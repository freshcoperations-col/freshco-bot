import type { SupabaseClient } from '@supabase/supabase-js'

// ═══════════════════════════════════════════════════════════════════════════
// Movimientos de inventario — PUNTO ÚNICO
//
// Todos los canales de venta (webhook de Wompi, aprobar pago desde el admin,
// contraentrega del bot, contraentrega de la webpage) pasan por acá. Si mañana
// se agrega un canal nuevo, llama a applyOrderStock y ya: no se reimplementa
// el descuento ni se olvida el registro.
//
// ─── Modelo de inventario ──────────────────────────────────────────────────
//
// Freshco maneja dos cosas distintas y ambas importan:
//
//   global_inventory  → prendas EN BLANCO por tipo+talla+color. Materia prima.
//   products.stock    → unidades de ESE diseño (la tirada).
//
// Y dos formas de producir, que es lo que distingue stock_mode:
//
//   'general'    → se estampa contra pedido. Vender consume un blanco Y una
//                  unidad de la tirada del diseño. Son ejes distintos: el
//                  blanco dice "solo tengo 5 negras L", la tirada dice "de
//                  este diseño solo saco 20".
//   'variantes'  → ya está estampado. El blanco se consumió al producir, así
//                  que vender solo baja la variante del producto.
//
// ─── Idempotencia ──────────────────────────────────────────────────────────
//
// Wompi reintenta el webhook ante cualquier respuesta que no sea 2xx, y manda
// varios transaction.updated por la misma transacción. El libro inventory_log
// tiene un índice único por (order_id, kind, reason, product_id, size, color):
// insertamos PRIMERO y solo descontamos si el insert entró. Si el pedido ya
// se había aplicado, el insert choca y no se toca el stock.
// ═══════════════════════════════════════════════════════════════════════════

export interface OrderItemLike {
  product_id?: string | null
  size?: string | null
  color?: string | null
  quantity?: number | null
}

type Reason = 'sale' | 'sale_reverted'

interface ApplyResult {
  applied: number
  skipped: number
  errors: string[]
}

// Une los items repetidos del pedido (mismo producto+talla+color) en una sola
// línea. Sin esto, dos líneas iguales chocarían contra el índice único y la
// segunda se perdería en silencio.
function mergeItems(items: OrderItemLike[]): Array<{
  productId: string
  size: string
  color: string
  quantity: number
}> {
  const merged = new Map<string, { productId: string; size: string; color: string; quantity: number }>()

  for (const item of items) {
    const productId = item.product_id?.trim()
    if (!productId) continue
    const size = item.size?.trim() ?? ''
    const color = item.color?.trim() ?? ''
    const quantity = Math.max(0, Math.floor(Number(item.quantity ?? 1)))
    if (quantity === 0) continue

    const key = `${productId}|${size}|${color}`
    const prev = merged.get(key)
    if (prev) prev.quantity += quantity
    else merged.set(key, { productId, size, color, quantity })
  }

  return Array.from(merged.values())
}

/**
 * Aplica el movimiento de inventario de un pedido.
 *
 * @param direction 'sale' descuenta; 'revert' devuelve (pedido cancelado).
 *
 * Nunca lanza: el inventario no puede tumbar la confirmación de un pago.
 * Los problemas vuelven en `errors` para que el llamador los loguee.
 */
export async function applyOrderStock(
  supabase: SupabaseClient,
  order: { id: string; items: OrderItemLike[] | null },
  direction: 'sale' | 'revert' = 'sale',
): Promise<ApplyResult> {
  if (direction === 'revert') return revertOrderStock(supabase, order.id)

  const result: ApplyResult = { applied: 0, skipped: 0, errors: [] }
  const items = mergeItems(order.items ?? [])
  if (items.length === 0) return result

  const reason: Reason = 'sale'
  const sign = 1

  for (const item of items) {
    try {
      const { data: product } = await supabase
        .from('products')
        .select('garment_type, stock_mode')
        .eq('id', item.productId)
        .maybeSingle()

      if (!product) {
        result.errors.push(`${item.productId}: producto no encontrado`)
        continue
      }

      const garmentType = (product.garment_type as string | null) ?? ''
      const esVariantes = product.stock_mode === 'variantes'
      const qty = item.quantity * sign

      // ── Stock del producto (siempre) ──────────────────────────────────
      const productoOk = await registrar(supabase, {
        order_id: order.id,
        kind: 'product',
        reason,
        product_id: item.productId,
        garment_type: garmentType,
        size: item.size,
        color: item.color,
        change_qty: -qty,
      })

      if (productoOk) {
        const { error } = await supabase.rpc('apply_product_stock', {
          p_product_id: item.productId,
          p_size: item.size,
          p_color: item.color,
          p_qty: qty,
        })
        if (error) result.errors.push(`${item.productId} (producto): ${error.message}`)
        else result.applied++
      } else {
        result.skipped++
      }

      // ── Prendas en blanco (solo si se estampa contra pedido) ──────────
      // En modo 'variantes' el blanco ya se consumió al producir; descontarlo
      // otra vez acá contaría dos veces la misma prenda física.
      if (!esVariantes && item.size && item.color) {
        const blancosOk = await registrar(supabase, {
          order_id: order.id,
          kind: 'blanks',
          reason,
          product_id: item.productId,
          garment_type: garmentType,
          size: item.size,
          color: item.color,
          change_qty: -qty,
        })

        if (blancosOk) {
          const { error } = await supabase.rpc('decrement_global_inventory', {
            p_garment_type: garmentType,
            p_size: item.size,
            p_color: item.color,
            p_qty: qty,
          })
          if (error) result.errors.push(`${item.productId} (blancos): ${error.message}`)
        }
      }
    } catch (err) {
      result.errors.push(`${item.productId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return result
}

/**
 * Devuelve al inventario lo que un pedido había descontado.
 *
 * Se guía por el LIBRO, no por los items del pedido: así, cancelar un pedido
 * que nunca descontó (un link de pago que nadie pagó, por ejemplo) no infla el
 * stock, y un pedido cuyos items se editaron después se revierte por lo que
 * realmente se aplicó.
 */
async function revertOrderStock(
  supabase: SupabaseClient,
  orderId: string,
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, skipped: 0, errors: [] }

  const { data: movimientos, error } = await supabase
    .from('inventory_log')
    .select('kind, product_id, garment_type, size, color, change_qty')
    .eq('order_id', orderId)
    .eq('reason', 'sale')

  if (error) {
    result.errors.push(`No se pudo leer el libro: ${error.message}`)
    return result
  }
  if (!movimientos?.length) return result

  for (const mov of movimientos) {
    const productId = (mov.product_id as string | null) ?? ''
    const size = (mov.size as string) ?? ''
    const color = (mov.color as string) ?? ''
    const garmentType = (mov.garment_type as string) ?? ''
    // change_qty quedó guardado en negativo al vender: devolver es su opuesto.
    const devolver = -Number(mov.change_qty ?? 0)
    if (devolver <= 0) continue

    const ok = await registrar(supabase, {
      order_id: orderId,
      kind: mov.kind as 'product' | 'blanks',
      reason: 'sale_reverted',
      product_id: productId,
      garment_type: garmentType,
      size,
      color,
      change_qty: devolver,
    })
    if (!ok) { result.skipped++; continue }

    // Cantidad negativa = incremento, tanto en el RPC de producto como en
    // el de blancos.
    const rpc = mov.kind === 'product'
      ? supabase.rpc('apply_product_stock', {
          p_product_id: productId, p_size: size, p_color: color, p_qty: -devolver,
        })
      : supabase.rpc('decrement_global_inventory', {
          p_garment_type: garmentType, p_size: size, p_color: color, p_qty: -devolver,
        })

    const { error: rpcErr } = await rpc
    if (rpcErr) result.errors.push(`${productId} (${mov.kind}): ${rpcErr.message}`)
    else result.applied++
  }

  return result
}

// Escribe el renglón del libro. Devuelve false si ya existía — esa es la
// guarda de idempotencia: si no entró, no se descuenta.
async function registrar(
  supabase: SupabaseClient,
  row: {
    order_id: string
    kind: 'product' | 'blanks'
    reason: Reason
    product_id: string
    garment_type: string
    size: string
    color: string
    change_qty: number
  },
): Promise<boolean> {
  const { error } = await supabase.from('inventory_log').insert(row)
  if (!error) return true

  // 23505 = unique_violation → el pedido ya se había aplicado.
  if (error.code === '23505') {
    console.log(`[inventory] ya aplicado, skip: ${row.order_id} ${row.kind} ${row.product_id} ${row.size}/${row.color}`)
    return false
  }

  console.error(`[inventory] no se pudo registrar el movimiento:`, error.message)
  return false
}

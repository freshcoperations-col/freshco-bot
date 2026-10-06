import type { SupabaseClient } from '@supabase/supabase-js'
import { checkCoupon, type ValidCoupon } from '@/lib/coupons'
import { getShippingCost } from '@/lib/shipping'

// ═══════════════════════════════════════════════════════════════════════════
// Cotización de un pedido: el ÚNICO lugar donde se calcula cuánto se cobra.
//
// La usan el checkout de la web (/api/orders/checkout) y las herramientas del
// bot (quote_order, create_payment_link, create_order). Quien llama solo dice
// QUÉ se compra; precios, ofertas, stock, cupón y envío salen de la base.
// Ni el navegador ni la IA pueden poner un precio.
// ═══════════════════════════════════════════════════════════════════════════

export const MAX_LINES = 20
export const MAX_QTY = 10

export interface QuoteLine {
  product_id: string
  size: string | null
  color: string | null
  quantity: number
}

export interface QuotedItem {
  product_id: string
  product_name: string
  size: string
  color: string
  quantity: number
  unit_price: number
}

export interface Quote {
  items: QuotedItem[]
  subtotal: number
  discount_amount: number
  shipping_cost: number
  total: number
  coupon: ValidCoupon | null
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: string; status: number }

// Normaliza lo que llega (JSON del navegador o input de la IA). Cantidades:
// solo enteros entre 1 y MAX_QTY; 1.5 no se redondea, se rechaza.
export function parseLines(raw: unknown): { ok: true; lines: QuoteLine[] } | { ok: false; error: string } {
  const arr = Array.isArray(raw) ? raw : []
  if (arr.length === 0) return { ok: false, error: 'El carrito está vacío.' }
  if (arr.length > MAX_LINES) return { ok: false, error: 'Demasiados productos en un solo pedido.' }
  const lines: QuoteLine[] = []
  for (const r of arr) {
    const it = (r ?? {}) as Record<string, unknown>
    const quantity = Number(it.quantity)
    const product_id = String(it.product_id ?? '').trim()
    if (!product_id || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      return { ok: false, error: `Cantidad inválida: debe ser un número entero entre 1 y ${MAX_QTY}.` }
    }
    const clean = (v: unknown) => {
      const s = v == null ? '' : String(v).trim()
      return s && s.toUpperCase() !== 'N/A' ? s : null
    }
    lines.push({ product_id, size: clean(it.size), color: clean(it.color), quantity })
  }
  return { ok: true, lines }
}

export async function quoteOrder(
  supabase: SupabaseClient,
  input: {
    lines: QuoteLine[]
    city: string
    couponCode?: string | null
    customer: { email?: string | null; phone?: string | null }
    // Productos de prueba: solo el equipo los compra (admins en la web,
    // TEAM_WHATSAPP_NUMBERS en el bot). Un cliente con el link no puede
    // comprar una camiseta de $1.500.
    allowTest?: boolean
  },
): Promise<QuoteResult> {
  const fail = (error: string, status = 400): QuoteResult => ({ ok: false, error, status })

  const { data: products } = await supabase
    .from('products_full')
    .select('id, name, price, sale_price, on_sale, sizes, colors, available, collection_active, out_of_stock, free_shipping, stock_mode, stock_variants, is_test')
    .in('id', Array.from(new Set(input.lines.map((l) => l.product_id))))
  const byId = new Map((products ?? []).map((p) => [String(p.id), p as Record<string, unknown>]))

  const items: QuotedItem[] = []
  let subtotal = 0
  let freeShipping = false
  for (const l of input.lines) {
    const p = byId.get(l.product_id)
    if (!p || p.available === false || p.collection_active === false || (p.is_test && !input.allowTest)) {
      return fail(`El producto "${l.product_id}" no existe o ya no está disponible.`, 409)
    }
    if (p.out_of_stock) return fail(`"${p.name}" está agotado.`, 409)

    const sizes = (p.sizes as string[] | null) ?? []
    const colors = (p.colors as string[] | null) ?? []
    if (sizes.length && (!l.size || !sizes.includes(l.size))) {
      return fail(`Elige una talla válida para "${p.name}" (${sizes.join(', ')}).`)
    }
    if (colors.length && (!l.color || !colors.includes(l.color))) {
      return fail(`Elige un color válido para "${p.name}" (${colors.join(', ')}).`)
    }

    // Stock por variante: no vender una combinación que no hay.
    if (p.stock_mode === 'variantes') {
      const v = ((p.stock_variants as Array<{ size: string | null; color: string | null; quantity: number }> | null) ?? [])
        .find((x) => (x.size ?? null) === (l.size ?? null) && (x.color ?? null) === (l.color ?? null))
      if (!v || v.quantity < l.quantity) {
        return fail(`No hay suficientes unidades de "${p.name}" en ${[l.size, l.color].filter(Boolean).join(' / ')}.`, 409)
      }
    }

    const price = Number(p.price)
    const sale = p.sale_price == null ? null : Number(p.sale_price)
    const unit = p.on_sale && sale != null && sale < price ? sale : price
    subtotal += unit * l.quantity
    if (p.free_shipping) freeShipping = true
    items.push({
      product_id: l.product_id,
      product_name: String(p.name),
      size: l.size ?? 'N/A',
      color: l.color ?? '',
      quantity: l.quantity,
      unit_price: unit,
    })
  }

  let coupon: ValidCoupon | null = null
  if (input.couponCode && input.couponCode.trim()) {
    const check = await checkCoupon(supabase, input.couponCode, input.customer)
    if (!check.ok) return fail(check.error)
    coupon = check.coupon
  }

  const discount_amount = coupon ? Math.round(subtotal * coupon.discount) : 0
  const shipping_cost = getShippingCost(input.city, freeShipping)
  const total = Math.round(subtotal - discount_amount + shipping_cost)
  return { ok: true, quote: { items, subtotal, discount_amount, shipping_cost, total, coupon } }
}

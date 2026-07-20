import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, updateOrderByReference, logMessage, getOrderByReference } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { verifyEventChecksum, mapStatus, type WompiEventPayload } from '@/lib/wompi'
import { emailPaymentConfirmed } from '@/lib/email'

// Wompi POSTea eventos a esta URL. Configurar en el dashboard de Wompi:
//   https://comercios.wompi.co → Eventos → Webhook
//   URL: https://<dominio>/api/wompi/webhook
//   Secret: copiarlo a WOMPI_EVENTS_SECRET
//
// Responde 200 lo más rápido posible; Wompi reintenta si recibe 4xx/5xx.
export async function POST(request: NextRequest) {
  let payload: WompiEventPayload
  try {
    payload = (await request.json()) as WompiEventPayload
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Validar firma. Si falla, no procesamos (evitamos webhooks falsificados).
  if (!verifyEventChecksum(payload)) {
    console.error('Firma inválida en webhook Wompi:', payload?.event)
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  // Awaitar el proceso antes de responder: en Vercel serverless el proceso
  // muere al retornar la respuesta, así que no se puede usar fire-and-forget.
  await processEvent(payload).catch((err) => {
    console.error('Error procesando evento Wompi:', err)
  })

  return NextResponse.json({ status: 'ok' })
}

async function processEvent(payload: WompiEventPayload): Promise<void> {
  const tx = payload.data?.transaction
  if (!tx) {
    console.warn('Evento Wompi sin transaction:', payload.event)
    return
  }

  const supabase = createServerClient()
  const paymentStatus = mapStatus(tx.status)

  const patch: Record<string, unknown> = {
    payment_status: paymentStatus,
    wompi_transaction_id: tx.id,
  }
  if (paymentStatus === 'approved') {
    patch.paid_at = tx.finalized_at ?? new Date().toISOString()
    patch.status = 'confirmado'
  } else if (paymentStatus === 'declined' || paymentStatus === 'error') {
    patch.status = 'pago_fallido'
  } else if (paymentStatus === 'voided') {
    patch.status = 'anulado'
  }

  const updated = await updateOrderByReference(supabase, tx.reference, patch)
  if (!updated) {
    // Puede haber llegado un webhook para una orden creada desde la webpage
    // (que escribe a Firebase, no a Supabase, en el flujo actual). Solo log.
    console.warn(`Webhook Wompi sin orden Supabase: ref=${tx.reference}`)
    return
  }

  // Notificar al cliente por WhatsApp según el estado del pago.
  const order = await getOrderByReference(supabase, tx.reference)
  if (!order) return

  const phone = order.customer_phone
  const orderShort = order.id.slice(0, 8).toUpperCase()
  let message: string | null = null

  switch (paymentStatus) {
    case 'approved':
      message =
        `¡Pago confirmado! 🎉 Tu pedido #${orderShort} por $${order.total.toLocaleString('es-CO')} ya quedó pago. ` +
        `Lo preparamos y te enviamos el número de guía cuando salga. Gracias por confiar en Freshco 💛`
      break
    case 'declined':
      message =
        `Tu pago del pedido #${orderShort} fue rechazado por el banco. Puedes intentar de nuevo con el mismo link o ` +
        `cambiar de método de pago. Si necesitas ayuda escríbeme por aquí 🙏`
      break
    case 'voided':
      message = `El pago del pedido #${orderShort} fue anulado. Si fue por error, generamos otro link y listo.`
      break
    case 'error':
      message =
        `Hubo un error procesando tu pago del pedido #${orderShort}. Intenta de nuevo o cuéntame qué pasó y te ayudo 🙏`
      break
    default:
      message = null
  }

  if (!message) return

  try {
    await sendWhatsAppMessage(phone, message)
    await logMessage(supabase, {
      customer_phone: phone,
      direction: 'outbound',
      content: message,
      intent: 'consulta_pago',
    })
  } catch (err) {
    console.error('Error notificando al cliente:', err)
  }

  // Decrementar inventario global al confirmar pago
  if (paymentStatus === 'approved') {
    type OrderItem = { product_id?: string; quantity?: number; size?: string; color?: string }
    const items = (order.items ?? []) as OrderItem[]
    for (const item of items) {
      const size = item.size?.trim()
      const color = item.color?.trim()
      if (!size || !color) continue
      const qty = item.quantity ?? 1

      // Obtener el garment_type del producto para decrementar la fila correcta
      let garmentType = ''
      if (item.product_id) {
        const { data: prod } = await supabase
          .from('products')
          .select('garment_type')
          .eq('id', item.product_id)
          .maybeSingle()
        garmentType = prod?.garment_type ?? ''
      }

      const { error: rpcErr } = await supabase.rpc('decrement_global_inventory', {
        p_garment_type: garmentType,
        p_size: size,
        p_color: color,
        p_qty: qty,
      })
      if (rpcErr) {
        console.error(
          `[inventory] ERROR al decrementar ${garmentType}/${size}/${color} x${qty} orden=${order.id}:`,
          rpcErr.message,
        )
      } else {
        // Log del decremento exitoso
        await supabase.from('inventory_log').insert({
          garment_type: garmentType,
          size,
          color,
          change_qty: -qty,
          reason: 'sale',
          order_id: order.id,
        }).then(({ error: logErr }) => {
          if (logErr) console.warn('[inventory_log] no se pudo registrar:', logErr.message)
        })
        console.log(`[inventory] decrementado ${garmentType}/${size}/${color} -${qty}`)
      }
    }
  }

  // Email de pago confirmado (awaited para que no se corte)
  if (paymentStatus === 'approved' && order.customer_email) {
    try {
      await emailPaymentConfirmed({
        shortId: order.id.slice(0, 8).toUpperCase(),
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        total: order.total,
        items: (order.items ?? []) as never,
        shippingAddress: order.shipping_address,
      })
    } catch (e) {
      console.error('Email pago confirmado:', e)
    }
  }
}

// GET de salud para probar manualmente que la ruta está montada.
export async function GET() {
  return NextResponse.json({ status: 'wompi webhook activo' })
}

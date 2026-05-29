import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, updateOrderByReference, logMessage, getOrderByReference } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { verifyEventChecksum, mapStatus, type WompiEventPayload } from '@/lib/wompi'

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

  // Procesar de forma asíncrona; siempre respondemos 200 a Wompi.
  void processEvent(payload).catch((err) => {
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
}

// GET de salud para probar manualmente que la ruta está montada.
export async function GET() {
  return NextResponse.json({ status: 'wompi webhook activo' })
}

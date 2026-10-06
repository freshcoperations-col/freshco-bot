import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, updateOrderByReference, logMessage, getOrderByReference } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { verifyEventChecksum, mapStatus, type WompiEventPayload } from '@/lib/wompi'
import { applyOrderStock } from '@/lib/inventory'
import { cop, notifyTeam, orderAlert, orderTemplate } from '@/lib/notify'
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

  // Wompi manda varios transaction.updated por la misma transacción y reintenta
  // ante cualquier respuesta que no sea 2xx. Si el pedido ya estaba en este
  // mismo estado, no hay nada nuevo que hacer: salir antes de volver a
  // notificar al cliente y reenviar el correo.
  const previo = await getOrderByReference(supabase, tx.reference)
  if (previo && previo.payment_status === paymentStatus) {
    console.log(`[wompi] evento repetido para ${tx.reference} (ya está en ${paymentStatus}), skip`)
    return
  }

  // Un pedido aprobado no baja de estado. Si el cliente reintentó el pago con
  // el mismo link, Wompi puede entregar el rechazo del primer intento DESPUÉS
  // del pago aprobado: ese evento viejo no puede marcar como fallido un pedido
  // pagado. La única salida de "aprobado" es una anulación (reembolso).
  if (previo?.payment_status === 'approved' && paymentStatus !== 'approved') {
    if (paymentStatus !== 'voided') {
      console.warn(`[wompi] ${tx.reference}: evento ${tx.status} después de aprobado, se ignora`)
      return
    }
    await updateOrderByReference(supabase, tx.reference, { payment_status: 'voided', status: 'anulado' } as never)
    const rev = await applyOrderStock(supabase, { id: previo.id, items: previo.items }, 'revert')
    if (rev.errors.length) console.error('[inventory] anulación:', rev.errors)
    await notifyTeam({
      title: '↩️ Pago anulado en Wompi',
      message: `Pedido #${previo.id.slice(0, 8).toUpperCase()} (${cop(Number(previo.total))}): Wompi anuló el pago. Se devolvió el stock; no lo despaches.`,
      tags: ['warning'],
      priority: 5,
      path: '/orders',
      template: orderTemplate(previo as never, 'pago anulado, no despachar'),
    })
    return
  }

  // El monto pagado tiene que ser el del pedido. Si no coincide, alguien pagó
  // un monto distinto al que se firmó o al que vale el pedido: no se aprueba,
  // y el equipo revisa a mano.
  if (paymentStatus === 'approved' && previo) {
    const expected = previo.amount_in_cents ?? Math.round(Number(previo.total) * 100)
    if (Number(tx.amount_in_cents) !== Number(expected)) {
      console.error(`[wompi] MONTO NO COINCIDE ref=${tx.reference}: pagó ${tx.amount_in_cents}, esperado ${expected}`)
      await updateOrderByReference(supabase, tx.reference, {
        payment_status: 'error',
        wompi_transaction_id: tx.id,
        status: 'revision_monto',
      } as never)
      await notifyTeam({
        title: '⚠️ Pago con monto distinto al pedido',
        message: `Pedido #${previo.id.slice(0, 8).toUpperCase()}: pagó ${cop(Number(tx.amount_in_cents) / 100)} y el pedido es de ${cop(Number(expected) / 100)}. NO se aprobó: revísalo en Wompi.`,
        tags: ['warning'],
        priority: 5,
        path: '/orders',
        template: orderTemplate(
          { id: previo.id, customer_name: previo.customer_name ?? null, total: Number(expected) / 100 },
          'pago con monto distinto, requiere revisión',
        ),
      })
      return
    }
  }

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

  // Inventario: un solo punto para todos los canales (ver lib/inventory.ts).
  // Va ANTES de armar el mensaje a propósito: el stock no puede depender de
  // que este estado tenga o no un texto que mandarle al cliente.
  if (paymentStatus === 'approved') {
    const res = await applyOrderStock(supabase, order)
    console.log(`[inventory] orden=${order.id} aplicadas=${res.applied} repetidas=${res.skipped}`)
    if (res.errors.length) console.error('[inventory] errores:', res.errors)
    // La guarda de idempotencia de arriba evita que un reintento de Wompi
    // repita esta alerta.
    await notifyTeam(orderAlert('paid', order))
  }

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
    await sendWhatsAppMessage(phone, message, orderShort)
    await logMessage(supabase, {
      customer_phone: phone,
      direction: 'outbound',
      content: message,
      intent: 'consulta_pago',
    })
  } catch (err) {
    console.error('Error notificando al cliente:', err)
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

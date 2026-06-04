import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { emailOrderDelivered } from '@/lib/email'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/orders/[short_id]/deliver
// Marca la orden como entregada y notifica al cliente por WhatsApp.
export async function POST(
  request: NextRequest,
  { params }: { params: { short_id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: admin.reason }, { status: 403, headers: cors })
  }

  const shortId = params.short_id?.toLowerCase().replace(/^#/, '').trim()
  if (!shortId) {
    return NextResponse.json({ error: 'short_id requerido' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, customer_phone, customer_email, customer_name, total, status, tracking_number, shipping_carrier, items')
    .order('created_at', { ascending: false })
    .limit(200)

  const order = (orders ?? []).find((o) => (o.id as string).toLowerCase().startsWith(shortId))
  if (!order) {
    return NextResponse.json({ error: `Orden #${shortId} no encontrada` }, { status: 404, headers: cors })
  }

  if (order.status === 'entregado') {
    return NextResponse.json({ error: 'La orden ya está marcada como entregada.' }, { status: 409, headers: cors })
  }

  const { error: updateErr } = await supabase
    .from('orders')
    .update({ status: 'entregado' })
    .eq('id', order.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500, headers: cors })
  }

  const firstName = (order.customer_name as string | null)?.split(' ')[0]
  const greeting = firstName ? `¡${firstName}!` : '¡Hola!'
  const orderShort = (order.id as string).slice(0, 8).toUpperCase()

  const msg =
    `${greeting} 📦 Tu pedido #${orderShort} fue entregado exitosamente.\n\n` +
    `Esperamos que lo disfrutes mucho 💛 Si tienes algún inconveniente o quieres hacer una devolución, escríbenos por aquí y te ayudamos.\n\n` +
    `¡Gracias por comprar en Freshco! 🙌`

  try {
    await sendWhatsAppMessage(order.customer_phone as string, msg)
    await supabase.from('messages').insert({
      customer_phone: order.customer_phone,
      direction: 'outbound',
      content: msg,
      intent: 'consulta_envio',
    })
  } catch (err) {
    return NextResponse.json(
      { warning: 'Orden marcada como entregada pero falló la notificación.', error: err instanceof Error ? err.message : String(err) },
      { status: 207, headers: cors },
    )
  }

  // Email de entregado
  emailOrderDelivered({
    shortId: orderShort,
    customerName: order.customer_name as string | null,
    customerEmail: (order as Record<string, unknown>).customer_email as string | null,
    total: Number(order.total),
    items: ((order as Record<string, unknown>).items ?? []) as never,
    shippingCarrier: order.shipping_carrier as string | null,
  }).catch((e) => console.error('Email entregado:', e))

  return NextResponse.json({ ok: true, short_id: orderShort }, { headers: cors })
}

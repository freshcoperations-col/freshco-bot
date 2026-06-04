import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { emailOrderShipped } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

const CARRIER_TRACKING_URLS: Record<string, (n: string) => string> = {
  servientrega: (n) => `https://www.servientrega.com/wps/portal/rastreo-envio?guia=${encodeURIComponent(n)}`,
  coordinadora: (n) => `https://coordinadora.com/rastrea-tu-envio/?guia=${encodeURIComponent(n)}`,
  'inter-rapidisimo': (n) => `https://www.interrapidisimo.com/sigue-tu-envio/?guia=${encodeURIComponent(n)}`,
  envia: (n) => `https://envia.co/rastrear-envio/?guia=${encodeURIComponent(n)}`,
  '99minutos': (n) => `https://99minutos.com/tracking?n=${encodeURIComponent(n)}`,
}

function carrierSlug(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-')
}

// POST /api/admin/web/orders/[short_id]/ship
// Body: { tracking_number, shipping_carrier }
// Marca como enviada y notifica al cliente por WhatsApp.
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

  let body: { tracking_number?: string; shipping_carrier?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const trackingNumber = body.tracking_number?.trim()
  const carrierRaw = body.shipping_carrier?.trim()
  if (!trackingNumber || !carrierRaw) {
    return NextResponse.json(
      { error: 'tracking_number y shipping_carrier son requeridos' },
      { status: 400, headers: cors },
    )
  }

  const supabase = createServerClient()

  const { data: orders } = await supabase
    .from('orders')
    .select('id, customer_phone, customer_email, customer_name, total, payment_status, shipping_address, items')
    .order('created_at', { ascending: false })
    .limit(200)

  const order = (orders ?? []).find((o) => (o.id as string).toLowerCase().startsWith(shortId))
  if (!order) {
    return NextResponse.json({ error: `Orden #${shortId} no encontrada` }, { status: 404, headers: cors })
  }

  if (order.payment_status !== 'approved') {
    return NextResponse.json(
      { error: `La orden está en estado ${order.payment_status}, no se puede marcar como enviada.` },
      { status: 409, headers: cors },
    )
  }

  const shippedAt = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('orders')
    .update({
      tracking_number: trackingNumber,
      shipping_carrier: carrierRaw,
      shipped_at: shippedAt,
      shipping_notified_at: shippedAt,
      status: 'enviado',
    })
    .eq('id', order.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500, headers: cors })
  }

  const firstName = (order.customer_name as string | null)?.split(' ')[0]
  const greeting = firstName ? `¡${firstName}!` : '¡Hey!'
  const orderShort = (order.id as string).slice(0, 8).toUpperCase()
  const tracker = CARRIER_TRACKING_URLS[carrierSlug(carrierRaw)]
  const trackingLine = tracker
    ? `Sigue tu pedido aquí: ${tracker(trackingNumber)}`
    : `Número de guía: ${trackingNumber}`

  const message =
    `${greeting} Tu pedido #${orderShort} ya salió 📦\n\n` +
    `Va con ${carrierRaw} y llega en 2-3 días hábiles.\n\n` +
    `${trackingLine}\n\n` +
    `Cuando esté por llegar te aviso por aquí 💛`

  try {
    await sendWhatsAppMessage(order.customer_phone as string, message)
    await supabase.from('messages').insert({
      customer_phone: order.customer_phone,
      direction: 'outbound',
      content: message,
      intent: 'consulta_envio',
    })
  } catch (err) {
    return NextResponse.json(
      {
        warning: 'Orden marcada como enviada pero falló la notificación.',
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 207, headers: cors },
    )
  }

  // Email de envío
  emailOrderShipped({
    shortId: orderShort,
    customerName: order.customer_name as string | null,
    customerEmail: (order as Record<string, unknown>).customer_email as string | null,
    total: Number(order.total),
    items: ((order as Record<string, unknown>).items ?? []) as never,
    shippingAddress: (order as Record<string, unknown>).shipping_address as string | null,
    trackingNumber,
    shippingCarrier: carrierRaw,
  }).catch((e) => console.error('Email enviado:', e))

  return NextResponse.json(
    {
      ok: true,
      short_id: orderShort,
      tracking_number: trackingNumber,
      shipping_carrier: carrierRaw,
      tracking_url: tracker ? tracker(trackingNumber) : null,
    },
    { headers: cors },
  )
}

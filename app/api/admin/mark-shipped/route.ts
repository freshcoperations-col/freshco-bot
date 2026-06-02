import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

// Carriers conocidos en Colombia y plantilla de link de seguimiento.
// Si el carrier no está aquí, mandamos el mensaje sin link (solo el número).
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

interface MarkShippedInput {
  short_id?: string
  tracking_number?: string
  shipping_carrier?: string
}

// POST /api/admin/mark-shipped
// Body: { short_id, tracking_number, shipping_carrier }
// Marca la orden como enviada, guarda guía + carrier, manda WhatsApp al cliente
// con la guía y (si lo conocemos) el link de rastreo del carrier.
export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'ADMIN_SECRET no configurado' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: MarkShippedInput
  try {
    body = (await request.json()) as MarkShippedInput
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const shortId = body.short_id?.toLowerCase().replace(/^#/, '').trim()
  const trackingNumber = body.tracking_number?.trim()
  const carrierRaw = body.shipping_carrier?.trim()

  if (!shortId || !trackingNumber || !carrierRaw) {
    return NextResponse.json(
      { error: 'short_id, tracking_number y shipping_carrier son requeridos' },
      { status: 400 },
    )
  }

  const supabase = createServerClient()

  const { data: orders } = await supabase
    .from('orders')
    .select('id, customer_phone, customer_name, total, payment_status, shipping_notified_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const order = (orders ?? []).find((o) => (o.id as string).toLowerCase().startsWith(shortId))
  if (!order) {
    return NextResponse.json({ error: `Orden #${shortId} no encontrada` }, { status: 404 })
  }

  if (order.payment_status !== 'approved') {
    return NextResponse.json(
      { error: `La orden #${shortId} aún no está aprobada (estado: ${order.payment_status})` },
      { status: 409 },
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
    return NextResponse.json({ error: 'No se pudo actualizar', details: updateErr.message }, { status: 500 })
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
        warning: 'Orden marcada como enviada pero no se pudo notificar al cliente',
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 207 },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      order_id: order.id,
      short_id: orderShort,
      tracking_number: trackingNumber,
      shipping_carrier: carrierRaw,
      tracking_url: tracker ? tracker(trackingNumber) : null,
      notified_at: shippedAt,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

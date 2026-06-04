import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

// POST /api/orders/[short_id]/undeliver
// Body: { reason?: string }
// Revierte 'entregado' → 'enviado' y notifica al cliente por WhatsApp.
export async function POST(
  request: NextRequest,
  { params }: { params: { short_id: string } },
) {
  const shortId = params.short_id.toLowerCase().replace(/^#/, '').trim()
  let body: { reason?: string } = {}
  try { body = await request.json() } catch { /* body puede ir vacío */ }

  const supabase = createServerClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, customer_phone, customer_name, status')
    .order('created_at', { ascending: false })
    .limit(200)

  const order = (orders ?? []).find((o) => (o.id as string).toLowerCase().startsWith(shortId))
  if (!order) {
    return NextResponse.json({ error: `Orden #${shortId} no encontrada` }, { status: 404 })
  }

  if (order.status !== 'entregado') {
    return NextResponse.json(
      { error: `La orden está en estado "${order.status}", no "entregado".` },
      { status: 409 },
    )
  }

  await supabase.from('orders').update({ status: 'enviado' }).eq('id', order.id)

  const firstName = (order.customer_name as string | null)?.split(' ')[0]
  const greeting = firstName ? `Hola ${firstName}` : 'Hola'
  const orderShort = (order.id as string).slice(0, 8).toUpperCase()
  const reasonLine = body.reason?.trim() ? `\n\nDetalle: ${body.reason.trim()}` : ''

  const msg =
    `${greeting} 🙏 Te escribimos para corregir un mensaje anterior sobre tu pedido #${orderShort}.${reasonLine}\n\n` +
    `Tu pedido está en camino y en breve te damos una actualización. Disculpa el inconveniente.`

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
      {
        warning: 'Estado revertido pero falló la notificación al cliente.',
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 207 },
    )
  }

  return NextResponse.json(
    { ok: true, short_id: orderShort },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/orders/[short_id]/resend-link
// Reenvía el link de pago Wompi al cliente por WhatsApp.
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
    .select('id, customer_phone, customer_name, total, payment_status, payment_link_url')
    .order('created_at', { ascending: false })
    .limit(200)

  const order = (orders ?? []).find((o) => (o.id as string).toLowerCase().startsWith(shortId))
  if (!order) {
    return NextResponse.json({ error: `Orden #${shortId} no encontrada` }, { status: 404, headers: cors })
  }
  if (!order.payment_link_url) {
    return NextResponse.json({ error: 'Esta orden no tiene link de pago.' }, { status: 400, headers: cors })
  }
  if (order.payment_status !== 'pending') {
    return NextResponse.json(
      { error: `La orden ya está ${order.payment_status}, no necesita link.` },
      { status: 409, headers: cors },
    )
  }

  const firstName = (order.customer_name as string | null)?.split(' ')[0]
  const greeting = firstName ? `Hola ${firstName}` : 'Hola'
  const orderShort = (order.id as string).slice(0, 8).toUpperCase()
  const totalCop = `$${Number(order.total).toLocaleString('es-CO')}`
  const msg =
    `${greeting} 🙏 Te recordamos tu pedido #${orderShort} por ${totalCop}.\n\n` +
    `Tu link de pago sigue activo: ${order.payment_link_url}\n\n` +
    `Cuando termines de pagar te confirmamos por acá automáticamente 💛`

  try {
    await sendWhatsAppMessage(order.customer_phone as string, msg)
    await supabase.from('messages').insert({
      customer_phone: order.customer_phone,
      direction: 'outbound',
      content: msg,
      intent: 'consulta_pago',
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error enviando WhatsApp' },
      { status: 500, headers: cors },
    )
  }

  return NextResponse.json({ ok: true }, { headers: cors })
}

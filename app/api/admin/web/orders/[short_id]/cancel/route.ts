import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/orders/[short_id]/cancel
// Body: { reason?: string, notify?: boolean }
// Cancela una orden y opcionalmente notifica al cliente.
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

  let body: { reason?: string; notify?: boolean }
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const reason = body.reason?.trim()
  const notify = body.notify !== false // por default notifica

  const supabase = createServerClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, customer_phone, customer_name, total, payment_status, tracking_number')
    .order('created_at', { ascending: false })
    .limit(200)

  const order = (orders ?? []).find((o) => (o.id as string).toLowerCase().startsWith(shortId))
  if (!order) {
    return NextResponse.json({ error: `Orden #${shortId} no encontrada` }, { status: 404, headers: cors })
  }

  if (order.tracking_number) {
    return NextResponse.json(
      { error: 'La orden ya tiene guía de envío. No se puede cancelar desde acá.' },
      { status: 409, headers: cors },
    )
  }

  const patch: Record<string, unknown> = { status: 'cancelado' }
  if (order.payment_status === 'pending') patch.payment_status = 'voided'

  const { error } = await supabase.from('orders').update(patch).eq('id', order.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  }

  // Notificar al cliente por WhatsApp si se pide.
  if (notify) {
    const firstName = (order.customer_name as string | null)?.split(' ')[0]
    const greeting = firstName ? `Hola ${firstName}` : 'Hola'
    const orderShort = (order.id as string).slice(0, 8).toUpperCase()
    const reasonLine = reason ? `\n\nMotivo: ${reason}` : ''
    const msg =
      `${greeting} 🙏 Tu pedido #${orderShort} fue cancelado.${reasonLine}\n\n` +
      `Si fue un error o quieres volverlo a generar, escríbeme aquí y te ayudo.`
    try {
      await sendWhatsAppMessage(order.customer_phone as string, msg)
      await supabase.from('messages').insert({
        customer_phone: order.customer_phone,
        direction: 'outbound',
        content: msg,
        intent: 'otro',
      })
    } catch (err) {
      console.error('Error notificando cancelación:', err)
    }
  }

  return NextResponse.json(
    { ok: true, short_id: (order.id as string).slice(0, 8).toUpperCase() },
    { headers: cors },
  )
}

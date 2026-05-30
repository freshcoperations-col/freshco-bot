import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

// Cron de Vercel — corre cada hora (config en vercel.json).
// Encuentra órdenes "pending" con link Wompi generado entre hace 2 y 24 horas
// que aún no hayan sido recordadas, y manda un mensaje suave al cliente.
//
// Auth: Vercel manda Authorization: Bearer <CRON_SECRET> automáticamente
// si la var CRON_SECRET está definida. Si no está, rechazamos para evitar
// que cualquiera dispare el job.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const now = Date.now()
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString()
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, customer_phone, customer_name, items, total, payment_link_url, created_at')
    .eq('payment_status', 'pending')
    .eq('source', 'whatsapp_bot')
    .is('reminder_sent_at', null)
    .not('payment_link_url', 'is', null)
    .lte('created_at', twoHoursAgo)
    .gte('created_at', twentyFourHoursAgo)
    .limit(20)

  if (error) {
    console.error('Error consultando órdenes pendientes:', error)
    return NextResponse.json({ error: 'query_failed', details: error.message }, { status: 500 })
  }

  const results: Array<{ id: string; phone: string; sent: boolean; error?: string }> = []

  for (const order of orders ?? []) {
    const firstName = (order.customer_name as string | null)?.split(' ')[0]
    const greeting = firstName ? `¡Hola, ${firstName}!` : '¡Hola!'
    const short = (order.id as string).slice(0, 8).toUpperCase()
    const totalCop = `$${Number(order.total).toLocaleString('es-CO')}`
    const link = order.payment_link_url as string

    const message =
      `${greeting} 👋 Te dejé reservado el pedido #${short} por ${totalCop}, pero veo que no terminaste el pago.\n\n` +
      `Si lo quieres seguir cerrando, tu link sigue activo: ${link}\n\n` +
      `Si cambiaste de opinión o necesitas ayuda con algo más, solo dime 🙏`

    try {
      await sendWhatsAppMessage(order.customer_phone as string, message)
      await supabase
        .from('orders')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', order.id)
      await supabase.from('messages').insert({
        customer_phone: order.customer_phone,
        direction: 'outbound',
        content: message,
        intent: 'consulta_pago',
      })
      results.push({ id: order.id as string, phone: order.customer_phone as string, sent: true })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`Reminder ${order.id} falló:`, errMsg)
      results.push({
        id: order.id as string,
        phone: order.customer_phone as string,
        sent: false,
        error: errMsg,
      })
    }
  }

  return NextResponse.json(
    {
      checked: orders?.length ?? 0,
      sent: results.filter((r) => r.sent).length,
      failed: results.filter((r) => !r.sent).length,
      results,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

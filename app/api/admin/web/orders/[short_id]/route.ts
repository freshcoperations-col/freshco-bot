import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/orders/[short_id]
// Detalle completo de una orden + últimos N mensajes con ese cliente.
export async function GET(
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
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  const order = (orders ?? []).find((o) => (o.id as string).toLowerCase().startsWith(shortId))
  if (!order) {
    return NextResponse.json({ error: `Orden #${shortId} no encontrada` }, { status: 404, headers: cors })
  }

  // Últimos 30 mensajes con ese cliente para mostrar historial en el drawer.
  const { data: messages } = await supabase
    .from('messages')
    .select('id, direction, content, intent, created_at')
    .eq('customer_phone', order.customer_phone)
    .order('created_at', { ascending: false })
    .limit(30)

  return NextResponse.json(
    {
      order: { ...order, short_id: (order.id as string).slice(0, 8).toUpperCase() },
      recent_messages: (messages ?? []).reverse(),
    },
    { headers: cors },
  )
}

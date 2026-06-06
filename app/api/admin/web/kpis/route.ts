import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/kpis — números rápidos para el home del admin.
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: admin.reason }, { status: 403, headers: cors })
  }

  const supabase = createServerClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    { count: ordersToday },
    { count: pending },
    { data: approved },
    { count: inTransit },
  ] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'pending'),
    supabase.from('orders').select('id, tracking_number, status').eq('payment_status', 'approved').is('tracking_number', null),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'enviado'),
  ])

  const DONE_STATUSES = new Set(['entregado', 'cancelado', 'enviado'])
  const approvedPendingShipment = (approved ?? []).filter((o) => {
    const trackingNumber = (o as { tracking_number?: string | null }).tracking_number
    const status = ((o as { status?: string | null }).status ?? '').toLowerCase().trim()
    return !trackingNumber && !DONE_STATUSES.has(status)
  }).length

  return NextResponse.json(
    {
      orders_today: ordersToday ?? 0,
      pending: pending ?? 0,
      approved_pending_shipment: approvedPendingShipment,
      in_transit: inTransit ?? 0,
    },
    { headers: cors },
  )
}

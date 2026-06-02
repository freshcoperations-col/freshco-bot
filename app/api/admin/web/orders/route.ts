import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// GET /api/admin/web/orders?status=pending&search=63AE8DB9&limit=50
// Lista órdenes con filtros para el admin webapp.
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: admin.reason }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const paymentStatus = searchParams.get('payment_status')
  const orderStatus = searchParams.get('status')
  const search = searchParams.get('search')?.trim().toLowerCase()
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200)

  const supabase = createServerClient()
  let query = supabase
    .from('orders')
    .select(
      'id, customer_phone, customer_name, customer_email, items, total, ' +
        'payment_status, status, paid_at, tracking_number, shipping_carrier, ' +
        'shipped_at, created_at, shipping_address, source',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (paymentStatus) query = query.eq('payment_status', paymentStatus)
  if (orderStatus) query = query.eq('status', orderStatus)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'query_failed', details: error.message }, { status: 500 })
  }

  interface OrderRow {
    id: string
    customer_phone: string
    customer_name: string | null
    customer_email: string | null
    [key: string]: unknown
  }
  let rows = (data ?? []) as unknown as OrderRow[]

  // El search lo hacemos en JS porque cubre short_id (no es columna real) +
  // nombre + email + teléfono.
  if (search) {
    rows = rows.filter((o) => {
      const shortId = o.id.slice(0, 8).toLowerCase()
      return (
        shortId.includes(search) ||
        (o.customer_name ?? '').toLowerCase().includes(search) ||
        (o.customer_email ?? '').toLowerCase().includes(search) ||
        (o.customer_phone ?? '').toLowerCase().includes(search)
      )
    })
  }

  return NextResponse.json(
    {
      orders: rows.map((o) => ({
        ...o,
        short_id: o.id.slice(0, 8).toUpperCase(),
      })),
      count: rows.length,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/orders?phone=57300...  → pedidos de un cliente
// GET /api/orders?limit=100        → todos los pedidos (tabla principal)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500)

  const supabase = createServerClient()
  let query = supabase
    .from('orders')
    .select('id, customer_phone, customer_name, total, status, payment_status, created_at, items, shipping_address')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (phone) query = query.eq('customer_phone', phone)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    (data ?? []).map((o) => ({ ...o, short_id: (o.id as string).slice(0, 8).toUpperCase() })),
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

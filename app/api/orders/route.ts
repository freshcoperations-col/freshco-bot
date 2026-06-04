import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/orders?phone=57300...
// Lista pedidos de un cliente para el dashboard.
export async function GET(request: NextRequest) {
  const phone = new URL(request.url).searchParams.get('phone')
  if (!phone) {
    return NextResponse.json({ error: 'phone es requerido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('orders')
    .select('id, total, status, payment_status, created_at, items, shipping_address')
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    (data ?? []).map((o) => ({ ...o, short_id: (o.id as string).slice(0, 8).toUpperCase() })),
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

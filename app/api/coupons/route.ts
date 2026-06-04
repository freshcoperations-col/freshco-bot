import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/coupons — lista todos los cupones para el dashboard.
export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('coupons')
    .select('id, code, discount, description, active, usage_limit, used_count, expires_at, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

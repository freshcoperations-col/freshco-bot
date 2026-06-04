import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ALLOWED_ORIGINS = [
  'https://freshco-design.com',
  'https://www.freshco-design.com',
  'http://localhost:5173',
  'http://localhost:3000',
]

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, max-age=0',
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get('origin')) })
}

// POST /api/coupons/use
// Registra que un cliente usó un cupón al completar una orden.
// Llamado desde la webpage después de crear la orden.
export async function POST(request: NextRequest) {
  const headers = cors(request.headers.get('origin'))

  let body: { code?: string; customer_email?: string; customer_phone?: string; order_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400, headers })
  }

  const code = body.code?.toString().trim().toUpperCase()
  if (!code) return NextResponse.json({ ok: false, error: 'code requerido' }, { status: 400, headers })

  const supabase = createServerClient()

  const { data: coupon } = await supabase
    .from('coupons')
    .select('id, one_per_customer')
    .ilike('code', code)
    .maybeSingle()

  if (!coupon) return NextResponse.json({ ok: false, error: 'Cupón no encontrado' }, { status: 404, headers })

  await supabase.from('coupon_uses').insert({
    coupon_id: coupon.id,
    customer_email: body.customer_email?.toLowerCase().trim() || null,
    customer_phone: body.customer_phone?.trim() || null,
    order_id: body.order_id || null,
  })

  return NextResponse.json({ ok: true }, { headers })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { checkCoupon } from '@/lib/coupons'

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

// POST /api/coupons/validate
// Body: { code: string }
// Valida un cupón y, si es válido, incrementa used_count.
// Endpoint público (sin auth) — la webpage lo llama directamente.
export async function POST(request: NextRequest) {
  const headers = cors(request.headers.get('origin'))

  let body: { code?: string; customer_email?: string; customer_phone?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ valid: false, error: 'JSON inválido' }, { status: 400, headers })
  }

  const code = body.code?.toString().trim().toUpperCase()
  if (!code) {
    return NextResponse.json({ valid: false, error: 'Código requerido' }, { status: 400, headers })
  }

  const customerEmail = body.customer_email?.toString().trim().toLowerCase() || null
  const customerPhone = body.customer_phone?.toString().trim() || null

  const supabase = createServerClient()
  // Solo valida: NO consume el cupón (el uso se registra al crear el pedido).
  const check = await checkCoupon(supabase, code, { email: customerEmail, phone: customerPhone })
  if (!check.ok) return NextResponse.json({ valid: false, error: check.error }, { headers })
  const coupon = check.coupon

  return NextResponse.json({
    valid: true,
    code: coupon.code,
    discount: coupon.discount,
    discount_pct: Math.round((coupon.discount as number) * 100),
    description: coupon.description,
    one_per_customer: coupon.one_per_customer,
  }, { headers })
}

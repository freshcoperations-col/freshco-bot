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

// POST /api/coupons/validate
// Body: { code: string }
// Valida un cupón y, si es válido, incrementa used_count.
// Endpoint público (sin auth) — la webpage lo llama directamente.
export async function POST(request: NextRequest) {
  const headers = cors(request.headers.get('origin'))

  let body: { code?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ valid: false, error: 'JSON inválido' }, { status: 400, headers })
  }

  const code = body.code?.toString().trim().toUpperCase()
  if (!code) {
    return NextResponse.json({ valid: false, error: 'Código requerido' }, { status: 400, headers })
  }

  const supabase = createServerClient()
  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('id, code, discount, description, active, usage_limit, used_count, expires_at')
    .eq('active', true)
    .ilike('code', code)
    .maybeSingle()

  if (error || !coupon) {
    return NextResponse.json({ valid: false, error: 'Código no válido o inactivo' }, { headers })
  }

  if (coupon.expires_at && new Date(coupon.expires_at as string) < new Date()) {
    return NextResponse.json({ valid: false, error: 'Este código ya expiró' }, { headers })
  }

  if (coupon.usage_limit != null && (coupon.used_count as number) >= (coupon.usage_limit as number)) {
    return NextResponse.json({ valid: false, error: 'Este código ya alcanzó su límite de usos' }, { headers })
  }

  // Incrementar used_count
  await supabase.from('coupons').update({ used_count: (coupon.used_count as number) + 1 }).eq('id', coupon.id)

  return NextResponse.json({
    valid: true,
    code: coupon.code,
    discount: coupon.discount,
    discount_pct: Math.round((coupon.discount as number) * 100),
    description: coupon.description,
  }, { headers })
}

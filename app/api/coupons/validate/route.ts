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
  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('id, code, discount, description, active, usage_limit, used_count, expires_at, one_per_customer')
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

  // Verificar one_per_customer — si el cliente ya lo usó, rechazar
  if (coupon.one_per_customer) {
    let usedQuery = supabase
      .from('coupon_uses')
      .select('id')
      .eq('coupon_id', coupon.id)

    if (customerEmail) {
      usedQuery = usedQuery.eq('customer_email', customerEmail)
    } else if (customerPhone) {
      usedQuery = usedQuery.eq('customer_phone', customerPhone)
    }

    if (customerEmail || customerPhone) {
      const { data: existing } = await usedQuery.limit(1).maybeSingle()
      if (existing) {
        return NextResponse.json({
          valid: false,
          error: 'Este código es solo para tu primera compra y ya lo usaste anteriormente.',
        }, { headers })
      }
    }
  }

  // Incrementar used_count (solo en ese momento — el uso real se graba al crear la orden)
  await supabase.from('coupons').update({ used_count: (coupon.used_count as number) + 1 }).eq('id', coupon.id)

  return NextResponse.json({
    valid: true,
    code: coupon.code,
    discount: coupon.discount,
    discount_pct: Math.round((coupon.discount as number) * 100),
    description: coupon.description,
    one_per_customer: coupon.one_per_customer,
  }, { headers })
}

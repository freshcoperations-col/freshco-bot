import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { checkCoupon } from '@/lib/coupons'
import { allowRequest, clientIp } from '@/lib/rate-limit'

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
// Pública (la tienda la llama al dar "Aplicar"). Solo dice si el CÓDIGO es
// válido; NO consume el cupón.
//
// No recibe correo ni teléfono a propósito: con "primera compra" / "ya lo
// usaste" serviría para averiguar si un correo ajeno ya compró. Las reglas
// por cliente se revisan en el checkout, con el correo verificado de la sesión.
//
// Con freno: 10 intentos cada 10 minutos por IP, para que no se puedan
// adivinar códigos en bucle.
export async function POST(request: NextRequest) {
  const headers = cors(request.headers.get('origin'))

  let body: { code?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ valid: false, error: 'JSON inválido' }, { status: 400, headers })
  }

  const code = body.code?.toString().trim().toUpperCase().slice(0, 40)
  if (!code) {
    return NextResponse.json({ valid: false, error: 'Código requerido' }, { status: 400, headers })
  }

  const supabase = createServerClient()
  if (!(await allowRequest(supabase, `coupon:${clientIp(request)}`, 10, 600))) {
    return NextResponse.json(
      { valid: false, error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
      { status: 429, headers },
    )
  }

  const check = await checkCoupon(supabase, code, {})
  if (!check.ok) return NextResponse.json({ valid: false, error: check.error }, { headers })
  const coupon = check.coupon

  return NextResponse.json({
    valid: true,
    code: coupon.code,
    discount: coupon.discount,
    discount_pct: Math.round(coupon.discount * 100),
    description: coupon.description,
    one_per_customer: coupon.one_per_customer,
    first_purchase_only: coupon.first_purchase_only,
  }, { headers })
}

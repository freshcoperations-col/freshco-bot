import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ALLOWED_ORIGINS = [
  'https://freshco-design.com',
  'https://www.freshco-design.com',
  'http://localhost:5173',
  'http://localhost:3000',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, max-age=0',
  }
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `57${digits}`
  if (digits.length === 12 && digits.startsWith('57')) return digits
  return null
}

const MAX_ATTEMPTS = 5

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  })
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'))

  let body: { phone?: string; code?: string; email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers })
  }

  const phone = body.phone ? normalizePhone(body.phone) : null
  const code = body.code?.toString().trim()
  const email = body.email?.toString().trim().toLowerCase()

  if (!phone || !code || !email) {
    return NextResponse.json(
      { error: 'phone, code y email son requeridos' },
      { status: 400, headers },
    )
  }

  const supabase = createServerClient()

  // Trae el OTP más reciente para ese phone, no usado, no vencido.
  const nowIso = new Date().toISOString()
  const { data: otp } = await supabase
    .from('auth_otps')
    .select('id, code, attempts, expires_at, used_at')
    .eq('phone', phone)
    .is('used_at', null)
    .gte('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!otp) {
    return NextResponse.json(
      { error: 'No hay un código activo. Pide uno nuevo.' },
      { status: 404, headers },
    )
  }

  if (otp.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Pide otro código.' },
      { status: 429, headers },
    )
  }

  if (otp.code !== code) {
    await supabase
      .from('auth_otps')
      .update({ attempts: (otp.attempts as number) + 1 })
      .eq('id', otp.id)
    return NextResponse.json({ error: 'Código incorrecto.' }, { status: 401, headers })
  }

  // Marca el OTP como usado.
  await supabase.from('auth_otps').update({ used_at: nowIso }).eq('id', otp.id)

  // Cuenta total de órdenes con ese phone (independiente del email previo).
  const { data: allOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('customer_phone', phone)

  // Backfill del email solo en las que no lo tenían bien.
  const { data: updated, error: updateErr } = await supabase
    .from('orders')
    .update({ customer_email: email })
    .eq('customer_phone', phone)
    .or(`customer_email.is.null,customer_email.neq.${email}`)
    .select('id')

  if (updateErr) {
    console.error('Error backfilling email:', updateErr)
    return NextResponse.json({ error: 'Error actualizando órdenes' }, { status: 500, headers })
  }

  return NextResponse.json(
    {
      verified: true,
      phone,
      email,
      total_orders: allOrders?.length ?? 0,
      newly_linked: updated?.length ?? 0,
    },
    { headers },
  )
}

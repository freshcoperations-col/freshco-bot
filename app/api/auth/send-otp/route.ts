import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { createServerClient } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

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

// Normaliza a E.164 sin el + (formato que usa WhatsApp Cloud API y la DB).
// Números colombianos de 10 dígitos que empiecen en 3 → agrega prefijo 57.
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('3')) return '57' + digits
  if (digits.length < 7 || digits.length > 15) return null
  return digits
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  })
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'))

  let body: { phone?: string; email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers })
  }

  const phone = body.phone ? normalizePhone(body.phone) : null
  if (!phone) {
    return NextResponse.json(
      { error: 'Teléfono inválido. Mándalo en formato 3XXXXXXXXX.' },
      { status: 400, headers },
    )
  }

  const supabase = createServerClient()

  // Rate limit: máximo un OTP por minuto y 5 por hora para el mismo phone.
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()

  const { data: recent } = await supabase
    .from('auth_otps')
    .select('created_at')
    .eq('phone', phone)
    .gte('created_at', oneHourAgo)
    .order('created_at', { ascending: false })

  if (recent && recent.length > 0) {
    if (new Date(recent[0].created_at as string).toISOString() > oneMinuteAgo) {
      return NextResponse.json(
        { error: 'Espera al menos 60 segundos antes de pedir otro código.' },
        { status: 429, headers },
      )
    }
    if (recent.length >= 5) {
      return NextResponse.json(
        { error: 'Has pedido demasiados códigos. Intenta en una hora.' },
        { status: 429, headers },
      )
    }
  }

  // Código de 6 dígitos. randomInt es criptográficamente seguro.
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()

  const { error: insertErr } = await supabase.from('auth_otps').insert({
    phone,
    code,
    email: body.email ?? null,
    expires_at: expiresAt,
  })

  if (insertErr) {
    console.error('No se pudo guardar OTP:', insertErr)
    return NextResponse.json({ error: 'Error interno' }, { status: 500, headers })
  }

  const message =
    `🔐 Tu código de Freshco es: *${code}*\n\n` +
    `Vence en 10 minutos. Si no lo pediste, ignora este mensaje.`

  try {
    await sendWhatsAppMessage(phone, message)
  } catch (err) {
    console.error('No se pudo enviar OTP por WhatsApp:', err)
    return NextResponse.json(
      { error: 'No pudimos enviar el código por WhatsApp. Verifica el número.' },
      { status: 502, headers },
    )
  }

  return NextResponse.json({ sent: true, expires_at: expiresAt }, { headers })
}

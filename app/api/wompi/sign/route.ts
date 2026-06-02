import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

// Endpoint público (con CORS) para que el checkout de la webpage Vite obtenga
// la firma de integridad de Wompi sin tener el secreto en el bundle del cliente.
//
// La firma es SHA-256(reference + amountInCents + currency + integritySecret)
// en hex lowercase. Wompi la valida cuando abre el widget en producción.
//
// El "secret" para la firma no es información confidencial del cliente (el
// servidor lo guarda), y la firma resultante solo sirve para pagar la
// combinación exacta (reference, amount, currency) — por eso es seguro
// exponer el endpoint sin auth.

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

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  })
}

interface SignInput {
  reference?: string
  amount_in_cents?: number
  currency?: string
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'))

  const secret = process.env.WOMPI_INTEGRITY_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'WOMPI_INTEGRITY_SECRET no configurado' },
      { status: 500, headers },
    )
  }

  let body: SignInput
  try {
    body = (await request.json()) as SignInput
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers })
  }

  const reference = body.reference?.toString().trim()
  const amountInCents = Number(body.amount_in_cents)
  const currency = (body.currency ?? 'COP').toString().trim().toUpperCase()

  if (!reference || !Number.isFinite(amountInCents) || amountInCents <= 0) {
    return NextResponse.json(
      { error: 'reference y amount_in_cents (positivo) son requeridos' },
      { status: 400, headers },
    )
  }

  const signature = createHash('sha256')
    .update(`${reference}${amountInCents}${currency}${secret}`)
    .digest('hex')

  return NextResponse.json({ signature, reference, amount_in_cents: amountInCents, currency }, {
    headers,
  })
}

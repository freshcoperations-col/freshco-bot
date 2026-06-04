import { NextRequest, NextResponse } from 'next/server'
import { emailOrderCreated } from '@/lib/email'

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

// POST /api/orders/notify
// Llamado desde la webpage después de crear una orden para enviar
// el email de confirmación al cliente y al admin.
export async function POST(request: NextRequest) {
  const headers = cors(request.headers.get('origin'))

  let body: {
    order_id?: string
    customer_name?: string
    customer_email?: string
    total?: number
    items?: unknown[]
    shipping_address?: string
  }
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers })
  }

  const shortId = body.order_id?.slice(0, 8).toUpperCase() ?? '?'

  emailOrderCreated({
    shortId,
    customerName: body.customer_name ?? null,
    customerEmail: body.customer_email ?? null,
    total: Number(body.total ?? 0),
    items: (body.items ?? []) as never,
    shippingAddress: body.shipping_address ?? null,
  }).catch((e) => console.error('Email orden web:', e))

  return NextResponse.json({ ok: true }, { headers })
}

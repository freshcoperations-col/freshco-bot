import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { emailPaymentConfirmed } from '@/lib/email'

export const dynamic = 'force-dynamic'

const ALLOWED_ORIGINS = [
  'https://freshco-design.com',
  'https://www.freshco-design.com',
  'http://localhost:5173',
  'http://localhost:3000',
]

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get('origin')) })
}

// POST /api/orders/payment-confirmed
// Llamado desde la webpage cuando Wompi aprueba el pago en el widget.
// Envía email de confirmación al cliente. No requiere autenticación de admin
// porque verifica en Supabase que la orden existe y ya está aprobada.
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const headers = cors(origin)

  let orderId: string
  try {
    const body = await request.json()
    orderId = body.order_id
  } catch {
    return NextResponse.json({ error: 'order_id requerido' }, { status: 400, headers })
  }

  if (!orderId) {
    return NextResponse.json({ error: 'order_id requerido' }, { status: 400, headers })
  }

  const supabase = createServerClient()
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, payment_status, customer_name, customer_email, total, items, shipping_address')
    .eq('id', orderId)
    .maybeSingle()

  if (error || !order) {
    return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404, headers })
  }

  if (order.payment_status !== 'approved' && order.payment_status !== 'cod') {
    return NextResponse.json({ error: 'Orden no está aprobada' }, { status: 409, headers })
  }

  if (!order.customer_email) {
    return NextResponse.json({ ok: true, skipped: 'sin email' }, { headers })
  }

  try {
    await emailPaymentConfirmed({
      shortId: (order.id as string).slice(0, 8).toUpperCase(),
      customerName: order.customer_name as string | null,
      customerEmail: order.customer_email as string,
      total: Number(order.total),
      items: ((order.items ?? []) as never),
      shippingAddress: order.shipping_address as string | null,
    })
  } catch (err) {
    console.error('emailPaymentConfirmed:', err)
    return NextResponse.json(
      { error: 'Email falló', detail: err instanceof Error ? err.message : String(err) },
      { status: 500, headers },
    )
  }

  return NextResponse.json({ ok: true }, { headers })
}

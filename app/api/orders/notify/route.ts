import { NextRequest, NextResponse } from 'next/server'
import { emailOrderCreated } from '@/lib/email'
import { createServerClient } from '@/lib/supabase'
import { applyOrderStock } from '@/lib/inventory'

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

  // Inventario de los pedidos contraentrega de la webpage — el único canal
  // que no descontaba nada. Los pedidos con Wompi NO se tocan acá: esos
  // descuentan cuando el webhook confirma el pago.
  //
  // Los items se releen de la base, no del body: este endpoint es público.
  if (body.order_id) {
    try {
      const supabase = createServerClient()
      const { data: order } = await supabase
        .from('orders')
        .select('id, items, payment_status')
        .eq('id', body.order_id)
        .maybeSingle()

      if (order && order.payment_status === 'cod') {
        const inv = await applyOrderStock(supabase, {
          id: order.id as string,
          items: order.items as never,
        })
        if (inv.errors.length) console.error('[inventory] orden web:', inv.errors)
      }
    } catch (e) {
      console.error('[inventory] orden web falló:', e)
    }
  }

  return NextResponse.json({ ok: true }, { headers })
}

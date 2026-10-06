import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase'
import { bearerToken } from '@/lib/admin-auth'
import { attachCouponUse, claimCoupon, releaseCoupon } from '@/lib/coupons'
import { parseLines, quoteOrder } from '@/lib/pricing'
import { allowRequest } from '@/lib/rate-limit'
import { signIntegrity } from '@/lib/wompi'
import { applyOrderStock } from '@/lib/inventory'
import { emailOrderCreated } from '@/lib/email'
import { notifyTeam, orderAlert } from '@/lib/notify'

export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/orders/checkout — el checkout de la tienda web.
//
// Antes la tienda creaba el pedido DESDE EL NAVEGADOR, con precios calculados
// en el navegador, y pedía la firma de Wompi para cualquier monto. Con la
// consola abierta se podía crear un pedido de $90.000 con total de $1.500,
// firmarlo y pagar $1.500.
//
// Ahora el navegador solo dice QUÉ quiere comprar. El servidor:
//   · verifica la sesión del cliente (el checkout exige iniciar sesión) y usa
//     su correo verificado
//   · lee precios, tallas, colores y stock de la base
//   · valida el cupón y calcula el envío
//   · crea el pedido y firma en Wompi SOLO el monto que él calculó
// ═══════════════════════════════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'https://freshco-design.com',
  'https://www.freshco-design.com',
  'http://localhost:5173',
]

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get('origin')) })
}

function fail(error: string, status: number, headers: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers })
}

export async function POST(request: NextRequest) {
  const headers = cors(request.headers.get('origin'))

  // ── 1. Quién compra: la sesión de Supabase del cliente ─────────────────
  const token = bearerToken(request.headers.get('authorization'))
  if (!token) return fail('Inicia sesión para comprar.', 401, headers)
  const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  const email = userData?.user?.email?.toLowerCase().trim()
  if (userErr || !email) return fail('Tu sesión expiró. Vuelve a iniciar sesión.', 401, headers)

  // ── 2. Qué quiere comprar ──────────────────────────────────────────────
  let body: {
    items?: unknown
    customer?: { name?: string; phone?: string; address?: string; city?: string }
    payment_method?: string
    coupon_code?: string | null
  }
  try { body = await request.json() } catch { return fail('Pedido inválido.', 400, headers) }

  const method = body.payment_method === 'cod' ? 'cod' : body.payment_method === 'wompi' ? 'wompi' : null
  if (!method) return fail('Elige una forma de pago.', 400, headers)

  const name = String(body.customer?.name ?? '').trim().slice(0, 120)
  const phone = String(body.customer?.phone ?? '').replace(/\D/g, '').slice(0, 15)
  const address = String(body.customer?.address ?? '').trim().slice(0, 300)
  const city = String(body.customer?.city ?? '').trim().slice(0, 80)
  if (!name || phone.length < 7 || !address || !city) {
    return fail('Completa todos los datos de envío.', 400, headers)
  }

  const parsed = parseLines(body.items)
  if (!parsed.ok) return fail(parsed.error, 400, headers)

  const supabase = createServerClient()

  // Freno: una cuenta no puede crear pedidos en ráfaga (ni probar cupones
  // en bucle a través del checkout).
  if (!(await allowRequest(supabase, `checkout:${email}`, 10, 600))) {
    return fail('Demasiados intentos. Espera unos minutos e intenta de nuevo.', 429, headers)
  }

  // ── 3. Precios, stock, cupón y envío: lib/pricing.ts ───────────────────
  const quoted = await quoteOrder(supabase, {
    lines: parsed.lines,
    city,
    couponCode: body.coupon_code ? String(body.coupon_code) : null,
    customer: { email, phone },
  })
  if (!quoted.ok) return fail(quoted.error, quoted.status, headers)
  const { items, total, shipping_cost: shippingCost, discount_amount: discountAmount, coupon } = quoted.quote
  const amountInCents = total * 100

  // ── 4. Reservar el cupón (atómico: dos pedidos a la vez no lo gastan dos veces)
  let couponUseId: string | null = null
  if (coupon) {
    const claim = await claimCoupon(supabase, coupon.code, { email, phone })
    if (!claim.ok) return fail(claim.error, 400, headers)
    couponUseId = claim.useId
  }

  // ── 5. Crear el pedido ─────────────────────────────────────────────────
  const reference = method === 'wompi' ? `WEB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` : null
  const fullAddress = `${name} — ${address}, ${city}. Tel: +${phone}`
  const { data: order, error: insErr } = await supabase
    .from('orders')
    .insert({
      customer_phone: phone,
      customer_name: name,
      customer_email: email,
      items,
      total,
      shipping_address: fullAddress,
      shipping_cost: shippingCost,
      payment_method: method === 'cod' ? 'Contraentrega' : 'Wompi (web)',
      wompi_reference: reference,
      amount_in_cents: amountInCents,
      currency: 'COP',
      source: 'webpage',
      payment_status: method === 'cod' ? 'cod' : 'pending',
      status: 'pendiente',
      coupon_code: coupon?.code ?? null,
      discount_amount: discountAmount,
    })
    .select('id')
    .single()
  if (insErr || !order) {
    if (couponUseId) await releaseCoupon(supabase, couponUseId)
    console.error('[checkout] no se pudo crear el pedido:', insErr)
    return fail('No se pudo crear el pedido. Intenta de nuevo.', 500, headers)
  }

  if (couponUseId) await attachCouponUse(supabase, couponUseId, order.id)

  emailOrderCreated({
    shortId: order.id.slice(0, 8).toUpperCase(),
    customerName: name,
    customerEmail: email,
    total,
    items: items as never,
    shippingAddress: fullAddress,
  }).catch((e) => console.error('[checkout] email:', e))

  // Contraentrega: se descuenta stock y se avisa al equipo ya. Con Wompi eso
  // pasa cuando el webhook confirma el pago.
  if (method === 'cod') {
    const inv = await applyOrderStock(supabase, { id: order.id, items })
    if (inv.errors.length) console.error('[checkout] inventario:', inv.errors)
    await notifyTeam(orderAlert('cod', { id: order.id, customer_name: name, total, items, source: 'webpage' }))
    return NextResponse.json({ order_id: order.id, total }, { status: 201, headers })
  }

  return NextResponse.json(
    {
      order_id: order.id,
      total,
      wompi: {
        reference,
        amount_in_cents: amountInCents,
        currency: 'COP',
        // La llave pública va junto con la firma: así las dos salen siempre
        // del mismo ambiente (pruebas o producción) y se cambian en un solo
        // lugar, las variables del bot.
        public_key: process.env.WOMPI_PUBLIC_KEY,
        signature: signIntegrity(reference!, amountInCents, 'COP'),
      },
    },
    { status: 201, headers },
  )
}

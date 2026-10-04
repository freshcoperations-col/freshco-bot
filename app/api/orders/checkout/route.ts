import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase'
import { bearerToken } from '@/lib/admin-auth'
import { checkCoupon, recordCouponUse, type ValidCoupon } from '@/lib/coupons'
import { getShippingCost } from '@/lib/shipping'
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

const MAX_LINES = 20
const MAX_QTY = 10

interface CartLine { product_id: string; size: string | null; color: string | null; quantity: number }

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

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) return fail('Tu carrito está vacío.', 400, headers)
  if (rawItems.length > MAX_LINES) return fail('Demasiados productos en un solo pedido.', 400, headers)
  const lines: CartLine[] = rawItems.map((r) => {
    const it = r as Record<string, unknown>
    return {
      product_id: String(it.product_id ?? ''),
      size: it.size ? String(it.size) : null,
      color: it.color ? String(it.color) : null,
      quantity: Math.floor(Number(it.quantity)),
    }
  })
  if (lines.some((l) => !l.product_id || !(l.quantity >= 1 && l.quantity <= MAX_QTY))) {
    return fail('Hay un producto con una cantidad inválida.', 400, headers)
  }

  // ── 3. Precios y disponibilidad, desde la base ─────────────────────────
  const supabase = createServerClient()
  const { data: products } = await supabase
    .from('products_full')
    .select('id, name, price, sale_price, on_sale, sizes, colors, available, collection_active, out_of_stock, free_shipping, stock_mode, stock_variants')
    .in('id', Array.from(new Set(lines.map((l) => l.product_id))))
  const byId = new Map((products ?? []).map((p) => [String(p.id), p as Record<string, unknown>]))

  const items: Array<{ product_id: string; product_name: string; size: string; color: string; quantity: number; unit_price: number }> = []
  let subtotal = 0
  let freeShipping = false
  for (const l of lines) {
    const p = byId.get(l.product_id)
    if (!p || p.available === false || p.collection_active === false) {
      return fail('Un producto de tu carrito ya no está disponible. Revisa el carrito.', 409, headers)
    }
    if (p.out_of_stock) return fail(`"${p.name}" está agotado.`, 409, headers)

    const sizes = (p.sizes as string[] | null) ?? []
    const colors = (p.colors as string[] | null) ?? []
    if (sizes.length && (!l.size || !sizes.includes(l.size))) return fail(`Elige una talla válida para "${p.name}".`, 400, headers)
    if (colors.length && (!l.color || !colors.includes(l.color))) return fail(`Elige un color válido para "${p.name}".`, 400, headers)

    // Stock por variante: no vender una combinación que no hay.
    if (p.stock_mode === 'variantes') {
      const v = ((p.stock_variants as Array<{ size: string | null; color: string | null; quantity: number }> | null) ?? [])
        .find((x) => (x.size ?? null) === (l.size ?? null) && (x.color ?? null) === (l.color ?? null))
      if (!v || v.quantity < l.quantity) {
        return fail(`No hay suficientes unidades de "${p.name}" en ${[l.size, l.color].filter(Boolean).join(' / ')}.`, 409, headers)
      }
    }

    const price = Number(p.price)
    const sale = p.sale_price == null ? null : Number(p.sale_price)
    const unit = p.on_sale && sale != null && sale < price ? sale : price
    subtotal += unit * l.quantity
    if (p.free_shipping) freeShipping = true
    items.push({
      product_id: l.product_id,
      product_name: String(p.name),
      size: l.size ?? 'N/A',
      color: l.color ?? '',
      quantity: l.quantity,
      unit_price: unit,
    })
  }

  // ── 4. Cupón y envío ───────────────────────────────────────────────────
  let coupon: ValidCoupon | null = null
  if (body.coupon_code && String(body.coupon_code).trim()) {
    const check = await checkCoupon(supabase, String(body.coupon_code), { email, phone })
    if (!check.ok) return fail(check.error, 400, headers)
    coupon = check.coupon
  }
  const discountAmount = coupon ? Math.round(subtotal * coupon.discount) : 0
  const shippingCost = getShippingCost(city, freeShipping)
  const total = Math.round(subtotal - discountAmount + shippingCost)
  const amountInCents = total * 100

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
    console.error('[checkout] no se pudo crear el pedido:', insErr)
    return fail('No se pudo crear el pedido. Intenta de nuevo.', 500, headers)
  }

  if (coupon) await recordCouponUse(supabase, coupon, { email, phone, orderId: order.id })

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
        signature: signIntegrity(reference!, amountInCents, 'COP'),
      },
    },
    { status: 201, headers },
  )
}

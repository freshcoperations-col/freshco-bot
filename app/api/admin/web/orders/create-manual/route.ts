import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { buildPaymentLink } from '@/lib/wompi'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/orders/create-manual
// Crea una orden manual desde el admin y genera link de pago Wompi con precio fijo.
export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: admin.reason }, { status: 403, headers: cors })
  }

  let body: {
    customer_name: string
    customer_phone: string
    customer_email?: string
    shipping_address?: string
    items: Array<{
      product_id?: string
      product_name: string
      size?: string
      color?: string
      quantity: number
      unit_price: number
    }>
    notes?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const { customer_name, customer_phone, items } = body
  if (!customer_name || !customer_phone || !items?.length) {
    return NextResponse.json(
      { error: 'customer_name, customer_phone e items son requeridos' },
      { status: 400, headers: cors },
    )
  }

  const total = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
  const amountInCents = total * 100

  const supabase = createServerClient()

  // Crear orden en Supabase
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      customer_name,
      customer_phone,
      customer_email: body.customer_email ?? null,
      shipping_address: body.shipping_address ?? null,
      items,
      total,
      payment_status: 'pending',
      status: 'pendiente',
      source: 'admin_manual',
      notes: body.notes ?? null,
    })
    .select('id')
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'No se pudo crear la orden', detail: error?.message }, { status: 500, headers: cors })
  }

  const shortId = order.id.slice(0, 8).toUpperCase()
  const reference = `ADMIN-${shortId}-${Date.now()}`

  // Actualizar la orden con la referencia de Wompi
  await supabase
    .from('orders')
    .update({ wompi_reference: reference })
    .eq('id', order.id)

  // Generar link de pago Wompi con precio fijo
  let paymentLink: string | null = null
  try {
    paymentLink = buildPaymentLink({
      reference,
      amountInCents,
      customerEmail: body.customer_email,
      customerName: customer_name,
      customerPhone: customer_phone.replace(/^\+/, ''),
      redirectUrl: `${process.env.WOMPI_REDIRECT_URL ?? 'https://freshco-design.com'}?order_paid=1`,
    })
  } catch (e) {
    console.error('[create-manual] Error generando link Wompi:', e)
  }

  return NextResponse.json(
    {
      order_id: order.id,
      short_id: shortId,
      reference,
      total,
      payment_link: paymentLink,
    },
    { status: 201, headers: cors },
  )
}

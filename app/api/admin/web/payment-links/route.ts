import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { buildPaymentLink } from '@/lib/wompi'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/payment-links
// Genera un link de pago Wompi con monto fijo, opcionalmente relacionado a un pedido existente.
export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: admin.reason }, { status: 403, headers: cors })
  }

  let body: {
    amount: number
    description?: string
    customer_name: string
    customer_phone: string
    customer_email?: string
    related_order_id?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const { amount, customer_name, customer_phone } = body
  if (!amount || amount <= 0 || !customer_name || !customer_phone) {
    return NextResponse.json(
      { error: 'amount, customer_name y customer_phone son requeridos' },
      { status: 400, headers: cors },
    )
  }

  const amountInCents = Math.round(amount) * 100
  const supabase = createServerClient()

  // Construir el campo notes con referencia al pedido relacionado si aplica
  const noteParts: string[] = []
  if (body.description) noteParts.push(body.description)
  if (body.related_order_id) noteParts.push(`Pedido relacionado: ${body.related_order_id}`)
  const notes = noteParts.length > 0 ? noteParts.join(' — ') : null

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      customer_name,
      customer_phone,
      customer_email: body.customer_email ?? null,
      items: [{ product_name: body.description ?? 'Pago adicional', quantity: 1, unit_price: amount }],
      total: amount,
      payment_status: 'pending',
      status: 'pendiente',
      source: 'payment_link',
      notes,
    })
    .select('id')
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'No se pudo crear el registro', detail: error?.message }, { status: 500, headers: cors })
  }

  const shortId = order.id.slice(0, 8).toUpperCase()
  const reference = `LINK-${shortId}-${Date.now()}`

  await supabase.from('orders').update({ wompi_reference: reference }).eq('id', order.id)

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
    console.error('[payment-links] Error generando link Wompi:', e)
  }

  return NextResponse.json(
    { order_id: order.id, short_id: shortId, reference, amount, payment_link: paymentLink },
    { status: 201, headers: cors },
  )
}

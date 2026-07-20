import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { buildPaymentLink } from '@/lib/wompi'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// Quita espacios y normaliza el prefijo + (evita ++57...)
function normalizePhone(p: string): string {
  return p.trim().replace(/\s/g, '').replace(/^\+{2,}/, '+')
}

// POST /api/admin/web/payment-links
// Genera SOLO un link de Wompi con monto fijo. No crea pedidos.
// Si se pasa related_order_id, registra el link en la nota de ese pedido.
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

  const { amount, customer_name } = body
  const customer_phone = normalizePhone(body.customer_phone ?? '')

  if (!amount || amount <= 0 || !customer_name || !customer_phone) {
    return NextResponse.json(
      { error: 'amount, customer_name y customer_phone son requeridos' },
      { status: 400, headers: cors },
    )
  }

  const amountInCents = Math.round(amount) * 100
  const reference = `LINK-${randomUUID().slice(0, 8).toUpperCase()}-${Date.now()}`

  // Si hay pedido relacionado, guardamos el link en su campo notes (no crea pedido nuevo)
  if (body.related_order_id) {
    try {
      const supabase = createServerClient()
      const { data: existing } = await supabase
        .from('orders')
        .select('notes')
        .eq('id', body.related_order_id)
        .single()

      const extraNote = `Link adicional ${body.description ? `(${body.description}) ` : ''}ref:${reference}`
      const updatedNotes = existing?.notes ? `${existing.notes}\n${extraNote}` : extraNote
      await supabase.from('orders').update({ notes: updatedNotes }).eq('id', body.related_order_id)
    } catch {
      // No crítico — el link se genera igual
    }
  }

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
    return NextResponse.json({ error: 'No se pudo generar el link de Wompi' }, { status: 500, headers: cors })
  }

  return NextResponse.json(
    { reference, amount, payment_link: paymentLink },
    { status: 200, headers: cors },
  )
}

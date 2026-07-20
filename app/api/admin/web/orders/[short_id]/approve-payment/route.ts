import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, logMessage } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { emailPaymentConfirmed } from '@/lib/email'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/orders/[short_id]/approve-payment
// Aprueba manualmente el pago de una orden pendiente, notifica al cliente
// por WhatsApp y email, y decrementa el inventario global.
export async function POST(
  request: NextRequest,
  { params }: { params: { short_id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: admin.reason }, { status: 403, headers: cors })
  }

  const shortId = params.short_id?.toLowerCase().replace(/^#/, '').trim()
  if (!shortId) {
    return NextResponse.json({ error: 'short_id requerido' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, payment_status, customer_name, customer_phone, customer_email, total, items, shipping_address')
    .order('created_at', { ascending: false })
    .limit(200)

  const order = (orders ?? []).find((o) => (o.id as string).toLowerCase().startsWith(shortId))
  if (!order) {
    return NextResponse.json({ error: `Orden #${shortId} no encontrada` }, { status: 404, headers: cors })
  }

  if (order.payment_status === 'approved' || order.payment_status === 'cod') {
    return NextResponse.json({ error: 'La orden ya está marcada como pagada.' }, { status: 409, headers: cors })
  }

  const { error: updateErr } = await supabase
    .from('orders')
    .update({ payment_status: 'approved', paid_at: new Date().toISOString() })
    .eq('id', order.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500, headers: cors })
  }

  const orderShort = (order.id as string).slice(0, 8).toUpperCase()
  const phone = order.customer_phone as string
  const warnings: string[] = []

  // WhatsApp
  const msg =
    `¡Pago confirmado! 🎉 Tu pedido #${orderShort} por $${Number(order.total).toLocaleString('es-CO')} ya quedó pago. ` +
    `Lo preparamos y te enviamos el número de guía cuando salga. Gracias por confiar en Freshco 💛`
  try {
    await sendWhatsAppMessage(phone, msg)
    await logMessage(supabase, {
      customer_phone: phone,
      direction: 'outbound',
      content: msg,
      intent: 'consulta_pago',
    })
  } catch (err) {
    warnings.push(`WhatsApp: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Decrementar inventario global
  type OrderItem = { product_id?: string; quantity?: number; size?: string; color?: string }
  const items = ((order.items ?? []) as OrderItem[])
  for (const item of items) {
    const size = item.size?.trim()
    const color = item.color?.trim()
    if (!size || !color) continue
    const qty = item.quantity ?? 1

    let garmentType = ''
    if (item.product_id) {
      const { data: prod } = await supabase
        .from('products')
        .select('garment_type')
        .eq('id', item.product_id)
        .maybeSingle()
      garmentType = prod?.garment_type ?? ''
    }

    const { error: rpcErr } = await supabase.rpc('decrement_global_inventory', {
      p_garment_type: garmentType,
      p_size: size,
      p_color: color,
      p_qty: qty,
    })
    if (!rpcErr) {
      await supabase.from('inventory_log').insert({
        garment_type: garmentType,
        size,
        color,
        change_qty: -qty,
        reason: 'sale',
        order_id: order.id,
      })
    }
  }

  // Email
  if (order.customer_email) {
    try {
      await emailPaymentConfirmed({
        shortId: orderShort,
        customerName: order.customer_name as string | null,
        customerEmail: order.customer_email as string,
        total: Number(order.total),
        items: items as never,
        shippingAddress: order.shipping_address as string | null,
      })
    } catch (err) {
      warnings.push(`Email: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json(
    { ok: true, short_id: orderShort, ...(warnings.length ? { warnings } : {}) },
    { headers: cors },
  )
}

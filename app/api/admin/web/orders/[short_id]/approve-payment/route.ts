import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/orders/[short_id]/approve-payment
// Aprueba manualmente el pago de una orden pendiente.
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
    .select('id, payment_status, customer_name, customer_phone')
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

  return NextResponse.json({ ok: true, short_id: (order.id as string).slice(0, 8).toUpperCase() }, { headers: cors })
}

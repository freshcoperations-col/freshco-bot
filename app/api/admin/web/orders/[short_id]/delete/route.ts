import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// DELETE /api/admin/web/orders/[short_id]/delete
// Elimina definitivamente una orden. No se puede deshacer.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { short_id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const shortId = params.short_id?.toLowerCase().replace(/^#/, '').trim()
  if (!shortId) return NextResponse.json({ error: 'short_id requerido' }, { status: 400, headers: cors })

  const supabase = createServerClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, customer_name')
    .order('created_at', { ascending: false })
    .limit(200)

  const order = (orders ?? []).find((o) => (o.id as string).toLowerCase().startsWith(shortId))
  if (!order) return NextResponse.json({ error: `Orden #${shortId} no encontrada` }, { status: 404, headers: cors })

  const { error } = await supabase.from('orders').delete().eq('id', order.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ ok: true }, { headers: cors })
}

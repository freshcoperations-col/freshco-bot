import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// DELETE /api/orders/[short_id]
// Elimina definitivamente un pedido.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { short_id: string } },
) {
  const shortId = params.short_id.toLowerCase().replace(/^#/, '').trim()
  if (!shortId) {
    return NextResponse.json({ error: 'short_id requerido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(200)

  const order = (orders ?? []).find((o) => (o.id as string).toLowerCase().startsWith(shortId))
  if (!order) {
    return NextResponse.json({ error: `Orden #${shortId} no encontrada` }, { status: 404 })
  }

  const { error } = await supabase.from('orders').delete().eq('id', order.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

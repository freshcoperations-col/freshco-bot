import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// PATCH /api/products/[id]
// Body: { available?: boolean, out_of_stock?: boolean }
// Actualiza estado de visibilidad o agotado desde el dashboard.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: { available?: boolean; out_of_stock?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.available === 'boolean') patch.available = body.available
  if (typeof body.out_of_stock === 'boolean') patch.out_of_stock = body.out_of_stock

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase.from('products').update(patch).eq('id', params.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, patch }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

// DELETE /api/products/[id]
// Elimina definitivamente un producto.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()
  const { error } = await supabase.from('products').delete().eq('id', params.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

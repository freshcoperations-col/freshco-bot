import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// PUT /api/admin/web/collections/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const patch: Record<string, unknown> = {}
  if (body.label !== undefined) patch.label = String(body.label).trim()
  if (body.description !== undefined) patch.description = body.description ? String(body.description) : null
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order)
  if (body.active !== undefined) patch.active = Boolean(body.active)

  const { data, error } = await supabase
    .from('collections')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ collection: data }, { headers: cors })
}

// DELETE /api/admin/web/collections/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  // Verificar que no haya productos usando esta colección
  const supabase = createServerClient()
  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .contains('collections', [params.id])

  if (count && count > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: ${count} producto(s) pertenecen a esta colección.` },
      { status: 409, headers: cors },
    )
  }

  const { error } = await supabase.from('collections').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ ok: true }, { headers: cors })
}

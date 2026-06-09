import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// PUT /api/admin/web/roles/[id]
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { name?: string; description?: string; permissions?: Record<string, boolean> }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()

  // No modificar roles de sistema (solo sus permisos, no el nombre)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.description !== undefined) patch.description = body.description.trim()
  if (body.permissions !== undefined) patch.permissions = body.permissions
  if (body.name) patch.name = body.name.trim()

  const { data, error } = await supabase
    .from('admin_roles')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ role: data }, { headers: cors })
}

// DELETE /api/admin/web/roles/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()

  // Verificar que no es un rol del sistema
  const { data: role } = await supabase.from('admin_roles').select('is_system').eq('id', params.id).maybeSingle()
  if (role?.is_system) return NextResponse.json({ error: 'No se puede eliminar un rol del sistema' }, { status: 400, headers: cors })

  // Verificar que no hay usuarios con este rol
  const { count } = await supabase.from('admin_users').select('id', { count: 'exact', head: true }).eq('role_id', params.id)
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'Hay usuarios con este rol. Reasígnalos primero.' }, { status: 400, headers: cors })

  const { error } = await supabase.from('admin_roles').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ ok: true }, { headers: cors })
}

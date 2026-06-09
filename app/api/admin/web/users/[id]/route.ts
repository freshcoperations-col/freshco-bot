import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// PUT /api/admin/web/users/[id] — cambiar rol
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { role_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  if (!body.role_id) return NextResponse.json({ error: 'role_id requerido' }, { status: 400, headers: cors })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('admin_users')
    .update({ role_id: body.role_id, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, email, role_id, admin_roles(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ user: data }, { headers: cors })
}

// DELETE /api/admin/web/users/[id] — revocar acceso
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()
  const { error } = await supabase.from('admin_users').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ ok: true }, { headers: cors })
}

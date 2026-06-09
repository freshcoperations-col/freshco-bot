import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/roles
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('admin_roles')
    .select('id, name, description, permissions, is_system, created_at')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ roles: data ?? [] }, { headers: cors })
}

// POST /api/admin/web/roles — solo dueños (isOwner)
export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { name?: string; description?: string; permissions?: Record<string, boolean> }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'name requerido' }, { status: 400, headers: cors })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('admin_roles')
    .insert({ name, description: body.description?.trim() ?? '', permissions: body.permissions ?? {} })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ role: data }, { status: 201, headers: cors })
}

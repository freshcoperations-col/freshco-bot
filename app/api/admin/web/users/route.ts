import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/users
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, email, role_id, created_at, admin_roles(id, name)')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbUsers = (data ?? []).map((u: any) => ({
    id: u.id as string,
    email: u.email as string,
    role_id: u.role_id as string,
    role_name: (Array.isArray(u.admin_roles) ? u.admin_roles[0]?.name : u.admin_roles?.name) ?? '',
    created_at: u.created_at as string,
    is_env_owner: false,
  }))

  // También incluir propietarios definidos en ADMIN_EMAILS (env var)
  const ownerEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

  const dbEmailSet = new Set(dbUsers.map((u) => u.email))
  const envOwners = ownerEmails
    .filter((email) => !dbEmailSet.has(email))
    .map((email) => ({
      id: `env:${email}`,
      email,
      role_id: '',
      role_name: 'Propietario',
      created_at: new Date(0).toISOString(),
      is_env_owner: true,
    }))

  return NextResponse.json({ users: [...envOwners, ...dbUsers] }, { headers: cors })
}

// POST /api/admin/web/users — agregar usuario al admin
export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { email?: string; role_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const email = body.email?.toLowerCase().trim()
  if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400, headers: cors })
  if (!body.role_id) return NextResponse.json({ error: 'role_id requerido' }, { status: 400, headers: cors })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('admin_users')
    .insert({ email, role_id: body.role_id })
    .select('id, email, role_id, created_at, admin_roles(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = data as any
  return NextResponse.json({
    user: {
      id: u.id as string,
      email: u.email as string,
      role_id: u.role_id as string,
      role_name: (Array.isArray(u.admin_roles) ? u.admin_roles[0]?.name : u.admin_roles?.name) ?? '',
      created_at: u.created_at as string,
    },
  }, { status: 201, headers: cors })
}

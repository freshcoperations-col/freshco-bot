import { createClient } from '@supabase/supabase-js'
import { ADMIN_PERMISSIONS, type PermissionsMap } from './permissions'

export type AdminResult =
  | { ok: false; reason: string }
  | { ok: true; email: string; role: string; permissions: PermissionsMap; isOwner: boolean }

// Verifica el access_token de Supabase Auth.
// - Los emails en ADMIN_EMAILS tienen acceso total siempre (backwards compat).
// - El resto necesita estar en la tabla admin_users con un rol asignado.
export async function verifyAdmin(token: string | null): Promise<AdminResult> {
  if (!token) return { ok: false, reason: 'no_token' }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, reason: 'misconfigured' }

  const supabase = createClient(url, key, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return { ok: false, reason: 'invalid_token' }

  const email = data.user.email?.toLowerCase().trim()
  if (!email) return { ok: false, reason: 'no_email' }

  // Propietarios (ADMIN_EMAILS) → acceso total, siempre
  const ownerEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (ownerEmails.includes(email)) {
    return { ok: true, email, role: 'Admin', permissions: ADMIN_PERMISSIONS, isOwner: true }
  }

  // Resto de usuarios → buscar en admin_users + su rol
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('role_id, admin_roles(name, permissions)')
    .eq('email', email)
    .maybeSingle()

  if (!adminUser) return { ok: false, reason: 'not_admin' }

  const raw = adminUser.admin_roles
  const roleRow = (Array.isArray(raw) ? raw[0] : raw) as { name: string; permissions: Record<string, boolean> } | null
  if (!roleRow) return { ok: false, reason: 'no_role' }

  const permissions = (roleRow.permissions ?? {}) as PermissionsMap

  return { ok: true, email, role: roleRow.name, permissions, isOwner: false }
}

export function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

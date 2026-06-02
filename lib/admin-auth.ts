import { createClient } from '@supabase/supabase-js'

// Verifica que un access_token de Supabase Auth corresponda a un email
// listado en la env var ADMIN_EMAILS (comma-separated, case-insensitive).
//
// Usado por los endpoints internos del admin webapp (NO los endpoints
// curl-style que siguen usando ADMIN_SECRET con header).
export async function verifyAdmin(
  token: string | null,
): Promise<{ ok: boolean; email?: string; reason?: string }> {
  if (!token) return { ok: false, reason: 'no_token' }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, reason: 'misconfigured' }

  const supabase = createClient(url, key, {
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return { ok: false, reason: 'invalid_token' }

  const email = data.user.email?.toLowerCase().trim()
  if (!email) return { ok: false, reason: 'no_email' }

  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (admins.length === 0) {
    // Si ADMIN_EMAILS no está configurada, por seguridad no autorizamos a nadie.
    return { ok: false, reason: 'no_admins_configured' }
  }
  if (!admins.includes(email)) return { ok: false, reason: 'not_admin' }

  return { ok: true, email }
}

export function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

import { createClient } from '@supabase/supabase-js'
import { bearerToken } from '@/lib/admin-auth'

// Correo VERIFICADO del cliente a partir del token de su sesión de Supabase
// (la tienda lo manda en Authorization: Bearer). null = sin sesión válida.
// Nunca se confía en un correo que venga en el cuerpo de la petición.
export async function customerEmailFromRequest(authHeader: string | null): Promise<string | null> {
  const token = bearerToken(authHeader)
  if (!token) return null
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
  const { data, error } = await client.auth.getUser(token)
  return error ? null : data?.user?.email?.toLowerCase().trim() || null
}

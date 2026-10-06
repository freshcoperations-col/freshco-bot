import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

// Freno de intentos (función rate_limit_hit en la base). Vercel corre muchas
// instancias, así que un contador en memoria no serviría: vive en Postgres.
// Si la base falla, se deja pasar: un freno caído no puede tumbar la tienda.
export async function allowRequest(
  supabase: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('rate_limit_hit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error('[rate-limit] error, se deja pasar:', error.message)
    return true
  }
  return data !== false
}

export function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

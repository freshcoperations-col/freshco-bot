import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function preview(value: string | undefined): {
  set: boolean
  length: number
  prefix: string
  suffix: string
  hasWhitespace: boolean
} {
  if (!value) return { set: false, length: 0, prefix: '', suffix: '', hasWhitespace: false }
  return {
    set: true,
    length: value.length,
    prefix: value.slice(0, 12),
    suffix: value.slice(-8),
    hasWhitespace: /\s/.test(value),
  }
}

export async function GET() {
  const url = process.env.SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.SUPABASE_ANON_KEY
  const pubUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const pubAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let pingOk = false
  let pingError: string | null = null
  try {
    const supabase = createServerClient()
    const { error } = await supabase.from('messages').select('id').limit(1)
    if (error) {
      pingError = `${error.message} | hint: ${error.hint ?? ''}`
    } else {
      pingOk = true
    }
  } catch (e) {
    pingError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    runtime: 'nodejs',
    SUPABASE_URL: preview(url),
    SUPABASE_SERVICE_ROLE_KEY: preview(serviceRole),
    SUPABASE_ANON_KEY: preview(anon),
    NEXT_PUBLIC_SUPABASE_URL: preview(pubUrl),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: preview(pubAnon),
    supabase_ping: { ok: pingOk, error: pingError },
  })
}

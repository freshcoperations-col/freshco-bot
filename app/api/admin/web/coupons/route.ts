import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ coupons: data ?? [] }, { headers: cors })
}

export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const code = String(body.code ?? '').trim().toUpperCase()
  const discount = Number(body.discount)
  if (!code || isNaN(discount) || discount <= 0 || discount > 1) {
    return NextResponse.json({ error: 'code y discount (0-1) son requeridos' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase.from('coupons').insert({
    code,
    discount,
    description: body.description ? String(body.description) : null,
    active: body.active !== false,
    usage_limit: body.usage_limit ? Number(body.usage_limit) : null,
    expires_at: body.expires_at ? String(body.expires_at) : null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ coupon: data }, { status: 201, headers: cors })
}

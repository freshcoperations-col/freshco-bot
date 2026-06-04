import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const patch: Record<string, unknown> = {}
  if (body.active !== undefined) patch.active = Boolean(body.active)
  if (body.code !== undefined) patch.code = String(body.code).trim().toUpperCase()
  if (body.discount !== undefined) patch.discount = Number(body.discount)
  if (body.description !== undefined) patch.description = body.description ? String(body.description) : null
  if (body.usage_limit !== undefined) patch.usage_limit = body.usage_limit ? Number(body.usage_limit) : null
  if (body.expires_at !== undefined) patch.expires_at = body.expires_at ? String(body.expires_at) : null
  if (body.used_count !== undefined) patch.used_count = Number(body.used_count)

  const supabase = createServerClient()
  const { data, error } = await supabase.from('coupons').update(patch).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ coupon: data }, { headers: cors })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()
  const { error } = await supabase.from('coupons').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ ok: true }, { headers: cors })
}

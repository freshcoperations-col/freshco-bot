import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// PUT /api/admin/web/banners/order — Body: { ids: string[] } en el orden nuevo.
export async function PUT(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.banners_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }
  let body: { ids?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
  if (ids.length === 0) return NextResponse.json({ error: 'ids requerido' }, { status: 400, headers: cors })

  const supabase = createServerClient()
  const results = await Promise.all(
    ids.map((id, i) => supabase.from('banners').update({ sort_order: i + 1 }).eq('id', id)),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500, headers: cors })
  return NextResponse.json({ ok: true }, { headers: cors })
}

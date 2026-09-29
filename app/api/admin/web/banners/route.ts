import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { bannerWithUrls as withUrls, normalizeLink } from '@/lib/storage-images'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/banners — todos, activos e inactivos, en orden.
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.banners_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .order('sort_order')
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ banners: (data ?? []).map((b) => withUrls(supabase, b)) }, { headers: cors })
}

// POST /api/admin/web/banners — crea un banner vacío (sin imágenes) al final.
// Las imágenes se suben después con /banners/[id]/image. Nace INACTIVO para
// que no aparezca en la tienda sin imagen.
export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.banners_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }
  let body: { title?: string; link_url?: string }
  try { body = await request.json() } catch { body = {} }

  const link = normalizeLink(body.link_url)
  if (!link.ok) return NextResponse.json({ error: link.error }, { status: 400, headers: cors })

  const supabase = createServerClient()
  const { data: last } = await supabase
    .from('banners').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await supabase
    .from('banners')
    .insert({
      title: String(body.title ?? '').trim().slice(0, 120),
      link_url: link.value,
      sort_order: ((last?.sort_order as number | undefined) ?? 0) + 1,
      active: false,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ banner: withUrls(supabase, data) }, { status: 201, headers: cors })
}

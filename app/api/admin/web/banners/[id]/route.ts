import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { normalizeLink, removeOwnedImage } from '@/lib/storage-images'
import { bannerWithUrls as withUrls } from '@/lib/storage-images'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// PUT /api/admin/web/banners/[id] — Body: { title?, link_url?, active? }
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.banners_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }
  let body: { title?: string; link_url?: string | null; active?: boolean }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) patch.title = String(body.title).trim().slice(0, 120)
  if (body.link_url !== undefined) {
    const link = normalizeLink(body.link_url)
    if (!link.ok) return NextResponse.json({ error: link.error }, { status: 400, headers: cors })
    patch.link_url = link.value
  }
  if (body.active !== undefined) {
    // Un banner sin imagen de computador no se puede activar: se vería vacío.
    if (body.active) {
      const { data: b } = await supabase.from('banners').select('desktop_path').eq('id', params.id).maybeSingle()
      if (!b?.desktop_path) {
        return NextResponse.json(
          { error: 'Sube primero la imagen de computador para poder activarlo.' },
          { status: 400, headers: cors },
        )
      }
    }
    patch.active = Boolean(body.active)
  }

  const { data, error } = await supabase.from('banners').update(patch).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ banner: withUrls(supabase, data) }, { headers: cors })
}

// DELETE /api/admin/web/banners/[id] — borra el banner y sus imágenes.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.banners_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }
  const supabase = createServerClient()
  const { data: b } = await supabase
    .from('banners').select('desktop_path, mobile_path').eq('id', params.id).maybeSingle()
  const { error } = await supabase.from('banners').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  await removeOwnedImage(supabase, (b?.desktop_path as string | null) ?? null)
  await removeOwnedImage(supabase, (b?.mobile_path as string | null) ?? null)
  return NextResponse.json({ ok: true }, { headers: cors })
}

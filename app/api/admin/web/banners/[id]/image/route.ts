import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { BANNER_PREFIX, removeOwnedImage, uploadImage } from '@/lib/storage-images'
import { bannerWithUrls as withUrls } from '@/lib/storage-images'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

function column(device: string | null): 'desktop_path' | 'mobile_path' | null {
  return device === 'desktop' ? 'desktop_path' : device === 'mobile' ? 'mobile_path' : null
}

// POST /api/admin/web/banners/[id]/image — FormData { file, device: desktop|mobile }
// Reemplaza la imagen de ese dispositivo y borra la anterior si la subió el admin.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.banners_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }
  let form: FormData
  try { form = await request.formData() } catch {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400, headers: cors })
  }
  const file = form.get('file') as File | null
  const col = column(form.get('device')?.toString() ?? null)
  if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400, headers: cors })
  if (!col) return NextResponse.json({ error: 'device debe ser desktop o mobile' }, { status: 400, headers: cors })

  const supabase = createServerClient()
  const { data: before } = await supabase.from('banners').select(col).eq('id', params.id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Banner no encontrado' }, { status: 404, headers: cors })

  const up = await uploadImage(supabase, BANNER_PREFIX, `${col === 'desktop_path' ? 'desktop' : 'mobile'}`, file)
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: 400, headers: cors })

  const { data, error } = await supabase
    .from('banners')
    .update({ [col]: up.path, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()
  if (error) {
    await removeOwnedImage(supabase, up.path)
    return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  }
  await removeOwnedImage(supabase, (before as Record<string, string | null>)[col])
  return NextResponse.json({ banner: withUrls(supabase, data) }, { headers: cors })
}

// DELETE /api/admin/web/banners/[id]/image?device=mobile — quita la imagen de
// celular (la tienda vuelve a usar la de computador). La de computador no se
// puede quitar: sin ella el banner no tiene qué mostrar.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.banners_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }
  const device = new URL(request.url).searchParams.get('device')
  if (device !== 'mobile') {
    return NextResponse.json({ error: 'Solo se puede quitar la imagen de celular' }, { status: 400, headers: cors })
  }
  const supabase = createServerClient()
  const { data: before } = await supabase.from('banners').select('mobile_path').eq('id', params.id).maybeSingle()
  const { data, error } = await supabase
    .from('banners')
    .update({ mobile_path: null, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  await removeOwnedImage(supabase, (before?.mobile_path as string | null) ?? null)
  return NextResponse.json({ banner: withUrls(supabase, data) }, { headers: cors })
}

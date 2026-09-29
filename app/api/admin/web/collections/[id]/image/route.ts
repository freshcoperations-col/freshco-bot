import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { COLLECTION_PREFIX, IMAGES_BUCKET, publicUrl, removeOwnedImage, uploadImage } from '@/lib/storage-images'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// collections.image_url guarda la URL completa (así la lee la tienda desde
// siempre). Para poder borrar el archivo al reemplazarlo, se recupera la ruta
// dentro del bucket a partir de esa URL.
function pathFromUrl(url: string | null): string | null {
  if (!url) return null
  const marker = `/object/public/${IMAGES_BUCKET}/`
  const i = url.indexOf(marker)
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split('?')[0]) : null
}

// POST /api/admin/web/collections/[id]/image — FormData { file }
// Sube la imagen de la tarjeta de la colección y reemplaza la anterior.
// Al cambiar la foto el punto de enfoque vuelve al centro: el de la foto
// anterior no significa nada en la nueva.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.collections_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }
  let form: FormData
  try { form = await request.formData() } catch {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400, headers: cors })
  }
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400, headers: cors })

  const supabase = createServerClient()
  const { data: before } = await supabase.from('collections').select('image_url').eq('id', params.id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Colección no encontrada' }, { status: 404, headers: cors })

  const up = await uploadImage(supabase, COLLECTION_PREFIX, params.id, file)
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: 400, headers: cors })

  const { data, error } = await supabase
    .from('collections')
    .update({ image_url: publicUrl(supabase, up.path), image_focus: '50% 50%' })
    .eq('id', params.id)
    .select()
    .single()
  if (error) {
    await removeOwnedImage(supabase, up.path)
    return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  }
  await removeOwnedImage(supabase, pathFromUrl(before.image_url as string | null))
  return NextResponse.json({ collection: data }, { headers: cors })
}

// DELETE /api/admin/web/collections/[id]/image — la tarjeta vuelve al diseño tipográfico.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.collections_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }
  const supabase = createServerClient()
  const { data: before } = await supabase.from('collections').select('image_url').eq('id', params.id).maybeSingle()
  const { data, error } = await supabase
    .from('collections')
    .update({ image_url: null, image_focus: '50% 50%' })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  await removeOwnedImage(supabase, pathFromUrl((before?.image_url as string | null) ?? null))
  return NextResponse.json({ collection: data }, { headers: cors })
}

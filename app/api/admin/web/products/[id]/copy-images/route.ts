import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import type { ProductImage } from '@/lib/products-db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/admin/web/products/[id]/copy-images
// Body: { source_id: string }
//
// Copia las imágenes de un producto a otro dentro del bucket `productos`.
// Lo usa "Duplicar producto": el formulario crea primero el producto nuevo
// (necesitamos su slug) y después llama aquí para clonar los archivos.
//
// Cubre las dos convenciones que conviven hoy:
//   1. Naming convention legacy: {id}-alfrente-{color}.png / {id}-detras-{color}.png
//   2. Array images[]: {id}-{type}-{color}.{ext}
// Ambas empiezan por "{id}-", así que copiamos todo archivo con ese prefijo
// y reescribimos images[] apuntando a las copias.

const BUCKET = 'productos'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.products_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }

  let body: { source_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const sourceId = body.source_id?.trim()
  const targetId = params.id.trim()
  if (!sourceId) return NextResponse.json({ error: 'source_id requerido' }, { status: 400, headers: cors })
  if (sourceId === targetId) {
    return NextResponse.json({ error: 'source_id y destino son el mismo producto' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()

  // El destino tiene que existir: si no, no hay dónde escribir images[].
  const { data: target } = await supabase.from('products').select('id').eq('id', targetId).maybeSingle()
  if (!target) {
    return NextResponse.json({ error: `El producto ${targetId} no existe` }, { status: 404, headers: cors })
  }

  const { data: source } = await supabase
    .from('products')
    .select('images')
    .eq('id', sourceId)
    .maybeSingle()
  if (!source) {
    return NextResponse.json({ error: `El producto original ${sourceId} no existe` }, { status: 404, headers: cors })
  }

  // 1. Copiar todos los archivos del bucket que empiecen por "{sourceId}-".
  const { data: files, error: listErr } = await supabase.storage
    .from(BUCKET)
    .list('', { limit: 1000 })

  if (listErr) {
    return NextResponse.json({ error: `No se pudo listar Storage: ${listErr.message}` }, { status: 500, headers: cors })
  }

  const prefix = `${sourceId}-`
  const toCopy = (files ?? []).filter((f) => f.name.startsWith(prefix))

  const copied: string[] = []
  const failed: Array<{ file: string; error: string }> = []

  for (const file of toCopy) {
    const newName = `${targetId}-${file.name.slice(prefix.length)}`
    const { error } = await supabase.storage.from(BUCKET).copy(file.name, newName)
    if (error) {
      // "already exists" no es un fallo real — el archivo destino ya está.
      if (/exists/i.test(error.message)) {
        copied.push(newName)
      } else {
        failed.push({ file: file.name, error: error.message })
      }
    } else {
      copied.push(newName)
    }
  }

  // 2. Reescribir images[] del destino apuntando a los archivos copiados.
  const sourceImages = (source.images as ProductImage[] | null) ?? []
  const newImages: ProductImage[] = []

  for (const img of sourceImages) {
    const filename = decodeURIComponent(img.url.split(`/${BUCKET}/`)[1] ?? '')
    if (!filename || !filename.startsWith(prefix)) continue
    const newName = `${targetId}-${filename.slice(prefix.length)}`
    if (!copied.includes(newName)) continue
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(newName)
    newImages.push({ ...img, url: publicUrl, sort_order: newImages.length })
  }

  if (newImages.length > 0) {
    const { error: updateErr } = await supabase
      .from('products')
      .update({ images: newImages })
      .eq('id', targetId)
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500, headers: cors })
    }
  }

  return NextResponse.json(
    { ok: true, copied: copied.length, images: newImages.length, failed },
    { headers: cors },
  )
}

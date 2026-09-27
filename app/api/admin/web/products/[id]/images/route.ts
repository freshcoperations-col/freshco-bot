import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import type { ProductImage, ProductImageType } from '@/lib/products-db'

export const dynamic = 'force-dynamic'

const IMAGE_TYPES: ProductImageType[] = ['back', 'front', 'lifestyle', 'detail', 'flat']

// Quita entradas repetidas por URL y renumera el orden. Hasta ahora varias
// subidas del mismo tipo+color reescribían el mismo archivo y dejaban el
// arreglo con varias entradas apuntando a él; esto lo limpia en cada escritura.
function dedupe(images: ProductImage[]): ProductImage[] {
  const seen = new Set<string>()
  return images
    .filter((img) => {
      if (!img?.url || seen.has(img.url)) return false
      seen.add(img.url)
      return true
    })
    .map((img, i) => ({ ...img, sort_order: i }))
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/products/[id]/images
// FormData: { file: File, type: ProductImageType, color?: string, label?: string }
// Sube la imagen a Storage y la agrega al array images[] del producto.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let formData: FormData
  try { formData = await request.formData() } catch {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400, headers: cors })
  }

  const file = formData.get('file') as File | null
  const type = formData.get('type')?.toString().trim() as ProductImageType | undefined
  const color = formData.get('color')?.toString().trim() || null
  const label = formData.get('label')?.toString().trim() || null

  if (!file) return NextResponse.json({ error: 'file requerido' }, { status: 400, headers: cors })
  if (!type || !IMAGE_TYPES.includes(type)) {
    return NextResponse.json({ error: `type debe ser uno de: ${IMAGE_TYPES.join(', ')}` }, { status: 400, headers: cors })
  }

  const ACCENT_FROM = 'ÁÉÍÓÚÜÑáéíóúüñ'
  const ACCENT_TO   = 'AEIOUUNaeiouun'
  function slugifyColor(c: string): string {
    let out = ''
    for (const ch of c) {
      const i = ACCENT_FROM.indexOf(ch)
      out += i >= 0 ? ACCENT_TO[i] : ch
    }
    return out.toLowerCase().trim().replace(/\s+/g, '-')
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const colorSlug = color ? `-${slugifyColor(color)}` : ''
  // Cada subida lleva un sufijo único. Antes el nombre era solo
  // {id}-{type}-{color}, así que dos fotos del mismo tipo y color escribían
  // el MISMO archivo: la segunda borraba la primera, y como la URL no
  // cambiaba el navegador seguía mostrando la versión vieja en caché.
  // Nadie arma estas URLs por nombre — todo lee la url guardada en images[].
  const unico = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const filename = `${params.id}-${type}${colorSlug}-${unico}.${ext}`

  const bytes = await file.arrayBuffer()
  const supabase = createServerClient()

  const { error: uploadErr } = await supabase.storage
    .from('productos')
    .upload(filename, Buffer.from(bytes), { contentType: file.type || 'image/jpeg', upsert: false })

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500, headers: cors })

  const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(filename)

  // Agregar al array images[] del producto
  const { data: product } = await supabase
    .from('products')
    .select('images')
    .eq('id', params.id)
    .single()

  const existing = dedupe((product?.images as ProductImage[] | null) ?? [])
  const newImage: ProductImage = {
    url: publicUrl,
    type,
    color,
    label,
    sort_order: existing.length,
  }
  const updated = [...existing, newImage]

  const { error: updateErr } = await supabase
    .from('products')
    .update({ images: updated })
    .eq('id', params.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500, headers: cors })

  return NextResponse.json({ ok: true, image: newImage }, { status: 201, headers: cors })
}

// PATCH /api/admin/web/products/[id]/images
// Body: { url: string, color?: string | null, type?: ProductImageType }
// Cambia el color o el tipo de una foto ya subida, sin volver a subirla.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.products_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }

  let body: { url?: string; color?: string | null; type?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }
  if (!body.url) return NextResponse.json({ error: 'url requerida' }, { status: 400, headers: cors })
  if (body.type !== undefined && !IMAGE_TYPES.includes(body.type as ProductImageType)) {
    return NextResponse.json({ error: `type debe ser uno de: ${IMAGE_TYPES.join(', ')}` }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const { data: product } = await supabase.from('products').select('images').eq('id', params.id).single()
  const existing = dedupe((product?.images as ProductImage[] | null) ?? [])

  if (!existing.some((img) => img.url === body.url)) {
    return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404, headers: cors })
  }

  const updated = existing.map((img) => {
    if (img.url !== body.url) return img
    return {
      ...img,
      ...(body.color !== undefined && { color: body.color?.trim() || null }),
      ...(body.type !== undefined && { type: body.type as ProductImageType }),
    }
  })

  const { error } = await supabase.from('products').update({ images: updated }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ ok: true, images: updated }, { headers: cors })
}

// DELETE /api/admin/web/products/[id]/images
// Body: { url: string }  — elimina la imagen del array por URL
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { url?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  if (!body.url) return NextResponse.json({ error: 'url requerida' }, { status: 400, headers: cors })

  const supabase = createServerClient()
  const { data: product } = await supabase
    .from('products')
    .select('images')
    .eq('id', params.id)
    .single()

  const existing = (product?.images as ProductImage[] | null) ?? []
  const updated = dedupe(existing.filter((img) => img.url !== body.url))

  const { error } = await supabase
    .from('products')
    .update({ images: updated })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  // Opcional: borrar el archivo de Storage también
  const filename = body.url.split('/productos/')[1]
  if (filename) {
    await supabase.storage.from('productos').remove([decodeURIComponent(filename)])
  }

  return NextResponse.json({ ok: true })
}

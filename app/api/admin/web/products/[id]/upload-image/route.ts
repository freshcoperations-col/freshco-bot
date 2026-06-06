import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

const ACCENT_FROM = 'ÁÉÍÓÚÜÑáéíóúüñ'
const ACCENT_TO = 'AEIOUUNaeiouun'
function slugifyColor(color: string): string {
  let out = ''
  for (const ch of color) {
    const i = ACCENT_FROM.indexOf(ch)
    out += i >= 0 ? ACCENT_TO[i] : ch
  }
  return out.toLowerCase().trim().replace(/\s+/g, '-')
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/products/[id]/upload-image
// FormData: { file: File, color: string, side: 'frente' | 'detras' }
// Sube la imagen al bucket "productos" de Supabase Storage con el nombre
// correcto: {id}-alfrente-{color-slug}.png o {id}-detras-{color-slug}.png
// Requiere que el bucket "productos" exista y sea público.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400, headers: cors })
  }

  const file = formData.get('file') as File | null
  const color = formData.get('color')?.toString().trim()
  const side = formData.get('side')?.toString().trim()

  if (!file) return NextResponse.json({ error: 'file es requerido' }, { status: 400, headers: cors })
  if (!color) return NextResponse.json({ error: 'color es requerido' }, { status: 400, headers: cors })
  if (side !== 'frente' && side !== 'detras') {
    return NextResponse.json({ error: 'side debe ser "frente" o "detras"' }, { status: 400, headers: cors })
  }

  const colorSlug = slugifyColor(color)
  // Convención: {id}-alfrente-{color}.png y {id}-detras-{color}.png
  const prefix = side === 'frente' ? 'alfrente' : 'detras'
  const filename = `${params.id}-${prefix}-${colorSlug}.png`

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const supabase = createServerClient()
  const { error } = await supabase.storage
    .from('productos')
    .upload(filename, buffer, {
      contentType: 'image/png',
      upsert: true,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(filename)

  return NextResponse.json({ ok: true, filename, public_url: publicUrl }, { status: 201, headers: cors })
}

// DELETE /api/admin/web/products/[id]/upload-image?color=Vainilla&side=frente
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const { searchParams } = new URL(request.url)
  const color = searchParams.get('color')?.trim()
  const side = searchParams.get('side')?.trim()

  if (!color) return NextResponse.json({ error: 'color es requerido' }, { status: 400, headers: cors })
  if (side !== 'frente' && side !== 'detras') {
    return NextResponse.json({ error: 'side debe ser "frente" o "detras"' }, { status: 400, headers: cors })
  }

  const prefix = side === 'frente' ? 'alfrente' : 'detras'
  const filename = `${params.id}-${prefix}-${slugifyColor(color)}.png`

  const supabase = createServerClient()
  const { error } = await supabase.storage.from('productos').remove([filename])
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ ok: true, filename }, { headers: cors })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

const ACCENT_FROM = 'ÁÉÍÓÚÜÑáéíóúüñ'
const ACCENT_TO   = 'AEIOUUNaeiouun'
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

// POST /api/admin/web/products/[id]/upload-model
// FormData: { file: File (.glb), color: string }
// Sube el modelo 3D al bucket "productos" con el nombre:
//   {id}-3d-{color-slug}.glb
// La webpage lo detecta automáticamente vía product3dUrl().
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

  if (!file) return NextResponse.json({ error: 'file requerido' }, { status: 400, headers: cors })
  if (!color) return NextResponse.json({ error: 'color requerido' }, { status: 400, headers: cors })

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'glb' && ext !== 'gltf') {
    return NextResponse.json({ error: 'Solo se aceptan archivos .glb o .gltf' }, { status: 400, headers: cors })
  }

  const colorSlug = slugifyColor(color)
  const filename = `${params.id}-3d-${colorSlug}.${ext}`

  const bytes = await file.arrayBuffer()
  const supabase = createServerClient()

  const { error } = await supabase.storage
    .from('productos')
    .upload(filename, Buffer.from(bytes), {
      contentType: 'application/octet-stream',
      upsert: true,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(filename)

  return NextResponse.json({ ok: true, filename, public_url: publicUrl }, { status: 201, headers: cors })
}

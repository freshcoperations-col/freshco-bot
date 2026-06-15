import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { optimizeGlb } from '@/lib/optimize-glb'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

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

// POST /api/admin/web/products/[id]/optimize-model
// Body JSON: { color: string, ext?: string }
// Descarga el GLB actual desde el bucket "productos", lo comprime
// (Draco + texturas WebP) y lo vuelve a subir con el mismo nombre.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { color?: string; ext?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const color = body.color?.trim()
  const ext = (body.ext || 'glb').toLowerCase()

  if (!color) return NextResponse.json({ error: 'color requerido' }, { status: 400, headers: cors })
  if (ext !== 'glb') {
    return NextResponse.json({ error: 'Solo se puede comprimir .glb' }, { status: 400, headers: cors })
  }

  const colorSlug = slugifyColor(color)
  const filename = `${params.id}-3d-${colorSlug}.${ext}`

  const supabase = createServerClient()

  const { data: original, error: downloadError } = await supabase.storage
    .from('productos')
    .download(filename)

  if (downloadError || !original) {
    return NextResponse.json({ error: downloadError?.message || 'Modelo no encontrado' }, { status: 404, headers: cors })
  }

  const originalBuffer = Buffer.from(await original.arrayBuffer())
  const beforeSize = originalBuffer.length

  let optimizedBuffer: Buffer
  try {
    optimizedBuffer = await optimizeGlb(originalBuffer)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: `Error al comprimir: ${message}` }, { status: 500, headers: cors })
  }

  const afterSize = optimizedBuffer.length

  const { error: uploadError } = await supabase.storage
    .from('productos')
    .upload(filename, optimizedBuffer, {
      contentType: 'application/octet-stream',
      upsert: true,
    })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500, headers: cors })

  const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(filename)

  return NextResponse.json({
    ok: true,
    filename,
    public_url: publicUrl,
    before_size: beforeSize,
    after_size: afterSize,
  }, { headers: cors })
}

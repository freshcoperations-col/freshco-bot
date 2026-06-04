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

// GET /api/admin/web/products/[id]/upload-model-url?color=Vainilla&ext=glb
// Devuelve una URL firmada para que el browser suba el .glb DIRECTAMENTE a
// Supabase Storage sin pasar por Vercel (evita el límite de 4.5MB del body).
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const { searchParams } = new URL(request.url)
  const color = searchParams.get('color')?.trim()
  const ext = searchParams.get('ext')?.toLowerCase() || 'glb'

  if (!color) return NextResponse.json({ error: 'color requerido' }, { status: 400, headers: cors })
  if (ext !== 'glb' && ext !== 'gltf') {
    return NextResponse.json({ error: 'ext debe ser glb o gltf' }, { status: 400, headers: cors })
  }

  const colorSlug = slugifyColor(color)
  const path = `${params.id}-3d-${colorSlug}.${ext}`

  const supabase = createServerClient()

  const { data, error } = await supabase.storage
    .from('productos')
    .createSignedUploadUrl(path, { upsert: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(path)

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path,
    publicUrl,
  }, { headers: cors })
}

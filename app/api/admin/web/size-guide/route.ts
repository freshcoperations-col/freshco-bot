import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/size-guide
// Devuelve la guía de tallas de todos los tipos de prenda.
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()

  // Traer todos los tipos activos con sus guías (LEFT JOIN implícito)
  const { data: types } = await supabase
    .from('garment_types')
    .select('id, label, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  const { data: guides } = await supabase
    .from('size_guide')
    .select('*')

  const guidesMap = Object.fromEntries((guides ?? []).map((g) => [g.garment_type, g]))

  const result = (types ?? []).map((t) => ({
    garment_type: t.id,
    label: t.label,
    sizes: guidesMap[t.id]?.sizes ?? [],
    measurements: guidesMap[t.id]?.measurements ?? [],
  }))

  return NextResponse.json({ guides: result }, { headers: cors })
}

// POST /api/admin/web/size-guide
// Body: { label: string } — crea un nuevo tipo de prenda en garment_types
export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { label?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const label = (body.label ?? '').trim()
  if (!label) return NextResponse.json({ error: 'label requerido' }, { status: 400, headers: cors })

  // Generar id a partir del label
  const id = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')

  const supabase = createServerClient()

  // sort_order = max actual + 1
  const { data: existing } = await supabase.from('garment_types').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  const nextOrder = ((existing?.[0]?.sort_order ?? -1) as number) + 1

  const { data, error } = await supabase
    .from('garment_types')
    .insert({ id, label, sort_order: nextOrder, active: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ garment_type: data }, { status: 201, headers: cors })
}

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

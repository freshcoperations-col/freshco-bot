import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/size-guide/[type]
export async function GET(
  request: NextRequest,
  { params }: { params: { type: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()
  const { data } = await supabase
    .from('size_guide')
    .select('*')
    .eq('garment_type', params.type)
    .maybeSingle()

  return NextResponse.json(data ?? { garment_type: params.type, sizes: [], measurements: [] }, { headers: cors })
}

// PUT /api/admin/web/size-guide/[type]
// Body: { sizes: string[], measurements: [{label, values}][] }
export async function PUT(
  request: NextRequest,
  { params }: { params: { type: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { sizes?: string[]; measurements?: unknown[] }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('size_guide')
    .upsert({
      garment_type: params.type,
      sizes: body.sizes ?? [],
      measurements: body.measurements ?? [],
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json(data, { headers: cors })
}

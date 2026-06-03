import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/meta — garment_types + collections para los dropdowns del formulario.
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }

  const supabase = createServerClient()
  const [{ data: garmentTypes }, { data: collections }] = await Promise.all([
    supabase.from('garment_types').select('id, label, sort_order').eq('active', true).order('sort_order'),
    supabase.from('collections').select('id, label, sort_order').eq('active', true).order('sort_order'),
  ])

  return NextResponse.json(
    { garment_types: garmentTypes ?? [], collections: collections ?? [] },
    { headers: cors },
  )
}

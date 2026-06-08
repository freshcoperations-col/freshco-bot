import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/inventory
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()
  const { data } = await supabase
    .from('global_inventory')
    .select('out_of_stock')
    .eq('id', 1)
    .maybeSingle()

  return NextResponse.json({ out_of_stock: data?.out_of_stock ?? [] }, { headers: cors })
}

// PUT /api/admin/web/inventory
// Body: { out_of_stock: [{size: string|null, color: string|null}] }
export async function PUT(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { out_of_stock?: Array<{ size?: string | null; color?: string | null }> }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  if (!Array.isArray(body.out_of_stock)) {
    return NextResponse.json({ error: 'out_of_stock debe ser un array' }, { status: 400, headers: cors })
  }

  const combos = body.out_of_stock
    .map((c) => ({
      size: c.size?.trim() || null,
      color: c.color?.trim() || null,
    }))
    .filter((c) => c.size || c.color)

  const supabase = createServerClient()
  const { error } = await supabase
    .from('global_inventory')
    .upsert({ id: 1, out_of_stock: combos })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ ok: true, out_of_stock: combos }, { headers: cors })
}

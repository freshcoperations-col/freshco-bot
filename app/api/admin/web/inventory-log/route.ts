import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/inventory-log?limit=50
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const limit = Math.min(200, Number(new URL(request.url).searchParams.get('limit') ?? 50))

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('inventory_log')
    .select('id, garment_type, size, color, change_qty, reason, order_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ log: data ?? [] }, { headers: cors })
}

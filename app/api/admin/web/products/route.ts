import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/products — lista completa para el admin.
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: admin.reason }, { status: 403, headers: cors })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products_full')
    .select('id, name, price, sale_price, on_sale, stock, available, colors, sizes, visual_tags, garment_type_label, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'query_failed', details: error.message }, { status: 500, headers: cors })
  }

  return NextResponse.json({ products: data ?? [] }, { headers: cors })
}

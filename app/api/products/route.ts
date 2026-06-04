import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/products — lista TODOS los productos (incluyendo ocultos) para el dashboard.
export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products_full')
    .select('id, name, garment_type_label, price, stock, available, out_of_stock, featured, on_sale, colors, sizes, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

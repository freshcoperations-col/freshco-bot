import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/colors — público, catálogo de colores con su hex para swatches.
export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('colors')
    .select('id, name, hex, sort_order')
    .order('sort_order')
    .order('name')

  return NextResponse.json(
    { colors: data ?? [] },
    { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
  )
}

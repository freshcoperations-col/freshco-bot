import { storeCors } from '@/lib/store-cors'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/colors — público, catálogo de colores con su hex para swatches.
export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('colors')
    .select('id, name, hex, sort_order')
    .order('sort_order')
    .order('name')

  return NextResponse.json(
    { colors: data ?? [] },
    { headers: storeCors(request.headers.get('origin')) },
  )
}

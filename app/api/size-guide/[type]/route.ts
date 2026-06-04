import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/size-guide/[type] — público, sin auth. Usado por la webpage.
export async function GET(
  _request: NextRequest,
  { params }: { params: { type: string } },
) {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('size_guide')
    .select('sizes, measurements')
    .eq('garment_type', params.type)
    .maybeSingle()

  const headers = {
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
    'Access-Control-Allow-Origin': '*',
  }

  return NextResponse.json(data ?? { sizes: [], measurements: [] }, { headers })
}

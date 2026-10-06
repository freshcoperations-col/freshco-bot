import { storeCors } from '@/lib/store-cors'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/size-guide/[type] — público, sin auth. Usado por la webpage.
export async function GET(
  request: NextRequest,
  { params }: { params: { type: string } },
) {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('size_guide')
    .select('sizes, measurements')
    .eq('garment_type', params.type)
    .maybeSingle()

  const headers = storeCors(request.headers.get('origin'))

  return NextResponse.json(data ?? { sizes: [], measurements: [] }, { headers })
}

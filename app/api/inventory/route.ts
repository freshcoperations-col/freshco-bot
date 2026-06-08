import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/inventory — público, usado por la webpage para saber qué combos están agotados.
export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('global_inventory')
    .select('out_of_stock')
    .eq('id', 1)
    .maybeSingle()

  return NextResponse.json(
    { out_of_stock: (data?.out_of_stock ?? []) as Array<{ size: string | null; color: string | null }> },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}

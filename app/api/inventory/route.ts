import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/inventory — público, usado por la webpage para conocer el stock global por talla+color.
// Retorna todas las combinaciones con su cantidad disponible.
// quantity === 0 significa agotado para esa combinación.
export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('global_inventory')
    .select('size, color, quantity')
    .order('color')
    .order('size')

  return NextResponse.json(
    { inventory: (data ?? []) as Array<{ size: string; color: string; quantity: number }> },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}

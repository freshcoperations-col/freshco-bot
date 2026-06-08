import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/inventory — público, usado por la webpage para conocer el stock global.
// Retorna todas las combinaciones con garment_type, size, color y quantity.
// quantity === 0 significa agotado para esa combinación.
// garment_type vacío ('') aplica a todos los tipos de prenda (legacy).
export async function GET() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('global_inventory')
    .select('garment_type, size, color, quantity')
    .order('garment_type')
    .order('color')
    .order('size')

  return NextResponse.json(
    { inventory: (data ?? []) as Array<{ garment_type: string; size: string; color: string; quantity: number }> },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}

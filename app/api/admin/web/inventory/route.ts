import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/inventory — devuelve todas las filas del inventario global
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('global_inventory')
    .select('id, size, color, quantity, updated_at')
    .order('color')
    .order('size')

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ inventory: data ?? [] }, { headers: cors })
}

// POST /api/admin/web/inventory
// Body: { size: string, color: string, quantity: number }
// Upserta (crea o actualiza) una fila del inventario global.
export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { size?: string; color?: string; quantity?: number }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const size = body.size?.trim()
  const color = body.color?.trim()
  const quantity = Math.max(0, Number(body.quantity) || 0)

  if (!size || !color) {
    return NextResponse.json({ error: 'size y color son requeridos' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('global_inventory')
    .upsert({ size, color, quantity, updated_at: new Date().toISOString() }, { onConflict: 'size,color' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ ok: true, entry: data }, { headers: cors })
}

// DELETE /api/admin/web/inventory
// Body: { size: string, color: string }
export async function DELETE(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { size?: string; color?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const size = body.size?.trim()
  const color = body.color?.trim()
  if (!size || !color) {
    return NextResponse.json({ error: 'size y color son requeridos' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from('global_inventory')
    .delete()
    .eq('size', size)
    .eq('color', color)

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ ok: true }, { headers: cors })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/activity?since=<ISO>
// La campana del admin pregunta aquí cada pocos segundos qué pasó desde
// `since`: pedidos nuevos y clientes que pidieron asesor. Antes el admin leía
// las tablas directo con la llave pública, lo que obligaba a dejar pedidos y
// mensajes abiertos para cualquiera que tuviera esa llave.
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const raw = request.nextUrl.searchParams.get('since')
  const since = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : new Date(0).toISOString()

  const supabase = createServerClient()
  const [orders, asesor] = await Promise.all([
    supabase
      .from('orders')
      .select('id, customer_name, total, created_at', { count: 'exact' })
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('messages')
      .select('id, customer_phone, content, created_at')
      .eq('direction', 'inbound')
      .eq('intent', 'solicita_asesor')
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  return NextResponse.json(
    {
      now: new Date().toISOString(),
      new_orders: orders.count ?? 0,
      orders: orders.data ?? [],
      asesor_requests: asesor.data ?? [],
    },
    { headers: { ...cors, 'Cache-Control': 'no-store' } },
  )
}

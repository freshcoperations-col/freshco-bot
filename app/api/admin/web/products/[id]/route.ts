import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// PATCH /api/admin/web/products/[id]
// Body: { visual_tags?: string[], available?: boolean }
// Edita los tags visuales o el toggle de disponibilidad de un producto.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: admin.reason }, { status: 403, headers: cors })
  }

  let body: { visual_tags?: string[]; available?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const patch: Record<string, unknown> = {}
  if (Array.isArray(body.visual_tags)) {
    patch.visual_tags = body.visual_tags
      .map((t) => String(t).trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length < 40)
      .slice(0, 20)
  }
  if (typeof body.available === 'boolean') {
    patch.available = body.available
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const { error } = await supabase.from('products').update(patch).eq('id', params.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  }

  return NextResponse.json({ ok: true, patch }, { headers: cors })
}

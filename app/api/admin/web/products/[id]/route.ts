import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// PUT /api/admin/web/products/[id] — actualización completa del producto.
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = String(body.name).trim()
  if (body.description !== undefined) patch.description = body.description ? String(body.description) : null
  if (body.garment_type !== undefined) patch.garment_type = String(body.garment_type)
  if (body.price !== undefined) patch.price = Number(body.price)
  if (body.sale_price !== undefined) patch.sale_price = body.sale_price != null ? Number(body.sale_price) : null
  if (body.on_sale !== undefined) patch.on_sale = Boolean(body.on_sale)
  if (body.stock !== undefined) patch.stock = Number(body.stock)
  if (Array.isArray(body.sizes)) patch.sizes = body.sizes
  if (Array.isArray(body.colors)) patch.colors = body.colors
  if (Array.isArray(body.collections)) patch.collections = body.collections
  if (body.material !== undefined) patch.material = body.material ? String(body.material) : null
  if (body.printing_method !== undefined) patch.printing_method = body.printing_method ? String(body.printing_method) : null
  if (body.available !== undefined) patch.available = Boolean(body.available)
  if (body.featured !== undefined) patch.featured = Boolean(body.featured)
  if (body.audience !== undefined) patch.audience = String(body.audience)
  if (Array.isArray(body.visual_tags)) {
    patch.visual_tags = (body.visual_tags as unknown[])
      .map((t) => String(t).trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length < 40)
      .slice(0, 20)
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase.from('products').update(patch).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ product: data }, { headers: cors })
}

// PATCH /api/admin/web/products/[id] — actualización parcial (tags y available).
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { visual_tags?: string[]; available?: boolean }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const patch: Record<string, unknown> = {}
  if (Array.isArray(body.visual_tags)) {
    patch.visual_tags = body.visual_tags
      .map((t) => String(t).trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length < 40)
      .slice(0, 20)
  }
  if (typeof body.available === 'boolean') patch.available = body.available
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const { error } = await supabase.from('products').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ ok: true, patch }, { headers: cors })
}

// DELETE /api/admin/web/products/[id] — elimina el producto definitivamente.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()
  const { error } = await supabase.from('products').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ ok: true }, { headers: cors })
}

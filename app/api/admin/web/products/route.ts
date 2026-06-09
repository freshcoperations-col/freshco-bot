import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// POST /api/admin/web/products — crear producto nuevo.
export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.products_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name es requerido' }, { status: 400, headers: cors })

  const id = body.id ? String(body.id).trim() : slugify(name)
  if (!id) return NextResponse.json({ error: 'id/slug inválido' }, { status: 400, headers: cors })

  const garment_type = String(body.garment_type ?? '').trim()
  if (!garment_type) return NextResponse.json({ error: 'garment_type es requerido' }, { status: 400, headers: cors })

  const supabase = createServerClient()

  const { data: existing } = await supabase.from('products').select('id').eq('id', id).maybeSingle()
  if (existing) return NextResponse.json({ error: `Ya existe un producto con id "${id}"` }, { status: 409, headers: cors })

  const row = {
    id,
    name,
    garment_type,
    description: body.description ? String(body.description) : null,
    price: Number(body.price ?? 0),
    sale_price: body.sale_price != null ? Number(body.sale_price) : null,
    on_sale: Boolean(body.on_sale),
    stock: Number(body.stock ?? 0),
    sizes: Array.isArray(body.sizes) ? body.sizes : [],
    colors: Array.isArray(body.colors) ? body.colors : [],
    collections: Array.isArray(body.collections) ? body.collections : [],
    material: body.material ? String(body.material) : null,
    printing_method: body.printing_method ? String(body.printing_method) : null,
    available: body.available !== false,
    featured: Boolean(body.featured),
    free_shipping: Boolean(body.free_shipping),
    audience: body.audience ? String(body.audience) : 'unisex',
  }

  const { data, error } = await supabase.from('products').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ product: data }, { status: 201, headers: cors })
}

// GET /api/admin/web/products — lista completa para el admin.
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: admin.reason }, { status: 403, headers: cors })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products_full')
    .select('id, name, description, price, sale_price, on_sale, stock, available, out_of_stock, featured, free_shipping, colors, sizes, collections, collection_labels, garment_type, garment_type_label, material, printing_method, visual_tags, audience, images, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'query_failed', details: error.message }, { status: 500, headers: cors })
  }

  return NextResponse.json({ products: data ?? [] }, { headers: cors })
}

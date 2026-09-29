import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { FIELDS, sameValue } from '@/lib/product-fields'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/products/import/[id]/revert
//
// Deshace una importación: devuelve cada campo al valor que tenía antes.
//
// Un campo que alguien volvió a cambiar DESPUÉS de la importación no se toca:
// deshacer no puede pisar un cambio posterior hecho a mano. Esos se reportan
// como conflicto para revisarlos.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.products_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }

  const supabase = createServerClient()
  const { data: imp } = await supabase
    .from('product_imports')
    .select('id, reverted_at')
    .eq('id', params.id)
    .maybeSingle()
  if (!imp) return NextResponse.json({ error: 'Importación no encontrada' }, { status: 404, headers: cors })
  if (imp.reverted_at) {
    return NextResponse.json({ error: 'Esta importación ya se deshizo' }, { status: 409, headers: cors })
  }

  const { data: changes, error } = await supabase
    .from('product_changes')
    .select('product_id, field, old_value, new_value')
    .eq('import_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  const pricingFields = FIELDS.filter((f) => f.pricing).map((f) => f.key as string)
  if (!admin.permissions.products_pricing && (changes ?? []).some((c) => pricingFields.includes(c.field))) {
    return NextResponse.json(
      { error: 'Esta importación cambió precios y tu rol no puede cambiar precios.' },
      { status: 403, headers: cors },
    )
  }

  // Agrupar por producto para escribir cada uno una sola vez.
  const byProduct = new Map<string, Array<{ field: string; old_value: unknown; new_value: unknown }>>()
  for (const c of changes ?? []) {
    const list = byProduct.get(c.product_id) ?? []
    list.push(c)
    byProduct.set(c.product_id, list)
  }

  const fields = FIELDS.map((f) => f.key).join(', ')
  const { data: current } = await supabase
    .from('products')
    .select(`id, name, ${fields}`)
    .in('id', Array.from(byProduct.keys()))
  const byId = new Map(((current ?? []) as unknown as Record<string, unknown>[]).map((p) => [String(p.id), p]))

  let restored = 0
  const conflicts: Array<{ product_id: string; name: string | null; field: string }> = []
  const failed: Array<{ product_id: string; error: string }> = []

  for (const [productId, list] of Array.from(byProduct.entries())) {
    const product = byId.get(productId)
    if (!product) {
      failed.push({ product_id: productId, error: 'el producto ya no existe' })
      continue
    }
    const patch: Record<string, unknown> = {}
    for (const c of list) {
      // Solo se deshace si el campo sigue con el valor que dejó la importación.
      if (sameValue(product[c.field], c.new_value)) patch[c.field] = c.old_value
      else conflicts.push({ product_id: productId, name: String(product.name ?? ''), field: c.field })
    }
    if (Object.keys(patch).length === 0) continue

    const { error: updErr } = await supabase.from('products').update(patch).eq('id', productId)
    if (updErr) failed.push({ product_id: productId, error: updErr.message })
    else restored += Object.keys(patch).length
  }

  await supabase
    .from('product_imports')
    .update({ reverted_at: new Date().toISOString(), reverted_by: admin.email })
    .eq('id', params.id)

  return NextResponse.json({ ok: true, restored, conflicts, failed }, { headers: cors })
}

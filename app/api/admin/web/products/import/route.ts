import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import {
  FIELDS,
  SELECT_COLUMNS,
  isBlank,
  loadReference,
  parseCell,
  resolveHeader,
  sameValue,
  type FieldKey,
} from '@/lib/product-fields'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_ROWS = 2000

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

interface Change {
  field: FieldKey
  label: string
  from: unknown
  to: unknown
}

interface RowResult {
  line: number              // fila del archivo (1 = encabezado), para ubicarla en Excel
  id: string
  name: string | null
  status: 'changes' | 'unchanged' | 'error' | 'applied'
  changes: Change[]
  errors: string[]
}

// POST /api/admin/web/products/import
// Body: { rows: Array<Record<columna, celda>>, dry_run: boolean, file_name?: string }
//
// La MISMA función simula y aplica: lo que muestra la vista previa es lo que se
// escribe. Aun así, al aplicar se vuelve a calcular todo contra la base — no se
// confía en una vista previa que pudo quedar vieja.
//
// Reglas:
//   · celda vacía = no se toca
//   · una fila con cualquier error NO se aplica, ni en parte; las demás sí
//   · solo actualiza productos existentes
export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.products_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }

  let body: { rows?: unknown; dry_run?: boolean; file_name?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : null
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'El archivo no tiene filas' }, { status: 400, headers: cors })
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Máximo ${MAX_ROWS} filas por archivo` }, { status: 400, headers: cors })
  }
  const dryRun = body.dry_run !== false

  // ── Columnas ────────────────────────────────────────────────────────────
  const headers = Object.keys(rows[0] ?? {})
  const warnings: string[] = []
  const idHeader = headers.find((h) => resolveHeader(h).type === 'id')
  if (!idHeader) {
    return NextResponse.json(
      { error: 'Falta la columna "id". Descarga el catálogo desde el admin para tener el formato correcto.' },
      { status: 400, headers: cors },
    )
  }
  const fieldColumns: Array<{ header: string; spec: (typeof FIELDS)[number] }> = []
  for (const h of headers) {
    const t = resolveHeader(h)
    if (t.type === 'field') {
      if (fieldColumns.some((c) => c.spec.key === t.spec.key)) {
        warnings.push(`La columna "${h}" está repetida; se usa solo la primera.`)
      } else {
        fieldColumns.push({ header: h, spec: t.spec })
      }
    } else if (t.type === 'unknown' && h.trim() !== '') {
      warnings.push(`La columna "${h}" no se reconoce y se ignora.`)
    }
  }
  if (fieldColumns.length === 0) {
    return NextResponse.json(
      { error: 'El archivo no tiene ninguna columna editable (descripcion, precio, colores…).' },
      { status: 400, headers: cors },
    )
  }

  // ── Estado actual de los productos del archivo ──────────────────────────
  const supabase = createServerClient()
  const ids = Array.from(new Set(rows.map((r) => String(r[idHeader] ?? '').trim()).filter(Boolean)))
  const [ref, { data: current, error: loadErr }] = await Promise.all([
    loadReference(supabase),
    supabase.from('products').select(SELECT_COLUMNS).in('id', ids),
  ])
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500, headers: cors })
  const byId = new Map(
    ((current ?? []) as unknown as Record<string, unknown>[]).map((p) => [String(p.id), p]),
  )

  // ── Cálculo por fila ────────────────────────────────────────────────────
  const seen = new Set<string>()
  const results: RowResult[] = []
  const patches = new Map<string, Record<string, unknown>>()

  rows.forEach((row, i) => {
    const id = String(row[idHeader] ?? '').trim()
    // Fila totalmente vacía (Excel a veces deja filas en blanco al final): se ignora.
    if (!id && fieldColumns.every((c) => isBlank(row[c.header]))) return

    const res: RowResult = { line: i + 2, id, name: null, status: 'unchanged', changes: [], errors: [] }
    results.push(res)
    if (!id) { res.status = 'error'; res.errors.push('Falta el id'); return }
    if (seen.has(id)) { res.status = 'error'; res.errors.push('El id está repetido en el archivo'); return }
    seen.add(id)

    const product = byId.get(id)
    if (!product) { res.status = 'error'; res.errors.push(`No existe un producto con id "${id}"`); return }
    res.name = String(product.name ?? '')

    const patch: Record<string, unknown> = {}
    for (const { header, spec } of fieldColumns) {
      const raw = row[header]
      if (isBlank(raw)) continue // celda vacía = no se toca

      const parsed = parseCell(spec, raw, ref)
      if (!parsed.ok) { res.errors.push(`${spec.label}: ${parsed.error}`); continue }
      if (spec.required && isBlank(parsed.value)) { res.errors.push(`${spec.label}: no puede quedar vacío`); continue }
      if (sameValue(product[spec.key], parsed.value)) continue

      if (spec.pricing && !admin.permissions.products_pricing) {
        res.errors.push(`${spec.label}: tu rol no puede cambiar precios`)
        continue
      }
      patch[spec.key] = parsed.value
      res.changes.push({ field: spec.key, label: spec.label, from: product[spec.key] ?? null, to: parsed.value })
    }

    // Coherencia de precios con el estado que QUEDARÍA, no solo con el archivo.
    const price = Number(patch.price ?? product.price)
    const salePrice = patch.sale_price ?? product.sale_price
    const onSale = (patch.on_sale ?? product.on_sale) === true
    if (onSale && salePrice != null && Number(salePrice) >= price) {
      res.errors.push('El precio de oferta debe ser menor al precio')
    }

    if (res.errors.length) res.status = 'error'
    else if (res.changes.length) { res.status = 'changes'; patches.set(id, patch) }
  })

  const summary = () => ({
    rows: results.length,
    with_changes: results.filter((r) => r.status === 'changes' || r.status === 'applied').length,
    unchanged: results.filter((r) => r.status === 'unchanged').length,
    errors: results.filter((r) => r.status === 'error').length,
    fields_changed: results.reduce((n, r) => n + (r.status === 'error' ? 0 : r.changes.length), 0),
  })

  if (dryRun || patches.size === 0) {
    return NextResponse.json(
      { dry_run: true, warnings, summary: summary(), results },
      { headers: cors },
    )
  }

  // ── Aplicar ─────────────────────────────────────────────────────────────
  const { data: imp, error: impErr } = await supabase
    .from('product_imports')
    .insert({ actor_email: admin.email, file_name: body.file_name?.slice(0, 200) ?? null })
    .select('id')
    .single()
  if (impErr || !imp) {
    return NextResponse.json(
      { error: `No se pudo registrar la importación: ${impErr?.message ?? 'error'}` },
      { status: 500, headers: cors },
    )
  }

  let productsChanged = 0
  let fieldsChanged = 0
  for (const res of results) {
    const patch = patches.get(res.id)
    if (!patch) continue

    // El historial se escribe ANTES del cambio: si el producto se actualizara
    // y el historial fallara, ese cambio quedaría sin forma de deshacerse.
    const { error: logErr } = await supabase.from('product_changes').insert(
      res.changes.map((c) => ({
        import_id: imp.id,
        product_id: res.id,
        field: c.field,
        old_value: c.from,
        new_value: c.to,
      })),
    )
    if (logErr) {
      res.status = 'error'
      res.errors.push(`No se aplicó: no se pudo guardar el historial (${logErr.message})`)
      continue
    }

    const { error: updErr } = await supabase.from('products').update(patch).eq('id', res.id)
    if (updErr) {
      await supabase.from('product_changes').delete().eq('import_id', imp.id).eq('product_id', res.id)
      res.status = 'error'
      res.errors.push(`No se aplicó: ${updErr.message}`)
      continue
    }
    res.status = 'applied'
    productsChanged++
    fieldsChanged += res.changes.length
  }

  await supabase
    .from('product_imports')
    .update({ products_changed: productsChanged, fields_changed: fieldsChanged })
    .eq('id', imp.id)

  return NextResponse.json(
    { dry_run: false, import_id: imp.id, warnings, summary: summary(), results },
    { headers: cors },
  )
}

// GET /api/admin/web/products/import — últimas importaciones, para el historial.
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.products_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('product_imports')
    .select('id, created_at, actor_email, file_name, products_changed, fields_changed, reverted_at, reverted_by')
    .gt('products_changed', 0)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ imports: data ?? [] }, { headers: cors })
}

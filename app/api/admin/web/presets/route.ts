import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

// Valores rápidos (chips) y plantillas del formulario de producto.
// Todo vive en una sola fila de app_settings (key = 'presets'), así el
// formulario lo lee de un solo request al abrir.
//
//   GET  → devuelve el documento completo
//   PUT  → reemplaza una o varias listas (sección Presets del admin)
//   POST → agrega UN valor a una lista ("+ guardar como rápido")

const SETTINGS_KEY = 'presets'

const VALUE_LISTS = ['materiales', 'metodos_impresion', 'precios', 'precios_oferta', 'descuentos'] as const
type ValueList = typeof VALUE_LISTS[number]

// Las listas de precios y descuentos guardan números; el resto, texto.
const NUMERIC_LISTS: ValueList[] = ['precios', 'precios_oferta', 'descuentos']

interface PresetValue {
  id: string
  valor: string | number
  orden: number
  esDefault: boolean
}

interface Plantilla {
  id: string
  nombre: string
  [key: string]: unknown
}

interface PresetsDoc {
  materiales: PresetValue[]
  metodos_impresion: PresetValue[]
  precios: PresetValue[]
  precios_oferta: PresetValue[]
  descuentos: PresetValue[]
  plantillas: Plantilla[]
}

const EMPTY_DOC: PresetsDoc = {
  materiales: [],
  metodos_impresion: [],
  precios: [],
  precios_oferta: [],
  descuentos: [],
  plantillas: [],
}

function isValueList(x: string): x is ValueList {
  return (VALUE_LISTS as readonly string[]).includes(x)
}

// Normaliza una lista: tipa el valor, descarta vacíos, reordena desde 0 y
// garantiza que a lo sumo un valor quede marcado como default.
function normalizeList(list: unknown, listName: ValueList): PresetValue[] {
  if (!Array.isArray(list)) return []
  const numeric = NUMERIC_LISTS.includes(listName)

  const cleaned: PresetValue[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>

    let valor: string | number
    if (numeric) {
      const n = Number(item.valor)
      if (!Number.isFinite(n) || n < 0) continue
      valor = Math.round(n)
    } else {
      valor = String(item.valor ?? '').trim()
      if (!valor || valor.length > 120) continue
    }

    cleaned.push({
      id: String(item.id ?? '').trim() || newId(listName),
      valor,
      orden: Number(item.orden ?? cleaned.length),
      esDefault: item.esDefault === true,
    })
  }

  cleaned.sort((a, b) => a.orden - b.orden)

  let defaultSeen = false
  return cleaned.map((item, i) => {
    const esDefault = item.esDefault && !defaultSeen
    if (esDefault) defaultSeen = true
    return { ...item, orden: i, esDefault }
  })
}

function normalizePlantillas(list: unknown): Plantilla[] {
  if (!Array.isArray(list)) return []
  return list
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p, i) => ({
      ...p,
      id: String(p.id ?? '').trim() || `plantilla-${Date.now()}-${i}`,
      nombre: String(p.nombre ?? '').trim() || 'Sin nombre',
    }))
    .filter((p) => p.nombre !== 'Sin nombre' || Object.keys(p).length > 2)
}

function newId(prefix: string): string {
  return `${prefix.slice(0, 3)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

async function readDoc(): Promise<PresetsDoc> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  const value = (data?.value ?? {}) as Partial<PresetsDoc>
  return {
    materiales: normalizeList(value.materiales, 'materiales'),
    metodos_impresion: normalizeList(value.metodos_impresion, 'metodos_impresion'),
    precios: normalizeList(value.precios, 'precios'),
    precios_oferta: normalizeList(value.precios_oferta, 'precios_oferta'),
    descuentos: normalizeList(value.descuentos, 'descuentos'),
    plantillas: normalizePlantillas(value.plantillas),
  }
}

async function writeDoc(doc: PresetsDoc): Promise<string | null> {
  const supabase = createServerClient()
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: SETTINGS_KEY, value: doc, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  return error?.message ?? null
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/presets — cualquier admin puede leerlos (los necesita
// el formulario de producto, no solo quien administra la sección).
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: admin.reason }, { status: 403, headers: cors })
  }

  try {
    return NextResponse.json({ presets: await readDoc() }, { headers: cors })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return NextResponse.json({ error: msg }, { status: 500, headers: cors })
  }
}

// PUT /api/admin/web/presets
// Body: { materiales?: [...], precios?: [...], plantillas?: [...] }
// Solo reemplaza las listas presentes en el body.
export async function PUT(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.presets_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const current = await readDoc()
  const next: PresetsDoc = { ...EMPTY_DOC, ...current }

  for (const list of VALUE_LISTS) {
    if (body[list] !== undefined) next[list] = normalizeList(body[list], list)
  }
  if (body.plantillas !== undefined) next.plantillas = normalizePlantillas(body.plantillas)

  const err = await writeDoc(next)
  if (err) return NextResponse.json({ error: err }, { status: 500, headers: cors })

  return NextResponse.json({ ok: true, presets: next }, { headers: cors })
}

// POST /api/admin/web/presets
// Body: { lista: 'materiales' | ..., valor: string | number }
// Agrega un valor al final de la lista. Idempotente: si el valor ya existe
// devuelve el documento sin duplicarlo. Es lo que usa "+ guardar como rápido",
// por eso pide presets_edit igual que el PUT.
export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.presets_edit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }

  let body: { lista?: string; valor?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const lista = String(body.lista ?? '').trim()
  if (!isValueList(lista)) {
    return NextResponse.json(
      { error: `lista debe ser una de: ${VALUE_LISTS.join(', ')}` },
      { status: 400, headers: cors },
    )
  }

  const numeric = NUMERIC_LISTS.includes(lista)
  let valor: string | number
  if (numeric) {
    const n = Number(body.valor)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'valor numérico inválido' }, { status: 400, headers: cors })
    }
    valor = Math.round(n)
  } else {
    valor = String(body.valor ?? '').trim()
    if (!valor) return NextResponse.json({ error: 'valor requerido' }, { status: 400, headers: cors })
    if (valor.length > 120) return NextResponse.json({ error: 'valor demasiado largo' }, { status: 400, headers: cors })
  }

  const doc = await readDoc()
  const already = doc[lista].some((v) => String(v.valor).toLowerCase() === String(valor).toLowerCase())

  if (!already) {
    doc[lista] = [
      ...doc[lista],
      { id: newId(lista), valor, orden: doc[lista].length, esDefault: false },
    ]
    const err = await writeDoc(doc)
    if (err) return NextResponse.json({ error: err }, { status: 500, headers: cors })
  }

  return NextResponse.json({ ok: true, added: !already, presets: doc }, { headers: cors })
}

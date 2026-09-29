import type { SupabaseClient } from '@supabase/supabase-js'

// ═══════════════════════════════════════════════════════════════════════════
// Campos de producto editables por CSV — DEFINICIÓN ÚNICA
//
// La exportación ("Descargar catálogo") y la importación leen esta misma
// lista, así que el archivo que se baja es exactamente el que se puede subir.
// Para habilitar una columna nueva se agrega aquí y nada más.
//
// Reglas del CSV (las aplica la importación, no este archivo):
//   · celda vacía = no se toca (nunca borra)
//   · solo actualiza productos existentes, identificados por `id`
//   · el stock queda fuera a propósito: tiene sus propias reglas (modo
//     general/variantes y el libro de movimientos de lib/inventory.ts)
// ═══════════════════════════════════════════════════════════════════════════

export type FieldKey =
  | 'name' | 'description' | 'price' | 'sale_price' | 'on_sale' | 'available'
  | 'featured' | 'free_shipping' | 'collections' | 'sizes' | 'colors'
  | 'material' | 'printing_method'

type Kind = 'text' | 'longtext' | 'money' | 'bool' | 'sizes' | 'colors' | 'collections'

export interface FieldSpec {
  key: FieldKey
  header: string        // nombre de la columna en el CSV que se descarga
  aliases: string[]     // otros nombres que se aceptan al subir
  label: string         // cómo se muestra en la vista previa
  kind: Kind
  required?: boolean    // no puede quedar vacío (pero vacío en el CSV = no tocar)
  max?: number
  pricing?: boolean     // cambiarlo exige el permiso products_pricing
}

export const FIELDS: FieldSpec[] = [
  { key: 'name', header: 'nombre', aliases: ['name'], label: 'Nombre', kind: 'text', required: true, max: 120 },
  { key: 'description', header: 'descripcion', aliases: ['description'], label: 'Descripción', kind: 'longtext', max: 3000 },
  { key: 'price', header: 'precio', aliases: ['price'], label: 'Precio', kind: 'money', pricing: true },
  { key: 'sale_price', header: 'precio_oferta', aliases: ['sale_price', 'precio de oferta'], label: 'Precio de oferta', kind: 'money', pricing: true },
  { key: 'on_sale', header: 'en_oferta', aliases: ['on_sale', 'oferta'], label: 'En oferta', kind: 'bool' },
  { key: 'available', header: 'mostrar', aliases: ['available', 'visible'], label: 'Mostrar', kind: 'bool' },
  { key: 'featured', header: 'destacado', aliases: ['featured'], label: 'Destacado', kind: 'bool' },
  { key: 'free_shipping', header: 'envio_gratis', aliases: ['free_shipping', 'envio gratis'], label: 'Envío gratis', kind: 'bool' },
  { key: 'collections', header: 'colecciones', aliases: ['collections', 'coleccion'], label: 'Colecciones', kind: 'collections' },
  { key: 'sizes', header: 'tallas', aliases: ['sizes', 'talla'], label: 'Tallas', kind: 'sizes' },
  { key: 'colors', header: 'colores', aliases: ['colors', 'color'], label: 'Colores', kind: 'colors' },
  { key: 'material', header: 'material', aliases: [], label: 'Material', kind: 'text', max: 120 },
  { key: 'printing_method', header: 'metodo_impresion', aliases: ['printing_method', 'metodo de impresion'], label: 'Método de impresión', kind: 'text', max: 120 },
]

// Columnas que se exportan como contexto pero se ignoran al subir.
export const ID_HEADER = 'id'
export const READONLY_HEADERS = ['tipo_prenda', 'stock']

export const SELECT_COLUMNS =
  'id, garment_type, stock, ' + FIELDS.map((f) => f.key).join(', ')

// ─── Encabezados ─────────────────────────────────────────────────────────────

// Sin tildes, minúsculas, espacios y guiones como "_": así "Método de
// impresión", "metodo_impresion" y "METODO IMPRESION" son la misma columna.
function normHeader(h: string): string {
  return h
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[\s\-]+/g, '_')
}

export type HeaderTarget =
  | { type: 'id' }
  | { type: 'field'; spec: FieldSpec }
  | { type: 'readonly' }
  | { type: 'unknown' }

export function resolveHeader(header: string): HeaderTarget {
  const h = normHeader(header)
  if (h === ID_HEADER || h === 'slug') return { type: 'id' }
  if (READONLY_HEADERS.map(normHeader).includes(h)) return { type: 'readonly' }
  const spec = FIELDS.find((f) => [f.header, f.key, ...f.aliases].map(normHeader).includes(h))
  return spec ? { type: 'field', spec } : { type: 'unknown' }
}

// ─── Datos de referencia para validar ────────────────────────────────────────

export interface Reference {
  colors: string[]                                 // nombres de la paleta
  collections: Array<{ id: string; label: string }>
}

export async function loadReference(supabase: SupabaseClient): Promise<Reference> {
  const [{ data: colors }, { data: collections }] = await Promise.all([
    supabase.from('colors').select('name').order('sort_order'),
    supabase.from('collections').select('id, label').order('sort_order'),
  ])
  return {
    colors: (colors ?? []).map((c) => String(c.name)),
    collections: (collections ?? []).map((c) => ({ id: String(c.id), label: String(c.label) })),
  }
}

function normValue(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// ─── Lectura de una celda ────────────────────────────────────────────────────

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string }

const TRUE_WORDS = ['si', 'true', '1', 'x', 'yes', 'verdadero']
const FALSE_WORDS = ['no', 'false', '0', 'falso']

// Precio en COP. Acepta "90000", "90.000", "$ 90.000", "90,000" y el
// "90000.0" que a veces deja una hoja de cálculo. Un separador seguido de
// exactamente 3 dígitos es de miles; seguido de 1-2 dígitos es decimal.
function parseMoney(raw: unknown): ParseResult {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0
      ? { ok: true, value: Math.round(raw) }
      : { ok: false, error: 'debe ser un número mayor a 0' }
  }
  const s = String(raw).replace(/[$\s]/g, '').replace(/COP/i, '')
  let n: number
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) n = Number(s.replace(/[.,]/g, ''))
  else if (/^\d+([.,]\d{1,2})?$/.test(s)) n = Math.round(Number(s.replace(',', '.')))
  else return { ok: false, error: `"${raw}" no es un precio válido` }
  return n > 0 ? { ok: true, value: n } : { ok: false, error: 'debe ser mayor a 0' }
}

function splitList(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw.map(String) : String(raw).split(/[|,;]/)
  const out: string[] = []
  for (const p of parts) {
    const t = p.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

export function parseCell(spec: FieldSpec, raw: unknown, ref: Reference): ParseResult {
  switch (spec.kind) {
    case 'text': {
      const v = String(raw).trim()
      if (spec.max && v.length > spec.max) return { ok: false, error: `máximo ${spec.max} caracteres` }
      return { ok: true, value: v }
    }
    case 'longtext': {
      // Se respetan los saltos de línea internos (una descripción puede tener párrafos).
      const v = String(raw).replace(/\r\n?/g, '\n').trim()
      if (spec.max && v.length > spec.max) return { ok: false, error: `máximo ${spec.max} caracteres` }
      return { ok: true, value: v }
    }
    case 'money':
      return parseMoney(raw)
    case 'bool': {
      if (typeof raw === 'boolean') return { ok: true, value: raw }
      const v = normValue(String(raw))
      if (TRUE_WORDS.includes(v)) return { ok: true, value: true }
      if (FALSE_WORDS.includes(v)) return { ok: true, value: false }
      return { ok: false, error: `"${raw}" debe ser sí o no` }
    }
    case 'sizes':
      return { ok: true, value: splitList(raw).map((s) => s.toUpperCase()) }
    case 'colors': {
      // Los colores deben existir en la paleta: el nombre del color forma
      // parte del nombre de las fotos, y un error de tipeo las rompe.
      const out: string[] = []
      for (const c of splitList(raw)) {
        const match = ref.colors.find((p) => normValue(p) === normValue(c))
        if (!match) return { ok: false, error: `el color "${c}" no existe en la paleta (${ref.colors.join(', ')})` }
        if (!out.includes(match)) out.push(match)
      }
      return { ok: true, value: out }
    }
    case 'collections': {
      // Se acepta el id ("todo-melo") o el nombre visible ("Todo Melo (O Eso Parece)").
      const out: string[] = []
      for (const c of splitList(raw)) {
        const match = ref.collections.find(
          (col) => normValue(col.id) === normValue(c) || normValue(col.label) === normValue(c),
        )
        if (!match) return { ok: false, error: `la colección "${c}" no existe` }
        if (!out.includes(match.id)) out.push(match.id)
      }
      return { ok: true, value: out }
    }
  }
}

// ¿La celda está vacía? Vacía = no tocar el campo.
export function isBlank(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true
  if (Array.isArray(raw)) return raw.length === 0
  return typeof raw === 'string' && raw.trim() === ''
}

// Igualdad para decidir si un campo cambió de verdad.
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
  }
  if (typeof a === 'number' || typeof b === 'number') {
    return a != null && b != null && Number(a) === Number(b)
  }
  return (a ?? '') === (b ?? '')
}

// ─── Escritura para el CSV que se descarga ───────────────────────────────────

export function formatCell(spec: FieldSpec, value: unknown, ref: Reference): string {
  if (value === null || value === undefined) return ''
  switch (spec.kind) {
    case 'bool':
      return value ? 'sí' : 'no'
    case 'money':
      return String(Math.round(Number(value)))
    case 'collections':
      // Se exporta el nombre visible, que es el que la gente reconoce — salvo
      // que el nombre traiga un separador (coma, punto y coma o |): al volver
      // a subir el archivo se partiría en dos colecciones. Ahí va el id.
      return (value as string[])
        .map((id) => {
          const label = ref.collections.find((c) => c.id === id)?.label
          return label && !/[,;|]/.test(label) ? label : id
        })
        .join(', ')
    case 'sizes':
    case 'colors':
      return (value as string[]).join(', ')
    default:
      return String(value)
  }
}

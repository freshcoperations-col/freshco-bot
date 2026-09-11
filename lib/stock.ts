// Stock por producto: modo general (un número) o por variante (talla × color).
//
// products.stock guarda SIEMPRE el total. En modo 'variantes' se recalcula
// como la suma de stock_variants en cada guardado, así que todo lo que hoy
// lee products.stock (tienda pública, Stock global, analíticas, listados)
// sigue funcionando sin cambios.

export type StockMode = 'general' | 'variantes'

export interface StockVariant {
  /** null cuando la prenda no maneja tallas. */
  size: string | null
  /** null cuando la prenda es única, sin variantes de color. */
  color: string | null
  quantity: number
}

export function parseStockMode(value: unknown): StockMode | undefined {
  if (value === 'variantes' || value === 'general') return value
  return undefined
}

// Cantidades enteras >= 0, sin filas vacías. Se usa igual al crear y al
// actualizar un producto.
export function normalizeVariants(raw: unknown): StockVariant[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
    .map((v) => ({
      size: v.size ? String(v.size) : null,
      color: v.color ? String(v.color) : null,
      quantity: Math.max(0, Math.floor(Number(v.quantity) || 0)),
    }))
    .filter((v) => v.size !== null || v.color !== null)
}

export function totalFromVariants(variants: StockVariant[]): number {
  return variants.reduce((sum, v) => sum + v.quantity, 0)
}

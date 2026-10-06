// Lectura del catálogo de Freshco desde Supabase — misma fuente de verdad
// que la página web (tablas: products, collections, garment_types).
//
// El bot usa esto en lugar del catálogo hardcoded. Si Supabase no responde,
// devolvemos arrays vacíos para que el agente lo comunique honestamente
// en vez de inventar productos.

import { createServerClient } from './supabase'

export type ProductImageType = 'back' | 'front' | 'lifestyle' | 'detail' | 'flat'

export interface ProductImage {
  url: string
  type: ProductImageType
  color: string | null
  label: string | null
  sort_order: number
}

export interface Product {
  id: string
  name: string
  description: string | null
  garment_type: string
  garment_type_label: string | null
  collections: string[]
  collection_labels: string[]
  audience: 'mujer' | 'hombre' | 'unisex'
  price: number
  sale_price: number | null
  on_sale: boolean
  effective_price: number
  sizes: string[]
  colors: string[]
  material: string | null
  printing_method: string | null
  stock: number
  available: boolean
  is_test: boolean
  // Visible si no fuera de prueba. Para el equipo: los productos de prueba
  // se pueden buscar y comprar por el bot (para probar pagos).
  visible_to_team: boolean
  out_of_stock: boolean
  featured: boolean
  free_shipping: boolean
  visual_tags: string[]
  images: ProductImage[]
  image_front_url: string | null
  image_back_url: string | null
  product_url: string
}

export interface Collection {
  id: string
  label: string
  description: string | null
  sort_order: number
}

export interface GarmentType {
  id: string
  label: string
  sort_order: number
}

export interface ProductFilters {
  query?: string
  garment_type?: string
  collection?: string
  audience?: 'mujer' | 'hombre' | 'unisex'
  size?: string
  color?: string
  on_sale?: boolean
  only_available?: boolean
  include_test?: boolean   // solo para números del equipo
  limit?: number
}

const WEBPAGE_BASE_URL = (process.env.WEBPAGE_BASE_URL ?? 'https://freshco-design.com').replace(/\/$/, '')
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const PRODUCT_IMAGES_BASE = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/productos/`
  : ''

const ACCENT_FROM = 'ÁÉÍÓÚÜÑáéíóúüñ'
const ACCENT_TO = 'AEIOUUNaeiouun'

function slugifyColor(color: string): string {
  if (!color) return ''
  let out = ''
  for (const ch of color) {
    const i = ACCENT_FROM.indexOf(ch)
    out += i >= 0 ? ACCENT_TO[i] : ch
  }
  return out.toLowerCase().trim().replace(/\s+/g, '-')
}

function productImageFrontUrl(productId: string, color: string | undefined): string | null {
  if (!PRODUCT_IMAGES_BASE) return null
  const slug = slugifyColor(color || 'Vainilla')
  return `${PRODUCT_IMAGES_BASE}${encodeURIComponent(`${productId}-alfrente-${slug}.png`)}`
}

function productImageBackUrl(productId: string, color: string | undefined): string | null {
  if (!PRODUCT_IMAGES_BASE) return null
  const slug = slugifyColor(color || 'Vainilla')
  return `${PRODUCT_IMAGES_BASE}${encodeURIComponent(`${productId}-detras-${slug}.png`)}`
}

function productUrl(productId: string): string {
  return `${WEBPAGE_BASE_URL}/item/${productId}`
}

function normalize(row: Record<string, unknown>): Product {
  const price = Number(row.price ?? 0)
  const salePrice = row.sale_price == null ? null : Number(row.sale_price)
  const onSale = !!row.on_sale && salePrice != null && salePrice < price
  const colors = (row.colors as string[] | null) ?? []
  const id = String(row.id ?? '')
  const images = (row.images as ProductImage[] | null) ?? []

  // image_back_url / image_front_url: primero busca en images[], luego fallback a naming convention.
  // Esto permite que camisetas actuales sigan funcionando y que nuevas prendas (pantalones, gorras)
  // usen images[] directamente sin naming convention.
  const backFromImages = images.find((img) => img.type === 'back')?.url ?? null
  const frontFromImages = images.find((img) => img.type === 'front')?.url ?? null

  return {
    id,
    name: String(row.name ?? ''),
    description: (row.description as string | null) ?? null,
    garment_type: String(row.garment_type ?? ''),
    garment_type_label: (row.garment_type_label as string | null) ?? null,
    collections: (row.collections as string[] | null) ?? [],
    collection_labels: (row.collection_labels as string[] | null) ?? [],
    audience: ((row.audience as Product['audience']) ?? 'unisex'),
    price,
    sale_price: salePrice,
    on_sale: onSale,
    effective_price: onSale && salePrice != null ? salePrice : price,
    sizes: (row.sizes as string[] | null) ?? [],
    colors,
    material: (row.material as string | null) ?? null,
    printing_method: (row.printing_method as string | null) ?? null,
    stock: Number(row.stock ?? 0),
    // Visible solo si el admin no lo ocultó, no está únicamente en colecciones
    // desactivadas (collection_active viene de la vista products_full) y no es
    // un producto de prueba (esos solo se compran desde su link en la web).
    available: row.available !== false && row.collection_active !== false && !row.is_test,
    is_test: !!row.is_test,
    visible_to_team: row.available !== false && row.collection_active !== false,
    out_of_stock: !!(row.out_of_stock),
    featured: !!row.featured,
    free_shipping: !!(row.free_shipping),
    visual_tags: (row.visual_tags as string[] | null) ?? [],
    images,
    image_front_url: frontFromImages ?? productImageFrontUrl(id, colors[0]),
    image_back_url: backFromImages ?? productImageBackUrl(id, colors[0]),
    product_url: productUrl(id),
  }
}

async function fetchAll(): Promise<Product[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products_full')
    .select('*')
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Supabase error fetching products:', error)
    return []
  }
  return (data ?? []).map(normalize)
}

// Quita tildes para que "piña" matchee "pina" y viceversa.
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function textMatches(p: Product, q: string): boolean {
  const needle = stripAccents(q.toLowerCase().trim())
  if (!needle) return true
  const hay = stripAccents(
    [
      p.name,
      p.id.replace(/-/g, ' '),   // "que-fluya" → "que fluya"
      p.description ?? '',
      p.garment_type_label ?? '',
      ...p.collection_labels,
      ...p.colors,
      ...p.visual_tags,
    ]
      .join(' ')
      .toLowerCase(),
  )
  return hay.includes(needle)
}

export async function searchProducts(filters: ProductFilters = {}): Promise<Product[]> {
  let all = await fetchAll()

  if (filters.only_available !== false) {
    all = all.filter((p) => (p.available || (filters.include_test && p.visible_to_team)) && !p.out_of_stock)
  }
  if (filters.garment_type) {
    all = all.filter((p) => p.garment_type === filters.garment_type)
  }
  if (filters.collection) {
    all = all.filter((p) => p.collections.includes(filters.collection!))
  }
  if (filters.audience) {
    all = all.filter((p) => p.audience === filters.audience)
  }
  if (filters.size) {
    const s = filters.size.toUpperCase()
    all = all.filter((p) => p.sizes.map((x) => x.toUpperCase()).includes(s))
  }
  if (filters.color) {
    const c = filters.color.toLowerCase()
    all = all.filter((p) => p.colors.map((x) => x.toLowerCase()).includes(c))
  }
  if (filters.on_sale) {
    all = all.filter((p) => p.on_sale)
  }
  if (filters.query) {
    all = all.filter((p) => textMatches(p, filters.query!))
  }

  return typeof filters.limit === 'number' ? all.slice(0, filters.limit) : all
}

// Devuelve productos ordenados por fecha de creación (más recientes primero),
// solo disponibles. Para responder "¿qué tienen nuevo?".
export async function getNewArrivals(limit = 5): Promise<Product[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products_full')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit * 2)

  if (error) {
    console.error('Supabase error fetching new arrivals:', error)
    return []
  }
  return (data ?? [])
    .map(normalize)
    .filter((p) => p.available)
    .slice(0, limit)
}

// Devuelve los productos más comprados en órdenes aprobadas. Cuenta unidades
// agregando los items de cada orden.
// Por debajo de esto, "más vendido" no significa nada: con 1 venta cualquier
// producto encabeza la lista. Se devuelve vacío y el bot recomienda otra cosa.
const MIN_UNITS_FOR_BESTSELLER = 3

export async function getBestsellers(limit = 5): Promise<Array<Product & { units_sold: number }>> {
  const supabase = createServerClient()
  const { data: orders, error } = await supabase
    .from('orders')
    .select('items')
    .eq('payment_status', 'approved')
    .limit(500)

  if (error) {
    console.error('Supabase error fetching orders for bestsellers:', error)
    return []
  }

  const counts: Record<string, number> = {}
  for (const order of orders ?? []) {
    const items = (order.items as Array<{ product_id?: string; quantity?: number }> | null) ?? []
    for (const it of items) {
      if (!it.product_id) continue
      counts[it.product_id] = (counts[it.product_id] ?? 0) + (Number(it.quantity) || 1)
    }
  }

  // Se ordena todo y se filtra DESPUÉS por visibilidad: si el primero está
  // oculto (ej. un producto de prueba), el siguiente sube en vez de dejar la
  // lista más corta.
  const ranked = Object.entries(counts)
    .filter(([, units]) => units >= MIN_UNITS_FOR_BESTSELLER)
    .sort((a, b) => b[1] - a[1])

  const result: Array<Product & { units_sold: number }> = []
  for (const [id, units] of ranked) {
    if (result.length >= limit) break
    const p = await getProductById(id)
    if (p && p.available && !p.out_of_stock) {
      result.push({ ...p, units_sold: units })
    }
  }
  return result
}

export async function getProductById(id: string): Promise<Product | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products_full')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error(`Supabase error fetching product ${id}:`, error)
    return null
  }
  return data ? normalize(data) : null
}

// Colecciones y tipos de prenda QUE TIENEN PRODUCTOS A LA VENTA. Las tablas
// tienen tipos activos sin productos todavía (hoodies, pantalones…): si el bot
// los listara, ofrecería cosas que no existen. Se deduce del catálogo, así que
// en cuanto se publique el primer producto de un tipo, el bot lo ofrece solo.
async function sellableSets(): Promise<{ collections: Set<string>; garmentTypes: Set<string> }> {
  const products = (await fetchAll()).filter((p) => p.available && !p.out_of_stock)
  return {
    collections: new Set(products.flatMap((p) => p.collections)),
    garmentTypes: new Set(products.map((p) => p.garment_type)),
  }
}

export async function getCollections(): Promise<Collection[]> {
  const supabase = createServerClient()
  const [{ data, error }, sellable] = await Promise.all([
    supabase
      .from('collections')
      .select('id, label, description, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true }),
    sellableSets(),
  ])

  if (error) {
    console.error('Supabase error fetching collections:', error)
    return []
  }
  return ((data ?? []) as Collection[]).filter((c) => sellable.collections.has(c.id))
}

export async function getGarmentTypes(): Promise<GarmentType[]> {
  const supabase = createServerClient()
  const [{ data, error }, sellable] = await Promise.all([
    supabase
      .from('garment_types')
      .select('id, label, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true }),
    sellableSets(),
  ])

  if (error) {
    console.error('Supabase error fetching garment_types:', error)
    return []
  }
  return ((data ?? []) as GarmentType[]).filter((g) => sellable.garmentTypes.has(g.id))
}

// Resumen compacto del producto para mandar al modelo — quita campos
// internos para no quemar tokens.
export function summarizeForAgent(p: Product) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    garment_type: p.garment_type_label || p.garment_type,
    collections: p.collection_labels,
    audience: p.audience,
    price: p.price,
    sale_price: p.sale_price,
    on_sale: p.on_sale,
    effective_price: p.effective_price,
    sizes: p.sizes,
    colors: p.colors,
    material: p.material,
    available: p.available,
    out_of_stock: p.out_of_stock,
    stock: p.stock,
    free_shipping: p.free_shipping,
    visual_tags: p.visual_tags,
    image_url: p.image_back_url ?? p.image_front_url,
    url: p.product_url,
  }
}

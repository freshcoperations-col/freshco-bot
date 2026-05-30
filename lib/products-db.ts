// Lectura del catálogo de Freshco desde Supabase — misma fuente de verdad
// que la página web (tablas: products, collections, garment_types).
//
// El bot usa esto en lugar del catálogo hardcoded. Si Supabase no responde,
// devolvemos arrays vacíos para que el agente lo comunique honestamente
// en vez de inventar productos.

import { createServerClient } from './supabase'

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
  featured: boolean
  visual_tags: string[]
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
    available: row.available !== false,
    featured: !!row.featured,
    visual_tags: (row.visual_tags as string[] | null) ?? [],
    image_front_url: productImageFrontUrl(id, colors[0]),
    image_back_url: productImageBackUrl(id, colors[0]),
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

function textMatches(p: Product, q: string): boolean {
  const needle = q.toLowerCase().trim()
  if (!needle) return true
  const hay = [
    p.name,
    p.description ?? '',
    p.garment_type_label ?? '',
    ...p.collection_labels,
    ...p.colors,
    ...p.visual_tags,
  ]
    .join(' ')
    .toLowerCase()
  return hay.includes(needle)
}

export async function searchProducts(filters: ProductFilters = {}): Promise<Product[]> {
  let all = await fetchAll()

  if (filters.only_available !== false) {
    all = all.filter((p) => p.available)
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

export async function getCollections(): Promise<Collection[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('collections')
    .select('id, label, description, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Supabase error fetching collections:', error)
    return []
  }
  return (data ?? []) as Collection[]
}

export async function getGarmentTypes(): Promise<GarmentType[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('garment_types')
    .select('id, label, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Supabase error fetching garment_types:', error)
    return []
  }
  return (data ?? []) as GarmentType[]
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
    stock: p.stock,
    visual_tags: p.visual_tags,
    image_url: p.image_back_url ?? p.image_front_url,
    url: p.product_url,
  }
}

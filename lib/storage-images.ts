import type { SupabaseClient } from '@supabase/supabase-js'

// Subida de imágenes de banners y colecciones al bucket público `banners`.
//
// Cada archivo lleva un nombre ÚNICO. Con un nombre fijo, reemplazar una
// imagen reescribía el mismo archivo: la URL no cambiaba y el navegador y la
// CDN seguían mostrando la versión vieja en caché — el mismo bug que tuvieron
// las fotos adicionales de producto.
//
// La compresión la hace el admin en el navegador antes de subir (Vercel
// rechaza cuerpos de más de 4,5 MB); acá solo se valida y se guarda.

export const IMAGES_BUCKET = 'banners'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 4_400_000

// Prefijos de lo que sube el admin. Los archivos viejos con nombre
// `banner-{n}-si-...` no llevan prefijo y NUNCA se borran desde acá: pueden
// seguir sirviendo a una versión anterior de la tienda.
export const BANNER_PREFIX = 'b/'
export const COLLECTION_PREFIX = 'c/'

// Un banner con las URLs públicas de sus dos imágenes, listo para el admin.
export function bannerWithUrls(supabase: SupabaseClient, b: Record<string, unknown>) {
  return {
    ...b,
    desktop_url: publicUrl(supabase, b.desktop_path as string | null),
    mobile_url: publicUrl(supabase, b.mobile_path as string | null),
  }
}

export function publicUrl(supabase: SupabaseClient, path: string | null): string | null {
  if (!path) return null
  return supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function uploadImage(
  supabase: SupabaseClient,
  prefix: string,
  base: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: 'Formato no soportado: usa JPG, PNG o WebP' }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'La imagen pesa demasiado (máximo 4 MB)' }
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const unico = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const safeBase = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40) || 'img'
  const path = `${prefix}${safeBase}-${unico}.${ext}`

  const { error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
      // Nombre único: se puede cachear para siempre sin riesgo de ver una
      // versión vieja, porque una imagen nueva siempre tiene otra URL.
      cacheControl: '31536000',
    })
  if (error) return { ok: false, error: error.message }
  return { ok: true, path }
}

// Borra un archivo SOLO si lo subió el admin (lleva uno de nuestros
// prefijos). Nunca falla hacia afuera: un archivo huérfano es basura, no un
// error que deba tumbar la operación.
export async function removeOwnedImage(supabase: SupabaseClient, path: string | null): Promise<void> {
  if (!path || !(path.startsWith(BANNER_PREFIX) || path.startsWith(COLLECTION_PREFIX))) return
  await supabase.storage.from(IMAGES_BUCKET).remove([path]).catch(() => {})
}

// Link de un banner: vacío = sin link. Se acepta una ruta de la tienda
// ("/collection/redmoon") o una dirección web completa. Cualquier otra cosa
// (ej. "javascript:...") se rechaza.
export function normalizeLink(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = String(raw ?? '').trim()
  if (!v) return { ok: true, value: null }
  if (v.startsWith('/') && !v.startsWith('//')) return { ok: true, value: v }
  try {
    const url = new URL(v)
    if (url.protocol === 'https:' || url.protocol === 'http:') return { ok: true, value: url.toString() }
  } catch {
    // cae al error de abajo
  }
  return { ok: false, error: 'El link debe empezar por / (una página de la tienda) o por https://' }
}

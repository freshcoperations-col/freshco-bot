import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/admin/tag-products?force=true
// Recorre los productos, descarga la imagen trasera de cada uno, le pide a
// Claude vision que extraiga 5-12 sustantivos concretos del estampado, y los
// guarda en la columna visual_tags. Esto le permite al bot encontrar productos
// por contenido visual (ej: cliente busca "piña" y matchea el estampado).
//
// Auth: header `Authorization: Bearer <ADMIN_SECRET>`. Idempotente: por
// default solo procesa productos sin tags. Pasa ?force=true para re-taggear.
export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'ADMIN_SECRET no configurado' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'CLAUDE_API_KEY no configurado' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const force = searchParams.get('force') === 'true'

  const supabase = createServerClient()
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
  const storageBase = `${supabaseUrl}/storage/v1/object/public/productos/`

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, colors, visual_tags')

  if (error) {
    return NextResponse.json({ error: 'query_failed', details: error.message }, { status: 500 })
  }

  const anthropic = new Anthropic({ apiKey })
  const results: Array<{ id: string; tags?: string[]; skipped?: string; error?: string }> = []

  for (const product of products ?? []) {
    const id = product.id as string
    const existing = (product.visual_tags as string[] | null) ?? []
    if (!force && existing.length > 0) {
      results.push({ id, skipped: 'already tagged' })
      continue
    }

    const colors = (product.colors as string[] | null) ?? []
    const colorSlug = slugifyColor(colors[0] || 'Vainilla')
    const imageUrl = `${storageBase}${encodeURIComponent(`${id}-detras-${colorSlug}.png`)}`

    try {
      const imgRes = await fetch(imageUrl)
      if (!imgRes.ok) {
        results.push({ id, error: `imagen no encontrada (${imgRes.status})` })
        continue
      }
      const buf = Buffer.from(await imgRes.arrayBuffer())
      const base64 = buf.toString('base64')

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: base64 },
              },
              {
                type: 'text',
                text:
                  'Esta es la parte trasera de una camiseta. Mira SOLO el estampado y enumera entre 5 y 12 sustantivos concretos en español que describan lo que aparece en el diseño. Incluye objetos, frutas, animales, personajes, plantas, palabras escritas, o cualquier elemento visual identificable. NO incluyas adjetivos abstractos ("moderno", "tropical"), colores de la camiseta, ni la palabra "camiseta" o "estampado". Responde SOLO con la lista separada por comas, sin numeración, sin explicación, todo en minúscula. Ejemplo: "piña, hojas, sol, palmera".',
              },
            ],
          },
        ],
      })

      const text = message.content.find((b) => b.type === 'text')
      const raw = text?.type === 'text' ? text.text : ''
      const tags = raw
        .toLowerCase()
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length < 40)
        .slice(0, 15)

      const { error: updateError } = await supabase
        .from('products')
        .update({ visual_tags: tags })
        .eq('id', id)

      if (updateError) {
        results.push({ id, error: `update_failed: ${updateError.message}` })
      } else {
        results.push({ id, tags })
      }
    } catch (err) {
      results.push({ id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json(
    {
      total: products?.length ?? 0,
      tagged: results.filter((r) => r.tags).length,
      skipped: results.filter((r) => r.skipped).length,
      failed: results.filter((r) => r.error).length,
      results,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}

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

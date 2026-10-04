import type { SupabaseClient } from '@supabase/supabase-js'

// ═══════════════════════════════════════════════════════════════════════════
// Alertas al celular del equipo vía ntfy (app gratuita, https://ntfy.sh)
//
// Todos los avisos al equipo pasan por aquí: cliente que pide asesor,
// conversación nueva, pago confirmado, pedido contraentrega. Para recibirlas
// basta con suscribirse al tema NTFY_TOPIC desde la app de ntfy; varias
// personas pueden suscribirse al mismo tema.
//
// Se publica en JSON y no con cabeceras HTTP: una cabecera no admite emojis
// ni caracteres fuera de Latin-1, así que un cliente con un emoji en el nombre
// hacía fallar la alerta en silencio.
//
// Nunca lanza: una alerta que no sale no puede tumbar la respuesta al cliente
// ni la confirmación de un pago.
// ═══════════════════════════════════════════════════════════════════════════

const ADMIN_URL = (process.env.ADMIN_BASE_URL ?? 'https://admin.freshco-design.com').replace(/\/$/, '')

export interface TeamAlert {
  title: string
  message: string
  tags?: string[]       // emojis de ntfy, ej. ['bell'], ['moneybag']
  priority?: 1 | 2 | 3 | 4 | 5 // 3 = normal, 4 = alta (suena distinto)
  path?: string         // pantalla del admin que abre al tocar la alerta
}

export async function notifyTeam(alert: TeamAlert): Promise<void> {
  const topic = process.env.NTFY_TOPIC?.trim()
  if (!topic) {
    console.error('[ntfy] NTFY_TOPIC no está configurada — alerta no enviada:', alert.title)
    return
  }
  try {
    const res = await fetch('https://ntfy.sh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        title: alert.title,
        message: alert.message,
        tags: alert.tags ?? [],
        priority: alert.priority ?? 3,
        ...(alert.path ? { click: `${ADMIN_URL}${alert.path}` } : {}),
      }),
    })
    if (!res.ok) console.error(`[ntfy] respuesta ${res.status}:`, (await res.text()).slice(0, 120))
  } catch (err) {
    console.error('[ntfy] no se pudo enviar:', err)
  }
}

// El último nombre que dio este cliente en un pedido, para que la alerta diga
// "Laura Gómez" en vez de un número de teléfono.
export async function customerNameFor(supabase: SupabaseClient, phone: string): Promise<string | null> {
  const { data } = await supabase
    .from('orders')
    .select('customer_name')
    .eq('customer_phone', phone)
    .not('customer_name', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { customer_name?: string } | null)?.customer_name ?? null
}

export function cop(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CO')}`
}

// Las alertas de pedido, en un solo formato para todos los canales.
export function orderAlert(kind: 'paid' | 'cod', o: {
  id: string
  customer_name: string | null
  total: number
  items?: Array<{ product_name?: string; quantity?: number }> | null
  source?: string | null
}): TeamAlert {
  const short = o.id.slice(0, 8).toUpperCase()
  const who = o.customer_name || 'Un cliente'
  const lines = (o.items ?? [])
    .slice(0, 4)
    .map((i) => `• ${i.quantity ?? 1} × ${i.product_name ?? 'producto'}`)
    .join('\n')
  const origin = o.source === 'webpage' ? 'web' : o.source === 'whatsapp_bot' ? 'WhatsApp' : 'admin'
  return kind === 'paid'
    ? {
        title: `💰 Pago confirmado: ${cop(o.total)}`,
        message: `${who} · pedido #${short} (${origin})\n${lines}`,
        tags: ['moneybag'],
        priority: 4,
        path: '/orders',
      }
    : {
        title: `🛍 Pedido contraentrega: ${cop(o.total)}`,
        message: `${who} · pedido #${short} (${origin})\nSe cobra al entregar.\n${lines}`,
        tags: ['package'],
        priority: 4,
        path: '/orders',
      }
}

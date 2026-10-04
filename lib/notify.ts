import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppRaw } from '@/lib/whatsapp'

// ═══════════════════════════════════════════════════════════════════════════
// Alertas al equipo: cliente que pide asesor, conversación nueva, pago
// confirmado, pedido contraentrega, pago con monto distinto.
//
// Canal principal: WhatsApp. El bot le escribe desde el número de Freshco a
// cada número de TEAM_WHATSAPP_NUMBERS (separados por coma, con indicativo:
// 573001234567,573109876543).
//   · Si esa persona le escribió al bot en las últimas 24 h, va un mensaje
//     normal.
//   · Si no, WhatsApp exige una plantilla aprobada: TEAM_ALERT_TEMPLATE
//     (por defecto "alerta_equipo"), con dos variables: título y detalle.
//
// Respaldo opcional: ntfy (https://ntfy.sh), si NTFY_TOPIC está configurada.
// Para dejar de usarlo basta con borrar esa variable en Vercel.
//
// Un grupo de WhatsApp necesitaría cuenta oficial (OBA) y máximo 8 personas;
// cuando exista, el cambio es el destino del envío, no el resto.
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

export function teamNumbers(): string[] {
  return (process.env.TEAM_WHATSAPP_NUMBERS ?? '')
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter((n) => n.length >= 10)
}

// Las variables de una plantilla no admiten saltos de línea, tabulaciones ni
// más de 4 espacios seguidos: Meta rechaza el envío.
function templateParam(text: string): string {
  return text.replace(/\s*\n+\s*/g, ' · ').replace(/\s{2,}/g, ' ').trim().slice(0, 900) || '-'
}

async function sendToTeamMember(to: string, alert: TeamAlert): Promise<void> {
  const link = alert.path ? `${ADMIN_URL}${alert.path}` : ''
  const text = await sendWhatsAppRaw({
    to,
    type: 'text',
    text: { body: `*${alert.title}*\n${alert.message}${link ? `\n\n${link}` : ''}`, preview_url: false },
  })
  if (text.ok) return

  if (text.code !== 131047) {
    console.error(`[alerta] WhatsApp a ${to} falló:`, text.error)
    return
  }
  // Ventana de 24 h cerrada: plantilla aprobada.
  const tpl = await sendWhatsAppRaw({
    to,
    type: 'template',
    template: {
      name: process.env.TEAM_ALERT_TEMPLATE ?? 'alerta_equipo',
      language: { code: 'es' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: templateParam(alert.title) },
          { type: 'text', text: templateParam(`${alert.message}${link ? ` ${link}` : ''}`) },
        ],
      }],
    },
  })
  if (!tpl.ok) console.error(`[alerta] plantilla a ${to} falló:`, tpl.error)
}

async function sendNtfy(topic: string, alert: TeamAlert): Promise<void> {
  try {
    // JSON y no cabeceras HTTP: una cabecera no admite emojis.
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

export async function notifyTeam(alert: TeamAlert): Promise<void> {
  const numbers = teamNumbers()
  const topic = process.env.NTFY_TOPIC?.trim()
  if (numbers.length === 0 && !topic) {
    console.error('[alerta] sin TEAM_WHATSAPP_NUMBERS ni NTFY_TOPIC — alerta no enviada:', alert.title)
    return
  }
  await Promise.all([
    ...numbers.map((n) => sendToTeamMember(n, alert)),
    ...(topic ? [sendNtfy(topic, alert)] : []),
  ])
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

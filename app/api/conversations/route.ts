import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/conversations — lista todas las conversaciones únicas
export async function GET() {
  try {
    const supabase = createServerClient()

    // Obtener el último mensaje de cada cliente (para preview y ordenamiento)
    const { data: lastMessages, error: lastError } = await supabase
      .from('messages')
      .select('customer_phone, content, created_at, intent, direction')
      .order('created_at', { ascending: false })

    if (lastError) throw lastError

    // Agrupar por teléfono para construir la lista de conversaciones
    const conversationMap = new Map<
      string,
      {
        customer_phone: string
        last_message: string
        last_message_at: string
        last_intent: string
        last_direction: string
      }
    >()

    for (const msg of lastMessages ?? []) {
      if (!conversationMap.has(msg.customer_phone)) {
        conversationMap.set(msg.customer_phone, {
          customer_phone: msg.customer_phone,
          last_message: msg.content,
          last_message_at: msg.created_at,
          last_intent: msg.intent ?? 'otro',
          last_direction: msg.direction,
        })
      }
    }

    // Contar mensajes y obtener primer contacto por cliente
    const phones = Array.from(conversationMap.keys())

    const { data: counts, error: countError } = await supabase
      .from('messages')
      .select('customer_phone, created_at')
      .in('customer_phone', phones)
      .order('created_at', { ascending: true })

    if (countError) throw countError

    const statsMap = new Map<string, { total: number; first_contact: string }>()
    for (const row of counts ?? []) {
      const existing = statsMap.get(row.customer_phone)
      if (!existing) {
        statsMap.set(row.customer_phone, { total: 1, first_contact: row.created_at })
      } else {
        existing.total++
      }
    }

    // Construir respuesta final
    const conversations = Array.from(conversationMap.values()).map((conv) => {
      const stats = statsMap.get(conv.customer_phone) ?? {
        total: 0,
        first_contact: conv.last_message_at,
      }
      return {
        customer_phone: conv.customer_phone,
        last_message: conv.last_message,
        last_message_at: conv.last_message_at,
        last_intent: conv.last_intent,
        total_messages: stats.total,
        first_contact_at: stats.first_contact,
      }
    })

    // Ordenar por más reciente primero
    conversations.sort(
      (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
    )

    return NextResponse.json(conversations)
  } catch (error) {
    console.error('Error obteniendo conversaciones:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

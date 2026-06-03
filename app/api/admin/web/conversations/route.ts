import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/conversations — lista conversaciones con preview del último mensaje.
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('messages')
    .select('customer_phone, content, created_at, intent, direction')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  // Agrupar por teléfono — mismo algoritmo que /api/conversations del dashboard.
  type ConvMap = {
    customer_phone: string
    last_message: string
    last_message_at: string
    last_intent: string
    last_direction: string
  }
  const conversationMap = new Map<string, ConvMap>()
  for (const msg of data ?? []) {
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

  const phones = Array.from(conversationMap.keys())
  const { data: counts } = await supabase
    .from('messages')
    .select('customer_phone, created_at')
    .in('customer_phone', phones)
    .order('created_at', { ascending: true })

  const statsMap = new Map<string, { total: number; first_contact: string }>()
  for (const row of counts ?? []) {
    const ex = statsMap.get(row.customer_phone)
    if (!ex) statsMap.set(row.customer_phone, { total: 1, first_contact: row.created_at })
    else ex.total++
  }

  // Obtener estado AI por teléfono
  const { data: settings } = await supabase
    .from('conversation_settings')
    .select('customer_phone, ai_paused')
    .in('customer_phone', phones)

  const aiPausedMap = new Map<string, boolean>()
  for (const s of settings ?? []) {
    aiPausedMap.set(s.customer_phone, Boolean(s.ai_paused))
  }

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
      ai_paused: aiPausedMap.get(conv.customer_phone) ?? false,
    }
  })

  conversations.sort((a, b) =>
    new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
  )

  return NextResponse.json({ conversations }, { headers: cors })
}

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export interface Message {
  id: string
  customer_phone: string
  direction: 'inbound' | 'outbound'
  content: string
  intent: string
  whatsapp_message_id: string | null
  created_at: string
}

export interface Order {
  id: string
  customer_phone: string
  items: OrderItem[]
  total: number
  shipping_address: string | null
  payment_method: string | null
  status: string
  created_at: string
  // Wompi payment fields (added in migration-2026-05-29-orders-payments.sql)
  wompi_reference: string | null
  wompi_transaction_id: string | null
  payment_status: 'pending' | 'approved' | 'declined' | 'voided' | 'error'
  payment_link_url: string | null
  amount_in_cents: number | null
  currency: string | null
  paid_at: string | null
  customer_name: string | null
  customer_email: string | null
  source: 'whatsapp_bot' | 'webpage'
}

export interface OrderItem {
  product_id: string
  product_name: string
  size: string
  color: string
  quantity: number
  unit_price: number
}

export interface Conversation {
  customer_phone: string
  last_message: string
  last_message_at: string
  last_intent: string
  total_messages: number
  first_contact_at: string
}

// Server-side client — usa service role key para acceso completo (solo API routes).
// Forzamos cache: 'no-store' en el fetch porque Next.js 14 cachea respuestas GET
// internas por defecto, lo que hace que los SELECT vía supabase-js devuelvan
// datos vencidos entre requests aunque la ruta declare dynamic = 'force-dynamic'.
export function createServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridas')
  }
  return createClient(url, key, {
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}

// Browser client — usa anon key para el dashboard (con RLS)
export function createBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY requeridas')
  }
  return createClient(url, key)
}

// ─── Helpers de base de datos ─────────────────────────────────────────────────

export async function logMessage(
  supabase: SupabaseClient,
  data: {
    customer_phone: string
    direction: 'inbound' | 'outbound'
    content: string
    intent?: string
    whatsapp_message_id?: string
  },
): Promise<Message | null> {
  const { data: message, error } = await supabase
    .from('messages')
    .insert(data)
    .select()
    .single()

  if (error) {
    console.error('Error guardando mensaje:', error)
    return null
  }
  return message
}

export async function getRecentHistory(
  supabase: SupabaseClient,
  phone: string,
  limit = 6,
): Promise<Message[]> {
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).reverse() as Message[]
}

export async function isDuplicateMessage(
  supabase: SupabaseClient,
  waMessageId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('messages')
    .select('id')
    .eq('whatsapp_message_id', waMessageId)
    .single()

  return !!data
}

export async function isAIPaused(
  supabase: SupabaseClient,
  phone: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('conversation_settings')
    .select('ai_paused, paused_at')
    .eq('customer_phone', phone)
    .single()

  if (!data?.ai_paused) return false

  // Auto-reactivar si lleva más de 24 horas pausado
  if (data.paused_at) {
    const pausedAt = new Date(data.paused_at).getTime()
    const hours24 = 24 * 60 * 60 * 1000
    if (Date.now() - pausedAt > hours24) {
      await setAIPaused(supabase, phone, false)
      return false
    }
  }

  return true
}

export async function setAIPaused(
  supabase: SupabaseClient,
  phone: string,
  paused: boolean,
): Promise<void> {
  await supabase
    .from('conversation_settings')
    .upsert({
      customer_phone: phone,
      ai_paused: paused,
      paused_at: paused ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
}

export async function saveOrder(
  supabase: SupabaseClient,
  data: {
    customer_phone: string
    items: OrderItem[]
    total: number
    shipping_address: string
    payment_method: string
    customer_name?: string
    customer_email?: string
    wompi_reference?: string
    payment_link_url?: string
    amount_in_cents?: number
    currency?: string
    source?: 'whatsapp_bot' | 'webpage'
  },
): Promise<Order | null> {
  const { data: order, error } = await supabase
    .from('orders')
    .insert({ source: 'whatsapp_bot', ...data })
    .select()
    .single()

  if (error) {
    console.error('Error guardando pedido:', error)
    return null
  }
  return order
}

// Actualiza una orden por su Wompi reference (lo que devuelve el webhook).
// Si la orden no existe la creamos vacía para no perder el evento (caso
// raro: webhook llega antes de que el bot guardara la orden).
export async function updateOrderByReference(
  supabase: SupabaseClient,
  reference: string,
  patch: Partial<Order>,
): Promise<Order | null> {
  const { data: existing } = await supabase
    .from('orders')
    .select('*')
    .eq('wompi_reference', reference)
    .maybeSingle()

  if (!existing) {
    console.warn(`Webhook recibido para referencia desconocida: ${reference}`)
    return null
  }

  const { data: updated, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', existing.id)
    .select()
    .single()

  if (error) {
    console.error('Error actualizando orden:', error)
    return null
  }
  return updated
}

export async function getOrderByReference(
  supabase: SupabaseClient,
  reference: string,
): Promise<Order | null> {
  const { data } = await supabase
    .from('orders')
    .select('*')
    .eq('wompi_reference', reference)
    .maybeSingle()
  return (data as Order | null) ?? null
}

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

// Server-side client — usa service role key para acceso completo (solo API routes)
export function createServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridas')
  }
  return createClient(url, key)
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
    .select('ai_paused')
    .eq('customer_phone', phone)
    .single()
  return data?.ai_paused === true
}

export async function setAIPaused(
  supabase: SupabaseClient,
  phone: string,
  paused: boolean,
): Promise<void> {
  await supabase
    .from('conversation_settings')
    .upsert({ customer_phone: phone, ai_paused: paused, updated_at: new Date().toISOString() })
}

export async function saveOrder(
  supabase: SupabaseClient,
  data: {
    customer_phone: string
    items: OrderItem[]
    total: number
    shipping_address: string
    payment_method: string
  },
): Promise<Order | null> {
  const { data: order, error } = await supabase
    .from('orders')
    .insert(data)
    .select()
    .single()

  if (error) {
    console.error('Error guardando pedido:', error)
    return null
  }
  return order
}

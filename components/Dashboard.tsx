'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ConversationList } from './ConversationList'
import { ChatView } from './ChatView'
import { createBrowserClient } from '@/lib/supabase'
import { INTENT_COLORS, INTENT_LABELS, ALL_INTENTS, type Intent } from '@/lib/intents'
import type { Message, Conversation } from '@/lib/supabase'

function CustomerDetail({
  phone,
  messages,
  conversations,
}: {
  phone: string | null
  messages: Message[]
  conversations: Conversation[]
}) {
  const [copied, setCopied] = useState(false)
  const [, forceUpdate] = useState(0)

  // Actualizar tiempo relativo cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  if (!phone) {
    return (
      <div className="flex items-center justify-center h-full text-center px-4">
        <span className="text-sm text-gray-400">Selecciona un cliente para ver detalles</span>
      </div>
    )
  }

  const conv = conversations.find((c) => c.customer_phone === phone)

  const seenIntents = Array.from(
    new Set(messages.filter((m) => m.direction === 'inbound').map((m) => m.intent as Intent)),
  )

  function handleCopy() {
    navigator.clipboard.writeText('+' + phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const lastActive = conv?.last_message_at
    ? formatDistanceToNow(new Date(conv.last_message_at), { locale: es, addSuffix: true })
    : '—'

  const firstContact = conv?.first_contact_at
    ? format(new Date(conv.first_contact_at), "d 'de' MMMM yyyy, HH:mm", { locale: es })
    : '—'

  return (
    <div className="p-4 overflow-y-auto h-full">
      {/* Header */}
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
        Detalles del Cliente
      </div>

      {/* Teléfono */}
      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">Teléfono</div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-semibold text-gray-900">+{phone}</span>
          <button
            onClick={handleCopy}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Copiar número"
          >
            {copied ? (
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">Total mensajes</div>
        <div className="font-mono text-2xl font-bold text-gray-900">{messages.length}</div>
        <div className="text-xs text-gray-400">mensajes</div>
      </div>

      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">Primer contacto</div>
        <div className="font-mono text-sm text-gray-700">{firstContact}</div>
      </div>

      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">Última actividad</div>
        <div className="text-sm text-gray-700">{lastActive}</div>
      </div>

      {/* Intenciones vistas */}
      {seenIntents.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2">Intenciones detectadas</div>
          <div className="flex flex-wrap gap-1.5">
            {seenIntents.map((intent) => (
              <span
                key={intent}
                className="text-xs px-2 py-0.5 rounded-sm border font-mono"
                style={{
                  borderColor: INTENT_COLORS[intent] ?? '#9CA3AF',
                  color: INTENT_COLORS[intent] ?? '#9CA3AF',
                }}
              >
                {INTENT_LABELS[intent] ?? intent}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function Dashboard() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  // ─── Cargar conversaciones ──────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
      }
    } catch (error) {
      console.error('Error cargando conversaciones:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // ─── Cargar mensajes de un cliente ─────────────────────────────────────────
  const loadMessages = useCallback(async (phone: string) => {
    try {
      const res = await fetch(`/api/messages?phone=${encodeURIComponent(phone)}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
      }
    } catch (error) {
      console.error('Error cargando mensajes:', error)
    }
  }, [])

  // ─── Seleccionar cliente ────────────────────────────────────────────────────
  function handleSelect(phone: string) {
    setSelectedPhone(phone)
    setMessages([])
    loadMessages(phone)
  }

  // ─── Inicialización ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // ─── Realtime: Supabase subscription ───────────────────────────────────────
  useEffect(() => {
    const supabase = createBrowserClient()

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as Message

          // Actualizar lista de conversaciones
          loadConversations()

          // Si es del cliente seleccionado, agregar al chat
          if (newMsg.customer_phone === selectedPhone) {
            setMessages((prev) => [...prev, newMsg])
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedPhone, loadConversations])

  // ─── Responsive: solo desktop ───────────────────────────────────────────────
  const selectedConv = conversations.find((c) => c.customer_phone === selectedPhone)

  return (
    <>
      {/* Mensaje para pantallas pequeñas */}
      <div className="lg:hidden flex items-center justify-center h-screen bg-white px-8 text-center">
        <p className="text-sm text-gray-500">
          El dashboard está optimizado para escritorio. Por favor usa una pantalla mayor a 1024px.
        </p>
      </div>

      {/* Dashboard desktop */}
      <div className="hidden lg:flex h-screen overflow-hidden bg-white">
        {/* Header global */}
        <div className="fixed top-0 left-0 right-0 z-10 bg-white border-b border-gray-200 px-4 h-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">Freshco</span>
            <span className="text-xs text-gray-400">— Dashboard WhatsApp</span>
          </div>
          {loading && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
              <span className="text-xs text-gray-400">Cargando...</span>
            </div>
          )}
        </div>

        {/* Layout de 3 columnas (debajo del header fijo) */}
        <div className="flex w-full mt-10 h-[calc(100vh-2.5rem)]">
          {/* Columna izquierda: conversaciones */}
          <div className="w-80 flex-shrink-0 h-full overflow-hidden">
            <ConversationList
              conversations={conversations}
              selectedPhone={selectedPhone}
              onSelect={handleSelect}
            />
          </div>

          {/* Columna central: chat */}
          <div className="flex-1 h-full overflow-hidden border-r border-gray-200">
            <ChatView
              phone={selectedPhone}
              messages={messages}
              firstContactAt={selectedConv?.first_contact_at}
            />
          </div>

          {/* Columna derecha: detalles del cliente */}
          <div className="w-72 flex-shrink-0 h-full overflow-hidden border-r border-gray-200">
            <CustomerDetail
              phone={selectedPhone}
              messages={messages}
              conversations={conversations}
            />
          </div>
        </div>
      </div>
    </>
  )
}

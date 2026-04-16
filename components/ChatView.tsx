'use client'

import { useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { MessageBubble } from './MessageBubble'
import type { Message } from '@/lib/supabase'

interface ChatViewProps {
  phone: string | null
  messages: Message[]
  firstContactAt?: string
}

export function ChatView({ phone, messages, firstContactAt }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll al último mensaje
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!phone) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <svg
          className="w-12 h-12 mb-3 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        <span className="text-sm">Selecciona una conversación</span>
      </div>
    )
  }

  const firstContact = firstContactAt
    ? format(new Date(firstContactAt), "d 'de' MMMM yyyy", { locale: es })
    : '—'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="text-base font-mono font-semibold text-gray-900">+{phone}</div>
        <div className="text-xs text-gray-400 mt-0.5">
          Primer contacto: {firstContact}
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-gray-400">Sin mensajes</span>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              previousMessage={i > 0 ? messages[i - 1] : undefined}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

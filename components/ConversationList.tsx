'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { INTENT_COLORS, type Intent } from '@/lib/intents'
import type { Conversation } from '@/lib/supabase'

interface ConversationListProps {
  conversations: Conversation[]
  selectedPhone: string | null
  onSelect: (phone: string) => void
  onDelete: (phone: string) => void
}

function formatRelativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { locale: es, addSuffix: false })
  } catch {
    return '—'
  }
}

function truncate(text: string, maxLen = 45): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

export function ConversationList({
  conversations,
  selectedPhone,
  onSelect,
  onDelete,
}: ConversationListProps) {
  const [search, setSearch] = useState('')
  const [confirmPhone, setConfirmPhone] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = conversations.filter((c) =>
    c.customer_phone.toLowerCase().includes(search.toLowerCase()),
  )

  async function handleDelete(phone: string) {
    setDeleting(phone)
    try {
      await fetch(`/api/conversations/${encodeURIComponent(phone)}`, { method: 'DELETE' })
      onDelete(phone)
    } finally {
      setDeleting(null)
      setConfirmPhone(null)
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-900">Conversaciones</span>
          <span className="bg-blue-600 text-white text-xs font-mono px-2 py-0.5 rounded-sm">
            {conversations.length}
          </span>
        </div>
        <input
          type="text"
          placeholder="Buscar por teléfono..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded-sm px-3 py-1.5 focus:outline-none focus:border-blue-500 font-mono bg-white"
        />
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-sm text-gray-400">
              {conversations.length === 0 ? 'Sin conversaciones aún' : 'Sin resultados'}
            </span>
          </div>
        ) : (
          filtered.map((conv) => {
            const isSelected = conv.customer_phone === selectedPhone
            const intentColor =
              INTENT_COLORS[(conv.last_intent as Intent) ?? 'otro'] ?? '#9CA3AF'
            const isConfirming = confirmPhone === conv.customer_phone
            const isDeletingThis = deleting === conv.customer_phone

            return (
              <div
                key={conv.customer_phone}
                className={`relative group border-b border-gray-100 border-l-4 transition-colors duration-150 ${
                  isSelected
                    ? 'bg-blue-50 border-l-blue-600'
                    : 'hover:bg-gray-100 border-l-transparent'
                }`}
              >
                {isConfirming ? (
                  /* Confirmación inline de eliminación */
                  <div className="px-4 py-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-600">¿Eliminar conversación?</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleDelete(conv.customer_phone)}
                        disabled={isDeletingThis}
                        className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        {isDeletingThis ? '...' : 'Sí'}
                      </button>
                      <button
                        onClick={() => setConfirmPhone(null)}
                        className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        No
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => onSelect(conv.customer_phone)}
                    className="w-full text-left px-4 py-3 flex items-start gap-3"
                  >
                    {/* Dot de intención */}
                    <div
                      className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: intentColor }}
                    />

                    {/* Contenido */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-mono font-medium text-gray-900 truncate">
                          +{conv.customer_phone}
                        </span>
                        <span className="text-xs font-mono text-gray-400 ml-2 flex-shrink-0">
                          {formatRelativeTime(conv.last_message_at)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {truncate(conv.last_message)}
                      </p>
                    </div>

                    {/* Botón eliminar */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmPhone(conv.customer_phone)
                      }}
                      className="flex-shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors"
                      title="Eliminar conversación"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

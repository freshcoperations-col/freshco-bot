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
}: ConversationListProps) {
  const [search, setSearch] = useState('')

  const filtered = conversations.filter((c) =>
    c.customer_phone.toLowerCase().includes(search.toLowerCase()),
  )

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

            return (
              <button
                key={conv.customer_phone}
                onClick={() => onSelect(conv.customer_phone)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors duration-150 flex items-start gap-3 ${
                  isSelected
                    ? 'bg-blue-50 border-l-4 border-l-blue-600 pl-3'
                    : 'hover:bg-gray-100 border-l-4 border-l-transparent'
                }`}
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
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

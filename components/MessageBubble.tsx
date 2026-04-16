'use client'

import { format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Message } from '@/lib/supabase'

interface MessageBubbleProps {
  message: Message
  previousMessage?: Message
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr)
  if (isToday(date)) return format(date, 'HH:mm')
  if (isYesterday(date)) return `Ayer ${format(date, 'HH:mm')}`
  return format(date, 'd MMM HH:mm', { locale: es })
}

function isSameSender(a: Message, b: Message): boolean {
  return a.direction === b.direction
}

export function MessageBubble({ message, previousMessage }: MessageBubbleProps) {
  const isInbound = message.direction === 'inbound'
  const isConsecutive = previousMessage ? isSameSender(message, previousMessage) : false

  return (
    <div
      className={`flex ${isInbound ? 'justify-start' : 'justify-end'} ${
        isConsecutive ? 'mt-1' : 'mt-4'
      }`}
    >
      <div className="max-w-[70%]">
        <div
          className={`px-3 py-2 rounded-sm text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isInbound
              ? 'bg-gray-100 text-gray-900'
              : 'bg-blue-600 text-white'
          }`}
        >
          {message.content}
        </div>
        <div
          className={`mt-1 text-xs font-mono text-gray-400 ${
            isInbound ? 'text-left' : 'text-right'
          }`}
        >
          {formatMessageTime(message.created_at)}
        </div>
      </div>
    </div>
  )
}

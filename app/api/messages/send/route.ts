import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, logMessage } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

// POST /api/messages/send — envía un mensaje manual desde el dashboard
export async function POST(request: NextRequest) {
  let body: { phone?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { phone, message } = body
  if (!phone || !message?.trim()) {
    return NextResponse.json({ error: 'phone y message requeridos' }, { status: 400 })
  }

  try {
    await sendWhatsAppMessage(phone, message.trim())

    const supabase = createServerClient()
    await logMessage(supabase, {
      customer_phone: phone,
      direction: 'outbound',
      content: message.trim(),
      intent: 'otro',
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error enviando mensaje manual:', error)
    return NextResponse.json({ error: 'Error enviando mensaje' }, { status: 500 })
  }
}

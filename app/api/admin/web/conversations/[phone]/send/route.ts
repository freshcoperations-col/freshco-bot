import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/conversations/[phone]/send
// Body: { message: string }
// Envía un mensaje por WhatsApp desde el admin (fuera del bot IA) y lo registra.
export async function POST(
  request: NextRequest,
  { params }: { params: { phone: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { message?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const message = body.message?.trim()
  if (!message) return NextResponse.json({ error: 'message es requerido' }, { status: 400, headers: cors })

  try {
    await sendWhatsAppMessage(params.phone, message)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error enviando WhatsApp' },
      { status: 500, headers: cors },
    )
  }

  const supabase = createServerClient()
  await supabase.from('messages').insert({
    customer_phone: params.phone,
    direction: 'outbound',
    content: message,
    intent: 'otro',
  })

  return NextResponse.json({ ok: true }, { headers: cors })
}

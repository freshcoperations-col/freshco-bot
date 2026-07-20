import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, logMessage } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/send-whatsapp
// Envía un mensaje de texto por WhatsApp desde la cuenta de Freshco y lo
// registra en la tabla messages para que aparezca en Conversaciones.
export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) {
    return NextResponse.json({ error: 'Forbidden', reason: admin.reason }, { status: 403, headers: cors })
  }

  let body: { phone: string; message: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const { phone, message } = body
  if (!phone || !message?.trim()) {
    return NextResponse.json({ error: 'phone y message son requeridos' }, { status: 400, headers: cors })
  }

  try {
    await sendWhatsAppMessage(phone, message)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'No se pudo enviar el mensaje por WhatsApp', detail: msg }, { status: 502, headers: cors })
  }

  // Registrar en Supabase para que aparezca en Conversaciones
  const supabase = createServerClient()
  await logMessage(supabase, {
    customer_phone: phone,
    direction: 'outbound',
    content: message,
    intent: 'link_pago',
  })

  return NextResponse.json({ ok: true }, { status: 200, headers: cors })
}

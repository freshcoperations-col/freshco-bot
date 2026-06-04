import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, setAIPaused } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/conversations/[phone]/toggle-ai
// Body: { paused: boolean, advisor_name?: string }
// Cuando paused=true envía saludo personalizado del asesor al cliente.
export async function POST(
  request: NextRequest,
  { params }: { params: { phone: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { paused?: boolean; advisor_name?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  const newPaused = Boolean(body.paused)
  await setAIPaused(supabase, params.phone, newPaused)

  // Si el asesor toma el control → enviar saludo personalizado
  if (newPaused) {
    // Nombre del asesor: viene del body, o lo derivamos del email autenticado
    const advisorName =
      body.advisor_name?.trim() ||
      (admin.email ? admin.email.split('@')[0].replace(/[._-]/g, ' ') : 'Asesor de Freshco')

    // Nombre del cliente desde órdenes previas
    const { data: orderData } = await supabase
      .from('orders')
      .select('customer_name')
      .eq('customer_phone', params.phone)
      .not('customer_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const customerName = (orderData as { customer_name?: string } | null)?.customer_name
    const clientGreeting = customerName ? `¡Hola ${customerName.split(' ')[0]}! 👋` : '¡Hola! 👋'

    const greeting =
      `${clientGreeting} Soy ${advisorName}, asesor de Freshco. ` +
      `Estoy aquí para atenderte personalmente. ¿En qué te puedo ayudar? 💛`

    try {
      await sendWhatsAppMessage(params.phone, greeting)
      await supabase.from('messages').insert({
        customer_phone: params.phone,
        direction: 'outbound',
        content: greeting,
        intent: 'saludo',
      })
    } catch (err) {
      console.error('Error enviando saludo de asesor:', err)
      // El toggle sí se guardó — no bloqueamos
    }
  }

  return NextResponse.json({ ok: true, ai_paused: newPaused }, { headers: cors })
}

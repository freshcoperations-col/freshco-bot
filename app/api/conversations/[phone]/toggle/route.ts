import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, isAIPaused, setAIPaused } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

// PUT /api/conversations/[phone]/toggle — alterna modo manual/AI.
// Cuando se pausa (asesor toma el control), envía saludo personalizado al cliente.
export async function PUT(
  _request: NextRequest,
  { params }: { params: { phone: string } },
) {
  const phone = params.phone
  if (!phone) {
    return NextResponse.json({ error: 'Phone requerido' }, { status: 400 })
  }

  try {
    const supabase = createServerClient()
    const currentlyPaused = await isAIPaused(supabase, phone)
    const newState = !currentlyPaused
    await setAIPaused(supabase, phone, newState)

    // Si el asesor acaba de tomar el control → enviar saludo al cliente
    if (newState) {
      const adminName = process.env.ADMIN_NAME?.trim()

      // Obtener nombre del cliente si existe
      const { data: orderData } = await supabase
        .from('orders')
        .select('customer_name')
        .eq('customer_phone', phone)
        .not('customer_name', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const customerName = (orderData as { customer_name?: string } | null)?.customer_name
      const clientGreeting = customerName ? `¡Hola ${customerName.split(' ')[0]}! 👋` : '¡Hola! 👋'

      const advisorLine = adminName
        ? `Soy ${adminName}, asesor de Freshco.`
        : 'Soy del equipo de Freshco.'

      const greeting =
        `${clientGreeting} ${advisorLine} Estoy aquí para atenderte personalmente. ¿En qué te puedo ayudar? 💛`

      try {
        await sendWhatsAppMessage(phone, greeting)
        await supabase.from('messages').insert({
          customer_phone: phone,
          direction: 'outbound',
          content: greeting,
          intent: 'saludo',
        })
      } catch (err) {
        console.error('Error enviando saludo de asesor:', err)
        // No bloqueamos la respuesta si el WA falla — el toggle sí se guardó
      }
    }

    return NextResponse.json({ ai_paused: newState })
  } catch (error) {
    console.error('Error toggling AI:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// GET /api/conversations/[phone]/toggle — obtiene estado actual
export async function GET(
  _request: NextRequest,
  { params }: { params: { phone: string } },
) {
  const phone = params.phone
  if (!phone) {
    return NextResponse.json({ error: 'Phone requerido' }, { status: 400 })
  }

  try {
    const supabase = createServerClient()
    const paused = await isAIPaused(supabase, phone)
    return NextResponse.json({ ai_paused: paused })
  } catch (error) {
    console.error('Error obteniendo estado AI:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

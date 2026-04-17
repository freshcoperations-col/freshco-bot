import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, logMessage, getRecentHistory, isDuplicateMessage, isAIPaused, setAIPaused } from '@/lib/supabase'
import { sendWhatsAppMessage, markMessageAsRead, type WhatsAppWebhookPayload } from '@/lib/whatsapp'
import { processMessage } from '@/lib/agent'

// GET — Verificación del webhook de WhatsApp (Meta)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// POST — Recibe mensajes de WhatsApp
// Retorna 200 inmediatamente y procesa en background para no timeout
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ status: 'ok' })
  }

  // Procesar de forma asíncrona — no bloqueamos la respuesta
  void processWebhook(body)

  return NextResponse.json({ status: 'ok' })
}

// Cliente que ya escribió antes pero lleva más de 24h sin actividad
async function checkIsReturningCustomer(
  supabase: ReturnType<typeof createServerClient>,
  phone: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('messages')
    .select('created_at')
    .eq('customer_phone', phone)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(2)

  if (!data || data.length < 2) return false

  // Tiene historial previo — verificar si el penúltimo mensaje fue hace más de 24h
  const previousMessage = data[1]
  const hours24 = 24 * 60 * 60 * 1000
  return Date.now() - new Date(previousMessage.created_at).getTime() > hours24
}

async function processWebhook(body: unknown): Promise<void> {
  const supabase = createServerClient()

  try {
    const data = body as WhatsAppWebhookPayload

    if (data.object !== 'whatsapp_business_account') return

    for (const entry of data.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const messages = change.value?.messages ?? []

        for (const msg of messages) {
          // Solo procesamos mensajes de texto
          if (msg.type !== 'text') continue

          const phone = msg.from
          const text = msg.text?.body ?? ''
          const waMessageId = msg.id

          if (!text.trim()) continue

          // Verificar duplicados
          const isDuplicate = await isDuplicateMessage(supabase, waMessageId)
          if (isDuplicate) continue

          // 1. Guardar mensaje entrante
          await logMessage(supabase, {
            customer_phone: phone,
            direction: 'inbound',
            content: text,
            intent: 'otro',
            whatsapp_message_id: waMessageId,
          })

          // 2. Marcar como leído siempre
          await markMessageAsRead(waMessageId)

          // 3. Si el AI está pausado (modo manual), no responder
          const paused = await isAIPaused(supabase, phone)
          if (paused) continue

          // 4. Obtener historial reciente
          const history = await getRecentHistory(supabase, phone, 7)
          const contextHistory = history.slice(0, -1)

          // Detectar si es cliente que regresa después de 24h sin actividad
          const isReturningCustomer = await checkIsReturningCustomer(supabase, phone)

          // 5. Procesar con el agente de IA
          let agentResponse: string
          let intent: string
          let requestedHuman = false
          try {
            const result = await processMessage(phone, text, contextHistory, isReturningCustomer)
            agentResponse = result.response
            intent = result.intent
            requestedHuman = result.requestedHuman
          } catch (error) {
            console.error('Error en el agente:', error)
            agentResponse =
              'Lo siento, tuve un problema técnico momentáneo. Por favor intenta de nuevo o escríbenos en @freshco.col 🙏'
            intent = 'otro'
          }

          // 6. Actualizar intención del mensaje entrante
          await supabase
            .from('messages')
            .update({ intent })
            .eq('whatsapp_message_id', waMessageId)

          // 7. Guardar respuesta saliente
          await logMessage(supabase, {
            customer_phone: phone,
            direction: 'outbound',
            content: agentResponse,
            intent,
          })

          // 8. Enviar respuesta por WhatsApp
          try {
            await sendWhatsAppMessage(phone, agentResponse)
          } catch (error) {
            console.error('Error enviando mensaje WhatsApp:', error)
            await new Promise((r) => setTimeout(r, 2000))
            try {
              await sendWhatsAppMessage(phone, agentResponse)
            } catch (retryError) {
              console.error('Error en reintento WhatsApp:', retryError)
            }
          }

          // 9. Si el cliente pidió asesor: pausar AI y notificar al asesor vía ntfy
          if (requestedHuman) {
            await setAIPaused(supabase, phone, true)

            const ntfyTopic = process.env.NTFY_TOPIC
            if (ntfyTopic) {
              const waLink = `https://wa.me/${phone}?text=Hola%2C%20soy%20asesor%20de%20Freshco%20%F0%9F%91%8B%20%C2%BFCon%20qui%C3%A9n%20tengo%20el%20gusto%3F`
              const body =
                `📱 +${phone}\n` +
                `💬 "${text}"\n\n` +
                `👉 ${waLink}`
              try {
                await fetch(`https://ntfy.sh/${ntfyTopic}`, {
                  method: 'POST',
                  headers: {
                    'Title': 'Cliente solicita asesor - Freshco',
                    'Priority': 'high',
                    'Tags': 'bell',
                    'Content-Type': 'text/plain; charset=utf-8',
                  },
                  body: Buffer.from(body, 'utf-8'),
                })
              } catch (error) {
                console.error('Error enviando notificación ntfy:', error)
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error procesando webhook:', error)
  }
}

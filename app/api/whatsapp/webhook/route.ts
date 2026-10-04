import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { waitUntil } from '@vercel/functions'
import { createServerClient, logMessage, getRecentHistory, isDuplicateMessage, isAIPaused, isRateLimited, setAIPaused } from '@/lib/supabase'
import {
  sendWhatsAppMessage,
  markAsReadWithTyping,
  reactToMessage,
  downloadWhatsAppMedia,
  type WhatsAppWebhookPayload,
} from '@/lib/whatsapp'
import { processMessage, type InboundImage } from '@/lib/agent'
import { STORE_INFO } from '@/lib/store-info'
import { customerNameFor, notifyTeam } from '@/lib/notify'

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
// Retornamos 200 inmediatamente pero usamos waitUntil para que Vercel
// mantenga la lambda viva hasta que termine el procesamiento async
// (sin esto, en serverless la función puede ser matada después del
// `return`, dejando el procesamiento a medias en los mensajes 2..N).
export async function POST(request: NextRequest) {
  // Se lee el cuerpo como texto: la firma de Meta se calcula sobre los bytes
  // exactos, y un JSON re-serializado no coincidiría.
  const raw = await request.text()

  // Sin esta verificación cualquiera podía enviar mensajes falsos al webhook
  // y hacer que el bot escribiera, desde el número de Freshco, a quien quisiera.
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'))) {
    console.error('[wa] firma de Meta inválida — webhook rechazado')
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ status: 'ok' })
  }

  waitUntil(processWebhook(body))

  return NextResponse.json({ status: 'ok' })
}

// Meta firma cada webhook con el App Secret de la app de Meta:
// X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app_secret, cuerpo).
// Si WHATSAPP_APP_SECRET no está configurada se acepta con advertencia, para no
// apagar el bot antes de agregarla en Vercel.
function verifyMetaSignature(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim()
  if (!secret) {
    console.warn('[wa] WHATSAPP_APP_SECRET no configurada: el webhook NO verifica la firma de Meta')
    return true
  }
  if (!header?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(raw, 'utf8').digest('hex')
  const given = header.slice('sha256='.length)
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(given, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

// Conversación nueva = es su primer mensaje, o el anterior fue hace más de
// NEW_CONVERSATION_HOURS. Avisar cada mensaje sería ruido; esto avisa cuando
// alguien llega o vuelve.
const NEW_CONVERSATION_HOURS = 6

async function isNewConversation(
  supabase: ReturnType<typeof createServerClient>,
  phone: string,
): Promise<boolean> {
  // El mensaje actual ya está guardado: el anterior es el segundo.
  const { data } = await supabase
    .from('messages')
    .select('created_at')
    .eq('customer_phone', phone)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(2)
  if (!data || data.length < 2) return true
  return Date.now() - new Date(data[1].created_at).getTime() > NEW_CONVERSATION_HOURS * 3600 * 1000
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
        // Loggear statuses de entrega para detectar mensajes fallidos
        if (change.field === 'messages') {
          const statuses = (change.value as Record<string, unknown>)?.statuses as Array<Record<string, unknown>> | undefined
          if (statuses?.length) {
            for (const s of statuses) {
              const status = s.status
              const errors = s.errors
              if (status === 'failed' || errors) {
                console.error('[whatsapp] mensaje fallido:', JSON.stringify({ status, errors, recipient: s.recipient_id }))
              } else {
                console.log('[whatsapp] status entrega:', status, 'para:', s.recipient_id)
              }
            }
          }
        }

        if (change.field !== 'messages') continue

        const messages = change.value?.messages ?? []

        for (const msg of messages) {
          // Si es audio, responder pidiendo que escriba (sin tool de voz por ahora)
          if (msg.type === 'audio') {
            await sendWhatsAppMessage(
              msg.from,
              'Por ahora no puedo escuchar audios — escríbeme un texto o mándame una foto y con gusto te ayudo 😊',
            )
            continue
          }

          // Aceptamos texto e imagen. Cualquier otro tipo lo ignoramos.
          if (msg.type !== 'text' && msg.type !== 'image') continue

          const phone = msg.from
          const text = msg.type === 'text' ? msg.text?.body ?? '' : msg.image?.caption ?? ''
          const waMessageId = msg.id

          if (msg.type === 'text' && !text.trim()) continue

          // Si es imagen, descárgala desde Meta para pasarla a Claude
          let inboundImage: InboundImage | undefined
          if (msg.type === 'image' && msg.image?.id) {
            const media = await downloadWhatsAppMedia(msg.image.id)
            if (media) {
              inboundImage = { base64: media.base64, mimeType: media.mimeType }
              const sizeKb = Math.round((media.base64.length * 0.75) / 1024)
              console.log(
                `[wa] imagen recibida de ${msg.from}: ${media.mimeType}, ~${sizeKb}KB`,
              )
            } else {
              console.error(`[wa] no se pudo descargar imagen ${msg.image.id} de ${msg.from}`)
            }
          }

          console.log(
            `[wa] msg de ${phone} (id=${waMessageId}, type=${msg.type}): ${text.slice(0, 80)}`,
          )

          // Verificar duplicados
          const isDuplicate = await isDuplicateMessage(supabase, waMessageId)
          if (isDuplicate) {
            console.log(`[wa] duplicado, skip ${waMessageId}`)
            continue
          }

          // Rate limit: máx 5 mensajes en 30s por teléfono
          const rateLimited = await isRateLimited(supabase, phone)
          if (rateLimited) {
            console.warn(`[wa] rate limit alcanzado para ${phone}, ignorando mensaje`)
            continue
          }

          // 1. Guardar mensaje entrante (si es imagen sin caption, dejamos placeholder)
          const storedContent =
            text.trim() || (inboundImage ? '[el cliente envió una foto]' : '')
          await logMessage(supabase, {
            customer_phone: phone,
            direction: 'inbound',
            content: storedContent,
            intent: 'otro',
            whatsapp_message_id: waMessageId,
          })

          // ¿Empieza una conversación? (primer mensaje tras varias horas de
          // silencio). Se calcula ahora y se avisa al final, después de responder.
          const newConversation = await isNewConversation(supabase, phone)

          // 2. Marcar como leído + "Freshco está escribiendo..." mientras pensamos
          await markAsReadWithTyping(waMessageId)

          // Si llegó una foto, reaccionamos con 👀 para acusar recibo instantáneo
          if (inboundImage) {
            void reactToMessage(phone, waMessageId, '👀')
          }

          // 3. Si el AI está pausado (modo manual), no responder
          const paused = await isAIPaused(supabase, phone)
          if (paused) {
            console.log(`[wa] AI pausado para ${phone}, skip`)
            // En modo manual el bot no responde: alguien del equipo tiene que
            // hacerlo, así que cada mensaje avisa.
            const name = await customerNameFor(supabase, phone)
            await notifyTeam({
              title: `✋ ${name ?? `+${phone}`} escribió (modo manual)`,
              message: `📱 +${phone}\n💬 "${storedContent.slice(0, 200)}"\nEl bot está pausado: responde desde el admin.`,
              tags: ['raised_hand'],
              priority: 4,
              path: '/conversations',
            })
            continue
          }

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
            const result = await processMessage(
              phone,
              text,
              contextHistory,
              isReturningCustomer,
              inboundImage,
            )
            agentResponse = result.response
            intent = result.intent
            // Fallback: si la respuesta contiene la frase exacta del asesor, forzar escalación
            requestedHuman =
              result.requestedHuman ||
              (agentResponse.includes('asesor de Freshco') &&
                agentResponse.includes('pendiente por acá'))
          } catch (error) {
            console.error('Error en el agente:', error)
            agentResponse =
              `Lo siento, tuve un problema técnico momentáneo. Por favor intenta de nuevo o escríbenos en Instagram ${STORE_INFO.instagram} 🙏`
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

          // (Las fotos de productos ahora las decide el agente vía send_product_images,
          // ejecutado durante processMessage. Ya no mandamos un combo de productos
          // pre-armado desde el webhook.)

          // 8. Enviar respuesta de texto por WhatsApp
          console.log(`[wa] enviando respuesta a ${phone} (intent=${intent}, len=${agentResponse.length})`)
          try {
            await sendWhatsAppMessage(phone, agentResponse)
            console.log(`[wa] respuesta enviada OK a ${phone}`)
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

            const name = await customerNameFor(supabase, phone)
            await notifyTeam({
              title: `🙋 ${name ?? `+${phone}`} necesita un asesor`,
              message: `📱 +${phone}\n💬 "${text.slice(0, 200)}"`,
              tags: ['bell'],
              priority: 4,
              path: '/conversations',
            })
          } else if (newConversation) {
            // Conversación nueva (no aviso si pidió asesor: esa alerta ya llegó).
            const name = await customerNameFor(supabase, phone)
            await notifyTeam({
              title: `💬 Nueva conversación: ${name ?? `+${phone}`}`,
              message: `📱 +${phone}\n💬 "${storedContent.slice(0, 200)}"`,
              tags: ['speech_balloon'],
              path: '/conversations',
            })
          }
        }
      }
    }
  } catch (error) {
    console.error('Error procesando webhook:', error)
  }
}

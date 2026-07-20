const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0'

export async function sendWhatsAppMessage(to: string, message: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    throw new Error('Variables WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_ACCESS_TOKEN requeridas')
  }

  const toClean = to.replace(/^\+/, '')

  const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toClean,
      type: 'text',
      text: { body: message },
    }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { code?: number } }
    const code = body?.error?.code

    // Error 131047: ventana de 24h cerrada — intentar con template de orden
    if (code === 131047) {
      await sendOrderTemplate(toClean, phoneNumberId, accessToken)
      return
    }

    throw new Error(`WhatsApp API error ${response.status}: ${JSON.stringify(body)}`)
  }
}

// Envía la plantilla "confirmacion_pedido" (debe estar aprobada en Meta).
// Se usa cuando el cliente no ha escrito en las últimas 24h (error 131047).
async function sendOrderTemplate(to: string, phoneNumberId: string, accessToken: string): Promise<void> {
  const templateName = process.env.WHATSAPP_ORDER_TEMPLATE ?? 'confirmacion_pedido'
  const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'es' },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`WhatsApp template error ${response.status}: ${errorText}`)
  }
}

export async function sendWhatsAppImage(to: string, imageUrl: string, caption?: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) return

  const toClean = to.replace(/^\+/, '')

  const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toClean,
      type: 'image',
      image: {
        link: imageUrl,
        ...(caption ? { caption } : {}),
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`WhatsApp image error — URL: ${imageUrl} — ${response.status}: ${errorText}`)
    throw new Error(`WhatsApp image API error ${response.status}: ${errorText}`)
  }
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) return

  try {
    await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    })
  } catch {
    // No crítico — no bloqueamos el flujo si falla
  }
}

// Marca como leído + activa el "Freshco está escribiendo..." en el chat del
// cliente. El indicador desaparece automáticamente cuando enviamos el siguiente
// mensaje o pasan ~25 segundos.
export async function markAsReadWithTyping(messageId: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) return

  try {
    await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
    })
  } catch {
    // No crítico
  }
}

// Reacciona con un emoji a un mensaje del cliente — útil para acuse de recibo
// instantáneo (ej. 👀 cuando llega una foto que vamos a procesar).
// Pasa emoji vacío para quitar la reacción.
export async function reactToMessage(
  to: string,
  messageId: string,
  emoji: string,
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) return

  const toClean = to.replace(/^\+/, '')

  try {
    await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toClean,
        type: 'reaction',
        reaction: { message_id: messageId, emoji },
      }),
    })
  } catch {
    // No crítico
  }
}

// Tipos del payload del webhook de Meta WhatsApp Cloud API
export interface WhatsAppWebhookPayload {
  object: string
  entry?: WebhookEntry[]
}

interface WebhookEntry {
  id: string
  changes?: WebhookChange[]
}

interface WebhookChange {
  field: string
  value?: {
    messaging_product?: string
    metadata?: { display_phone_number: string; phone_number_id: string }
    contacts?: Array<{ profile: { name: string }; wa_id: string }>
    messages?: WhatsAppMessage[]
    statuses?: unknown[]
  }
}

export interface WhatsAppMessage {
  from: string
  id: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { id: string; mime_type: string; caption?: string }
}

// Descarga una imagen enviada por el cliente vía WhatsApp Cloud API.
// Meta envía un media_id; hay que pedir la URL temporal y luego descargar
// con el access token. Devolvemos base64 + mime_type para mandar a Claude.
export async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<{ base64: string; mimeType: string } | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!accessToken) {
    console.error('downloadWhatsAppMedia: falta WHATSAPP_ACCESS_TOKEN')
    return null
  }

  try {
    const metaRes = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!metaRes.ok) {
      console.error(`Error obteniendo media URL ${mediaId}: ${metaRes.status}`)
      return null
    }
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string }
    if (!meta.url) return null

    const imgRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!imgRes.ok) {
      console.error(`Error descargando media bytes ${mediaId}: ${imgRes.status}`)
      return null
    }

    const buffer = Buffer.from(await imgRes.arrayBuffer())
    return {
      base64: buffer.toString('base64'),
      mimeType: meta.mime_type ?? 'image/jpeg',
    }
  } catch (err) {
    console.error(`downloadWhatsAppMedia ${mediaId} falló:`, err)
    return null
  }
}

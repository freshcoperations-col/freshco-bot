const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0'

export async function sendWhatsAppMessage(to: string, message: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    throw new Error('Variables WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_ACCESS_TOKEN requeridas')
  }

  // WhatsApp espera el número sin el signo +
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
    const errorText = await response.text()
    throw new Error(`WhatsApp API error ${response.status}: ${errorText}`)
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
}

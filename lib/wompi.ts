// Wompi (Colombia) — integración server-side para el bot.
//
// 1. `buildPaymentLink` arma la URL del Wompi Web Checkout con la firma
//    de integridad, para que el cliente solo abra el link y pague.
// 2. `verifyEventChecksum` valida la firma de los eventos del webhook
//    (transaction.updated) usando el WOMPI_EVENTS_SECRET.
//
// Docs:
//   - Web Checkout:  https://docs.wompi.co/docs/colombia/widget-checkout-web/
//   - Eventos:       https://docs.wompi.co/docs/colombia/eventos/
//   - Integridad:    https://docs.wompi.co/docs/colombia/widget-checkout-web/#firma-de-integridad

import { createHash } from 'crypto'

const WOMPI_CHECKOUT_BASE = 'https://checkout.wompi.co/p/'

export type WompiStatus = 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING'

export interface BuildPaymentLinkInput {
  reference: string
  amountInCents: number
  currency?: 'COP'
  customerEmail?: string
  customerPhone?: string
  customerName?: string
  redirectUrl?: string
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variable de entorno ${name} requerida`)
  return v
}

// SHA-256(reference + amountInCents + currency + integritySecret) — hex lowercase.
function integritySignature(
  reference: string,
  amountInCents: number,
  currency: string,
  integritySecret: string,
): string {
  return createHash('sha256')
    .update(`${reference}${amountInCents}${currency}${integritySecret}`)
    .digest('hex')
}

export function buildPaymentLink(input: BuildPaymentLinkInput): string {
  const publicKey = requireEnv('WOMPI_PUBLIC_KEY')
  const integritySecret = requireEnv('WOMPI_INTEGRITY_SECRET')
  const currency = input.currency ?? 'COP'
  const redirectUrl =
    input.redirectUrl ??
    process.env.WOMPI_REDIRECT_URL ??
    'https://freshco-design.com/checkout/gracias'

  const signature = integritySignature(
    input.reference,
    input.amountInCents,
    currency,
    integritySecret,
  )

  const params = new URLSearchParams({
    'public-key': publicKey,
    currency,
    'amount-in-cents': String(input.amountInCents),
    reference: input.reference,
    'redirect-url': redirectUrl,
    'signature:integrity': signature,
  })

  if (input.customerEmail) params.set('customer-data:email', input.customerEmail)
  if (input.customerName) params.set('customer-data:full-name', input.customerName)
  if (input.customerPhone) params.set('customer-data:phone-number', input.customerPhone)

  return `${WOMPI_CHECKOUT_BASE}?${params.toString()}`
}

// Genera una referencia única y rastreable para el bot.
export function newReference(customerPhone: string): string {
  const phoneClean = customerPhone.replace(/[^\d]/g, '').slice(-6)
  const stamp = Date.now().toString(36).toUpperCase()
  return `BOT-${phoneClean}-${stamp}`
}

// ─── Validación de eventos del webhook ───────────────────────────────────────

export interface WompiEventPayload {
  event: string
  data: {
    transaction?: {
      id: string
      reference: string
      status: WompiStatus
      amount_in_cents: number
      currency: string
      customer_email?: string
      payment_method_type?: string
      created_at?: string
      finalized_at?: string
    }
  }
  sent_at?: string
  timestamp?: number
  signature?: {
    properties: string[]
    checksum: string
  }
  environment?: string
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

// Validación de la firma del evento. Wompi concatena los valores de las
// propiedades listadas + timestamp + WOMPI_EVENTS_SECRET y aplica SHA-256.
export function verifyEventChecksum(payload: WompiEventPayload): boolean {
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET
  if (!eventsSecret) {
    // Sin secret no podemos validar — rechazamos en producción para no
    // aceptar webhooks falsos. En dev permitir con WOMPI_SKIP_SIGNATURE=1.
    if (process.env.WOMPI_SKIP_SIGNATURE === '1') {
      console.warn('WOMPI_SKIP_SIGNATURE=1 — saltando validación de firma (solo dev).')
      return true
    }
    console.error('WOMPI_EVENTS_SECRET no configurado — rechazando webhook.')
    return false
  }

  const sig = payload.signature
  if (!sig || !sig.checksum || !sig.properties?.length || !payload.timestamp) {
    return false
  }

  const concat = sig.properties
    .map((prop) => String(getByPath(payload.data, prop) ?? ''))
    .join('')

  const computed = createHash('sha256')
    .update(`${concat}${payload.timestamp}${eventsSecret}`)
    .digest('hex')

  return computed === sig.checksum.toLowerCase()
}

// Mapea estados de Wompi a los que guardamos en orders.payment_status.
export function mapStatus(wompiStatus: WompiStatus): 'approved' | 'declined' | 'voided' | 'error' | 'pending' {
  switch (wompiStatus) {
    case 'APPROVED': return 'approved'
    case 'DECLINED': return 'declined'
    case 'VOIDED':   return 'voided'
    case 'ERROR':    return 'error'
    case 'PENDING':
    default:         return 'pending'
  }
}

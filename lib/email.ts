import nodemailer from 'nodemailer'

// ─── Transporter ──────────────────────────────────────────────────────────────

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST ?? 'smtpout.secureserver.net',
    port: Number(process.env.EMAIL_SMTP_PORT ?? 465),
    secure: true,
    auth: {
      user: process.env.EMAIL_USER ?? 'no-reply@freshco-design.com',
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
}

const FROM = `"Freshco" <${process.env.EMAIL_USER ?? 'no-reply@freshco-design.com'}>`
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL ?? ''
const STORE_URL = 'https://freshco-design.com'

// ─── Función base ─────────────────────────────────────────────────────────────

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!to || !process.env.EMAIL_PASS) return
  const transporter = createTransporter()
  await transporter.sendMail({ from: FROM, to, subject, html })
}

// Helper para enviar al cliente Y al admin en paralelo
async function sendBoth(
  customerEmail: string | null | undefined,
  adminSubject: string,
  customerSubject: string,
  html: string,
): Promise<void> {
  const promises: Promise<void>[] = []
  if (customerEmail) promises.push(sendEmail(customerEmail, customerSubject, html))
  if (ADMIN_EMAIL) promises.push(sendEmail(ADMIN_EMAIL, `[Admin] ${adminSubject}`, html))
  await Promise.allSettled(promises)
}

// ─── Layout base ──────────────────────────────────────────────────────────────

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #111111; padding: 24px 32px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 22px; letter-spacing: 3px; text-transform: uppercase; }
    .header p { color: #888888; font-size: 11px; letter-spacing: 2px; margin-top: 4px; text-transform: uppercase; }
    .body { padding: 32px; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
    .badge-green  { background: #dcfce7; color: #166534; }
    .badge-blue   { background: #dbeafe; color: #1e40af; }
    .badge-yellow { background: #fef9c3; color: #854d0e; }
    .badge-red    { background: #fee2e2; color: #991b1b; }
    h2 { font-size: 20px; color: #111; margin-bottom: 8px; }
    p  { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 12px; }
    .order-id { font-family: monospace; font-size: 18px; font-weight: 700; color: #111; }
    table.details { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
    table.details td { padding: 10px 0; border-bottom: 1px solid #f0f0f0; color: #444; }
    table.details td:first-child { color: #888; width: 140px; }
    table.details td:last-child { font-weight: 500; color: #111; }
    .items { background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .item { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .item-name { color: #333; }
    .item-price { font-weight: 600; color: #111; }
    .total-row { border-top: 2px solid #111; padding-top: 12px; margin-top: 8px; display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; }
    .btn { display: inline-block; background: #111; color: #fff !important; padding: 14px 32px; border-radius: 4px; text-decoration: none; font-size: 13px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-top: 20px; }
    .tracking-box { background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .tracking-box .carrier { font-size: 13px; color: #555; margin-bottom: 4px; }
    .tracking-box .guia { font-family: monospace; font-size: 18px; font-weight: 700; color: #1e40af; letter-spacing: 2px; }
    .footer { background: #111; padding: 20px 32px; text-align: center; }
    .footer p { color: #666; font-size: 11px; line-height: 1.8; }
    .footer a { color: #aaa; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Freshco</h1>
      <p>Stay Crazy</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>Freshco · Bogotá, Colombia<br/>
      <a href="${STORE_URL}">${STORE_URL}</a><br/>
      Este correo fue enviado automáticamente. Si tienes dudas escríbenos por WhatsApp.</p>
    </div>
  </div>
</body>
</html>`
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function formatCOP(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO')
}

function itemsHtml(items: Array<{ product_name?: string; size?: string; color?: string; quantity?: number; unit_price?: number }>): string {
  const rows = (items ?? []).map((it) => {
    const name = it.product_name ?? 'Producto'
    const detail = [it.size ? `Talla ${it.size}` : '', it.color ?? ''].filter(Boolean).join(' · ')
    const qty = it.quantity ?? 1
    const price = (it.unit_price ?? 0) * qty
    return `<div class="item"><span class="item-name">${qty}× ${name}${detail ? `<br/><small style="color:#999">${detail}</small>` : ''}</span><span class="item-price">${formatCOP(price)}</span></div>`
  })
  return rows.join('')
}

// ─── Templates ────────────────────────────────────────────────────────────────

interface OrderEmailData {
  shortId: string
  customerName?: string | null
  customerEmail?: string | null
  total: number
  items: Array<{ product_name?: string; size?: string; color?: string; quantity?: number; unit_price?: number }>
  shippingAddress?: string | null
  trackingNumber?: string | null
  shippingCarrier?: string | null
  reason?: string
}

// 1. Pedido recibido
export async function emailOrderCreated(data: OrderEmailData): Promise<void> {
  const firstName = data.customerName?.split(' ')[0] ?? 'cliente'
  const html = layout(`
    <div class="badge badge-yellow">📋 Pedido recibido</div>
    <h2>¡Hola ${firstName}, recibimos tu pedido!</h2>
    <p>Aquí está el resumen de tu compra. En cuanto confirmemos el pago te avisamos.</p>
    <p class="order-id">#${data.shortId}</p>
    <div class="items">
      ${itemsHtml(data.items)}
      <div class="total-row"><span>Total</span><span>${formatCOP(data.total)}</span></div>
    </div>
    ${data.shippingAddress ? `<table class="details"><tr><td>Envío a</td><td>${data.shippingAddress}</td></tr></table>` : ''}
    <p style="color:#888;font-size:13px">¿Tienes dudas? Escríbenos por WhatsApp y te ayudamos.</p>
    <a href="${STORE_URL}" class="btn">Ver tienda</a>
  `)
  await sendBoth(data.customerEmail, `Pedido #${data.shortId} recibido`, `Tu pedido #${data.shortId} está en proceso — Freshco`, html)
}

// 2. Pago confirmado
export async function emailPaymentConfirmed(data: OrderEmailData): Promise<void> {
  const firstName = data.customerName?.split(' ')[0] ?? 'cliente'
  const html = layout(`
    <div class="badge badge-green">✅ Pago confirmado</div>
    <h2>¡${firstName}, tu pago fue aprobado!</h2>
    <p>Tu pedido está confirmado y pronto lo prepararemos para envío.</p>
    <p class="order-id">#${data.shortId}</p>
    <div class="items">
      ${itemsHtml(data.items)}
      <div class="total-row"><span>Total pagado</span><span>${formatCOP(data.total)}</span></div>
    </div>
    ${data.shippingAddress ? `<table class="details"><tr><td>Envío a</td><td>${data.shippingAddress}</td></tr></table>` : ''}
    <p style="color:#888;font-size:13px">Te avisaremos cuando tu pedido salga a domicilio.</p>
    <a href="${STORE_URL}" class="btn">Seguir comprando</a>
  `)
  await sendBoth(data.customerEmail, `Pedido #${data.shortId} — pago confirmado`, `¡Tu pago fue aprobado! Pedido #${data.shortId} — Freshco`, html)
}

// 3. Pedido enviado
export async function emailOrderShipped(data: OrderEmailData): Promise<void> {
  const firstName = data.customerName?.split(' ')[0] ?? 'cliente'
  const carrierSlug = (data.shippingCarrier ?? '').toLowerCase().trim().replace(/\s+/g, '-')
  const trackingUrls: Record<string, string> = {
    servientrega: `https://www.servientrega.com/wps/portal/rastreo-envio?guia=${data.trackingNumber}`,
    coordinadora: `https://coordinadora.com/rastrea-tu-envio/?guia=${data.trackingNumber}`,
    'inter-rapidisimo': `https://www.interrapidisimo.com/sigue-tu-envio/?guia=${data.trackingNumber}`,
    envia: `https://envia.co/rastrear-envio/?guia=${data.trackingNumber}`,
    '99minutos': `https://99minutos.com/tracking?n=${data.trackingNumber}`,
  }
  const trackingUrl = trackingUrls[carrierSlug]

  const html = layout(`
    <div class="badge badge-blue">📦 En camino</div>
    <h2>¡${firstName}, tu pedido ya salió!</h2>
    <p>Tu pedido <strong>#${data.shortId}</strong> está en camino y llega en 2-3 días hábiles.</p>
    <div class="tracking-box">
      <div class="carrier">${data.shippingCarrier ?? 'Transportadora'}</div>
      <div class="guia">${data.trackingNumber}</div>
      ${trackingUrl ? `<a href="${trackingUrl}" style="display:inline-block;margin-top:12px;color:#1e40af;font-size:13px;font-weight:600">Rastrear envío →</a>` : ''}
    </div>
    ${data.shippingAddress ? `<table class="details"><tr><td>Destino</td><td>${data.shippingAddress}</td></tr></table>` : ''}
    ${trackingUrl ? `<a href="${trackingUrl}" class="btn">Rastrear mi pedido</a>` : ''}
  `)
  await sendBoth(data.customerEmail, `Pedido #${data.shortId} — salió a domicilio`, `Tu pedido #${data.shortId} está en camino 📦 — Freshco`, html)
}

// 4. Pedido entregado
export async function emailOrderDelivered(data: OrderEmailData): Promise<void> {
  const firstName = data.customerName?.split(' ')[0] ?? 'cliente'
  const html = layout(`
    <div class="badge badge-green">🎉 Entregado</div>
    <h2>¡${firstName}, tu pedido llegó!</h2>
    <p>Tu pedido <strong>#${data.shortId}</strong> fue entregado exitosamente. Esperamos que lo disfrutes mucho 💛</p>
    <p>Si tienes algún inconveniente con tu compra, escríbenos por WhatsApp y lo resolvemos.</p>
    <table class="details">
      <tr><td>Pedido</td><td>#${data.shortId}</td></tr>
      <tr><td>Total</td><td>${formatCOP(data.total)}</td></tr>
      ${data.shippingCarrier ? `<tr><td>Entregado por</td><td>${data.shippingCarrier}</td></tr>` : ''}
    </table>
    <a href="${STORE_URL}" class="btn">Ver nuevos productos</a>
  `)
  await sendBoth(data.customerEmail, `Pedido #${data.shortId} — entregado`, `¡Tu pedido #${data.shortId} llegó! 🎉 — Freshco`, html)
}

// 5. Pedido cancelado
export async function emailOrderCancelled(data: OrderEmailData): Promise<void> {
  const firstName = data.customerName?.split(' ')[0] ?? 'cliente'
  const reasonBlock = data.reason
    ? `<table class="details"><tr><td>Motivo</td><td>${data.reason}</td></tr></table>`
    : ''
  const html = layout(`
    <div class="badge badge-red">❌ Cancelado</div>
    <h2>Tu pedido #${data.shortId} fue cancelado</h2>
    <p>Hola ${firstName}, te informamos que tu pedido fue cancelado.</p>
    ${reasonBlock}
    <p style="color:#888;font-size:13px">Si fue un error o quieres hacer un nuevo pedido, escríbenos por WhatsApp y te ayudamos.</p>
    <a href="${STORE_URL}" class="btn">Volver a la tienda</a>
  `)
  await sendBoth(data.customerEmail, `Pedido #${data.shortId} cancelado`, `Tu pedido #${data.shortId} fue cancelado — Freshco`, html)
}

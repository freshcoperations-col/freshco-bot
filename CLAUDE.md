# Freshco — WhatsApp AI Agent

## Qué hace este proyecto
Agente de ventas por WhatsApp para **Freshco**, tienda de ropa urbana en Bogotá. El agente atiende 24/7, busca productos en el catálogo real (Supabase), responde dudas, **genera links de pago Wompi**, recibe la confirmación del pago vía webhook y notifica al cliente. Todo se visualiza en un dashboard en tiempo real.

## Stack
- **Framework**: Next.js 14 (App Router)
- **Lenguaje**: TypeScript
- **Base de datos**: Supabase (PostgreSQL + Realtime) — misma BD que la página web
- **IA**: Anthropic Claude (`claude-haiku-4-5`) con tool use
- **WhatsApp**: Meta WhatsApp Cloud API
- **Pagos**: Wompi (Colombia) — Web Checkout + webhooks
- **Estilos**: Tailwind CSS
- **Deploy**: Vercel

## Estructura de archivos clave
```
app/
  page.tsx                          # Dashboard principal
  api/whatsapp/webhook/route.ts     # Recibe mensajes de Meta WhatsApp
  api/wompi/webhook/route.ts        # Recibe eventos de pago de Wompi
  api/messages/route.ts             # API para obtener mensajes
  api/conversations/route.ts        # API para listar conversaciones
components/
  Dashboard.tsx                     # Layout del dashboard
  ConversationList.tsx              # Sidebar de conversaciones
  ChatView.tsx                      # Vista de mensajes
  MessageBubble.tsx                 # Burbuja individual
lib/
  supabase.ts                       # Cliente Supabase + helpers de orders/messages
  agent.ts                          # Lógica del agente IA con tools
  system-prompt.ts                  # Prompt del sistema en español
  products-db.ts                    # Lectura del catálogo desde Supabase
  product-catalog.ts                # Datos estáticos: guía DTF, tallas, shipping
  store-info.ts                     # Info tienda y métodos de pago
  wompi.ts                          # Wompi: link de pago + validación de eventos
  intents.ts                        # Tipos de intención del dashboard
  whatsapp.ts                       # Cliente Meta WhatsApp
setup-db.sql                                       # Schema mensajes/órdenes
setup-products-db.sql                              # Schema catálogo (compartido con webpage)
migration-2026-05-18-collections-cleanup.sql
migration-2026-05-18-audience-and-image-naming.sql
migration-2026-05-29-orders-payments.sql           # Wompi en orders (correr al actualizar)
```

## Setup local
```bash
npm install
cp .env.local.example .env.local   # completar credenciales
npm run dev
```

## Tablas en Supabase
- `messages` — mensajes inbound/outbound con intención
- `orders` — pedidos. Incluye campos Wompi (`wompi_reference`, `payment_link_url`, `payment_status`, `paid_at`, ...)
- `products`, `collections`, `garment_types`, `products_full` — catálogo (admin desde la webpage)
- `conversation_settings` — pausa manual del AI por conversación

## Herramientas del agente (tool use)
- `search_products` — busca productos por texto / colección / audiencia / talla / color / oferta
- `get_product_by_id` — detalle de un producto específico (úsalo antes de cobrar)
- `list_collections` / `list_garment_types` — slugs y labels activos
- `get_size_guide` — tallas en cm
- `get_shipping_info` — tiempos y costos
- `get_payment_methods` — Nequi, Bancolombia, tarjeta (Wompi), contraentrega
- `create_payment_link` — **genera link Wompi** y crea orden en `pending`
- `create_order` — crea orden sin link de pago (solo manual: Nequi/contraentrega)

## Flujo de pago con Wompi
1. Cliente confirma producto + talla + dirección + elige tarjeta/PSE/Nequi
2. Agente llama `create_payment_link` → la orden queda en `payment_status='pending'`
3. Agente envía al cliente la URL del Web Checkout de Wompi
4. Cliente paga en el navegador
5. Wompi POSTea a `/api/wompi/webhook` con la firma de evento (`X-Event-Checksum`)
6. El webhook valida la firma (`WOMPI_EVENTS_SECRET`), actualiza la orden (`payment_status='approved'`, `paid_at`, `wompi_transaction_id`) y envía un mensaje de confirmación por WhatsApp.

## Detección de intenciones
El agente incluye `[INTENCION:categoria]` al final de cada respuesta. El webhook parsea y elimina el marcador antes de enviar al cliente, y lo guarda para el dashboard.

Categorías: `consulta_producto`, `consulta_tallas`, `pedido`, `consulta_envio`, `consulta_pago`, `saludo`, `solicita_asesor`, `otro`.

## Deploy en Vercel
1. Push a GitHub
2. Importar en Vercel
3. Agregar TODAS las variables de entorno (ver `.env.local.example`)
4. Webhook de Meta: `https://<dominio>/api/whatsapp/webhook`
5. Webhook de Wompi: `https://<dominio>/api/wompi/webhook` (configurar en dashboard de Wompi → Eventos)

## Variables de entorno requeridas
Ver `.env.local.example`. Las nuevas para Wompi son:
- `WOMPI_PUBLIC_KEY` (pública, va en el link)
- `WOMPI_INTEGRITY_SECRET` (firma el link de checkout)
- `WOMPI_EVENTS_SECRET` (valida los webhooks)
- `WOMPI_REDIRECT_URL` (página de gracias tras pagar)
- `WEBPAGE_BASE_URL` (para los links que envía el bot)

## Notas importantes
- **Idioma**: español colombiano
- **Precios**: COP formateados `$XX.XXX`
- **Envíos**: Bogotá gratis > $150.000; resto desde $12.000
- **Catálogo**: ahora viene de Supabase (no hardcoded, no Firebase). El bot y la webpage comparten la BD.
- **Pagos**: Wompi está en modo PRUEBA en la webpage (key `pub_test_*`). Migrar a producción cambiando llaves en Wompi dashboard + variables de entorno.
- **No hay Calendly**: no se implementó funcionalidad de reservas.

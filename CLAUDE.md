# Freshco — WhatsApp AI Agent

## Qué hace este proyecto
Agente de ventas por WhatsApp para **Freshco**, una tienda de ropa urbana en Bogotá, Colombia. El agente atiende clientes 24/7, responde preguntas sobre productos, ayuda con tallas, procesa pedidos y brinda información de envíos. Todo se visualiza en un dashboard en tiempo real.

## Stack
- **Framework**: Next.js 14 (App Router)
- **Lenguaje**: TypeScript
- **Base de datos**: Supabase (PostgreSQL + Realtime)
- **IA**: Anthropic Claude (`claude-haiku-4-5`) con tool use / function calling
- **WhatsApp**: Meta WhatsApp Cloud API (phone_number_id + access_token)
- **Estilos**: Tailwind CSS
- **Deploy**: Vercel

## Estructura de archivos clave
```
app/
  page.tsx                          # Dashboard principal
  api/whatsapp/webhook/route.ts     # Recibe mensajes de Meta WhatsApp Cloud API
  api/messages/route.ts             # API para obtener mensajes
  api/conversations/route.ts        # API para listar conversaciones
components/
  Dashboard.tsx                     # Layout del dashboard (3 columnas)
  ConversationList.tsx              # Lista de conversaciones (sidebar)
  ChatView.tsx                      # Vista de mensajes del chat
  MessageBubble.tsx                 # Burbuja individual de mensaje
lib/
  supabase.ts                       # Cliente Supabase (server + browser)
  agent.ts                          # Lógica del agente IA con herramientas
  system-prompt.ts                  # Prompt del sistema en español
  product-catalog.ts                # Catálogo, guía de tallas y envíos
  store-info.ts                     # Info de la tienda y métodos de pago
  intents.ts                        # Tipos de intención y colores del dashboard
  whatsapp.ts                       # Cliente Meta WhatsApp Cloud API
setup-db.sql                        # Schema de Supabase — ejecutar primero
```

## Setup local
```bash
npm install
cp .env.local.example .env.local   # completar con tus credenciales
npm run dev
```

## Tablas en Supabase
- `messages` — todos los mensajes (inbound/outbound) con intención detectada
- `orders` — pedidos capturados por el agente

## Herramientas del agente (tool use)
- `get_product_catalog` — catálogo de productos con precios y tallas
- `get_size_guide` — tabla de tallas por categoría
- `get_shipping_info` — tiempos y transportadoras
- `get_payment_methods` — métodos de pago disponibles
- `create_order` — guarda un pedido en Supabase cuando el cliente confirma todo

## Detección de intenciones
El agente incluye `[INTENCION:categoria]` al final de cada respuesta. El webhook parsea y elimina este marcador antes de enviar el mensaje al cliente, y lo guarda en la base de datos para el dashboard.

Categorías: `consulta_producto`, `consulta_tallas`, `pedido`, `consulta_envio`, `consulta_pago`, `saludo`, `otro`

## Deploy en Vercel
1. Push a GitHub
2. Importar proyecto en Vercel
3. Agregar todas las variables de entorno
4. URL del webhook para Meta: `https://tu-dominio.vercel.app/api/whatsapp/webhook`
5. Configurar webhook en Meta Developer Console con el token de verificación

## Variables de entorno requeridas
Ver `.env.local.example`

## Notas importantes
- **No hay Calendly**: No se implementó ninguna funcionalidad de reservas o citas
- **Idioma**: Todo el agente responde en español colombiano
- **Precios**: En COP formateados como `$XX.XXX`
- **Envíos**: Bogotá gratis en compras > $150.000; resto de Colombia desde $12.000
- **WhatsApp API**: Meta Cloud API (no Twilio) — requiere `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ACCESS_TOKEN`

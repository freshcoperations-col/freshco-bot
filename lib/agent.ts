import Anthropic from '@anthropic-ai/sdk'
import { buildSystemPrompt } from './system-prompt'
import { PRODUCTS, SIZE_GUIDE, SHIPPING_INFO } from './product-catalog'
import { PAYMENT_METHODS } from './store-info'
import { createServerClient, saveOrder, type Message, type OrderItem } from './supabase'
import { isValidIntent, type Intent } from './intents'

// Modelo: claude-haiku-4-5 — rápido y económico, ideal para chatbot de WhatsApp
const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 1024
const MAX_TOOL_ITERATIONS = 5

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_product_catalog',
    description:
      'Obtiene el catálogo completo de productos de Freshco con precios, tallas disponibles y colores. Úsalo cuando el cliente pregunte por productos, precios o disponibilidad.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filtrar por categoría (opcional): Camisetas, Jeans, Sudaderas, Hoodies, Chaquetas, Shorts, Pantalones, Accesorios',
        },
      },
    },
  },
  {
    name: 'get_size_guide',
    description:
      'Obtiene la guía de tallas de Freshco con medidas en centímetros. Úsalo cuando el cliente pregunte por tallas o necesite saber qué talla elegir.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Categoría de prenda: camisetas, jeans, sudaderas_hoodies',
        },
      },
    },
  },
  {
    name: 'get_shipping_info',
    description:
      'Obtiene información de tiempos de entrega y costos de envío para Colombia. Úsalo cuando el cliente pregunte por envíos, domicilios o tiempos de entrega.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_payment_methods',
    description:
      'Obtiene los métodos de pago disponibles en Freshco. Úsalo cuando el cliente pregunte cómo puede pagar.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_order',
    description:
      'Crea un pedido cuando el cliente haya confirmado todos los datos: productos, talla, color, dirección de envío y método de pago.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Lista de productos del pedido',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'string' },
              product_name: { type: 'string' },
              size: { type: 'string' },
              color: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number' },
            },
            required: ['product_id', 'product_name', 'size', 'color', 'quantity', 'unit_price'],
          },
        },
        total: {
          type: 'number',
          description: 'Total del pedido en pesos colombianos (COP)',
        },
        shipping_address: {
          type: 'string',
          description: 'Dirección completa de envío (nombre, ciudad, barrio, dirección)',
        },
        payment_method: {
          type: 'string',
          description: 'Método de pago elegido por el cliente',
        },
      },
      required: ['items', 'total', 'shipping_address', 'payment_method'],
    },
  },
]

// ─── Ejecución de herramientas ─────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  customerPhone: string,
): Promise<string> {
  switch (name) {
    case 'get_product_catalog': {
      const category = input.category as string | undefined
      const products = category
        ? PRODUCTS.filter((p) => p.category.toLowerCase() === category.toLowerCase())
        : PRODUCTS
      return JSON.stringify(products)
    }

    case 'get_size_guide': {
      const category = input.category as string | undefined
      if (category && category in SIZE_GUIDE) {
        return JSON.stringify({
          [category]: SIZE_GUIDE[category as keyof typeof SIZE_GUIDE],
          consejo: SIZE_GUIDE.consejo,
        })
      }
      return JSON.stringify(SIZE_GUIDE)
    }

    case 'get_shipping_info':
      return JSON.stringify(SHIPPING_INFO)

    case 'get_payment_methods':
      return JSON.stringify(PAYMENT_METHODS)

    case 'create_order': {
      const supabase = createServerClient()
      const order = await saveOrder(supabase, {
        customer_phone: customerPhone,
        items: input.items as OrderItem[],
        total: input.total as number,
        shipping_address: input.shipping_address as string,
        payment_method: input.payment_method as string,
      })

      if (!order) {
        return JSON.stringify({ error: 'No se pudo guardar el pedido. Intenta de nuevo.' })
      }

      return JSON.stringify({
        success: true,
        order_id: order.id,
        message: `Pedido #${order.id.slice(0, 8).toUpperCase()} creado exitosamente.`,
      })
    }

    default:
      return JSON.stringify({ error: `Herramienta '${name}' no disponible` })
  }
}

// ─── Función principal del agente ─────────────────────────────────────────────

export async function processMessage(
  customerPhone: string,
  message: string,
  history: Message[],
): Promise<{ response: string; intent: Intent; requestedHuman: boolean }> {
  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

  // Construir historial de mensajes para Claude
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  let currentMessages = messages
  let iterations = 0

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++

    let response: Anthropic.Message
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(),
        messages: currentMessages,
        tools: TOOLS,
      })
    } catch (error) {
      console.error('Error llamando Claude API:', error)
      return {
        response:
          'Lo siento, tuve un problema técnico. Por favor intenta de nuevo o escríbenos en Instagram @freshco.col 🙏',
        intent: 'otro',
        requestedHuman: false,
      }
    }

    if (response.stop_reason === 'tool_use') {
      // Ejecutar las herramientas solicitadas
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            customerPhone,
          )
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          })
        }
      }

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ]
      continue
    }

    // stop_reason === 'end_turn' — extraer texto e intención
    const textBlock = response.content.find((b) => b.type === 'text')
    const fullText = textBlock?.type === 'text' ? textBlock.text : ''

    // Parsear y extraer intención del marcador [INTENCION:tipo]
    const intentMatch = fullText.match(/\[INTENCION:([^\]]+)\]/)
    const rawIntent = intentMatch ? intentMatch[1].trim() : 'otro'
    const intent: Intent = isValidIntent(rawIntent) ? rawIntent : 'otro'

    // Limpiar el marcador antes de enviar al cliente
    const cleanResponse = fullText.replace(/\[INTENCION:[^\]]+\]/g, '').trim()

    return {
      response: cleanResponse || 'No entendí tu mensaje. ¿Puedes intentar de nuevo?',
      intent,
      requestedHuman: intent === 'solicita_asesor',
    }
  }

  // Se agotaron las iteraciones
  return {
    response:
      'Tuve un problema procesando tu consulta. Por favor contáctanos en @freshco.col 🙏',
    intent: 'otro',
    requestedHuman: false,
  }
}

import Anthropic from '@anthropic-ai/sdk'
import { emailOrderCreated } from './email'
import { buildSystemPrompt } from './system-prompt'
import { SIZE_GUIDE, SHIPPING_INFO, DTF_CARE } from './product-catalog'
import { PAYMENT_METHODS } from './store-info'
import {
  createServerClient,
  saveOrder,
  getCustomerHistory,
  getOrderByShortId,
  type Message,
  type OrderItem,
} from './supabase'
import {
  searchProducts,
  getProductById,
  getCollections,
  getGarmentTypes,
  getNewArrivals,
  getBestsellers,
  summarizeForAgent,
} from './products-db'
import { buildPaymentLink, newReference } from './wompi'
import { sendWhatsAppImage } from './whatsapp'
import { isValidIntent, type Intent } from './intents'

// Modelo: claude-haiku-4-5 — rápido y económico, ideal para WhatsApp.
// Para tareas más complejas considerar claude-sonnet-4-6.
const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 1024
const MAX_TOOL_ITERATIONS = 6

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_products',
    description:
      'Busca productos en el catálogo de Freshco (Supabase). Úsalo SIEMPRE que el cliente pregunte por productos, precios, colores, tallas, colecciones o disponibilidad. Devuelve los productos con id, nombre, precio, link a la página web y foto frontal. Filtra por cualquier combinación de parámetros; si no pasas filtros devuelve todo el catálogo disponible.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Texto libre para buscar en nombre, descripción, colección o color (ej: "tóxica", "vainilla", "todo melo").',
        },
        garment_type: {
          type: 'string',
          description: 'Slug del tipo de prenda. Valores reales en el catálogo: camisetas, pantalones, hoodies.',
        },
        collection: {
          type: 'string',
          description: 'Slug de la colección (ej: "todo-melo"). Llama a list_collections para ver las disponibles.',
        },
        audience: {
          type: 'string',
          enum: ['mujer', 'hombre', 'unisex'],
          description: 'Filtrar por audiencia. Hoy todos los productos son unisex.',
        },
        size: { type: 'string', description: 'Talla específica (S, M, L, XL, XXL).' },
        color: { type: 'string', description: 'Color específico (ej: Vainilla).' },
        on_sale: { type: 'boolean', description: 'Solo productos en oferta.' },
        limit: { type: 'number', description: 'Máximo de productos a devolver. Por defecto 20.' },
      },
    },
  },
  {
    name: 'get_product_by_id',
    description:
      'Obtiene un producto específico por su id/slug. Úsalo cuando ya identificaste el producto que quiere el cliente y necesitas detalles completos (descripción, material, todas las tallas, etc.) o cuando vas a crear el link de pago.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Slug del producto (ej: "no-se-mate-el-coco").' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_bestsellers',
    description:
      'Devuelve los productos más vendidos (más unidades pagadas en órdenes aprobadas), de mayor a menor. Úsalo cuando el cliente pregunta "¿cuál es la más vendida?", "¿qué recomiendas?", "¿qué es lo más pedido?", o cuando no sabe qué llevar y necesita prueba social.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Máximo de productos a devolver. Por defecto 3.' },
      },
    },
  },
  {
    name: 'get_new_arrivals',
    description:
      'Devuelve los productos más nuevos del catálogo, de más reciente a más antiguo. Úsalo cuando el cliente pregunta "¿qué tienen nuevo?", "¿qué llegó esta semana?", o "novedades".',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Máximo de productos a devolver. Por defecto 3.' },
      },
    },
  },
  {
    name: 'list_collections',
    description:
      'Lista las colecciones activas en el catálogo con su slug y nombre. Úsalo si el cliente pregunta "qué colecciones tienen" o si necesitas el slug exacto antes de filtrar.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_garment_types',
    description:
      'Lista los tipos de prenda disponibles (camisetas, pantalones, etc.).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_size_guide',
    description:
      'Guía de tallas en centímetros. Úsalo cuando el cliente pregunte por medidas, o si dudan qué talla pedir.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Categoría: camisetas_oversize.' },
      },
    },
  },
  {
    name: 'get_shipping_info',
    description: 'Tiempos y costos de envío en Colombia.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_payment_methods',
    description:
      'Métodos de pago disponibles (Nequi, Bancolombia, link de tarjeta Wompi, contraentrega, etc.).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'modify_order',
    description:
      'Modifica una orden EXISTENTE de este cliente antes de que sea enviada. Solo funciona si payment_status="approved" o "pending" Y la orden NO tiene tracking_number todavía. Sirve para: cambiar talla o color de un item, cambiar la dirección de envío, o cancelar. NO usar para cambiar productos (eso requiere generar otra orden) ni para cambiar el precio.',
    input_schema: {
      type: 'object',
      properties: {
        short_id: { type: 'string', description: 'Short id de la orden (los primeros 8 chars, ej "63AE8DB9").' },
        change_type: {
          type: 'string',
          enum: ['size', 'color', 'address', 'cancel'],
          description: 'Qué cambiar.',
        },
        item_index: {
          type: 'number',
          description: 'Índice del item a modificar (0 = primero) cuando cambias size o color. Por defecto 0.',
        },
        new_value: {
          type: 'string',
          description: 'El valor nuevo (talla nueva, color nuevo, o dirección completa nueva). Ignorado si change_type=cancel.',
        },
      },
      required: ['short_id', 'change_type'],
    },
  },
  {
    name: 'send_product_images',
    description:
      'Envía al cliente las fotos de los productos por WhatsApp, ANTES de tu respuesta de texto. Úsalo cuando estés recomendando o mostrando 1-4 productos relevantes a su consulta. Pasa los ids de los productos (ej: "no-se-mate-el-coco"). Devuelve cuántas imágenes envió y cuáles fallaron.',
    input_schema: {
      type: 'object',
      properties: {
        product_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ids/slugs de los productos a mostrar (máximo 4).',
        },
      },
      required: ['product_ids'],
    },
  },
  {
    name: 'get_customer_history',
    description:
      'Devuelve el histórico de compras del cliente actual: cantidad de pedidos, último pedido (short_id, total, estado), talla y color favoritos. Úsalo al inicio de la conversación si el cliente es recurrente para personalizar la experiencia, o cuando el cliente pregunte por "mis pedidos".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_order_status',
    description:
      'Devuelve el estado actual de una orden por su short_id (los primeros 8 caracteres del id, ej: "63AE8DB9"). Úsalo cuando el cliente pregunte por el estado de un pedido específico.',
    input_schema: {
      type: 'object',
      properties: {
        short_id: { type: 'string', description: 'Los primeros 8 caracteres del id de la orden, sin el #.' },
      },
      required: ['short_id'],
    },
  },
  {
    name: 'create_payment_link',
    description:
      'Genera un link de pago seguro con Wompi (tarjeta crédito/débito, PSE, Nequi, Bancolombia Transfer) para que el cliente pague desde el navegador. Crea la orden en estado pendiente y devuelve la URL para enviarla por WhatsApp. ÚSALO únicamente cuando el cliente ya confirmó: producto(s), talla, color, dirección de envío y eligió "link de pago" o "tarjeta" como método. La confirmación del pago llega automáticamente por webhook — no hace falta crear otra orden después.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Productos del pedido.',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'string' },
              product_name: { type: 'string' },
              size: { type: 'string' },
              color: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number', description: 'Precio unitario en COP.' },
            },
            required: ['product_id', 'product_name', 'size', 'color', 'quantity', 'unit_price'],
          },
        },
        total: { type: 'number', description: 'Total en pesos colombianos (COP), envío incluido.' },
        shipping_address: { type: 'string', description: 'Dirección física de entrega: ciudad, barrio, calle/carrera, número e indicaciones. NO incluir el nombre del cliente.' },
        customer_name: { type: 'string', description: 'Nombre completo del cliente.' },
        customer_email: { type: 'string', description: 'Correo electrónico del cliente. OBLIGATORIO — necesario para asociar el pedido a su cuenta.' },
        coupon_code: { type: 'string', description: 'Código de cupón aplicado. Solo si el cliente lo proporcionó y validate_coupon confirmó que es válido.' },
        discount_amount: { type: 'number', description: 'Monto descontado en COP. Ya debe estar descontado del total.' },
      },
      required: ['items', 'total', 'shipping_address', 'customer_name', 'customer_email'],
    },
  },
  {
    name: 'validate_coupon',
    description:
      'Verifica si un código de cupón es válido y cuánto descuento aplica. NO incrementa el contador de usos — solo consulta. Llámalo cuando el cliente mencione tener un cupón o código de descuento.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'El código del cupón tal como lo escribió el cliente.' },
      },
      required: ['code'],
    },
  },
  {
    name: 'create_order',
    description:
      'Crea un pedido SIN link de pago — úsalo solo para métodos manuales como Nequi/Bancolombia transferencia o contraentrega. Para pagos con tarjeta usa create_payment_link.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
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
        total: { type: 'number' },
        shipping_address: { type: 'string' },
        payment_method: { type: 'string', description: 'Nequi, Bancolombia, Daviplata, Contraentrega.' },
        customer_name: { type: 'string' },
        customer_email: { type: 'string', description: 'Correo electrónico del cliente.' },
        coupon_code: { type: 'string', description: 'Código de cupón aplicado (si aplica).' },
        discount_amount: { type: 'number', description: 'Monto descontado en COP (si aplica).' },
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
    case 'search_products': {
      const limit = typeof input.limit === 'number' ? input.limit : 20
      const products = await searchProducts({
        query: input.query as string | undefined,
        garment_type: input.garment_type as string | undefined,
        collection: input.collection as string | undefined,
        audience: input.audience as 'mujer' | 'hombre' | 'unisex' | undefined,
        size: input.size as string | undefined,
        color: input.color as string | undefined,
        on_sale: input.on_sale as boolean | undefined,
        only_available: true,
        limit,
      })
      return JSON.stringify({
        count: products.length,
        products: products.map(summarizeForAgent),
      })
    }

    case 'get_product_by_id': {
      const id = String(input.id ?? '')
      const product = await getProductById(id)
      if (!product) return JSON.stringify({ error: `Producto '${id}' no encontrado.` })
      return JSON.stringify({ product: summarizeForAgent(product) })
    }

    case 'get_bestsellers': {
      const limit = typeof input.limit === 'number' ? input.limit : 3
      const products = await getBestsellers(limit)
      return JSON.stringify({
        count: products.length,
        products: products.map((p) => ({ ...summarizeForAgent(p), units_sold: p.units_sold })),
      })
    }

    case 'get_new_arrivals': {
      const limit = typeof input.limit === 'number' ? input.limit : 3
      const products = await getNewArrivals(limit)
      return JSON.stringify({
        count: products.length,
        products: products.map(summarizeForAgent),
      })
    }

    case 'list_collections': {
      const cols = await getCollections()
      return JSON.stringify({ collections: cols })
    }

    case 'list_garment_types': {
      const gts = await getGarmentTypes()
      return JSON.stringify({ garment_types: gts })
    }

    case 'get_size_guide':
      return JSON.stringify({ ...SIZE_GUIDE, cuidados_dtf: DTF_CARE })

    case 'get_shipping_info':
      return JSON.stringify(SHIPPING_INFO)

    case 'get_payment_methods':
      return JSON.stringify(PAYMENT_METHODS)

    case 'modify_order': {
      const supabase = createServerClient()
      const shortId = String(input.short_id ?? '')
      const changeType = String(input.change_type ?? '')
      const newValue = input.new_value ? String(input.new_value) : ''
      const itemIndex = typeof input.item_index === 'number' ? input.item_index : 0

      const order = await getOrderByShortId(supabase, customerPhone, shortId)
      if (!order) {
        return JSON.stringify({ error: `No encontré tu pedido #${shortId}.` })
      }
      if (order.tracking_number) {
        return JSON.stringify({
          error: `El pedido #${shortId} ya fue despachado (guía ${order.tracking_number}). No puedo modificarlo desde acá.`,
          action_required: 'ESCALAR_A_ASESOR',
        })
      }
      if (order.payment_status !== 'approved' && order.payment_status !== 'pending') {
        return JSON.stringify({
          error: `El pedido #${shortId} está en estado ${order.payment_status} y no se puede modificar.`,
        })
      }

      let updatedItems = order.items
      const patch: Record<string, unknown> = {}

      if (changeType === 'size' || changeType === 'color') {
        if (!newValue) return JSON.stringify({ error: 'Falta new_value.' })
        const items = Array.isArray(order.items) ? [...order.items] : []
        if (itemIndex < 0 || itemIndex >= items.length) {
          return JSON.stringify({ error: `El item ${itemIndex} no existe en el pedido.` })
        }
        items[itemIndex] = { ...items[itemIndex], [changeType]: newValue }
        updatedItems = items
        patch.items = items
      } else if (changeType === 'address') {
        if (!newValue) return JSON.stringify({ error: 'Falta new_value (dirección).' })
        patch.shipping_address = newValue
      } else if (changeType === 'cancel') {
        patch.status = 'cancelado'
        if (order.payment_status === 'pending') {
          patch.payment_status = 'voided'
        }
      } else {
        return JSON.stringify({ error: `change_type inválido: ${changeType}` })
      }

      const { error: updateErr } = await supabase
        .from('orders')
        .update(patch)
        .eq('id', order.id)
      if (updateErr) {
        return JSON.stringify({ error: `No se pudo actualizar: ${updateErr.message}` })
      }

      return JSON.stringify({
        success: true,
        short_id: order.id.slice(0, 8).toUpperCase(),
        change_type: changeType,
        updated_items: updatedItems,
        new_address: patch.shipping_address ?? order.shipping_address,
        new_status: patch.status ?? order.status,
        message:
          changeType === 'cancel'
            ? `Pedido #${order.id.slice(0, 8).toUpperCase()} cancelado.`
            : `Pedido #${order.id.slice(0, 8).toUpperCase()} actualizado.`,
      })
    }

    case 'send_product_images': {
      const ids = ((input.product_ids as string[]) ?? []).slice(0, 4)
      if (ids.length === 0) return JSON.stringify({ sent: 0, errors: [] })

      const errors: string[] = []
      let sent = 0
      for (const id of ids) {
        const product = await getProductById(id)
        // Mostramos la trasera (donde va el estampado DTF). Si por algún motivo
        // no existe la imagen trasera, caemos a la frontal.
        const imageUrl = product?.image_back_url ?? product?.image_front_url
        if (!product || !imageUrl) {
          errors.push(`${id}: sin imagen`)
          continue
        }
        const priceLine =
          product.on_sale && product.sale_price
            ? `$${product.sale_price.toLocaleString('es-CO')} (antes $${product.price.toLocaleString('es-CO')})`
            : `$${product.price.toLocaleString('es-CO')}`
        const caption = `${product.name} — ${priceLine}\n👉 Ver más: ${product.product_url}`
        try {
          await sendWhatsAppImage(customerPhone, imageUrl, caption)
          sent++
          if (sent < ids.length) await new Promise((r) => setTimeout(r, 400))
        } catch (err) {
          errors.push(`${id}: ${err instanceof Error ? err.message : 'error'}`)
        }
      }
      return JSON.stringify({ sent, errors })
    }

    case 'get_customer_history': {
      const supabase = createServerClient()
      const history = await getCustomerHistory(supabase, customerPhone)
      return JSON.stringify(history)
    }

    case 'get_order_status': {
      const supabase = createServerClient()
      const shortId = String(input.short_id ?? '')
      const order = await getOrderByShortId(supabase, customerPhone, shortId)
      if (!order) {
        return JSON.stringify({ error: `No encontré ningún pedido tuyo con el id #${shortId}.` })
      }
      return JSON.stringify({
        short_id: order.id.slice(0, 8).toUpperCase(),
        payment_status: order.payment_status,
        paid_at: order.paid_at,
        total: order.total,
        items: order.items,
        shipping_address: order.shipping_address,
        payment_method: order.payment_method,
        created_at: order.created_at,
        tracking_number: order.tracking_number,
        shipping_carrier: order.shipping_carrier,
        shipped_at: order.shipped_at,
        status: order.status,
      })
    }

    case 'validate_coupon': {
      const supabase = createServerClient()
      const code = String(input.code ?? '').trim().toUpperCase()
      if (!code) return JSON.stringify({ valid: false, error: 'Código vacío.' })

      const { data: coupon } = await supabase
        .from('coupons')
        .select('id, code, discount, description, active, usage_limit, used_count, expires_at, one_per_customer')
        .ilike('code', code)
        .maybeSingle()

      if (!coupon) return JSON.stringify({ valid: false, error: 'Código no encontrado.' })
      if (!coupon.active) return JSON.stringify({ valid: false, error: 'Este código ya no está activo.' })
      if (coupon.expires_at && new Date(coupon.expires_at as string) < new Date()) {
        return JSON.stringify({ valid: false, error: 'Este código ya expiró.' })
      }
      if (coupon.usage_limit != null && (coupon.used_count as number) >= (coupon.usage_limit as number)) {
        return JSON.stringify({ valid: false, error: 'Este código ya alcanzó su límite de usos.' })
      }

      // Verificar one_per_customer por teléfono del cliente de WhatsApp
      if (coupon.one_per_customer) {
        const { data: existing } = await supabase
          .from('coupon_uses')
          .select('id')
          .eq('coupon_id', coupon.id)
          .eq('customer_phone', customerPhone)
          .limit(1)
          .maybeSingle()
        if (existing) {
          return JSON.stringify({ valid: false, error: 'Este código es solo para tu primera compra y ya lo usaste anteriormente.' })
        }
      }

      return JSON.stringify({
        valid: true,
        coupon_id: coupon.id,
        code: coupon.code,
        discount_pct: Math.round((coupon.discount as number) * 100),
        discount_decimal: coupon.discount,
        description: coupon.description ?? '',
      })
    }

    case 'create_payment_link': {
      try {
        const items = input.items as OrderItem[]
        const total = Number(input.total)
        const shippingAddress = String(input.shipping_address)
        const customerName = String(input.customer_name)
        const customerEmail = input.customer_email ? String(input.customer_email) : undefined
        const couponCode = input.coupon_code ? String(input.coupon_code).toUpperCase() : undefined
        const discountAmount = input.discount_amount ? Number(input.discount_amount) : 0
        const reference = newReference(customerPhone)
        const amountInCents = Math.round(total * 100)

        const paymentLink = buildPaymentLink({
          reference,
          amountInCents,
          currency: 'COP',
          customerEmail,
          customerName,
          customerPhone,
        })

        const supabase = createServerClient()
        const order = await saveOrder(supabase, {
          customer_phone: customerPhone,
          items,
          total,
          shipping_address: shippingAddress,
          payment_method: 'Wompi (link de pago)',
          customer_name: customerName,
          customer_email: customerEmail,
          wompi_reference: reference,
          payment_link_url: paymentLink,
          amount_in_cents: amountInCents,
          currency: 'COP',
          source: 'whatsapp_bot',
          coupon_code: couponCode,
          discount_amount: discountAmount,
        })

        // Registrar uso del cupón en coupon_uses (garantiza one_per_customer)
        if (couponCode && order) {
          const { data: c } = await supabase
            .from('coupons')
            .select('id, used_count')
            .ilike('code', couponCode)
            .maybeSingle()
          if (c) {
            await Promise.all([
              supabase.from('coupons').update({ used_count: (c.used_count as number) + 1 }).eq('id', c.id),
              supabase.from('coupon_uses').insert({
                coupon_id: c.id,
                customer_phone: customerPhone,
                customer_email: customerEmail ?? null,
                order_id: order.id,
              }),
            ])
          }
        }

        if (!order) {
          return JSON.stringify({ error: 'No se pudo guardar la orden. Intenta de nuevo.' })
        }

        // Email de pedido recibido (fire-and-forget)
        if (customerEmail) {
          emailOrderCreated({
            shortId: order.id.slice(0, 8).toUpperCase(),
            customerName,
            customerEmail,
            total,
            items,
            shippingAddress: shippingAddress,
          }).catch((e) => console.error('Email pedido recibido:', e))
        }

        return JSON.stringify({
          success: true,
          order_id: order.id,
          reference,
          payment_link: paymentLink,
          message:
            `Link de pago generado. Comparte el siguiente texto con el cliente: "Listo. Tu pedido por $${total.toLocaleString('es-CO')} está reservado. Paga aquí: ${paymentLink}  Cuando se complete el pago te confirmamos por este chat."`,
        })
      } catch (error) {
        console.error('Error generando link de pago:', error)
        const msg = error instanceof Error ? error.message : 'Error desconocido.'
        return JSON.stringify({
          error: `No se pudo generar el link de pago: ${msg}`,
        })
      }
    }

    case 'create_order': {
      const supabase = createServerClient()
      const customerName = input.customer_name ? String(input.customer_name) : undefined
      const customerEmail = input.customer_email ? String(input.customer_email) : undefined
      const couponCode = input.coupon_code ? String(input.coupon_code).toUpperCase() : undefined
      const discountAmount = input.discount_amount ? Number(input.discount_amount) : 0
      const order = await saveOrder(supabase, {
        customer_phone: customerPhone,
        items: input.items as OrderItem[],
        total: input.total as number,
        shipping_address: input.shipping_address as string,
        payment_method: input.payment_method as string,
        customer_name: customerName,
        customer_email: customerEmail,
        source: 'whatsapp_bot',
        coupon_code: couponCode,
        discount_amount: discountAmount,
      })

      // Incrementar used_count si se usó cupón
      if (couponCode && order) {
        const { data: c } = await supabase
          .from('coupons')
          .select('id, used_count')
          .ilike('code', couponCode)
          .maybeSingle()
        if (c) {
          await supabase
            .from('coupons')
            .update({ used_count: (c.used_count as number) + 1 })
            .eq('id', c.id)
        }
      }

      if (!order) {
        return JSON.stringify({ error: 'No se pudo guardar el pedido. Intenta de nuevo.' })
      }

      // Decrementar stock (pago manual — se asume que el cliente pagará)
      const orderItems = input.items as Array<{ product_id?: string; quantity?: number }>
      for (const item of orderItems) {
        if (!item.product_id) continue
        const supabaseStock = createServerClient()
        const { data: prod } = await supabaseStock.from('products').select('stock').eq('id', item.product_id).maybeSingle()
        if (prod != null) {
          const newStock = Math.max(0, (prod.stock as number) - (item.quantity ?? 1))
          const patch: Record<string, unknown> = { stock: newStock }
          if (newStock === 0) patch.out_of_stock = true
          await supabaseStock.from('products').update(patch).eq('id', item.product_id)
        }
      }

      // Email de pedido recibido (fire-and-forget)
      if (customerEmail) {
        emailOrderCreated({
          shortId: order.id.slice(0, 8).toUpperCase(),
          customerName,
          customerEmail,
          total: input.total as number,
          items: input.items as never,
          shippingAddress: input.shipping_address as string,
        }).catch((e) => console.error('Email pedido recibido:', e))
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

export interface InboundImage {
  base64: string
  mimeType: string
}

export async function processMessage(
  customerPhone: string,
  message: string,
  history: Message[],
  isReturningCustomer = false,
  image?: InboundImage,
): Promise<{ response: string; intent: Intent; requestedHuman: boolean }> {
  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

  // Si es cliente recurrente, prefetch del histórico para personalizar el saludo.
  let returningCtx
  if (isReturningCustomer) {
    try {
      const supabase = createServerClient()
      const hist = await getCustomerHistory(supabase, customerPhone)
      if (hist.total_orders > 0) {
        returningCtx = {
          customer_name: hist.customer_name,
          favorite_size: hist.favorite_size,
          favorite_color: hist.favorite_color,
          last_purchase_at: hist.last_purchase_at,
          total_orders: hist.total_orders,
        }
      }
    } catch (err) {
      console.error('No se pudo prefetch customer history:', err)
    }
  }

  const systemPrompt = buildSystemPrompt(isReturningCustomer, returningCtx)

  const userBlocks: Anthropic.ContentBlockParam[] = []
  if (image) {
    userBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: image.base64,
      },
    })
  }
  userBlocks.push({
    type: 'text',
    text: message || (image ? 'El cliente envió esta foto.' : ''),
  })

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userBlocks },
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
        system: systemPrompt,
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

    const textBlock = response.content.find((b) => b.type === 'text')
    const fullText = textBlock?.type === 'text' ? textBlock.text : ''

    const intentMatch = fullText.match(/\[INTENCION:([^\]]+)\]/)
    const rawIntent = intentMatch ? intentMatch[1].trim() : 'otro'
    const intent: Intent = isValidIntent(rawIntent) ? rawIntent : 'otro'

    const cleanResponse = fullText.replace(/\[INTENCION:[^\]]+\]/g, '').trim()

    return {
      response: cleanResponse || 'No entendí tu mensaje. ¿Puedes intentar de nuevo?',
      intent,
      requestedHuman: intent === 'solicita_asesor',
    }
  }

  return {
    response:
      'Tuve un problema procesando tu consulta. Por favor contáctanos en @freshco.col 🙏',
    intent: 'otro',
    requestedHuman: false,
  }
}

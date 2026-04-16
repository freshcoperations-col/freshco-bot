export type Intent =
  | 'consulta_producto'
  | 'consulta_tallas'
  | 'pedido'
  | 'consulta_envio'
  | 'consulta_pago'
  | 'saludo'
  | 'otro'

export const INTENT_LABELS: Record<Intent, string> = {
  consulta_producto: 'Producto',
  consulta_tallas: 'Tallas',
  pedido: 'Pedido',
  consulta_envio: 'Envío',
  consulta_pago: 'Pago',
  saludo: 'Saludo',
  otro: 'Otro',
}

export const INTENT_COLORS: Record<Intent, string> = {
  consulta_producto: '#2563EB',  // blue
  consulta_tallas: '#7C3AED',    // purple
  pedido: '#059669',             // green
  consulta_envio: '#D97706',     // amber
  consulta_pago: '#0D9488',      // teal
  saludo: '#6B7280',             // gray
  otro: '#9CA3AF',               // light gray
}

export const INTENT_BG_COLORS: Record<Intent, string> = {
  consulta_producto: '#EFF6FF',
  consulta_tallas: '#F5F3FF',
  pedido: '#ECFDF5',
  consulta_envio: '#FFFBEB',
  consulta_pago: '#F0FDFA',
  saludo: '#F9FAFB',
  otro: '#F9FAFB',
}

export const ALL_INTENTS: Intent[] = [
  'consulta_producto',
  'consulta_tallas',
  'pedido',
  'consulta_envio',
  'consulta_pago',
  'saludo',
  'otro',
]

export function isValidIntent(value: string): value is Intent {
  return ALL_INTENTS.includes(value as Intent)
}

export const STORE_INFO = {
  name: 'Freshco',
  tagline: 'Ropa urbana — Bogotá, Colombia',
  city: 'Bogotá',
  country: 'Colombia',
  instagram: '@freshco.col',
  schedule: 'Lunes a sábado 9am–8pm, domingos 10am–6pm',
  minOrderFreeShipping: 150000, // COP
}

export const PAYMENT_METHODS = [
  {
    method: 'Nequi',
    details: 'Número: 301 234 5678',
    instructions:
      'Realiza la transferencia y envíanos el comprobante por este mismo chat.',
  },
  {
    method: 'Bancolombia',
    details: 'Cuenta de ahorros: 123-456789-00',
    instructions:
      'Realiza la transferencia y envíanos el comprobante por este mismo chat.',
  },
  {
    method: 'Daviplata',
    details: 'Número: 301 234 5678',
    instructions: 'Realiza la transferencia y envíanos el comprobante.',
  },
  {
    method: 'Contraentrega',
    details: 'Disponible en Bogotá y ciudades principales.',
    instructions: 'Pagas directamente al recibir tu pedido. Sin costo adicional.',
  },
  {
    method: 'Link de pago (tarjeta crédito/débito)',
    details: 'Visa, Mastercard, American Express',
    instructions: 'Te enviamos un link seguro para pagar con tu tarjeta.',
  },
]

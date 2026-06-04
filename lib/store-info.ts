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
    method: 'Link de pago Wompi (recomendado)',
    details:
      'El link de Wompi acepta: Tarjeta crédito/débito (Visa, Mastercard, Amex), ' +
      'PSE (débito bancario), Nequi, Bancolombia a la mano y Daviplata.',
    instructions:
      'Te enviamos un link seguro. Pagas con el método que prefieras dentro del link. ' +
      'La confirmación llega automáticamente.',
  },
  {
    method: 'Contraentrega',
    details: 'Disponible en Bogotá y ciudades principales.',
    instructions: 'Pagas directamente al recibir tu pedido. Sin costo adicional.',
  },
]

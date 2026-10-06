export const STORE_INFO = {
  name: 'Freshco',
  tagline: 'Ropa urbana — marca 100% online, con base en Bogotá',
  city: 'Bogotá',
  country: 'Colombia',
  instagram: '@freshco_design',
  tiktok: '@freshco_design',
  website: 'https://freshco-design.com',
  email: 'Freshcoperations@gmail.com', // solicitudes de datos personales (Ley 1581)
  // Horario de los ASESORES HUMANOS. El asistente del chat atiende 24/7.
  humanSchedule: 'lunes a sábado de 9 a. m. a 8 p. m., y domingos de 10 a. m. a 6 p. m.',
}

// Política de tratamiento de datos (Ley 1581). La versión debe coincidir con
// PRIVACY_POLICY_VERSION de freshco-webpage/src/data/legal.js.
export const PRIVACY_POLICY_URL = 'https://freshco-design.com/legal/privacidad'
export const PRIVACY_POLICY_VERSION = '2026-10-06'

// Mismo horario, en datos, para saber si en este momento hay asesores.
// Índice = día de la semana (0 = domingo). Horas en hora de Bogotá.
const HUMAN_HOURS: Array<{ open: number; close: number }> = [
  { open: 10, close: 18 }, // domingo
  { open: 9, close: 20 },  // lunes
  { open: 9, close: 20 },
  { open: 9, close: 20 },
  { open: 9, close: 20 },
  { open: 9, close: 20 },
  { open: 9, close: 20 },  // sábado
]

function hourLabel(h: number): string {
  if (h === 12) return '12 m.'
  return h < 12 ? `${h} a. m.` : `${h - 12} p. m.`
}

// ¿Hay asesores humanos ahora? Y si no, cuándo vuelven, en palabras.
// Bogotá es UTC-5 todo el año (sin horario de verano), así que basta con
// restar 5 horas, sin depender de la zona horaria del servidor.
export function humanAvailability(now: Date = new Date()): { open: boolean; nextOpen: string } {
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  const day = bogota.getUTCDay()
  const hour = bogota.getUTCHours() + bogota.getUTCMinutes() / 60
  const today = HUMAN_HOURS[day]

  if (hour >= today.open && hour < today.close) return { open: true, nextOpen: 'ahora' }
  if (hour < today.open) return { open: false, nextOpen: `hoy desde las ${hourLabel(today.open)}` }
  const tomorrow = HUMAN_HOURS[(day + 1) % 7]
  return { open: false, nextOpen: `mañana desde las ${hourLabel(tomorrow.open)}` }
}

// Todos los pagos con tarjeta, PSE, Nequi, Bancolombia o Daviplata van por el
// link de Wompi. No se aceptan transferencias directas.
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
    details: 'Disponible a todo el país, sin costo adicional. Pagas en efectivo al recibir tu pedido.',
    instructions:
      'Confirmas el pedido y lo despachamos. El pago lo haces directamente al mensajero o transportadora al momento de la entrega.',
  },
]

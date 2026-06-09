export type ShippingZone = 'bogota' | 'regional' | 'nacional'

const BOGOTA_KEYWORDS = ['bogotá', 'bogota', 'bta', 'dc', 'd.c']

const REGIONAL_KEYWORDS = [
  'soacha', 'chía', 'chia', 'cajicá', 'cajica', 'zipaquirá', 'zipaquira',
  'facatativá', 'facatativa', 'madrid', 'mosquera', 'funza', 'la calera',
  'sibaté', 'sibate', 'sopó', 'sopo', 'tabio', 'tenjo', 'tocancipá', 'tocancipa',
  'gachancipá', 'gachancipa', 'cota',
]

export const SHIPPING_COSTS: Record<ShippingZone, number> = {
  bogota: 10000,
  regional: 12000,
  nacional: 15000,
}

export const SHIPPING_TIMES: Record<ShippingZone, string> = {
  bogota: '1-2 días hábiles',
  regional: '2-3 días hábiles',
  nacional: '3-5 días hábiles',
}

export function getShippingZone(city: string): ShippingZone {
  const c = city.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (BOGOTA_KEYWORDS.some((k) => c.includes(norm(k)))) return 'bogota'
  if (REGIONAL_KEYWORDS.some((k) => c.includes(norm(k)))) return 'regional'
  return 'nacional'
}

export function getShippingCost(city: string, hasFreeShipping = false): number {
  if (hasFreeShipping) return 0
  return SHIPPING_COSTS[getShippingZone(city)]
}

export function getShippingLabel(city: string): string {
  const zone = getShippingZone(city)
  const cost = SHIPPING_COSTS[zone]
  return `$${cost.toLocaleString('es-CO')}`
}

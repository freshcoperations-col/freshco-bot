export interface Product {
  id: string
  name: string
  category: string
  price: number
  sizes: string[]
  colors: string[]
  description: string
  material: string
  printing: string
  available: boolean
}

export const PRODUCTS: Product[] = [
  {
    id: 'CAM-OVER-DTF',
    name: 'Camiseta Oversize DTF',
    category: 'Camisetas',
    price: 48000,
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['Blanco', 'Negro', 'Beige', 'Gris', 'Azul cielo'],
    description: 'Camiseta oversize con estampado DTF exclusivo de Freshco. Corte amplio y relajado, perfecta para el look urbano. Cada diseño es único.',
    material: '100% algodón',
    printing: 'Estampado DTF (Direct to Film) — colores vivos, alta durabilidad, suave al tacto',
    available: true,
  },
]

export const DTF_CARE = {
  titulo: 'Cuidados del estampado DTF',
  instrucciones: [
    'Lavar al revés (con el estampado hacia adentro)',
    'Agua fría o máximo 30°C',
    'No usar blanqueador ni suavizante directamente sobre el estampado',
    'No frotar el estampado al lavar',
    'Secar a la sombra, evitar secadora',
    'Planchar al revés o con tela protectora — nunca directo sobre el estampado',
    'No lavar en seco',
  ],
  consejo: 'Siguiendo estos cuidados el estampado dura mucho más tiempo con colores vivos.',
}

export const SIZE_GUIDE = {
  camisetas_oversize: {
    S: { pecho: '100-104 cm', largo: '72 cm', hombro: '48 cm', nota: 'Queda amplio en talla S' },
    M: { pecho: '104-108 cm', largo: '74 cm', hombro: '50 cm', nota: 'Talla más pedida' },
    L: { pecho: '108-113 cm', largo: '76 cm', hombro: '52 cm', nota: 'Muy amplio' },
    XL: { pecho: '113-118 cm', largo: '78 cm', hombro: '54 cm', nota: 'Extra amplio' },
    XXL: { pecho: '118-124 cm', largo: '80 cm', hombro: '56 cm', nota: 'Máximo oversize' },
  },
  consejo:
    'El corte oversize ya es amplio por diseño. Si quieres que quede muy holgado sube una talla. Si prefieres que quede menos amplio, usa tu talla normal.',
}

export const SHIPPING_INFO = {
  bogota: {
    tiempo: '1-2 días hábiles',
    costo: '$10.000',
    zona: 'Bogotá',
  },
  regional: {
    tiempo: '2-3 días hábiles',
    costo: '$12.000',
    zona: 'Municipios aledaños: Soacha, Chía, Cajicá, Zipaquirá, Facatativá, Madrid, Mosquera, Funza, La Calera, Sibaté, Sopó, Cota, Tocancipá y otros municipios de Cundinamarca cercanos a Bogotá',
  },
  nacional: {
    tiempo: '3-5 días hábiles',
    costo: '$15.000',
    zona: 'Resto de Colombia — Medellín, Cali, Barranquilla, Bucaramanga, Cartagena y cualquier otro municipio',
  },
  nota: 'Despachamos con Servientrega y Coordinadora. Te enviamos el número de guía cuando tu pedido salga. Si algún producto tiene envío gratis, se aplica sin importar la ciudad.',
}

export interface Product {
  id: string
  name: string
  category: string
  price: number
  sizes: string[]
  colors: string[]
  description: string
  available: boolean
}

export const PRODUCTS: Product[] = [
  {
    id: 'CAM-BASIC',
    name: 'Camiseta Básica',
    category: 'Camisetas',
    price: 35000,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    colors: ['Blanco', 'Negro', 'Gris', 'Azul marino', 'Verde oliva'],
    description: 'Camiseta de algodón 100%, corte regular, cuello redondo.',
    available: true,
  },
  {
    id: 'CAM-STAMP',
    name: 'Camiseta Estampada',
    category: 'Camisetas',
    price: 45000,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    colors: ['Blanco', 'Negro', 'Gris'],
    description: 'Camiseta con estampados exclusivos de Freshco. Diseños urbanos.',
    available: true,
  },
  {
    id: 'CAM-OVER',
    name: 'Camiseta Oversize',
    category: 'Camisetas',
    price: 48000,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Blanco', 'Negro', 'Beige', 'Azul'],
    description: 'Camiseta oversize de tendencia, corte amplio y relajado.',
    available: true,
  },
  {
    id: 'JEAN-SLIM',
    name: 'Jean Slim Fit',
    category: 'Jeans',
    price: 89000,
    sizes: ['28', '30', '32', '34', '36'],
    colors: ['Azul oscuro', 'Negro', 'Azul claro'],
    description: 'Jean slim fit de denim resistente. Corte ceñido y moderno.',
    available: true,
  },
  {
    id: 'JEAN-BAG',
    name: 'Jean Baggy',
    category: 'Jeans',
    price: 95000,
    sizes: ['28', '30', '32', '34', '36'],
    colors: ['Azul oscuro', 'Negro', 'Azul claro', 'Beige'],
    description: 'Jean baggy de corte amplio, estilo 90s. Muy cómodo.',
    available: true,
  },
  {
    id: 'SUDA-CREW',
    name: 'Sudadera Crew Neck',
    category: 'Sudaderas',
    price: 75000,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    colors: ['Gris', 'Negro', 'Azul marino', 'Beige', 'Verde oliva'],
    description: 'Sudadera clásica cuello redondo, tela interior afelpada.',
    available: true,
  },
  {
    id: 'HOOD-BASIC',
    name: 'Hoodie Básico',
    category: 'Hoodies',
    price: 85000,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    colors: ['Gris', 'Negro', 'Azul marino', 'Rojo', 'Blanco'],
    description: 'Hoodie con capucha y bolsillo frontal. Cálido y cómodo.',
    available: true,
  },
  {
    id: 'CHAQ-WIND',
    name: 'Chaqueta Rompevientos',
    category: 'Chaquetas',
    price: 129000,
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colors: ['Negro', 'Azul marino', 'Verde oliva', 'Rojo'],
    description: 'Chaqueta cortavientos ligera, perfecta para el clima bogotano.',
    available: true,
  },
  {
    id: 'SHORT-CARGO',
    name: 'Short Cargo',
    category: 'Shorts',
    price: 55000,
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colors: ['Negro', 'Beige', 'Verde oliva', 'Gris'],
    description: 'Short cargo con bolsillos laterales, tela liviana.',
    available: true,
  },
  {
    id: 'JOG-BASIC',
    name: 'Jogger Básico',
    category: 'Pantalones',
    price: 65000,
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    colors: ['Negro', 'Gris', 'Azul marino'],
    description: 'Jogger cómodo con elástico en cintura y tobillo.',
    available: true,
  },
  {
    id: 'GORRA-5P',
    name: 'Gorra 5 Paneles',
    category: 'Accesorios',
    price: 35000,
    sizes: ['Única'],
    colors: ['Negro', 'Blanco', 'Beige', 'Azul marino'],
    description: 'Gorra de 5 paneles con logo bordado de Freshco.',
    available: true,
  },
  {
    id: 'MED-PACK',
    name: 'Pack de Medias x3',
    category: 'Accesorios',
    price: 18000,
    sizes: ['Única'],
    colors: ['Negro', 'Blanco', 'Gris'],
    description: 'Pack de 3 pares de medias deportivas con logo.',
    available: true,
  },
]

export const SIZE_GUIDE = {
  camisetas: {
    XS: { pecho: '86-91 cm', largo: '67 cm' },
    S: { pecho: '91-96 cm', largo: '69 cm' },
    M: { pecho: '96-101 cm', largo: '71 cm' },
    L: { pecho: '101-107 cm', largo: '73 cm' },
    XL: { pecho: '107-112 cm', largo: '75 cm' },
    XXL: { pecho: '112-117 cm', largo: '77 cm' },
  },
  jeans: {
    '28': { cintura: '71-73 cm', cadera: '91-94 cm' },
    '30': { cintura: '76-78 cm', cadera: '96-99 cm' },
    '32': { cintura: '81-83 cm', cadera: '101-104 cm' },
    '34': { cintura: '86-89 cm', cadera: '106-109 cm' },
    '36': { cintura: '91-94 cm', cadera: '111-114 cm' },
  },
  sudaderas_hoodies: {
    XS: { pecho: '88-93 cm', hombro: '42 cm' },
    S: { pecho: '93-98 cm', hombro: '44 cm' },
    M: { pecho: '98-103 cm', hombro: '46 cm' },
    L: { pecho: '103-109 cm', hombro: '48 cm' },
    XL: { pecho: '109-114 cm', hombro: '50 cm' },
    XXL: { pecho: '114-120 cm', hombro: '52 cm' },
  },
  consejo:
    'Si estás entre dos tallas, te recomendamos elegir la talla mayor para mayor comodidad. Para el estilo oversize, sube una talla adicional.',
}

export const SHIPPING_INFO = {
  bogota: {
    tiempo: '1-2 días hábiles',
    costo: 'Gratis en compras mayores a $150.000. De lo contrario $8.000.',
    zona: 'Bogotá y municipios aledaños (Soacha, Chía, Cajicá, Zipaquirá)',
  },
  ciudades_principales: {
    tiempo: '2-3 días hábiles',
    costo: 'Desde $12.000',
    zona: 'Medellín, Cali, Barranquilla, Bucaramanga, Cartagena, Manizales, Pereira, Cúcuta',
  },
  resto_colombia: {
    tiempo: '3-5 días hábiles',
    costo: 'Desde $15.000',
    zona: 'Todos los demás municipios de Colombia',
  },
  nota: 'Despachamos con Servientrega y Coordinadora. Te enviamos el número de guía cuando tu pedido salga.',
}

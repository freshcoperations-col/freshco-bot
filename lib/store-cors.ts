// CORS de las rutas que llama la tienda (freshco-design.com). Solo esos
// orígenes: antes algunas respondían `*` (cualquier página podía usarlas).
const STORE_ORIGINS = [
  'https://freshco-design.com',
  'https://www.freshco-design.com',
  'http://localhost:5173',
]

export function storeCors(origin: string | null, methods = 'GET, OPTIONS'): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && STORE_ORIGINS.includes(origin) ? origin : STORE_ORIGINS[0],
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  }
}

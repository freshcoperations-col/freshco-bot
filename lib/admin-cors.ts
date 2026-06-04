// CORS helper para endpoints del admin webapp (que vive en otro dominio).

const ALLOWED_ORIGINS = [
  'https://admin.freshco-design.com',
  'http://localhost:3000',
  'http://localhost:3001',
]

export function adminCors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store, max-age=0',
  }
}

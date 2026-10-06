// Cabeceras de seguridad: nadie puede meter esta app dentro de un iframe de
// otra página (clickjacking), el navegador no adivina tipos de archivo y no se
// filtra la URL completa a otros sitios.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  serverExternalPackages: [
    'draco3dgltf',
    'sharp',
    '@gltf-transform/core',
    '@gltf-transform/extensions',
    '@gltf-transform/functions',
    'meshoptimizer',
  ],
  outputFileTracingIncludes: {
    '/api/admin/web/products/[id]/optimize-model': ['./node_modules/draco3dgltf/*.wasm'],
  },
}

module.exports = nextConfig

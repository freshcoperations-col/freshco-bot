/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/api/admin/web/products/[id]/optimize-model': ['./node_modules/draco3dgltf/*.wasm'],
    },
  },
}

module.exports = nextConfig

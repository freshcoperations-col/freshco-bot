/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
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
  },
}

module.exports = nextConfig

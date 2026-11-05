import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Excel imports are posted to a server action as FormData. The default 1 MB
  // limit is too small for a full article list.
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb',
    },
  },
  serverExternalPackages: ['exceljs'],
}

export default nextConfig

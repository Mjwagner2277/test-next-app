import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Next 16 can generate agent instruction files during dev. This keeps the
  // scaffold focused on application files only.
  agentRules: false,

  // Create .next/standalone during `next build`. The Dockerfile copies that
  // traced runtime output so the final image does not need the source tree or a
  // full node_modules install.
  output: 'standalone',
}

export default nextConfig

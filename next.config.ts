import type { NextConfig } from 'next'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import createNextIntlPlugin from 'next-intl/plugin'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const projectRoot = dirname(fileURLToPath(import.meta.url))

const config: NextConfig = {
  output: 'export',
  outputFileTracingRoot: projectRoot,
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(config)

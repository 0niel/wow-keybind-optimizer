import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const config: NextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(config)

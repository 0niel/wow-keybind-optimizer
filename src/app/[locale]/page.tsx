import { setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n/locales'
import { OptimizerApp } from '@/components/OptimizerApp'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

interface Props {
  params: Promise<{ locale: string }>
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  return <OptimizerApp />
}

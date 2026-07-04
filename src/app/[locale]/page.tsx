import { setRequestLocale, getTranslations } from 'next-intl/server'
import { locales } from '@/i18n/locales'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

interface Props {
  params: Promise<{ locale: string }>
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('app')
  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('tagline')}</p>
    </main>
  )
}

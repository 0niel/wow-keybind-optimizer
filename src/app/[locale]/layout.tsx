import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n/locales'
import { DocumentLanguage } from '@/components/DocumentLanguage'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

interface Props {
  children: ReactNode
  params: Promise<{ locale: string }>
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params
  if (!hasLocale(locales, locale)) notFound()
  setRequestLocale(locale)
  const messages = (await import(`@/i18n/messages/${locale}.json`)).default
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DocumentLanguage locale={locale} />
      {children}
    </NextIntlClientProvider>
  )
}

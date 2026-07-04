export const locales = ['en', 'ru'] as const

export type AppLocale = (typeof locales)[number]

export const defaultLocale: AppLocale = 'en'

export const gameDataLocaleByAppLocale: Record<AppLocale, string> = {
  en: 'en_US',
  ru: 'ru_RU',
}

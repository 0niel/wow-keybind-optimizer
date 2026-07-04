'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'

export function AppHeader() {
  const t = useTranslations('app')
  const locale = useLocale()
  const pathname = usePathname()
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto')

  useEffect(() => {
    const stored = localStorage.getItem('app-theme')
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored)
      document.documentElement.dataset['theme'] = stored
    }
  }, [])

  const cycleTheme = () => {
    const next = theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto'
    setTheme(next)
    if (next === 'auto') {
      delete document.documentElement.dataset['theme']
      localStorage.removeItem('app-theme')
    } else {
      document.documentElement.dataset['theme'] = next
      localStorage.setItem('app-theme', next)
    }
  }

  const otherLocale = locale === 'ru' ? 'en' : 'ru'
  const switchLocale = () => {
    localStorage.setItem('app-locale', otherLocale)
    const target = pathname.replace(`/${locale}`, `/${otherLocale}`)
    window.location.href = `${target}${window.location.search}`
  }

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px clamp(16px, 3vw, 40px)',
        maxWidth: 1440,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div>
        <div style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
          {t('title')}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>{t('tagline')}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="ghost-button" onClick={cycleTheme} title={t('theme')}>
          {theme === 'auto' ? '🌗' : theme === 'dark' ? '🌙' : '☀️'}
        </button>
        <button className="ghost-button" onClick={switchLocale}>
          {otherLocale.toUpperCase()}
        </button>
      </div>
    </header>
  )
}

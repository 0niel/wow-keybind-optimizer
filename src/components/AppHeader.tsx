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
    if (stored === 'light' || stored === 'dark') setTheme(stored)
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
        padding: '22px clamp(20px, 4vw, 56px)',
        maxWidth: 1400,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          aria-hidden
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--on-accent)',
            fontWeight: 800,
            fontSize: '1rem',
          }}
        >
          ⌘
        </span>
        <span style={{ fontWeight: 750, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
          {t('title')}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="pill" onClick={cycleTheme} title={t('theme')}>
          {theme === 'auto' ? '🌗' : theme === 'dark' ? '🌙' : '☀️'}
        </button>
        <button className="pill" onClick={switchLocale}>
          {otherLocale.toUpperCase()}
        </button>
      </div>
    </header>
  )
}

'use client'

import { useEffect } from 'react'

export default function RootRedirect() {
  useEffect(() => {
    const stored = localStorage.getItem('app-locale')
    const fromBrowser = (navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en'
    const locale = stored === 'ru' || stored === 'en' ? stored : fromBrowser
    window.location.replace(`./${locale}/${window.location.search}`)
  }, [])

  return (
    <noscript>
      <a href="./en/">English</a> · <a href="./ru/">Русский</a>
    </noscript>
  )
}

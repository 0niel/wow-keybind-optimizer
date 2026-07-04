import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'WoW Keybind Optimizer',
}

const themeInitScript = `(function(){var t=localStorage.getItem('app-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}})()`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

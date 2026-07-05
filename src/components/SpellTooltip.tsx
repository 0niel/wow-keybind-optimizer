'use client'

import { useState } from 'react'
import { spellIconUrl } from '@/lib/data'

export interface SpellTooltipInfo {
  name: string
  description: string
  icon: string | null
  accent: string
  subtitle?: string
  x: number
  y: number
}

export function SpellTooltip({ info }: { info: SpellTooltipInfo }) {
  const [iconFailed, setIconFailed] = useState(false)
  const left = Math.min(info.x + 18, typeof window !== 'undefined' ? window.innerWidth - 336 : info.x)
  const top = Math.min(info.y + 18, typeof window !== 'undefined' ? window.innerHeight - 210 : info.y)

  return (
    <div
      className="overlay-card"
      style={{
        position: 'fixed',
        left,
        top,
        width: 316,
        zIndex: 50,
        pointerEvents: 'none',
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: info.description ? 12 : 0 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            flexShrink: 0,
            background: 'var(--inset-strong)',
            boxShadow: `inset 0 0 0 2px ${info.accent}`,
            overflow: 'hidden',
          }}
        >
          {info.icon && !iconFailed && (
            <img
              src={spellIconUrl(info.icon)}
              alt=""
              width={44}
              height={44}
              onError={() => setIconFailed(true)}
              style={{ display: 'block' }}
            />
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.02rem', lineHeight: 1.2 }}>{info.name}</div>
          {info.subtitle && (
            <div style={{ fontSize: '0.8rem', color: info.accent, fontWeight: 600, marginTop: 2 }}>
              {info.subtitle}
            </div>
          )}
        </div>
      </div>
      {info.description && (
        <p
          style={{
            fontSize: '0.85rem',
            lineHeight: 1.55,
            color: 'var(--text-soft)',
            maxHeight: 150,
            overflow: 'hidden',
            whiteSpace: 'pre-line',
          }}
        >
          {info.description}
        </p>
      )}
    </div>
  )
}

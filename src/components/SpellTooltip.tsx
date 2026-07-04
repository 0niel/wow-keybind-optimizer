'use client'

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
  const left = Math.min(info.x + 16, typeof window !== 'undefined' ? window.innerWidth - 340 : info.x)
  const top = Math.min(info.y + 16, typeof window !== 'undefined' ? window.innerHeight - 220 : info.y)

  return (
    <div
      className="overlay-card"
      style={{ position: 'fixed', left, top, width: 320, zIndex: 50, pointerEvents: 'none' }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: info.description ? 8 : 0 }}>
        {info.icon && (
          <img src={spellIconUrl(info.icon)} alt="" width={40} height={40} style={{ borderRadius: 10 }} />
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{info.name}</div>
          {info.subtitle && (
            <div style={{ fontSize: '0.8rem', color: info.accent, fontWeight: 600 }}>{info.subtitle}</div>
          )}
        </div>
      </div>
      {info.description && (
        <p
          style={{
            fontSize: '0.82rem',
            color: 'var(--text-soft)',
            maxHeight: 130,
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

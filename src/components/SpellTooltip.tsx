'use client'

import { useState } from 'react'
import { FALLBACK_ICON, spellIconUrl } from '@/lib/data'
import { useClampedOverlay } from './overlay-position'

export interface SpellTooltipPill {
  label: string
  color?: string
}

export interface SpellTooltipInfo {
  name: string
  description: string
  icon: string | null
  accent: string
  subtitle?: string
  pills?: SpellTooltipPill[]
  x: number
  y: number
}

export function SpellTooltip({ info }: { info: SpellTooltipInfo }) {
  const [failedIcon, setFailedIcon] = useState<string | null>(null)
  const { ref, left, top } = useClampedOverlay(info.x, info.y, 316)
  const iconName = info.icon && failedIcon !== info.icon ? info.icon : FALLBACK_ICON

  return (
    <div
      ref={ref}
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
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: info.description || info.pills?.length ? 12 : 0 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            flexShrink: 0,
            background: 'var(--inset-strong)',
            overflow: 'hidden',
          }}
        >
          <img
            src={spellIconUrl(iconName)}
            alt=""
            width={44}
            height={44}
            onError={() => {
              if (iconName === info.icon) setFailedIcon(info.icon)
            }}
            style={{ display: 'block' }}
          />
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
      {info.pills && info.pills.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: info.description ? 10 : 0 }}>
          {info.pills.map((pill) => (
            <span
              key={pill.label}
              className="pill"
              style={pill.color ? { color: pill.color, fontWeight: 650 } : undefined}
            >
              {pill.label}
            </span>
          ))}
        </div>
      )}
      {info.description && (
        <p
          style={{
            fontSize: '0.85rem',
            lineHeight: 1.55,
            color: 'var(--text-soft)',
            display: '-webkit-box',
            WebkitLineClamp: 12,
            WebkitBoxOrient: 'vertical',
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

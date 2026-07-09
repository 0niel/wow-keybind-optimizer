'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { SpellMetaShard } from '@/core/model/snapshot'
import type { LuaBindPlacement } from '@/lib/exports'
import { BAR_SIZE } from '@/lib/placement'
import { abilityIconName, spellIconUrl } from '@/lib/data'

interface BarCell {
  icon: string | null
  name: string
  hotkey: string
  category: string
  variant?: string
  mouseover?: boolean
}

function macroTag(cell: BarCell): string | null {
  if (cell.variant === 'focus') return '@focus'
  if (cell.variant?.startsWith('arena')) return `@${cell.variant.slice(-1)}`
  if (cell.mouseover) return '@mo'
  return null
}

const CELL_SIZE = 44
const CELL_GAP = 4

function shortWowKey(key: string): string {
  return key
    .replace('SHIFT-', 's-')
    .replace('CTRL-', 'c-')
    .replace('ALT-', 'a-')
    .replace('MOUSEWHEELUP', 'WU')
    .replace('MOUSEWHEELDOWN', 'WD')
    .replace('BUTTON', 'M')
}

function BarButton({ cell }: { cell: BarCell | undefined }) {
  const tag = cell ? macroTag(cell) : null
  return (
    <div
      title={cell ? `${cell.name} — ${cell.hotkey}${tag ? ` ${tag}` : ''}` : undefined}
      style={{
        position: 'relative',
        width: CELL_SIZE,
        height: CELL_SIZE,
        borderRadius: 8,
        border: tag ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.14)',
        background: cell ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.38)',
        boxShadow: cell ? 'none' : 'inset 0 2px 8px rgba(0,0,0,0.55)',
        flexShrink: 0,
      }}
    >
      {cell?.icon && (
        <img
          src={spellIconUrl(cell.icon)}
          alt={cell.name}
          width={CELL_SIZE - 6}
          height={CELL_SIZE - 6}
          loading="lazy"
          style={{ position: 'absolute', inset: 3, borderRadius: 6, objectFit: 'cover' }}
        />
      )}
      {tag && (
        <span
          style={{
            position: 'absolute',
            top: 1,
            left: 2,
            fontSize: 8.5,
            fontWeight: 800,
            padding: '0 3px',
            borderRadius: 4,
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            lineHeight: 1.5,
          }}
        >
          {tag}
        </span>
      )}
      {cell && (
        <span
          style={{
            position: 'absolute',
            top: 1,
            right: 3,
            fontSize: 10,
            fontWeight: 800,
            fontFamily: 'monospace',
            color: '#fff',
            textShadow: '0 1px 2px #000, 0 0 4px #000',
            letterSpacing: '-0.02em',
          }}
        >
          {cell.hotkey}
        </span>
      )}
      {cell && (
        <span
          style={{
            position: 'absolute',
            left: 3,
            right: 3,
            bottom: 3,
            height: 4,
            borderRadius: 2,
            background: `var(--cat-${cell.category})`,
          }}
        />
      )}
    </div>
  )
}

function BarRow({ label, cells, faded }: { label: string; cells: (BarCell | undefined)[]; faded?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', opacity: faded ? 0.75 : 1 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', alignSelf: 'flex-start' }}>{label}</span>
      <div style={{ display: 'flex', gap: CELL_GAP }}>
        {cells.map((cell, index) => (
          <BarButton key={index} cell={cell} />
        ))}
      </div>
    </div>
  )
}

function BarColumn({ label, cells }: { label: string; cells: (BarCell | undefined)[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
      <span
        style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.55)',
          maxWidth: CELL_SIZE + 8,
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: CELL_GAP }}>
        {cells.map((cell, index) => (
          <BarButton key={index} cell={cell} />
        ))}
      </div>
    </div>
  )
}

export function GameBarsPreview({
  placements,
  spellMeta,
}: {
  placements: LuaBindPlacement[]
  spellMeta: SpellMetaShard
}) {
  const t = useTranslations('export.bars')

  const { cellsByBar, keysOnly, hasExtra, hasMacro } = useMemo(() => {
    const bySlot = new Map<number, BarCell>()
    const unplaced: BarCell[] = []
    for (const { bind, entry } of placements) {
      const icon = abilityIconName(
        bind.ability.spellId,
        bind.ability.id,
        spellMeta[String(bind.ability.spellId)]?.icon,
      )
      const cell: BarCell = {
        icon,
        name: bind.name,
        hotkey: shortWowKey(entry.key),
        category: entry.category ?? bind.ability.category,
        variant: entry.variant,
        mouseover: entry.mouseover,
      }
      if (entry.slot === undefined) unplaced.push(cell)
      else bySlot.set(entry.slot, cell)
    }
    const byBar = new Map<number, (BarCell | undefined)[]>()
    for (const [slot, cell] of bySlot) {
      const bar = Math.floor(slot / BAR_SIZE)
      const row = byBar.get(bar) ?? Array.from({ length: BAR_SIZE }, () => undefined)
      row[slot % BAR_SIZE] = cell
      byBar.set(bar, row)
    }
    const hasMacro = [...bySlot.values()].some((cell) => macroTag(cell) !== null) || unplaced.some((cell) => macroTag(cell) !== null)
    return {
      cellsByBar: byBar,
      keysOnly: unplaced,
      hasExtra: [...byBar.keys()].some((bar) => bar >= 5),
      hasMacro,
    }
  }, [placements, spellMeta])

  const barLabel = (bar: number): string => {
    if (bar === 0) return t('main')
    if (bar <= 4) return t(`bar${bar + 1}` as 'bar2' | 'bar3' | 'bar4' | 'bar5')
    return t('extra', { n: bar + 1 })
  }

  const bottomBars = [2, 1, 0].filter((bar) => cellsByBar.has(bar))
  const extraBars = [7, 6, 5].filter((bar) => cellsByBar.has(bar))
  const sideBars = [3, 4].filter((bar) => cellsByBar.has(bar))

  return (
    <div>
      <div
        style={{
          position: 'relative',
          borderRadius: 16,
          padding: '28px 20px 20px',
          background: '#131a28',
          border: '1px solid rgba(255,255,255,0.08)',
          overflowX: 'auto',
        }}
      >
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-end', justifyContent: 'center', minWidth: 720 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            {extraBars.map((bar) => (
              <BarRow key={bar} label={barLabel(bar)} cells={cellsByBar.get(bar) ?? []} faded />
            ))}
            {bottomBars.map((bar) => (
              <BarRow key={bar} label={barLabel(bar)} cells={cellsByBar.get(bar) ?? []} />
            ))}
          </div>
          {sideBars.length > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              {sideBars.map((bar) => (
                <BarColumn key={bar} label={barLabel(bar)} cells={cellsByBar.get(bar) ?? []} />
              ))}
            </div>
          )}
        </div>
      </div>
      {keysOnly.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="label">{t('keysOnly')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {keysOnly.map((cell, index) => (
              <span
                key={index}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 10px',
                  borderRadius: 10,
                  background: 'var(--inset)',
                  fontSize: '0.82rem',
                }}
              >
                <b style={{ fontFamily: 'monospace' }}>{cell.hotkey}</b>
                {cell.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {hasMacro && (
        <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-soft)' }}>
          <b style={{ color: 'var(--accent)' }}>@</b> {t('macroNote')}
        </p>
      )}
      {hasExtra && (
        <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-faint)' }}>{t('hiddenHint')}</p>
      )}
    </div>
  )
}

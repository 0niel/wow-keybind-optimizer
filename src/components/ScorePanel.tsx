'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { Ability, Slot, SolveResult } from '@/core/model/ability'
import type { AbilityCategory } from '@/core/model/ability-category'

interface Props {
  result: SolveResult
  baseline: SolveResult
  abilities: Ability[]
  slots: Slot[]
  elapsedMs: number | null
}

export function ScorePanel({ result, baseline, abilities, slots, elapsedMs }: Props) {
  const t = useTranslations('score')
  const tCat = useTranslations('categories')

  const improvement =
    baseline.objective > 0
      ? ((result.objective - baseline.objective) / baseline.objective) * 100
      : 0

  const categoryQuality = useMemo(() => {
    const slotById = new Map(slots.map((slot) => [slot.id, slot]))
    const abilityById = new Map(abilities.map((ability) => [ability.id, ability]))
    const sums = new Map<AbilityCategory, { total: number; count: number }>()
    for (const bind of result.assignments) {
      const ability = abilityById.get(bind.abilityId)
      const slot = slotById.get(bind.slotId)
      if (!ability || !slot) continue
      const entry = sums.get(ability.category) ?? { total: 0, count: 0 }
      entry.total += slot.accessibility
      entry.count += 1
      sums.set(ability.category, entry)
    }
    return [...sums.entries()]
      .map(([category, { total, count }]) => ({ category, average: total / count, count }))
      .sort((a, b) => b.average - a.average)
  }, [result.assignments, abilities, slots])

  return (
    <section className="panel fade-in">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 20,
          marginBottom: 28,
        }}
      >
        <Stat label={t('objective')} value={result.objective.toFixed(2)} />
        <Stat label={t('baseline')} value={baseline.objective.toFixed(2)} />
        <Stat label={t('improvement')} value={`+${improvement.toFixed(1)}%`} tone="ok" />
        <Stat label={t('binds')} value={String(result.assignments.length)} />
        {elapsedMs !== null && <Stat label={t('time')} value={`${elapsedMs} ms`} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {categoryQuality.map(({ category, average, count }) => (
          <div key={category} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                fontSize: '0.85rem',
                width: 190,
                color: 'var(--text-soft)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: `var(--cat-${category})`,
                  flexShrink: 0,
                }}
              />
              {tCat(category)} · {count}
            </span>
            <div
              style={{
                flex: 1,
                height: 10,
                borderRadius: 5,
                background: 'var(--inset)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round(average * 100)}%`,
                  height: '100%',
                  borderRadius: 5,
                  background: `var(--cat-${category})`,
                  transition: 'width 0.4s ease-out',
                }}
              />
            </div>
            <span
              style={{
                fontSize: '0.82rem',
                color: 'var(--text-faint)',
                width: 34,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {(average * 100).toFixed(0)}
            </span>
          </div>
        ))}
      </div>
      {result.warnings.length > 0 && (
        <div style={{ marginTop: 18, fontSize: '0.85rem', color: 'var(--warn)' }}>
          {result.warnings.map((warning) => (
            <div key={warning}>⚠ {formatWarning(warning, t)}</div>
          ))}
        </div>
      )}
    </section>
  )
}

function formatWarning(warning: string, t: ReturnType<typeof useTranslations>): string {
  if (warning.startsWith('reactive-threshold-relaxed')) {
    return t('warningRelaxed', { value: warning.split(':')[1] ?? '' })
  }
  if (warning.startsWith('unassigned')) {
    return t('warningUnassigned', { count: (warning.split(':')[1] ?? '').split(',').length })
  }
  return warning
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' }) {
  return (
    <div className="inset-panel" style={{ padding: '16px 20px' }}>
      <div className="stat-label" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div className="stat-value" style={{ color: tone === 'ok' ? 'var(--ok)' : 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}

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
    <div className="card">
      <div className="section-label">{t('title')}</div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 18 }}>
        <Metric label={t('objective')} value={result.objective.toFixed(2)} />
        <Metric label={t('baseline')} value={baseline.objective.toFixed(2)} />
        <Metric
          label={t('improvement')}
          value={`+${improvement.toFixed(1)}%`}
          accent={improvement > 0}
        />
        <Metric label={t('binds')} value={String(result.assignments.length)} />
        {elapsedMs !== null && <Metric label={t('time')} value={`${elapsedMs} ms`} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {categoryQuality.map(({ category, average, count }) => (
          <div key={category} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: `var(--cat-${category})`,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '0.82rem', width: 160, color: 'var(--text-secondary)' }}>
              {tCat(category)} · {count}
            </span>
            <div
              style={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                background: 'var(--surface-2)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round(average * 100)}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: `var(--cat-${category})`,
                  transition: 'width 0.4s ease-out',
                }}
              />
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', width: 36, textAlign: 'right' }}>
              {(average * 100).toFixed(0)}
            </span>
          </div>
        ))}
      </div>
      {result.warnings.length > 0 && (
        <div style={{ marginTop: 14, fontSize: '0.8rem', color: 'var(--warn)' }}>
          {result.warnings.map((warning) => (
            <div key={warning}>⚠ {formatWarning(warning, t)}</div>
          ))}
        </div>
      )}
    </div>
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

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
      <div
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: accent ? 'var(--ok)' : 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  )
}

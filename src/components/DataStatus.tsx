'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { SnapshotManifest, SpecSnapshot } from '@/core/model/snapshot'
import type { GameMode } from '@/core/model/ability'

interface Props {
  manifest: SnapshotManifest
  spec: SpecSnapshot
  mode: GameMode
}

const SOURCE_LABEL_KEYS = {
  'game-tables': 'gameTables',
  'combat-logs': 'combatLogs',
  simulation: 'simulation',
  'spell-text': 'spellText',
} as const

export function DataStatus({ manifest, spec, mode }: Props) {
  const t = useTranslations('dataStatus')
  const locale = useLocale()
  const frequencyRecords = Object.values(spec.frequencyBySpellId)
  const combatLogSpells = frequencyRecords.filter((record) => record.cpm !== null).length
  const simulationSpells = frequencyRecords.filter((record) => record.aplRank !== null).length
  const dataMode = mode === 'raid' ? 'observed' : simulationSpells > 0 ? 'modeled' : 'heuristic'
  const generatedAt = new Date(manifest.generatedAt)
  const generatedLabel = Number.isNaN(generatedAt.getTime())
    ? manifest.generatedAt
    : new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(generatedAt)

  const sources =
    manifest.sources ??
    [
      { id: 'game-tables' as const, name: 'wago.tools', url: 'https://wago.tools' },
      { id: 'combat-logs' as const, name: 'Warcraft Logs', url: 'https://www.warcraftlogs.com' },
      { id: 'simulation' as const, name: 'SimulationCraft', url: 'https://www.simulationcraft.org' },
      { id: 'spell-text' as const, name: 'Wowhead', url: 'https://www.wowhead.com' },
    ]

  return (
    <aside className="panel data-status fade-in" aria-labelledby="data-status-title">
      <div className="panel-heading-row">
        <div>
          <span className="eyebrow">{t('eyebrow')}</span>
          <h2 id="data-status-title" className="panel-title">
            {t('title')}
          </h2>
        </div>
        <span className="live-badge" data-modeled={dataMode !== 'observed'}>
          <span aria-hidden className="live-dot" />
          {t(dataMode)}
        </span>
      </div>

      <div className="data-build-card">
        <div>
          <span className="stat-label">{t('build')}</span>
          <strong>{manifest.build}</strong>
        </div>
        <div>
          <span className="stat-label">{t('updated')}</span>
          <strong>{generatedLabel}</strong>
        </div>
      </div>

      <div className="data-metrics">
        <DataMetric value={combatLogSpells} label={t('combatLogSpells')} />
        <DataMetric value={simulationSpells} label={t('simulationSpells')} />
        <DataMetric
          value={manifest.coverage?.specs ?? manifest.specIds.length}
          label={t('specs')}
        />
      </div>

      <p className="data-note">{t(`${dataMode}Note`)}</p>
      <div className="source-list">
        {sources.map((source) => (
          <a key={source.id} href={source.url} target="_blank" rel="noreferrer noopener">
            <span>
              <b>{source.name}</b>
              <small>{t(`sources.${SOURCE_LABEL_KEYS[source.id]}`)}</small>
            </span>
            <span aria-hidden>↗</span>
          </a>
        ))}
      </div>
    </aside>
  )
}

function DataMetric({ value, label }: { value: number; label: string }) {
  return (
    <div className="data-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

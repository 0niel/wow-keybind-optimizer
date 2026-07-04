'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { RaceRecord, SpellMetaShard } from '@/core/model/snapshot'
import type { TextShard } from '@/lib/data'
import { spellIconUrl } from '@/lib/data'

interface Props {
  races: RaceRecord[]
  selectedRaceId: number | null
  onSelect: (raceId: number | null) => void
  spellMeta: SpellMetaShard
  text: TextShard
  locale: string
}

const PORTRAIT_SLUG_BY_RACE_SLUG: Record<string, string> = {
  human: 'human',
  orc: 'orc',
  dwarf: 'dwarf',
  'night-elf': 'nightelf',
  undead: 'scourge',
  tauren: 'tauren',
  gnome: 'gnome',
  troll: 'troll',
  goblin: 'goblin',
  'blood-elf': 'bloodelf',
  draenei: 'draenei',
  worgen: 'worgen',
  pandaren: 'pandaren',
  nightborne: 'nightborne',
  'highmountain-tauren': 'highmountaintauren',
  'void-elf': 'voidelf',
  'lightforged-draenei': 'lightforgeddraenei',
  'zandalari-troll': 'zandalaritroll',
  'kul-tiran': 'kultiran',
  'dark-iron-dwarf': 'darkirondwarf',
  vulpera: 'vulpera',
  'mag-har-orc': 'magharorc',
  dracthyr: 'dracthyr',
  earthen: 'earthendwarf',
  haranir: 'haranir',
}

function portraitUrl(raceSlug: string): string {
  const slug = PORTRAIT_SLUG_BY_RACE_SLUG[raceSlug] ?? raceSlug.replace(/-/g, '')
  return `https://wow.zamimg.com/images/wow/icons/large/race_${slug}_male.jpg`
}

export function RacePicker({ races, selectedRaceId, onSelect, spellMeta, text, locale }: Props) {
  const t = useTranslations('input')
  const selected = races.find((race) => race.id === selectedRaceId) ?? null

  const factions = (['alliance', 'horde', 'neutral'] as const).map((faction) => ({
    faction,
    list: races
      .filter((race) => race.faction === faction)
      .sort((a, b) => (a.names[locale] ?? '').localeCompare(b.names[locale] ?? '')),
  }))

  return (
    <div>
      {factions.map(({ faction, list }) =>
        list.length === 0 ? null : (
          <div key={faction} style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 650,
                color: 'var(--text-faint)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t(`factions.${faction}`)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {list.map((race) => (
                <RaceTile
                  key={race.id}
                  race={race}
                  locale={locale}
                  active={race.id === selectedRaceId}
                  fallbackIcon={firstRacialIcon(race, spellMeta)}
                  onClick={() => onSelect(race.id === selectedRaceId ? null : race.id)}
                />
              ))}
            </div>
          </div>
        ),
      )}
      {selected && (
        <div className="fade-in" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 650, fontSize: '0.95rem', marginBottom: 8 }}>
            {selected.names[locale] ?? selected.slug}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-faint)', marginBottom: 8 }}>
            {t('racialsLabel')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {dedupeByName(selected.racialSpellIds, text).map((spellId) => {
              const meta = spellMeta[String(spellId)]
              const name = text.spells[String(spellId)]?.name
              if (!meta || !name) return null
              return (
                <span
                  key={spellId}
                  className="pill"
                  title={text.spells[String(spellId)]?.description ?? ''}
                  style={{ cursor: 'help' }}
                >
                  <img src={spellIconUrl(meta.icon)} alt="" width={24} height={24} />
                  {name}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function dedupeByName(spellIds: number[], text: TextShard): number[] {
  const seen = new Set<string>()
  const result: number[] = []
  for (const spellId of spellIds) {
    const name = text.spells[String(spellId)]?.name
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push(spellId)
  }
  return result
}

function firstRacialIcon(race: RaceRecord, spellMeta: SpellMetaShard): string | null {
  for (const spellId of race.racialSpellIds) {
    const icon = spellMeta[String(spellId)]?.icon
    if (icon) return icon
  }
  return null
}

function RaceTile({
  race,
  locale,
  active,
  fallbackIcon,
  onClick,
}: {
  race: RaceRecord
  locale: string
  active: boolean
  fallbackIcon: string | null
  onClick: () => void
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const name = race.names[locale] ?? race.slug
  return (
    <button
      onClick={onClick}
      title={name}
      style={{
        width: 48,
        height: 48,
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--inset)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        outline: active ? '3px solid var(--accent)' : 'none',
        outlineOffset: 0,
        opacity: active ? 1 : 0.85,
        transition: 'opacity 0.15s ease-out, transform 0.1s ease-out',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.opacity = '1'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.opacity = active ? '1' : '0.85'
      }}
    >
      {imageFailed ? (
        fallbackIcon ? (
          <img src={spellIconUrl(fallbackIcon)} alt={name} width={48} height={48} loading="lazy" />
        ) : (
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-soft)' }}>
            {name.slice(0, 1)}
          </span>
        )
      ) : (
        <img
          src={portraitUrl(race.slug)}
          alt={name}
          width={48}
          height={48}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}
    </button>
  )
}

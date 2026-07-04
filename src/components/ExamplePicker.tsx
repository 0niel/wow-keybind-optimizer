'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { decodeLoadoutHeader } from '@/core/decoder'
import type { ClassRecord } from '@/core/model/snapshot'
import type { GameMode } from '@/core/model/ability'
import type { ExamplePreset } from '@/lib/data'
import { loadExamples } from '@/lib/data'

interface Props {
  classes: ClassRecord[]
  locale: string
  onPick: (preset: ExamplePreset) => void
}

interface ResolvedExample {
  preset: ExamplePreset
  className: string
  specName: string
  color: string
}

const MODE_LABEL_KEY: Record<string, string> = {
  raid: 'modes.raid',
  'mythic-plus': 'modes.mythicPlus',
  arena: 'modes.arena',
  rbg: 'modes.rbg',
  battleground: 'modes.battleground',
}

export function ExamplePicker({ classes, locale, onPick }: Props) {
  const t = useTranslations('examples')
  const tInput = useTranslations('input')
  const [examples, setExamples] = useState<ResolvedExample[]>([])

  useEffect(() => {
    let cancelled = false
    loadExamples()
      .then((presets) => {
        if (cancelled) return
        const resolved: ResolvedExample[] = []
        for (const preset of presets) {
          try {
            const specId = decodeLoadoutHeader(preset.string).specId
            const record = classes.find((candidate) => candidate.specIds.includes(specId))
            if (!record) continue
            resolved.push({
              preset,
              className: record.names[locale] ?? record.slug,
              specName: '',
              color: record.color,
            })
          } catch {
            continue
          }
        }
        setExamples(resolved)
      })
      .catch(() => setExamples([]))
    return () => {
      cancelled = true
    }
  }, [classes, locale])

  if (examples.length === 0) return null

  return (
    <div style={{ maxWidth: 900, margin: '18px auto 0' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.85rem', marginBottom: 10 }}>
        {t('title')}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {examples.map(({ preset, className, color }) => {
          const modeKey = MODE_LABEL_KEY[preset.mode] ?? 'modes.mythicPlus'
          return (
            <button
              key={preset.id}
              onClick={() => onPick(preset)}
              className="pill"
              style={{ gap: 8 }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{className}</span>
              <span style={{ color: 'var(--text-faint)' }}>· {tInput(modeKey as never)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function presetToMode(mode: string): GameMode {
  const modes: GameMode[] = ['raid', 'mythic-plus', 'arena', 'rbg', 'battleground']
  return modes.find((value) => value === mode) ?? 'mythic-plus'
}

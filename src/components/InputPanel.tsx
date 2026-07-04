'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { decodeLoadoutHeader, LoadoutDecodeError } from '@/core/decoder'
import type { ClassRecord, RaceRecord, SpecSnapshot } from '@/core/model/snapshot'
import type { GameMode } from '@/core/model/ability'
import type { Modifier } from '@/core/model/hardware'
import type { OptimizerInputs } from '@/state/inputs'
import type { TextShard } from '@/lib/data'
import { SegmentedControl, ChipToggle } from './controls'

interface Props {
  inputs: OptimizerInputs
  onChange: (inputs: OptimizerInputs) => void
  classes: ClassRecord[]
  races: RaceRecord[]
  spec: SpecSnapshot | null
  text: TextShard
  locale: string
}

export function detectSpecId(importString: string): number | null {
  if (importString.trim().length < 10) return null
  try {
    return decodeLoadoutHeader(importString.trim()).specId
  } catch (error) {
    if (error instanceof LoadoutDecodeError) return null
    return null
  }
}

export function InputPanel({ inputs, onChange, classes, races, spec, text, locale }: Props) {
  const t = useTranslations('input')
  const specId = useMemo(() => detectSpecId(inputs.importString), [inputs.importString])
  const detectedClass = useMemo(
    () => (specId !== null ? classes.find((c) => c.specIds.includes(specId)) : undefined),
    [classes, specId],
  )
  const isPvpMode = ['arena', 'rbg', 'battleground'].includes(inputs.mode)
  const stringEntered = inputs.importString.trim().length >= 10

  const update = (partial: Partial<OptimizerInputs>) => onChange({ ...inputs, ...partial })
  const updateHardware = (partial: Partial<OptimizerInputs['hardware']>) =>
    onChange({ ...inputs, hardware: { ...inputs.hardware, ...partial } })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <section>
        <div className="section-label">{t('importString')}</div>
        <textarea
          value={inputs.importString}
          onChange={(event) => update({ importString: event.target.value })}
          placeholder={t('importPlaceholder')}
          rows={3}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }}
        />
        <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {stringEntered && specId !== null && spec ? (
            <span style={{ color: detectedClass?.color ?? 'var(--text-primary)', fontWeight: 600 }}>
              {detectedClass?.names[locale] ?? ''} — {spec.names[locale] ?? ''}
            </span>
          ) : stringEntered && specId === null ? (
            <span style={{ color: 'var(--danger)' }}>{t('invalidString')}</span>
          ) : (
            t('importHint')
          )}
        </div>
      </section>

      <section>
        <div className="section-label">{t('mode')}</div>
        <SegmentedControl<GameMode>
          options={[
            { value: 'raid', label: t('modes.raid') },
            { value: 'mythic-plus', label: t('modes.mythicPlus') },
            { value: 'arena', label: t('modes.arena') },
            { value: 'rbg', label: t('modes.rbg') },
            { value: 'battleground', label: t('modes.battleground') },
          ]}
          value={inputs.mode}
          onChange={(mode) => update({ mode })}
        />
        {inputs.mode === 'arena' && (
          <div style={{ marginTop: 12 }}>
            <SegmentedControl<'focus' | 'arena123'>
              options={[
                { value: 'focus', label: t('targetScheme.focus') },
                { value: 'arena123', label: t('targetScheme.arena123') },
              ]}
              value={inputs.arenaTargetScheme}
              onChange={(arenaTargetScheme) => update({ arenaTargetScheme })}
            />
          </div>
        )}
      </section>

      <section>
        <div className="section-label">{t('race')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {races.map((race) => (
            <ChipToggle
              key={race.id}
              active={inputs.raceId === race.id}
              onClick={() => update({ raceId: inputs.raceId === race.id ? null : race.id })}
            >
              {race.names[locale] ?? race.slug}
            </ChipToggle>
          ))}
        </div>
      </section>

      {isPvpMode && spec && spec.pvpTalents.length > 0 && (
        <section>
          <div className="section-label">{t('pvpTalents')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {spec.pvpTalents.map((talent) => {
              const active = inputs.pvpTalentIds.includes(talent.id)
              const name = text.spells[String(talent.spellId)]?.name ?? `#${talent.spellId}`
              return (
                <ChipToggle
                  key={talent.id}
                  active={active}
                  title={text.spells[String(talent.spellId)]?.description ?? ''}
                  onClick={() => {
                    if (active) {
                      update({ pvpTalentIds: inputs.pvpTalentIds.filter((id) => id !== talent.id) })
                    } else if (inputs.pvpTalentIds.length < 3) {
                      update({ pvpTalentIds: [...inputs.pvpTalentIds, talent.id] })
                    }
                  }}
                >
                  {name}
                </ChipToggle>
              )
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
            {t('pvpTalentsHint', { count: inputs.pvpTalentIds.length })}
          </div>
        </section>
      )}

      <section>
        <div className="section-label">{t('hardware')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SegmentedControl<'full' | 'tkl' | 'sixty'>
            options={[
              { value: 'full', label: t('keyboard.full') },
              { value: 'tkl', label: t('keyboard.tkl') },
              { value: 'sixty', label: t('keyboard.sixty') },
            ]}
            value={inputs.hardware.formFactor}
            onChange={(formFactor) => updateHardware({ formFactor })}
          />
          <SegmentedControl<'none' | 'two-button' | 'mmo-twelve'>
            options={[
              { value: 'none', label: t('mouse.none') },
              { value: 'two-button', label: t('mouse.twoButton') },
              { value: 'mmo-twelve', label: t('mouse.mmo') },
            ]}
            value={inputs.hardware.mouse}
            onChange={(mouse) => updateHardware({ mouse })}
          />
          <SegmentedControl<'wasd' | 'esdf'>
            options={[
              { value: 'wasd', label: 'WASD' },
              { value: 'esdf', label: 'ESDF' },
            ]}
            value={inputs.hardware.movementScheme}
            onChange={(movementScheme) => updateHardware({ movementScheme })}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('modifiers')}</span>
            {(['shift', 'ctrl', 'alt'] as Modifier[]).map((modifier) => (
              <ChipToggle
                key={modifier}
                active={inputs.hardware.enabledModifiers.includes(modifier)}
                onClick={() => {
                  const enabled = inputs.hardware.enabledModifiers.includes(modifier)
                  const canonical: Modifier[] = ['none', 'shift', 'ctrl', 'alt']
                  const next = enabled
                    ? inputs.hardware.enabledModifiers.filter((m) => m !== modifier)
                    : [...inputs.hardware.enabledModifiers, modifier]
                  updateHardware({
                    enabledModifiers: canonical.filter((m) => next.includes(m)),
                  })
                }}
              >
                {modifier === 'shift' ? 'Shift' : modifier === 'ctrl' ? 'Ctrl' : 'Alt'}
              </ChipToggle>
            ))}
            <ChipToggle
              active={inputs.hardware.includeMouseWheel}
              onClick={() => updateHardware({ includeMouseWheel: !inputs.hardware.includeMouseWheel })}
            >
              {t('wheel')}
            </ChipToggle>
          </div>
        </div>
      </section>
    </div>
  )
}


'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { decodeLoadoutHeader, LoadoutDecodeError } from '@/core/decoder'
import type { ClassRecord, RaceRecord, SpecSnapshot, SpellMetaShard } from '@/core/model/snapshot'
import type { GameMode } from '@/core/model/ability'
import type { Modifier } from '@/core/model/hardware'
import type { OptimizerInputs } from '@/state/inputs'
import { effectiveTargetBinds } from '@/state/inputs'
import type { TextShard } from '@/lib/data'
import { spellIconUrl } from '@/lib/data'
import { SegmentedControl, ChipToggle } from './controls'
import { RacePicker } from './RacePicker'

export function detectSpecId(importString: string): number | null {
  if (importString.trim().length < 10) return null
  try {
    return decodeLoadoutHeader(importString.trim()).specId
  } catch (error) {
    if (error instanceof LoadoutDecodeError) return null
    return null
  }
}

interface HeroInputProps {
  inputs: OptimizerInputs
  onChange: (inputs: OptimizerInputs) => void
  classes: ClassRecord[]
  spec: SpecSnapshot | null
  locale: string
}

export function HeroInput({ inputs, onChange, classes, spec, locale }: HeroInputProps) {
  const t = useTranslations('input')
  const tHero = useTranslations('hero')
  const specId = useMemo(() => detectSpecId(inputs.importString), [inputs.importString])
  const detectedClass = useMemo(
    () => (specId !== null ? classes.find((c) => c.specIds.includes(specId)) : undefined),
    [classes, specId],
  )
  const stringEntered = inputs.importString.trim().length >= 10

  return (
    <section style={{ textAlign: 'center', padding: 'clamp(28px, 6vh, 72px) 0 12px' }}>
      <h1
        style={{
          fontSize: 'clamp(2rem, 5vw, 3.4rem)',
          fontWeight: 800,
          letterSpacing: '-0.035em',
          lineHeight: 1.08,
          maxWidth: 800,
          margin: '0 auto 14px',
        }}
      >
        {tHero('title')}
      </h1>
      <p
        style={{
          color: 'var(--text-soft)',
          fontSize: 'clamp(1rem, 1.6vw, 1.15rem)',
          maxWidth: 620,
          margin: '0 auto 36px',
        }}
      >
        {tHero('subtitle')}
      </p>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <textarea
          className="hero-input"
          value={inputs.importString}
          onChange={(event) => onChange({ ...inputs, importString: event.target.value })}
          placeholder={t('importPlaceholder')}
          rows={2}
          spellCheck={false}
        />
        <div style={{ marginTop: 14, fontSize: '0.95rem', minHeight: 24 }}>
          {stringEntered && specId !== null && spec ? (
            <span className="fade-in" style={{ fontWeight: 650, color: detectedClass?.color ?? 'var(--text)' }}>
              {detectedClass?.names[locale] ?? ''} — {spec.names[locale] ?? ''}
            </span>
          ) : stringEntered && specId === null ? (
            <span style={{ color: 'var(--danger)' }}>{t('invalidString')}</span>
          ) : (
            <span style={{ color: 'var(--text-faint)' }}>{t('importHint')}</span>
          )}
        </div>
      </div>
    </section>
  )
}

interface SettingsPanelProps {
  inputs: OptimizerInputs
  onChange: (inputs: OptimizerInputs) => void
  races: RaceRecord[]
  spec: SpecSnapshot | null
  spellMeta: SpellMetaShard
  text: TextShard
  locale: string
}

export function SettingsPanel({ inputs, onChange, races, spec, spellMeta, text, locale }: SettingsPanelProps) {
  const t = useTranslations('input')
  const isPvpMode = ['arena', 'rbg', 'battleground'].includes(inputs.mode)

  const update = (partial: Partial<OptimizerInputs>) => onChange({ ...inputs, ...partial })
  const updateHardware = (partial: Partial<OptimizerInputs['hardware']>) =>
    onChange({ ...inputs, hardware: { ...inputs.hardware, ...partial } })

  return (
    <section className="panel fade-in">
      <div className="settings-grid">
        <div>
          <span className="label">{t('mode')}</span>
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
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <SegmentedControl<'focus' | 'arena123'>
                options={[
                  { value: 'focus', label: t('targetScheme.focus') },
                  { value: 'arena123', label: t('targetScheme.arena123') },
                ]}
                value={inputs.arenaTargetScheme}
                onChange={(arenaTargetScheme) => update({ arenaTargetScheme })}
              />
              <ChipToggle
                active={effectiveTargetBinds(inputs)}
                onClick={() => update({ arenaTargetBinds: !effectiveTargetBinds(inputs) })}
                title={t('targetBindsHint')}
              >
                {t('targetBinds')}
              </ChipToggle>
            </div>
          )}
        </div>

        <div>
          <span className="label">{t('race')}</span>
          <RacePicker
            races={races}
            selectedRaceId={inputs.raceId}
            onSelect={(raceId) => update({ raceId })}
            spellMeta={spellMeta}
            text={text}
            locale={locale}
          />
          {isPvpMode && spec && spec.pvpTalents.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <span className="label">
                {t('pvpTalents')} · {inputs.pvpTalentIds.length}/3
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {spec.pvpTalents.map((talent) => {
                  const active = inputs.pvpTalentIds.includes(talent.id)
                  const name = text.spells[String(talent.spellId)]?.name ?? `#${talent.spellId}`
                  const icon =
                    spellMeta[String(talent.spellId)]?.icon ??
                    spec.iconBySpellId[String(talent.spellId)]
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
                      {icon && <img src={spellIconUrl(icon)} alt="" width={24} height={24} />}
                      {name}
                    </ChipToggle>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div>
          <span className="label">{t('hardware')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                    updateHardware({ enabledModifiers: canonical.filter((m) => next.includes(m)) })
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
        </div>
      </div>
    </section>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useGameData, useSpecSnapshot } from '@/hooks/useGameData'
import { useSolver } from '@/hooks/useSolver'
import { DEFAULT_INPUTS, deserializeInputs, serializeInputs } from '@/state/inputs'
import type { OptimizerInputs } from '@/state/inputs'
import { HeroInput, SettingsPanel, detectSpecId } from './InputPanel'
import { ExamplePicker, presetToMode } from './ExamplePicker'
import type { ExamplePreset } from '@/lib/data'
import { KeyboardView } from './KeyboardView'
import { ScorePanel } from './ScorePanel'
import { TalentTreeView } from './TalentTreeView'
import { ExportPanel } from './ExportPanel'
import { AppHeader } from './AppHeader'

export function OptimizerApp() {
  const t = useTranslations('app')
  const locale = useLocale()
  const { data, error } = useGameData()
  const [inputs, setInputs] = useState<OptimizerInputs>(DEFAULT_INPUTS)
  const [hydrated, setHydrated] = useState(false)
  const [highlightAbilityIds, setHighlightAbilityIds] = useState<Set<string> | null>(null)
  const [highlightNodeIds, setHighlightNodeIds] = useState<Set<number> | null>(null)
  const { state: solverState, solve } = useSolver()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setInputs(deserializeInputs(new URLSearchParams(window.location.search)))
    setHydrated(true)
  }, [])

  const updateInputs = useCallback((next: OptimizerInputs) => {
    setInputs(next)
    const params = serializeInputs(next)
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }, [])

  const specId = useMemo(() => detectSpecId(inputs.importString), [inputs.importString])
  const { spec, specError } = useSpecSnapshot(data?.build ?? null, specId)

  const race = useMemo(
    () => data?.races.find((candidate) => candidate.id === inputs.raceId) ?? null,
    [data, inputs.raceId],
  )

  useEffect(() => {
    if (!hydrated || !data || !spec) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      solve({
        spec,
        spellMeta: data.spellMeta,
        importString: inputs.importString,
        race,
        pvpTalentIds: inputs.pvpTalentIds,
        mode: inputs.mode,
        arenaTargetScheme: inputs.arenaTargetScheme,
        hardware: inputs.hardware,
        constraints: { lockedBinds: {}, bannedSlotIds: [], preservedBinds: {} },
        seed: inputs.seed,
        strategyId: 'qap-annealing',
      })
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [hydrated, data, spec, race, inputs, solve])

  const outcome = solverState.outcome

  const selectedVariant = useMemo(() => {
    if (!outcome || outcome.variants.length === 0) return null
    return outcome.variants.find((variant) => variant.seed === inputs.seed) ?? outcome.variants[0] ?? null
  }, [outcome, inputs.seed])

  const synergyPartnersByAbility = useMemo(() => {
    const map = new Map<string, Array<{ name: string; slotLabel: string; icon: string | null }>>()
    if (!outcome || !data || !selectedVariant) return map
    const abilityById = new Map(outcome.abilities.map((ability) => [ability.id, ability]))
    const slotById = new Map(outcome.slots.map((slot) => [slot.id, slot]))
    const slotByAbility = new Map(
      selectedVariant.result.assignments.map((assignment) => [assignment.abilityId, assignment.slotId]),
    )
    const nameOf = (abilityId: string): string => {
      const ability = abilityById.get(abilityId)
      if (!ability) return ''
      if (ability.spellId === 0) return t('trinket')
      return data.text.spells[String(ability.spellId)]?.name ?? ''
    }
    const iconOf = (abilityId: string): string | null => {
      const ability = abilityById.get(abilityId)
      if (!ability || ability.spellId === 0) return null
      return data.spellMeta[String(ability.spellId)]?.icon ?? null
    }
    for (const edge of outcome.synergies) {
      if (edge.weight < 0.3) continue
      for (const [self, partner] of [
        [edge.abilityIdA, edge.abilityIdB],
        [edge.abilityIdB, edge.abilityIdA],
      ] as const) {
        const partnerSlotId = slotByAbility.get(partner)
        if (!partnerSlotId) continue
        const slot = slotById.get(partnerSlotId)
        if (!slot) continue
        const entry = map.get(self) ?? []
        if (entry.length < 3) {
          const label = slot.modifier === 'none' ? slot.keyLabel : `${slot.modifier}+${slot.keyLabel}`
          entry.push({ name: nameOf(partner), slotLabel: label, icon: iconOf(partner) })
          map.set(self, entry)
        }
      }
    }
    return map
  }, [outcome, data, t, selectedVariant])

  const pickExample = useCallback(
    (preset: ExamplePreset) => {
      const raceId =
        preset.raceSlug && data
          ? (data.races.find((race) => race.slug === preset.raceSlug)?.id ?? null)
          : null
      updateInputs({
        ...inputs,
        importString: preset.string,
        mode: presetToMode(preset.mode),
        arenaTargetScheme: preset.scheme === 'arena123' ? 'arena123' : 'focus',
        raceId,
        pvpTalentIds: [],
        seed: 1,
      })
    },
    [data, inputs, updateInputs],
  )

  const toggleKeyBan = useCallback(
    (keyId: string) => {
      const banned = inputs.hardware.bannedKeyIds.includes(keyId)
      updateInputs({
        ...inputs,
        hardware: {
          ...inputs.hardware,
          bannedKeyIds: banned
            ? inputs.hardware.bannedKeyIds.filter((id) => id !== keyId)
            : [...inputs.hardware.bannedKeyIds, keyId],
        },
      })
    },
    [inputs, updateInputs],
  )

  const handleAbilityClick = useCallback(
    (abilityId: string) => {
      if (!outcome) return
      const ability = outcome.abilities.find((candidate) => candidate.id === abilityId)
      if (!ability || ability.sourceNodeIds.length === 0) {
        setHighlightNodeIds(null)
        setHighlightAbilityIds(null)
        return
      }
      setHighlightNodeIds(new Set(ability.sourceNodeIds))
      setHighlightAbilityIds(new Set([abilityId]))
    },
    [outcome],
  )

  const handleNodeClick = useCallback(
    (nodeId: number) => {
      if (!outcome) return
      const abilityIds = outcome.abilities
        .filter((ability) => ability.sourceNodeIds.includes(nodeId))
        .map((ability) => ability.id)
      if (abilityIds.length === 0) {
        setHighlightAbilityIds(null)
        setHighlightNodeIds(null)
        return
      }
      setHighlightAbilityIds(new Set(abilityIds))
      setHighlightNodeIds(new Set([nodeId]))
    },
    [outcome],
  )

  const clearHighlight = useCallback(() => {
    setHighlightAbilityIds(null)
    setHighlightNodeIds(null)
  }, [])

  useEffect(() => {
    if (highlightAbilityIds === null && highlightNodeIds === null) return
    const onDocClick = () => clearHighlight()
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [highlightAbilityIds, highlightNodeIds, clearHighlight])

  if (error) {
    return (
      <div>
        <AppHeader />
        <main style={{ maxWidth: 640, margin: '60px auto', padding: 24 }}>
          <div className="panel">
            <p style={{ color: 'var(--danger)' }}>
              {t('dataError')}: {error}
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <AppHeader />
      <main
        style={{
          width: '100%',
          maxWidth: 1400,
          margin: '0 auto',
          padding: '0 clamp(20px, 4vw, 56px) 96px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <HeroInput
          inputs={inputs}
          onChange={updateInputs}
          classes={data?.classes ?? []}
          spec={spec}
          locale={locale}
        />

        {data && !spec && (
          <ExamplePicker classes={data.classes} locale={locale} onPick={pickExample} />
        )}

        {!data && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <LoadingBlock label={t('loadingData')} />
          </div>
        )}

        {data && (
          <SettingsPanel
            inputs={inputs}
            onChange={updateInputs}
            races={data.races}
            spec={spec}
            spellMeta={data.spellMeta}
            text={data.text}
            locale={locale}
          />
        )}

        {specError && (
          <div className="panel">
            <p style={{ color: 'var(--danger)' }}>{specError}</p>
          </div>
        )}
        {spec && solverState.status === 'error' && (
          <div className="panel">
            <p style={{ color: 'var(--danger)' }}>
              {t('solveError')}: {solverState.errorMessage}
            </p>
          </div>
        )}

        {spec && data && outcome && selectedVariant && (
          <>
            <section
              className="panel fade-in"
              style={{ opacity: solverState.status === 'solving' ? 0.55 : 1, transition: 'opacity 0.2s' }}
            >
              {outcome.variants.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  <span className="label" style={{ marginBottom: 0 }}>
                    {t('variants')}
                  </span>
                  {outcome.variants.map((variant, index) => {
                    const best = outcome.variants[0]?.result.objective ?? 0
                    const diff = best > 0 ? ((variant.result.objective - best) / best) * 100 : 0
                    const active = variant.seed === selectedVariant.seed
                    return (
                      <button
                        key={variant.seed}
                        className="pill"
                        data-active={active}
                        onClick={() => updateInputs({ ...inputs, seed: variant.seed })}
                      >
                        {index + 1}
                        {index === 0 ? ` · ${t('variantBest')}` : ` · ${diff.toFixed(1)}%`}
                      </button>
                    )
                  })}
                </div>
              )}
              <KeyboardView
                hardware={inputs.hardware}
                slots={outcome.slots}
                abilities={outcome.abilities}
                assignments={selectedVariant.result.assignments}
                synergyPartnersByAbility={synergyPartnersByAbility}
                spellMeta={data.spellMeta}
                text={data.text}
                highlightAbilityIds={highlightAbilityIds}
                onAbilityClick={handleAbilityClick}
                onToggleKeyBan={toggleKeyBan}
              />
            </section>
            <ScorePanel
              result={selectedVariant.result}
              baseline={outcome.baseline}
              abilities={outcome.abilities}
              slots={outcome.slots}
              elapsedMs={solverState.elapsedMs}
            />
            <div className="two-col">
              <TalentTreeView
                spec={spec}
                selections={outcome.selections}
                highlightNodeIds={highlightNodeIds}
                onNodeClick={handleNodeClick}
                spellMeta={data.spellMeta}
                text={data.text}
              />
              <ExportPanel
                assignments={selectedVariant.result.assignments}
                abilities={outcome.abilities}
                slots={outcome.slots}
                spells={data.text.spells}
                spellMeta={data.spellMeta}
                build={data.build}
              />
            </div>
          </>
        )}

        {spec && data && !outcome && solverState.status === 'solving' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <LoadingBlock label={t('solving')} />
          </div>
        )}
      </main>
    </div>
  )
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-soft)' }}>
      <span className="spinner" />
      {label}
    </div>
  )
}

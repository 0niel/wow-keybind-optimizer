'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useGameData, useSpecSnapshot } from '@/hooks/useGameData'
import { useSolver } from '@/hooks/useSolver'
import { DEFAULT_INPUTS, deserializeInputs, effectiveTargetBinds, serializeInputs } from '@/state/inputs'
import type { OptimizerInputs } from '@/state/inputs'
import { DEFAULT_BANNED_KEY_IDS } from '@/core/model/hardware'
import {
  classPreservation,
  classTagFromSlug,
  loadCart,
  saveCart,
  upsertCartEntry,
} from '@/state/addon-cart'
import type { AddonCartEntry } from '@/state/addon-cart'
import { HeroInput, SettingsPanel, detectSpecId } from './InputPanel'
import { ExamplePicker, presetToMode } from './ExamplePicker'
import type { ExamplePreset } from '@/lib/data'
import { zeroSpellLabel } from '@/lib/data'
import { KeyboardView } from './KeyboardView'
import { ScorePanel } from './ScorePanel'
import { TalentTreeView } from './TalentTreeView'
import { ExportPanel } from './ExportPanel'
import { AppHeader } from './AppHeader'
import { DataStatus } from './DataStatus'

export function OptimizerApp() {
  const t = useTranslations('app')
  const tResults = useTranslations('results')
  const locale = useLocale()
  const { data, error } = useGameData()
  const [inputs, setInputs] = useState<OptimizerInputs>(DEFAULT_INPUTS)
  const [hydrated, setHydrated] = useState(false)
  const [cart, setCart] = useState<AddonCartEntry[]>([])
  const [highlightAbilityIds, setHighlightAbilityIds] = useState<Set<string> | null>(null)
  const [highlightNodeIds, setHighlightNodeIds] = useState<Set<number> | null>(null)
  const { state: solverState, solve } = useSolver()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setInputs(deserializeInputs(new URLSearchParams(window.location.search)))
    setCart(loadCart())
    setHydrated(true)
  }, [])

  const addToCart = useCallback((entry: AddonCartEntry) => {
    setCart((previous) => {
      const next = upsertCartEntry(previous, entry)
      saveCart(next)
      return next
    })
  }, [])

  const removeFromCart = useCallback((id: string) => {
    setCart((previous) => {
      const next = previous.filter((entry) => entry.id !== id)
      saveCart(next)
      return next
    })
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

  const spellNames = useMemo(() => {
    if (!data) return undefined
    const names: Record<string, string> = {}
    for (const [spellId, record] of Object.entries(data.text.spells)) {
      names[spellId] = record.name
    }
    return names
  }, [data])

  const preservation = useMemo(
    () => (spec ? classPreservation(cart, spec.classId) : { preservedBinds: {} }),
    [cart, spec],
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
        constraints: { lockedBinds: inputs.pinnedBinds, bannedSlotIds: [], preservedBinds: {} },
        seed: inputs.seed,
        strategyId: 'qap-annealing',
        spellNames,
        preservedBinds: preservation.preservedBinds,
        anchorInterruptSlotId: preservation.anchorInterruptSlotId,
        includeTargetBinds: effectiveTargetBinds(inputs),
        excludedAbilityIds: inputs.excludedAbilityIds,
      })
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [hydrated, data, spec, race, inputs, solve, spellNames, preservation])

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
      if (ability.spellId === 0) {
        return zeroSpellLabel(ability.id, {
          trinket: tResults('trinket'),
          pvpTrinket: tResults('pvpTrinket'),
          targetArena: (n) => tResults('targetArena', { n }),
          setFocus: tResults('setFocus'),
        })
      }
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
  }, [outcome, data, tResults, selectedVariant])

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
      const pinnedBinds = banned
        ? inputs.pinnedBinds
        : Object.fromEntries(
            Object.entries(inputs.pinnedBinds).filter(
              ([, slotId]) => slotId !== keyId && !slotId.endsWith(`+${keyId}`),
            ),
          )
      updateInputs({
        ...inputs,
        pinnedBinds,
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

  const setKeyPriority = useCallback(
    (keyId: string, priority: 'boost' | 'lower' | null) => {
      const keyPriorities = { ...inputs.hardware.keyPriorities }
      if (priority === null) delete keyPriorities[keyId]
      else keyPriorities[keyId] = priority
      updateInputs({ ...inputs, hardware: { ...inputs.hardware, keyPriorities } })
    },
    [inputs, updateInputs],
  )

  const pinAbility = useCallback(
    (abilityId: string, slotId: string) => {
      const pinnedBinds = Object.fromEntries(
        Object.entries(inputs.pinnedBinds).filter(
          ([pinnedAbility, pinnedSlot]) => pinnedAbility !== abilityId && pinnedSlot !== slotId,
        ),
      )
      pinnedBinds[abilityId] = slotId
      updateInputs({ ...inputs, pinnedBinds })
    },
    [inputs, updateInputs],
  )

  const unpinSlot = useCallback(
    (slotId: string) => {
      const pinnedBinds = Object.fromEntries(
        Object.entries(inputs.pinnedBinds).filter(([, pinnedSlot]) => pinnedSlot !== slotId),
      )
      updateInputs({ ...inputs, pinnedBinds })
    },
    [inputs, updateInputs],
  )

  const excludeAbility = useCallback(
    (abilityId: string) => {
      if (inputs.excludedAbilityIds.includes(abilityId)) return
      const pinnedBinds = Object.fromEntries(
        Object.entries(inputs.pinnedBinds).filter(([pinnedAbility]) => pinnedAbility !== abilityId),
      )
      updateInputs({
        ...inputs,
        pinnedBinds,
        excludedAbilityIds: [...inputs.excludedAbilityIds, abilityId],
      })
    },
    [inputs, updateInputs],
  )

  const restoreAbility = useCallback(
    (abilityId: string) => {
      updateInputs({
        ...inputs,
        excludedAbilityIds: inputs.excludedAbilityIds.filter((id) => id !== abilityId),
      })
    },
    [inputs, updateInputs],
  )

  const pinAllCurrent = useCallback(() => {
    if (!selectedVariant) return
    const pinnedBinds: Record<string, string> = {}
    for (const assignment of selectedVariant.result.assignments) {
      pinnedBinds[assignment.abilityId] = assignment.slotId
    }
    updateInputs({ ...inputs, pinnedBinds })
  }, [inputs, selectedVariant, updateInputs])

  const clearOverrides = useCallback(() => {
    updateInputs({
      ...inputs,
      pinnedBinds: {},
      excludedAbilityIds: [],
      hardware: {
        ...inputs.hardware,
        keyPriorities: {},
        bannedKeyIds: DEFAULT_BANNED_KEY_IDS,
      },
    })
  }, [inputs, updateInputs])

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
      <main className="optimizer-main">
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

        {data && spec && (
          <nav className="workspace-nav" aria-label={t('workspaceNav')}>
            <div className="workspace-nav-links">
              <a href="#setup">{t('navSetup')}</a>
              <a href="#result">{t('navLayout')}</a>
              <a href="#analysis">{t('navAnalysis')}</a>
              <a href="#export">{t('navExport')}</a>
            </div>
            <div className="workspace-context">
              <b>{spec.names[locale] ?? spec.names.en ?? spec.specId}</b>
              <span>{data.build}</span>
            </div>
          </nav>
        )}

        {!data && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <LoadingBlock label={t('loadingData')} />
          </div>
        )}

        {data && (
          <div id="setup" className="anchor-target">
            <SettingsPanel
              inputs={inputs}
              onChange={updateInputs}
              races={data.races}
              spec={spec}
              spellMeta={data.spellMeta}
              text={data.text}
              locale={locale}
            />
          </div>
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
            <section id="result" className="workspace-section anchor-target fade-in">
              <SectionHeading index="02" title={t('layoutTitle')} hint={t('layoutHint')} />
              <div
                className="panel result-panel"
                data-solving={solverState.status === 'solving'}
              >
                {outcome.variants.length > 1 && (
                  <div className="variant-toolbar">
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
                  editing={{
                    pinnedBinds: inputs.pinnedBinds,
                    excludedAbilityIds: inputs.excludedAbilityIds,
                    onToggleKeyBan: toggleKeyBan,
                    onSetKeyPriority: setKeyPriority,
                    onPinAbility: pinAbility,
                    onUnpinSlot: unpinSlot,
                    onExcludeAbility: excludeAbility,
                    onRestoreAbility: restoreAbility,
                    onPinAll: pinAllCurrent,
                    onClearOverrides: clearOverrides,
                  }}
                />
              </div>
            </section>

            <section id="analysis" className="workspace-section anchor-target">
              <SectionHeading index="03" title={t('analysisTitle')} hint={t('analysisHint')} />
              <div className="analysis-grid">
                <ScorePanel
                  result={selectedVariant.result}
                  baseline={outcome.baseline}
                  abilities={outcome.abilities}
                  slots={outcome.slots}
                  elapsedMs={solverState.elapsedMs}
                />
                <DataStatus manifest={data.manifest} spec={spec} mode={inputs.mode} />
              </div>
              <TalentTreeView
                spec={spec}
                selections={outcome.selections}
                highlightNodeIds={highlightNodeIds}
                onNodeClick={handleNodeClick}
                spellMeta={data.spellMeta}
                text={data.text}
              />
            </section>

            <section id="export" className="workspace-section anchor-target">
              <SectionHeading index="04" title={t('exportTitle')} hint={t('exportHint')} />
              <ExportPanel
                variants={outcome.variants}
                selectedSeed={selectedVariant.seed}
                abilities={outcome.abilities}
                slots={outcome.slots}
                spells={data.text.spells}
                spellMeta={data.spellMeta}
                build={data.build}
                mode={inputs.mode}
                scheme={inputs.arenaTargetScheme}
                specId={spec.specId}
                classId={spec.classId}
                classTag={classTagFromSlug(
                  data.classes.find((candidate) => candidate.id === spec.classId)?.slug ?? '',
                )}
                specName={spec.names[locale] ?? spec.names.en ?? String(spec.specId)}
                hardware={inputs.hardware}
                cart={cart}
                onAddToCart={addToCart}
                onRemoveFromCart={removeFromCart}
              />
            </section>
          </>
        )}

        {spec && data && !outcome && solverState.status === 'solving' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <LoadingBlock label={t('solving')} />
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  )
}

function AppFooter() {
  return (
    <footer
      style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: '28px clamp(20px, 4vw, 56px) 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontSize: '0.88rem',
        color: 'var(--text-faint)',
      }}
    >
      <span>© Oniel</span>
      <span aria-hidden>·</span>
      <a
        href="https://github.com/0niel"
        target="_blank"
        rel="noreferrer noopener"
        style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
      >
        GitHub
      </a>
    </footer>
  )
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="loading-block" role="status">
      <span className="loading-line" />
      <span>{label}</span>
    </div>
  )
}

function SectionHeading({ index, title, hint }: { index: string; title: string; hint: string }) {
  return (
    <div className="section-heading">
      <span>{index}</span>
      <div>
        <h2>{title}</h2>
        <p>{hint}</p>
      </div>
    </div>
  )
}

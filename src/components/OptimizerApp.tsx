'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useGameData, useSpecSnapshot } from '@/hooks/useGameData'
import { useSolver } from '@/hooks/useSolver'
import { DEFAULT_INPUTS, deserializeInputs, serializeInputs } from '@/state/inputs'
import type { OptimizerInputs } from '@/state/inputs'
import { InputPanel, detectSpecId } from './InputPanel'
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

  const synergyPartnersByAbility = useMemo(() => {
    const map = new Map<string, Array<{ name: string; slotLabel: string }>>()
    if (!outcome || !data) return map
    const abilityById = new Map(outcome.abilities.map((ability) => [ability.id, ability]))
    const slotById = new Map(outcome.slots.map((slot) => [slot.id, slot]))
    const slotByAbility = new Map(
      outcome.result.assignments.map((assignment) => [assignment.abilityId, assignment.slotId]),
    )
    const nameOf = (abilityId: string): string => {
      const ability = abilityById.get(abilityId)
      if (!ability) return ''
      if (ability.spellId === 0) return t('trinket')
      return data.text.spells[String(ability.spellId)]?.name ?? ''
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
          entry.push({ name: nameOf(partner), slotLabel: label })
          map.set(self, entry)
        }
      }
    }
    return map
  }, [outcome, data, t])

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

  if (error) {
    return (
      <main style={{ maxWidth: 640, margin: '80px auto', padding: 24 }}>
        <div className="card">
          <h1 style={{ marginBottom: 12 }}>{t('title')}</h1>
          <p style={{ color: 'var(--danger)' }}>{t('dataError')}: {error}</p>
        </div>
      </main>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader />
      <main
        style={{
          width: '100%',
          maxWidth: 1440,
          margin: '0 auto',
          padding: '24px clamp(16px, 3vw, 40px) 80px',
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 400px) 1fr',
          gap: 24,
          alignItems: 'start',
        }}
        className="app-grid"
        onClick={(event) => {
          if ((event.target as HTMLElement).tagName === 'MAIN') clearHighlight()
        }}
      >
        <div className="card" style={{ position: 'sticky', top: 24 }}>
          {data ? (
            <InputPanel
              inputs={inputs}
              onChange={updateInputs}
              classes={data.classes}
              races={data.races}
              spec={spec}
              text={data.text}
              locale={locale}
            />
          ) : (
            <LoadingBlock label={t('loadingData')} />
          )}
          {specError && (
            <p style={{ marginTop: 12, color: 'var(--danger)', fontSize: '0.85rem' }}>{specError}</p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {!spec && (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: '2.4rem', marginBottom: 16 }}>⌨️</div>
              <h2 style={{ marginBottom: 8 }}>{t('emptyTitle')}</h2>
              <p style={{ color: 'var(--text-secondary)' }}>{t('emptyHint')}</p>
            </div>
          )}
          {spec && solverState.status === 'error' && (
            <div className="card">
              <p style={{ color: 'var(--danger)' }}>
                {t('solveError')}: {solverState.errorMessage}
              </p>
            </div>
          )}
          {spec && data && outcome && (
            <>
              <div className="card" style={{ opacity: solverState.status === 'solving' ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                <div className="section-label">{t('layoutTitle')}</div>
                <KeyboardView
                  hardware={inputs.hardware}
                  slots={outcome.slots}
                  abilities={outcome.abilities}
                  assignments={outcome.result.assignments}
                  synergyPartnersByAbility={synergyPartnersByAbility}
                  spellMeta={data.spellMeta}
                  text={data.text}
                  highlightAbilityIds={highlightAbilityIds}
                  onAbilityClick={handleAbilityClick}
                />
              </div>
              <ScorePanel
                result={outcome.result}
                baseline={outcome.baseline}
                abilities={outcome.abilities}
                slots={outcome.slots}
                elapsedMs={solverState.elapsedMs}
              />
              <TalentTreeView
                spec={spec}
                selections={outcome.selections}
                abilities={outcome.abilities}
                highlightNodeIds={highlightNodeIds}
                onNodeClick={handleNodeClick}
                text={data.text}
              />
              <ExportPanel
                assignments={outcome.result.assignments}
                abilities={outcome.abilities}
                slots={outcome.slots}
                spells={data.text.spells}
                build={data.build}
              />
            </>
          )}
          {spec && solverState.status === 'solving' && !outcome && (
            <div className="card">
              <LoadingBlock label={t('solving')} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 20, color: 'var(--text-secondary)' }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: '3px solid var(--surface-3)',
          borderTopColor: 'var(--accent)',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      {label}
    </div>
  )
}

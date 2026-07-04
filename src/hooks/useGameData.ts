'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import type { ClassRecord, RaceRecord, SpecSnapshot, SpellMetaShard } from '@/core/model/snapshot'
import type { TextShard } from '@/lib/data'
import {
  loadClasses,
  loadLatestBuild,
  loadRaces,
  loadSpec,
  loadSpellMeta,
  loadText,
} from '@/lib/data'

export interface GameData {
  build: string
  classes: ClassRecord[]
  races: RaceRecord[]
  spellMeta: SpellMetaShard
  text: TextShard
}

export function useGameData(): { data: GameData | null; error: string | null } {
  const locale = useLocale()
  const [data, setData] = useState<GameData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const build = await loadLatestBuild()
        const [classes, races, spellMeta, text] = await Promise.all([
          loadClasses(build),
          loadRaces(build),
          loadSpellMeta(build),
          loadText(build, locale),
        ])
        if (!cancelled) setData({ build, classes, races, spellMeta, text })
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [locale])

  return { data, error }
}

export function useSpecSnapshot(
  build: string | null,
  specId: number | null,
): { spec: SpecSnapshot | null; specError: string | null } {
  const [spec, setSpec] = useState<SpecSnapshot | null>(null)
  const [specError, setSpecError] = useState<string | null>(null)

  useEffect(() => {
    if (!build || specId === null) {
      setSpec(null)
      return
    }
    let cancelled = false
    setSpec(null)
    setSpecError(null)
    loadSpec(build, specId)
      .then((snapshot) => {
        if (!cancelled) setSpec(snapshot)
      })
      .catch((cause) => {
        if (!cancelled) setSpecError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [build, specId])

  return { spec, specError }
}

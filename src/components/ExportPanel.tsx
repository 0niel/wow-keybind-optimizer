'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Ability, ArenaTargetScheme, GameMode, Slot } from '@/core/model/ability'
import type { SpellMetaShard, SpellTextShard } from '@/core/model/snapshot'
import type { LayoutVariant } from '@/workers/solver.worker'
import { cartEntryId } from '@/state/addon-cart'
import type { AddonCartEntry } from '@/state/addon-cart'
import {
  buildAddonKeyboard,
  buildAddonProfile,
  buildExportBinds,
  buildLuaBindPlacements,
  renderLuaAddon,
  renderMacroList,
  renderPlainList,
  renderAddonToc,
  ADDON_UI_KEYS,
} from '@/lib/exports'
import { encodeImportString } from '@/lib/import-string'
import { GameBarsPreview } from './GameBarsPreview'
import type { HardwareConfig } from '@/core/model/hardware'
import type { AddonDecor, AddonLocaleStrings, AddonUiKey } from '@/lib/exports'
import { buildZipBlob } from '@/lib/zip'
import { abilityIconName, spellIconUrl } from '@/lib/data'
import type { ZeroSpellLabels } from '@/lib/data'
import { CATEGORY_HEX } from '@/core/model/category-colors'
import { ALL_CATEGORIES } from '@/core/model/ability-category'
import type { AbilityCategory } from '@/core/model/ability-category'
import ruMessages from '@/i18n/messages/ru.json'
import enMessages from '@/i18n/messages/en.json'
import { CodeBlock } from './CodeBlock'
import { SegmentedControl } from './controls'

type Messages = typeof ruMessages

function localeStringsFor(messages: Messages): AddonLocaleStrings {
  const categories = Object.fromEntries(
    ALL_CATEGORIES.map((category) => [category, messages.categories[category]]),
  ) as Record<AbilityCategory, string>
  const ui = Object.fromEntries(
    ADDON_UI_KEYS.map((key) => [key, messages.export.addon[key]]),
  ) as Record<AddonUiKey, string>
  return { categories, ui }
}

type ExportTab = 'list' | 'bars' | 'macros' | 'lua'

interface Props {
  variants: LayoutVariant[]
  selectedSeed: number
  abilities: Ability[]
  slots: Slot[]
  spells: SpellTextShard
  spellMeta: SpellMetaShard
  build: string
  mode: GameMode
  scheme: ArenaTargetScheme
  specId: number
  classId: number
  classTag: string
  specName: string
  hardware: HardwareConfig
  cart: AddonCartEntry[]
  onAddToCart: (entry: AddonCartEntry) => void
  onRemoveFromCart: (id: string) => void
}

const ADDON_NAME = 'KeybindOptimizer'

const MODE_LABEL_KEY: Record<GameMode, string> = {
  raid: 'raid',
  'mythic-plus': 'mythicPlus',
  arena: 'arena',
  rbg: 'rbg',
  battleground: 'battleground',
}

export function ExportPanel({
  variants,
  selectedSeed,
  abilities,
  slots,
  spells,
  spellMeta,
  build,
  mode,
  scheme,
  specId,
  classId,
  classTag,
  specName,
  hardware,
  cart,
  onAddToCart,
  onRemoveFromCart,
}: Props) {
  const t = useTranslations('export')
  const tResults = useTranslations('results')
  const tInput = useTranslations('input')
  const [tab, setTab] = useState<ExportTab>('list')
  const [copied, setCopied] = useState(false)
  const [added, setAdded] = useState(false)
  const [importCopied, setImportCopied] = useState(false)

  const labels: ZeroSpellLabels = useMemo(
    () => ({
      trinket: t('trinket'),
      pvpTrinket: t('pvpTrinket'),
      targetArena: (n: number) => tResults('targetArena', { n }),
      setFocus: tResults('setFocus'),
    }),
    [t, tResults],
  )

  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.seed === selectedSeed) ?? variants[0] ?? null,
    [variants, selectedSeed],
  )

  const binds = useMemo(
    () =>
      selectedVariant
        ? buildExportBinds(selectedVariant.result.assignments, abilities, slots, spells, labels)
        : [],
    [selectedVariant, abilities, slots, spells, labels],
  )

  const decor: AddonDecor = useMemo(
    () => ({
      colorByCategory: CATEGORY_HEX,
      ru: localeStringsFor(ruMessages),
      en: localeStringsFor(enMessages),
    }),
    [],
  )

  const currentCartId = cartEntryId(specId, mode, scheme)

  const keyboard = useMemo(() => buildAddonKeyboard(hardware), [hardware])

  const profiles = useMemo(() => {
    const modeLabel = tInput(`modes.${MODE_LABEL_KEY[mode]}`)
    const cartProfiles = cart
      .filter((entry) => entry.id !== currentCartId)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        mode: entry.mode,
        specId: entry.specId,
        classTag: entry.classTag,
        hash: entry.hash,
        binds: entry.binds,
        keyboard: entry.keyboard ?? keyboard,
      }))
    const currentProfiles = variants.map((variant, index) => {
      const variantBinds = buildExportBinds(
        variant.result.assignments,
        abilities,
        slots,
        spells,
        labels,
      )
      const baseName = `${specName} · ${t('profileName', { mode: modeLabel, n: index + 1 })}`
      const name = index === 0 ? `${baseName} · ${t('profileBest')}` : baseName
      return buildAddonProfile(
        `${currentCartId}-v${variant.seed}`,
        name,
        mode,
        specId,
        classTag,
        variantBinds,
        keyboard,
        decor,
      )
    })
    return [...cartProfiles, ...currentProfiles]
  }, [variants, abilities, slots, spells, labels, mode, specId, classTag, specName, decor, t, tInput, cart, currentCartId, keyboard])

  const addCurrentToCart = () => {
    const selected = selectedVariant
    if (!selected) return
    const modeLabel = tInput(`modes.${MODE_LABEL_KEY[mode]}`)
    const profile = buildAddonProfile(
      currentCartId,
      `${specName} · ${modeLabel}`,
      mode,
      specId,
      classTag,
      binds,
      keyboard,
      decor,
    )
    const preserved: Record<string, string> = {}
    for (const assignment of selected.result.assignments) {
      preserved[assignment.abilityId] = assignment.slotId
    }
    const interruptAbility = abilities.find(
      (ability) => ability.category === 'interrupt' && ability.variantKind === 'base',
    )
    const interruptSlotId = interruptAbility ? preserved[interruptAbility.id] : undefined
    onAddToCart({
      id: currentCartId,
      name: `${specName} · ${modeLabel}`,
      specId,
      classId,
      classTag,
      mode,
      hash: profile.hash,
      binds: profile.binds,
      keyboard,
      preserved,
      interruptSlotId,
      savedAt: Date.now(),
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  const placements = useMemo(() => buildLuaBindPlacements(binds, decor), [binds, decor])

  const content = useMemo(() => {
    if (tab === 'list' || tab === 'bars') return renderPlainList(binds)
    if (tab === 'macros') return renderMacroList(binds)
    return `-- ${ADDON_NAME}.toc\n${renderAddonToc(ADDON_NAME, build)}\n\n-- ${ADDON_NAME}.lua\n${renderLuaAddon(profiles, ADDON_NAME, decor)}`
  }, [tab, binds, profiles, build, decor])

  const copyImportString = async () => {
    const importString = await encodeImportString(profiles)
    await navigator.clipboard.writeText(importString)
    setImportCopied(true)
    setTimeout(() => setImportCopied(false), 1500)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const download = () => {
    if (tab === 'lua') {
      const zip = buildZipBlob([
        { name: `${ADDON_NAME}/${ADDON_NAME}.toc`, content: renderAddonToc(ADDON_NAME, build) },
        { name: `${ADDON_NAME}/${ADDON_NAME}.lua`, content: renderLuaAddon(profiles, ADDON_NAME, decor) },
      ])
      triggerDownload(zip, `${ADDON_NAME}.zip`)
      return
    }
    triggerDownload(
      new Blob([content], { type: 'text/plain;charset=utf-8' }),
      `keybinds-${tab}.txt`,
    )
  }

  const shareUrl = () => {
    void navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <SegmentedControl<ExportTab>
          options={[
            { value: 'list', label: t('tabList') },
            { value: 'bars', label: t('tabBars') },
            { value: 'macros', label: t('tabMacros') },
            { value: 'lua', label: t('tabLua') },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tab === 'lua' && (
            <>
              <button className="action" onClick={addCurrentToCart}>
                {added ? t('addedToAddon') : t('addToAddon')}
              </button>
              <button className="action" data-primary onClick={copyImportString}>
                {importCopied ? t('importCopied') : t('importCopy')}
              </button>
            </>
          )}
          {tab !== 'bars' && (
            <>
              <button className="action" onClick={copy}>
                {copied ? t('copied') : t('copy')}
              </button>
              <button className="action" data-primary={tab === 'lua'} onClick={download}>
                {tab === 'lua' ? t('downloadAddon') : t('download')}
              </button>
            </>
          )}
          <button className="action" onClick={shareUrl}>
            {t('share')}
          </button>
        </div>
      </div>
      {tab === 'bars' && <GameBarsPreview placements={placements} spellMeta={spellMeta} />}
      {tab === 'list' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            maxHeight: 420,
            overflowY: 'auto',
            paddingRight: 6,
          }}
        >
          {binds.map((bind) => {
            const icon = abilityIconName(
              bind.ability.spellId,
              bind.ability.id,
              spellMeta[String(bind.ability.spellId)]?.icon,
            )
            return (
              <div
                key={`${bind.ability.id}-${bind.wowKey}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '7px 12px',
                  borderRadius: 12,
                  background: 'var(--inset)',
                }}
              >
                <span
                  style={{
                    minWidth: 96,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    color: 'var(--text)',
                  }}
                >
                  {bind.wowKey}
                </span>
                {icon ? (
                  <img
                    src={spellIconUrl(icon)}
                    alt=""
                    width={26}
                    height={26}
                    loading="lazy"
                    style={{ borderRadius: 7 }}
                  />
                ) : (
                  <span style={{ width: 26, textAlign: 'center' }}>🎒</span>
                )}
                <span style={{ fontSize: '0.9rem' }}>{bind.name}</span>
                {bind.ability.variantKind !== 'base' && bind.ability.category !== 'targeting' && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 650,
                      color: 'var(--accent)',
                      background: 'var(--accent-soft)',
                      borderRadius: 6,
                      padding: '2px 8px',
                    }}
                  >
                    @{bind.ability.variantKind}
                  </span>
                )}
                <span
                  style={{
                    marginLeft: 'auto',
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: `var(--cat-${bind.ability.category})`,
                    flexShrink: 0,
                  }}
                />
              </div>
            )
          })}
        </div>
      )}
      {(tab === 'macros' || tab === 'lua') && <CodeBlock code={content} />}
      {tab === 'macros' && (
        <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-faint)' }}>{t('macrosHint')}</p>
      )}
      {tab === 'lua' && cart.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="label">{t('cartTitle')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {cart.map((entry) => (
              <span
                key={entry.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 10px',
                  borderRadius: 10,
                  background: 'var(--inset)',
                  fontSize: '0.82rem',
                }}
              >
                {entry.name}
                {entry.id === currentCartId && (
                  <span style={{ color: 'var(--accent)', fontWeight: 650 }}>
                    {t('cartCurrent')}
                  </span>
                )}
                <button
                  onClick={() => onRemoveFromCart(entry.id)}
                  title={t('cartRemove')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-faint)',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <p style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-faint)' }}>
            {t('cartHint')}
          </p>
        </div>
      )}
      {tab === 'lua' && (
        <>
          <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-faint)' }}>{t('luaHint')}</p>
          <p style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--text-faint)' }}>{t('importHint')}</p>
        </>
      )}
    </section>
  )
}

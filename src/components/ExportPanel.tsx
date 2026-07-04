'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Ability, BindAssignment, Slot } from '@/core/model/ability'
import type { SpellTextShard } from '@/core/model/snapshot'
import {
  buildExportBinds,
  renderLuaAddon,
  renderMacroList,
  renderPlainList,
  renderAddonToc,
} from '@/lib/exports'
import { SegmentedControl } from './controls'

type ExportTab = 'list' | 'macros' | 'lua'

interface Props {
  assignments: BindAssignment[]
  abilities: Ability[]
  slots: Slot[]
  spells: SpellTextShard
  build: string
}

const ADDON_NAME = 'KeybindOptimizer'

export function ExportPanel({ assignments, abilities, slots, spells, build }: Props) {
  const t = useTranslations('export')
  const [tab, setTab] = useState<ExportTab>('list')
  const [copied, setCopied] = useState(false)

  const binds = useMemo(
    () => buildExportBinds(assignments, abilities, slots, spells, t('trinket'), t('pvpTrinket')),
    [assignments, abilities, slots, spells, t],
  )

  const content = useMemo(() => {
    if (tab === 'list') return renderPlainList(binds)
    if (tab === 'macros') return renderMacroList(binds)
    return `-- ${ADDON_NAME}.toc\n${renderAddonToc(ADDON_NAME, build)}\n\n-- ${ADDON_NAME}.lua\n${renderLuaAddon(binds, ADDON_NAME)}`
  }, [tab, binds, build])

  const copy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const download = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = tab === 'lua' ? `${ADDON_NAME}.lua` : `keybinds-${tab}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const shareUrl = () => {
    void navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <SegmentedControl<ExportTab>
          options={[
            { value: 'list', label: t('tabList') },
            { value: 'macros', label: t('tabMacros') },
            { value: 'lua', label: t('tabLua') },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ghost-button" onClick={copy}>
            {copied ? t('copied') : t('copy')}
          </button>
          <button className="ghost-button" onClick={download}>
            {t('download')}
          </button>
          <button className="ghost-button" onClick={shareUrl}>
            {t('share')}
          </button>
        </div>
      </div>
      <pre
        style={{
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius-control)',
          padding: 16,
          fontSize: '0.78rem',
          lineHeight: 1.6,
          overflowX: 'auto',
          maxHeight: 380,
          overflowY: 'auto',
        }}
      >
        {content}
      </pre>
      {tab === 'macros' && (
        <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{t('macrosHint')}</p>
      )}
      {tab === 'lua' && (
        <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{t('luaHint')}</p>
      )}
    </div>
  )
}

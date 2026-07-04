'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Ability, BindAssignment, Slot } from '@/core/model/ability'
import type { SpellMetaShard, SpellTextShard } from '@/core/model/snapshot'
import {
  buildExportBinds,
  renderLuaAddon,
  renderMacroList,
  renderPlainList,
  renderAddonToc,
} from '@/lib/exports'
import { spellIconUrl } from '@/lib/data'
import { SegmentedControl } from './controls'

type ExportTab = 'list' | 'macros' | 'lua'

interface Props {
  assignments: BindAssignment[]
  abilities: Ability[]
  slots: Slot[]
  spells: SpellTextShard
  spellMeta: SpellMetaShard
  build: string
}

const ADDON_NAME = 'KeybindOptimizer'

export function ExportPanel({ assignments, abilities, slots, spells, spellMeta, build }: Props) {
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
    <section className="panel">
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
          <button className="action" onClick={copy}>
            {copied ? t('copied') : t('copy')}
          </button>
          <button className="action" onClick={download}>
            {t('download')}
          </button>
          <button className="action" onClick={shareUrl}>
            {t('share')}
          </button>
        </div>
      </div>
      {tab === 'list' ? (
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
            const icon =
              bind.ability.spellId > 0 ? spellMeta[String(bind.ability.spellId)]?.icon : null
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
                {bind.ability.variantKind !== 'base' && (
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
      ) : (
        <pre
          style={{
            background: 'var(--inset)',
            borderRadius: 'var(--r-control)',
            padding: 16,
            fontSize: '0.78rem',
            lineHeight: 1.6,
            overflowX: 'auto',
            maxHeight: 420,
            overflowY: 'auto',
          }}
        >
          {content}
        </pre>
      )}
      {tab === 'macros' && (
        <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-faint)' }}>{t('macrosHint')}</p>
      )}
      {tab === 'lua' && (
        <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-faint)' }}>{t('luaHint')}</p>
      )}
    </section>
  )
}

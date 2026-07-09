'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { NodeSelection } from '@/core/decoder'
import type { SpecSnapshot, SpecTraitNodeRecord, SpellMetaShard } from '@/core/model/snapshot'
import type { TextShard } from '@/lib/data'
import { spellIconUrl } from '@/lib/data'
import { formatSpellDescription } from '@/lib/format'
import { SpellTooltip } from './SpellTooltip'
import type { SpellTooltipInfo, SpellTooltipPill } from './SpellTooltip'

interface Props {
  spec: SpecSnapshot
  selections: NodeSelection[]
  highlightNodeIds: Set<number> | null
  onNodeClick: (nodeId: number) => void
  spellMeta: SpellMetaShard
  text: TextShard
}

const VIEW_WIDTH = 960
const VIEW_HEIGHT = 540
const ICON = 34

export function TalentTreeView({
  spec,
  selections,
  highlightNodeIds,
  onNodeClick,
  spellMeta,
  text,
}: Props) {
  const t = useTranslations('tree')
  const tCat = useTranslations('categories')
  const [hover, setHover] = useState<SpellTooltipInfo | null>(null)

  const formatCooldown = (ms: number): string => {
    if (ms >= 60_000) {
      const minutes = Math.round((ms / 60_000) * 10) / 10
      return t('minutes', { value: minutes })
    }
    const seconds = Math.round((ms / 1_000) * 10) / 10
    return t('seconds', { value: seconds })
  }
  const selectedByNodeId = useMemo(
    () => new Map(selections.map((selection) => [selection.nodeId, selection])),
    [selections],
  )
  const activeSubTreeId = useMemo(() => {
    for (const node of spec.nodes) {
      if (node.kind !== 'subtree-selection') continue
      const selection = selectedByNodeId.get(node.id)
      if (selection?.choiceIndex !== null && selection?.choiceIndex !== undefined) {
        return node.entries[selection.choiceIndex]?.subTreeId ?? null
      }
    }
    return null
  }, [spec.nodes, selectedByNodeId])

  const visibleNodes = useMemo(
    () =>
      spec.nodes.filter(
        (node) =>
          node.entries.length > 0 &&
          node.forSpec &&
          (node.subTreeId === 0 || node.subTreeId === activeSubTreeId),
      ),
    [spec.nodes, activeSubTreeId],
  )

  const bounds = useMemo(() => {
    const xs = visibleNodes.map((node) => node.posX)
    const ys = visibleNodes.map((node) => node.posY)
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    }
  }, [visibleNodes])

  const scaleX = (value: number) =>
    ((value - bounds.minX) / Math.max(1, bounds.maxX - bounds.minX)) * (VIEW_WIDTH - 70) + 35
  const scaleY = (value: number) =>
    ((value - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY)) * (VIEW_HEIGHT - 60) + 30

  const nodeEntry = (node: SpecTraitNodeRecord) => {
    const selection = selectedByNodeId.get(node.id)
    return selection?.choiceIndex !== null && selection?.choiceIndex !== undefined
      ? node.entries[selection.choiceIndex]
      : node.entries[0]
  }

  const sectionColor = (node: SpecTraitNodeRecord): string =>
    node.section === 'hero'
      ? 'var(--cat-cc-hard)'
      : node.section === 'class'
        ? 'var(--cat-rotational-core)'
        : 'var(--accent)'

  return (
    <section className="panel">
      <div className="label">{t('title')}</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-faint)', marginBottom: 12 }}>
        {t('hint')}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} width="100%" style={{ minWidth: 680 }}>
          {visibleNodes.map((node) => {
            const selection = selectedByNodeId.get(node.id)
            const isSelected = selection !== undefined && selection.ranks > 0
            const isHighlighted = highlightNodeIds?.has(node.id) ?? false
            const dimmed = highlightNodeIds !== null && !isHighlighted
            const entry = nodeEntry(node)
            const icon = entry
              ? (spec.iconBySpellId[String(entry.spellId)] ?? spellMeta[String(entry.spellId)]?.icon)
              : undefined
            const name = entry ? (text.spells[String(entry.spellId)]?.name ?? '') : ''
            const x = scaleX(node.posX)
            const y = scaleY(node.posY)

            if (!isSelected || !icon) {
              return (
                <circle
                  key={node.id}
                  cx={x}
                  cy={y}
                  r={isSelected ? 6 : 5}
                  fill={isSelected ? sectionColor(node) : 'var(--inset-strong)'}
                  opacity={dimmed ? 0.15 : isSelected ? 0.9 : 0.5}
                />
              )
            }

            const meta = entry ? spellMeta[String(entry.spellId)] : undefined
            const showHover = (event: { clientX: number; clientY: number }) => {
              const pills: SpellTooltipPill[] = []
              if (meta) {
                pills.push({ label: t('active'), color: 'var(--cat-defensive-major)' })
                pills.push({ label: tCat(meta.category), color: `var(--cat-${meta.category})` })
                if (meta.cooldownMs > 0) {
                  pills.push({ label: t('cooldown', { value: formatCooldown(meta.cooldownMs) }) })
                }
              } else {
                pills.push({ label: t('passive') })
              }
              if (node.maxRanks > 1) {
                pills.push({ label: t('ranks', { current: selection?.ranks ?? 0, max: node.maxRanks }) })
              }
              if (node.kind === 'choice') pills.push({ label: t('choiceNode') })
              setHover({
                name,
                description: formatSpellDescription(text.spells[String(entry?.spellId)]?.description ?? ''),
                icon,
                accent: sectionColor(node),
                subtitle: t(`section.${node.section}`),
                pills,
                x: event.clientX,
                y: event.clientY,
              })
            }

            return (
              <g
                key={node.id}
                transform={`translate(${x - ICON / 2}, ${y - ICON / 2})`}
                onClick={(event) => {
                  event.stopPropagation()
                  onNodeClick(node.id)
                }}
                onMouseMove={showHover}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer' }}
                opacity={dimmed ? 0.25 : 1}
              >
                {isHighlighted && (
                  <rect
                    x={-4.5}
                    y={-4.5}
                    width={ICON + 9}
                    height={ICON + 9}
                    rx={10}
                    fill="none"
                    stroke="var(--warn)"
                    strokeWidth={3}
                  />
                )}
                <rect
                  x={-2.5}
                  y={-2.5}
                  width={ICON + 5}
                  height={ICON + 5}
                  rx={8.5}
                  fill={sectionColor(node)}
                />
                <image
                  href={spellIconUrl(icon)}
                  width={ICON}
                  height={ICON}
                  style={{ clipPath: 'inset(0 round 6px)' }}
                />
              </g>
            )
          })}
        </svg>
      </div>
      {hover && <SpellTooltip info={hover} />}
      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: '0.8rem', color: 'var(--text-faint)' }}>
        <LegendDot color="var(--cat-rotational-core)" label={t('classTree')} />
        <LegendDot color="var(--accent)" label={t('specTree')} />
        <LegendDot color="var(--cat-cc-hard)" label={t('heroTree')} />
      </div>
    </section>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

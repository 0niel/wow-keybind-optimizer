'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { NodeSelection } from '@/core/decoder'
import type { Ability } from '@/core/model/ability'
import type { SpecSnapshot, SpecTraitNodeRecord, SpellMetaShard } from '@/core/model/snapshot'
import type { TextShard } from '@/lib/data'
import { spellIconUrl } from '@/lib/data'

interface Props {
  spec: SpecSnapshot
  selections: NodeSelection[]
  abilities: Ability[]
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
  abilities,
  highlightNodeIds,
  onNodeClick,
  spellMeta,
  text,
}: Props) {
  const t = useTranslations('tree')
  const selectedByNodeId = useMemo(
    () => new Map(selections.map((selection) => [selection.nodeId, selection])),
    [selections],
  )
  const boundNodeIds = useMemo(() => {
    const ids = new Set<number>()
    for (const ability of abilities) {
      for (const nodeId of ability.sourceNodeIds) ids.add(nodeId)
    }
    return ids
  }, [abilities])

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
            const isBound = boundNodeIds.has(node.id)
            const isHighlighted = highlightNodeIds?.has(node.id) ?? false
            const dimmed = highlightNodeIds !== null && !isHighlighted
            const entry = nodeEntry(node)
            const icon = entry
              ? (spec.iconBySpellId[String(entry.spellId)] ?? spellMeta[String(entry.spellId)]?.icon)
              : undefined
            const name = entry ? (text.spells[String(entry.spellId)]?.name ?? '') : ''
            const x = scaleX(node.posX)
            const y = scaleY(node.posY)

            if (!isSelected) {
              return (
                <circle
                  key={node.id}
                  cx={x}
                  cy={y}
                  r={5}
                  fill="var(--inset-strong)"
                  opacity={dimmed ? 0.15 : 0.5}
                >
                  <title>{name}</title>
                </circle>
              )
            }

            return (
              <g
                key={node.id}
                transform={`translate(${x - ICON / 2}, ${y - ICON / 2})`}
                onClick={() => onNodeClick(node.id)}
                style={{ cursor: isBound ? 'pointer' : 'default' }}
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
                {icon ? (
                  <image
                    href={spellIconUrl(icon)}
                    width={ICON}
                    height={ICON}
                    style={{ clipPath: 'inset(0 round 6px)' }}
                  >
                    <title>{name}</title>
                  </image>
                ) : (
                  <rect width={ICON} height={ICON} rx={6} fill="var(--inset)">
                    <title>{name}</title>
                  </rect>
                )}
              </g>
            )
          })}
        </svg>
      </div>
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

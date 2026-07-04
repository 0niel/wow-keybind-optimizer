'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { NodeSelection } from '@/core/decoder'
import type { Ability } from '@/core/model/ability'
import type { SpecSnapshot, SpecTraitNodeRecord } from '@/core/model/snapshot'
import type { TextShard } from '@/lib/data'

interface Props {
  spec: SpecSnapshot
  selections: NodeSelection[]
  abilities: Ability[]
  highlightNodeIds: Set<number> | null
  onNodeClick: (nodeId: number) => void
  text: TextShard
}

const VIEW_WIDTH = 900
const VIEW_HEIGHT = 460

export function TalentTreeView({ spec, selections, abilities, highlightNodeIds, onNodeClick, text }: Props) {
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
    ((value - bounds.minX) / Math.max(1, bounds.maxX - bounds.minX)) * (VIEW_WIDTH - 60) + 30
  const scaleY = (value: number) =>
    ((value - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY)) * (VIEW_HEIGHT - 50) + 25

  const nodeLabel = (node: SpecTraitNodeRecord): string => {
    const selection = selectedByNodeId.get(node.id)
    const entry =
      selection?.choiceIndex !== null && selection?.choiceIndex !== undefined
        ? node.entries[selection.choiceIndex]
        : node.entries[0]
    if (!entry) return ''
    return text.spells[String(entry.spellId)]?.name ?? ''
  }

  return (
    <div className="panel">
      <div className="label">{t('title')}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-faint)', marginBottom: 10 }}>
        {t('hint')}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} width="100%" style={{ minWidth: 640 }}>
          {visibleNodes.map((node) => {
            const selection = selectedByNodeId.get(node.id)
            const isSelected = selection !== undefined && selection.ranks > 0
            const isBound = boundNodeIds.has(node.id)
            const isHighlighted = highlightNodeIds?.has(node.id) ?? false
            const dimmed = highlightNodeIds !== null && !isHighlighted
            const radius = node.kind === 'subtree-selection' ? 11 : node.kind === 'choice' ? 9 : 7
            const fill = !isSelected
              ? 'var(--inset-strong)'
              : node.section === 'hero'
                ? 'var(--cat-cc-hard)'
                : node.section === 'class'
                  ? 'var(--cat-rotational-core)'
                  : 'var(--accent)'
            return (
              <g
                key={node.id}
                transform={`translate(${scaleX(node.posX)}, ${scaleY(node.posY)})`}
                onClick={() => onNodeClick(node.id)}
                style={{ cursor: isBound ? 'pointer' : 'default' }}
              >
                {isHighlighted && (
                  <circle r={radius + 5} fill="none" stroke="var(--warn)" strokeWidth={3} />
                )}
                <circle
                  r={radius}
                  fill={fill}
                  opacity={dimmed ? 0.25 : isSelected ? 1 : 0.45}
                  stroke={isBound && isSelected ? 'var(--text)' : 'none'}
                  strokeWidth={1.5}
                  style={{ transition: 'opacity 0.2s ease-out' }}
                >
                  <title>{nodeLabel(node)}</title>
                </circle>
              </g>
            )
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.78rem', color: 'var(--text-faint)' }}>
        <LegendDot color="var(--cat-rotational-core)" label={t('classTree')} />
        <LegendDot color="var(--accent)" label={t('specTree')} />
        <LegendDot color="var(--cat-cc-hard)" label={t('heroTree')} />
      </div>
    </div>
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

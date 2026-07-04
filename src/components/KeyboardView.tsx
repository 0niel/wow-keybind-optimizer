'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Ability, BindAssignment, Slot } from '@/core/model/ability'
import type { HardwareConfig, Modifier } from '@/core/model/hardware'
import type { SpellMetaShard } from '@/core/model/snapshot'
import { buildKeyboardGeometry } from '@/core/hardware/keyboards'
import { MOVEMENT_SCHEMES } from '@/core/hardware/movement-schemes'
import { MOUSE_BUTTONS, WHEEL_BUTTONS } from '@/core/hardware/mice'
import type { TextShard } from '@/lib/data'
import { spellIconUrl } from '@/lib/data'
import { SegmentedControl } from './controls'
import { HoverCard } from './HoverCard'
import type { HoverInfo } from './HoverCard'

export type HeatmapMode = 'none' | 'accessibility' | 'frequency'

interface Props {
  hardware: HardwareConfig
  slots: Slot[]
  abilities: Ability[]
  assignments: BindAssignment[]
  synergyPartnersByAbility: Map<string, Array<{ name: string; slotLabel: string }>>
  spellMeta: SpellMetaShard
  text: TextShard
  highlightAbilityIds: Set<string> | null
  onAbilityClick?: (abilityId: string) => void
}

const KEY_UNIT = 52
const GAP = 4

export function KeyboardView({
  hardware,
  slots,
  abilities,
  assignments,
  synergyPartnersByAbility,
  spellMeta,
  text,
  highlightAbilityIds,
  onAbilityClick,
}: Props) {
  const t = useTranslations('results')
  const tCat = useTranslations('categories')
  const [layer, setLayer] = useState<Modifier>('none')
  const [heatmap, setHeatmap] = useState<HeatmapMode>('none')
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const geometry = useMemo(
    () => buildKeyboardGeometry(hardware.formFactor, hardware.layout),
    [hardware.formFactor, hardware.layout],
  )
  const scheme = MOVEMENT_SCHEMES[hardware.movementScheme]
  const movementKeys = new Set(scheme.movementKeyIds)

  const abilityById = useMemo(() => new Map(abilities.map((a) => [a.id, a])), [abilities])
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots])
  const bindBySlotId = useMemo(() => {
    const map = new Map<string, BindAssignment>()
    for (const bind of assignments) map.set(bind.slotId, bind)
    return map
  }, [assignments])

  const frequencyByKey = useMemo(() => {
    const map = new Map<string, number>()
    for (const bind of assignments) {
      const slot = slotById.get(bind.slotId)
      const ability = abilityById.get(bind.abilityId)
      if (!slot || !ability) continue
      map.set(slot.keyId, (map.get(slot.keyId) ?? 0) + ability.frequency)
    }
    return map
  }, [assignments, slotById, abilityById])

  const presentCategories = useMemo(() => {
    const seen = new Set<string>()
    for (const bind of assignments) {
      const ability = abilityById.get(bind.abilityId)
      if (ability) seen.add(ability.category)
    }
    return [...seen]
  }, [assignments, abilityById])

  const accessibilityByKey = useMemo(() => {
    const map = new Map<string, number>()
    for (const slot of slots) {
      if (slot.modifier !== 'none') continue
      map.set(slot.keyId, slot.accessibility)
    }
    return map
  }, [slots])

  const minX = Math.min(...geometry.map((key) => key.x))
  const minY = Math.min(...geometry.map((key) => key.y))
  const maxX = Math.max(...geometry.map((key) => key.x + key.w))
  const maxY = Math.max(...geometry.map((key) => key.y + key.h))

  const mouseButtons = [
    ...MOUSE_BUTTONS[hardware.mouse],
    ...(hardware.includeMouseWheel ? WHEEL_BUTTONS : []),
  ]
  const mouseColumns = 3
  const mouseWidth = hardware.mouse === 'none' && !hardware.includeMouseWheel ? 0 : mouseColumns * (KEY_UNIT * 0.9 + GAP) + 30

  const width = (maxX - minX) * KEY_UNIT + 20 + mouseWidth
  const height = (maxY - minY) * KEY_UNIT + 20

  const slotIdFor = (keyId: string) => (layer === 'none' ? keyId : `${layer}+${keyId}`)

  const renderKey = (
    keyId: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    _isMouse: boolean,
  ) => {
    const slotId = slotIdFor(keyId)
    const bind = bindBySlotId.get(slotId)
    const ability = bind ? abilityById.get(bind.abilityId) : undefined
    const slot = slotById.get(slotId)
    const isMovement = movementKeys.has(keyId)
    const meta = ability && ability.spellId > 0 ? spellMeta[String(ability.spellId)] : undefined
    const spellText =
      ability && ability.spellId > 0 ? text.spells[String(ability.spellId)] : undefined
    const dimmed =
      highlightAbilityIds !== null && ability !== undefined && !highlightAbilityIds.has(ability.id)

    let fill = 'var(--inset)'
    let opacity = 1
    if (heatmap === 'accessibility') {
      const value = accessibilityByKey.get(keyId) ?? 0
      fill = `color-mix(in srgb, var(--accent) ${Math.round(value * 85)}%, var(--inset))`
    } else if (heatmap === 'frequency') {
      const value = Math.min(1, (frequencyByKey.get(keyId) ?? 0) / 1.2)
      fill = `color-mix(in srgb, var(--cat-cooldown-burst) ${Math.round(value * 90)}%, var(--inset))`
    } else if (ability) {
      fill = `var(--cat-${ability.category})`
      opacity = dimmed ? 0.25 : 1
    } else if (isMovement) {
      fill = 'var(--inset-strong)'
    }

    const abilityName =
      ability?.spellId === 0
        ? ability.id === 'trinket:pvp'
          ? t('pvpTrinket')
          : t('trinket')
        : spellText?.name

    return (
      <g
        key={keyId}
        transform={`translate(${(x - minX) * KEY_UNIT + 10}, ${(y - minY) * KEY_UNIT + 10})`}
        onMouseEnter={(event) => {
          if (!ability || !bind || !slot) return
          setHover({
            ability,
            bind,
            slot,
            name: abilityName ?? '',
            description: spellText?.description ?? '',
            icon: meta?.icon ?? null,
            partners: synergyPartnersByAbility.get(ability.id) ?? [],
            x: event.clientX,
            y: event.clientY,
          })
        }}
        onMouseLeave={() => setHover(null)}
        onClick={() => ability && onAbilityClick?.(ability.id)}
        style={{ cursor: ability ? 'pointer' : 'default' }}
      >
        <rect
          width={w * KEY_UNIT - GAP}
          height={h * KEY_UNIT - GAP}
          rx={10}
          fill={fill}
          opacity={opacity}
          style={{ transition: 'fill 0.25s ease-out, opacity 0.2s ease-out' }}
        />
        {ability && heatmap === 'none' && (
          <>
            {meta ? (
              <image
                href={spellIconUrl(meta.icon)}
                x={(w * KEY_UNIT - GAP - iconSize(w, h)) / 2}
                y={(h * KEY_UNIT - GAP - iconSize(w, h)) / 2 + 3}
                width={iconSize(w, h)}
                height={iconSize(w, h)}
                opacity={dimmed ? 0.3 : 1}
                style={{ clipPath: 'inset(0 round 7px)' }}
              >
                <title>{abilityName ?? ''}</title>
              </image>
            ) : (
              <text
                x={(w * KEY_UNIT - GAP) / 2}
                y={(h * KEY_UNIT - GAP) / 2 + 8}
                textAnchor="middle"
                fontSize={15}
              >
                🎒
              </text>
            )}
          </>
        )}
        <text
          x={6}
          y={13}
          fontSize={9.5}
          fontWeight={650}
          fill={ability && heatmap === 'none' ? 'rgba(255,255,255,0.9)' : 'var(--text-soft)'}
          style={{ userSelect: 'none' }}
        >
          {label}
        </text>
        {isMovement && !ability && heatmap === 'none' && (
          <text x={7} y={h * KEY_UNIT - GAP - 8} fontSize={8} fill="var(--text-faint)">
            {t('movement')}
          </text>
        )}
      </g>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <SegmentedControl<Modifier>
          options={hardware.enabledModifiers.map((modifier) => ({
            value: modifier,
            label:
              modifier === 'none'
                ? t('layerBase')
                : modifier === 'shift'
                  ? 'Shift'
                  : modifier === 'ctrl'
                    ? 'Ctrl'
                    : 'Alt',
          }))}
          value={layer}
          onChange={setLayer}
        />
        <SegmentedControl<HeatmapMode>
          options={[
            { value: 'none', label: t('heatmapNone') },
            { value: 'accessibility', label: t('heatmapAccessibility') },
            { value: 'frequency', label: t('heatmapFrequency') },
          ]}
          value={heatmap}
          onChange={setHeatmap}
        />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          style={{ maxWidth: '100%', height: 'auto' }}
        >
          {geometry.map((key) => renderKey(key.id, key.label, key.x, key.y, key.w, key.h, false))}
          {mouseButtons.map((button, index) => {
            const column = index % mouseColumns
            const row = Math.floor(index / mouseColumns)
            return renderKey(
              button.id,
              button.label,
              maxX - minX + 0.6 + column * 0.95,
              minY + row * 0.95 + 1,
              0.9,
              0.9,
              true,
            )
          })}
        </svg>
      </div>
      {heatmap === 'none' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 16 }}>
          {presentCategories.map((category) => (
            <span
              key={category}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.8rem',
                color: 'var(--text-soft)',
              }}
            >
              <span
                style={{ width: 10, height: 10, borderRadius: 3, background: `var(--cat-${category})` }}
              />
              {tCat(category)}
            </span>
          ))}
        </div>
      )}
      {hover && <HoverCard info={hover} />}
    </div>
  )
}

function iconSize(w: number, h: number): number {
  return Math.min(30, Math.min(w, h) * KEY_UNIT - 20)
}

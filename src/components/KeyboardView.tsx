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
import { abilityIconName, spellIconUrl } from '@/lib/data'
import { SegmentedControl } from './controls'
import { HoverCard } from './HoverCard'
import type { HoverInfo } from './HoverCard'

export type HeatmapMode = 'none' | 'accessibility' | 'frequency'

interface Props {
  hardware: HardwareConfig
  slots: Slot[]
  abilities: Ability[]
  assignments: BindAssignment[]
  synergyPartnersByAbility: Map<string, Array<{ name: string; slotLabel: string; icon: string | null }>>
  spellMeta: SpellMetaShard
  text: TextShard
  highlightAbilityIds: Set<string> | null
  onAbilityClick?: (abilityId: string) => void
  onToggleKeyBan?: (keyId: string) => void
}

const KEY_UNIT = 58
const GAP = 5
const CATEGORY_BAR = 5

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
  onToggleKeyBan,
}: Props) {
  const t = useTranslations('results')
  const tCat = useTranslations('categories')
  const [layer, setLayer] = useState<Modifier>('none')
  const [heatmap, setHeatmap] = useState<HeatmapMode>('none')
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [editMode, setEditMode] = useState(false)
  const bannedKeys = new Set(hardware.bannedKeyIds)

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
    const isBanned = bannedKeys.has(keyId)
    const bind = isBanned ? undefined : bindBySlotId.get(slotId)
    const ability = bind ? abilityById.get(bind.abilityId) : undefined
    const slot = slotById.get(slotId)
    const isMovement = movementKeys.has(keyId)
    const meta = ability && ability.spellId > 0 ? spellMeta[String(ability.spellId)] : undefined
    const iconName = ability ? abilityIconName(ability.spellId, ability.id, meta?.icon) : null
    const spellText =
      ability && ability.spellId > 0 ? text.spells[String(ability.spellId)] : undefined
    const dimmed =
      highlightAbilityIds !== null && ability !== undefined && !highlightAbilityIds.has(ability.id)

    let fill = 'var(--inset)'
    let opacity = isBanned ? 0.45 : 1
    if (heatmap === 'accessibility') {
      const value = accessibilityByKey.get(keyId) ?? 0
      fill = `color-mix(in srgb, var(--accent) ${Math.round(value * 85)}%, var(--inset))`
    } else if (heatmap === 'frequency') {
      const value = Math.min(1, (frequencyByKey.get(keyId) ?? 0) / 1.2)
      fill = `color-mix(in srgb, var(--cat-cooldown-burst) ${Math.round(value * 90)}%, var(--inset))`
    } else if (ability) {
      fill = 'var(--inset-strong)'
      opacity = dimmed ? 0.3 : 1
    }

    const abilityName =
      ability?.spellId === 0
        ? ability.id === 'trinket:pvp'
          ? t('pvpTrinket')
          : t('trinket')
        : spellText?.name

    const canToggle = editMode && !isMovement
    return (
      <g
        key={keyId}
        transform={`translate(${(x - minX) * KEY_UNIT + 10}, ${(y - minY) * KEY_UNIT + 10})`}
        onMouseEnter={(event) => {
          if (editMode || !ability || !bind || !slot) return
          setHover({
            ability,
            bind,
            slot,
            name: abilityName ?? '',
            description: spellText?.description ?? '',
            icon: iconName,
            partners: synergyPartnersByAbility.get(ability.id) ?? [],
            x: event.clientX,
            y: event.clientY,
          })
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(event) => {
          if (canToggle) {
            event.stopPropagation()
            onToggleKeyBan?.(keyId)
            return
          }
          if (!editMode && ability) {
            event.stopPropagation()
            onAbilityClick?.(ability.id)
          }
        }}
        style={{ cursor: canToggle || (!editMode && ability) ? 'pointer' : 'default' }}
      >
        <rect
          width={w * KEY_UNIT - GAP}
          height={h * KEY_UNIT - GAP}
          rx={10}
          fill={fill}
          opacity={opacity}
          style={{ transition: 'fill 0.25s ease-out, opacity 0.2s ease-out' }}
        />
        {canToggle && (
          <rect
            x={1}
            y={1}
            width={w * KEY_UNIT - GAP - 2}
            height={h * KEY_UNIT - GAP - 2}
            rx={9}
            fill="none"
            stroke={isBanned ? 'var(--danger)' : 'var(--accent)'}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            opacity={0.7}
          />
        )}
        {isBanned && heatmap === 'none' && (
          <line
            x1={7}
            y1={h * KEY_UNIT - GAP - 7}
            x2={w * KEY_UNIT - GAP - 7}
            y2={7}
            stroke="var(--danger)"
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.6}
          />
        )}
        {ability && heatmap === 'none' && (
          <>
            {iconName ? (
              <>
                <rect
                  x={(w * KEY_UNIT - GAP - iconSize(w, h)) / 2 - 2}
                  y={(h * KEY_UNIT - GAP - CATEGORY_BAR - iconSize(w, h)) / 2 - 2}
                  width={iconSize(w, h) + 4}
                  height={iconSize(w, h) + 4}
                  rx={9}
                  fill="rgba(140, 150, 170, 0.22)"
                  opacity={dimmed ? 0.3 : 1}
                />
                <image
                  href={spellIconUrl(iconName)}
                  x={(w * KEY_UNIT - GAP - iconSize(w, h)) / 2}
                  y={(h * KEY_UNIT - GAP - CATEGORY_BAR - iconSize(w, h)) / 2}
                  width={iconSize(w, h)}
                  height={iconSize(w, h)}
                  opacity={dimmed ? 0.3 : 1}
                  style={{ clipPath: 'inset(0 round 8px)' }}
                >
                  <title>{abilityName ?? ''}</title>
                </image>
              </>
            ) : (
              <text
                x={(w * KEY_UNIT - GAP) / 2}
                y={(h * KEY_UNIT - GAP) / 2 + 6}
                textAnchor="middle"
                fontSize={20}
              >
                🎒
              </text>
            )}
            <rect
              x={5}
              y={h * KEY_UNIT - GAP - CATEGORY_BAR - 4}
              width={w * KEY_UNIT - GAP - 10}
              height={CATEGORY_BAR}
              rx={CATEGORY_BAR / 2}
              fill={`var(--cat-${ability.category})`}
              opacity={dimmed ? 0.3 : 1}
            />
          </>
        )}
        {ability && heatmap === 'none' && (
          <rect x={3} y={3} width={17} height={15} rx={5} fill="var(--panel)" opacity={0.9} />
        )}
        {ability && ability.variantKind !== 'base' && heatmap === 'none' && (
          <g transform={`translate(${w * KEY_UNIT - GAP - 11}, 11)`}>
            <circle r={8} fill="var(--accent)" opacity={dimmed ? 0.3 : 1} />
            <text
              textAnchor="middle"
              y={3.5}
              fontSize={9}
              fontWeight={800}
              fill="var(--on-accent)"
              opacity={dimmed ? 0.4 : 1}
            >
              {ability.variantKind === 'focus' ? 'F' : ability.variantKind.slice(-1)}
            </text>
          </g>
        )}
        <text
          x={ability && heatmap === 'none' ? 11.5 : 7}
          y={14.5}
          fontSize={10}
          fontWeight={700}
          textAnchor={ability && heatmap === 'none' ? 'middle' : 'start'}
          fill={ability && heatmap === 'none' ? 'var(--text)' : 'var(--text-soft)'}
          style={{ userSelect: 'none' }}
        >
          {label}
        </text>
        {isMovement && !ability && heatmap === 'none' && (
          <text x={7} y={h * KEY_UNIT - GAP - 8} fontSize={8.5} fill="var(--text-faint)">
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <SegmentedControl<HeatmapMode>
            options={[
              { value: 'none', label: t('heatmapNone') },
              { value: 'accessibility', label: t('heatmapAccessibility') },
              { value: 'frequency', label: t('heatmapFrequency') },
            ]}
            value={heatmap}
            onChange={setHeatmap}
          />
          <button
            className="pill"
            data-active={editMode}
            onClick={() => {
              setEditMode((value) => !value)
              setHover(null)
            }}
          >
            ⚙ {t('editKeys')}
          </button>
        </div>
      </div>
      {editMode && (
        <p
          className="fade-in"
          style={{ fontSize: '0.85rem', color: 'var(--text-soft)', margin: '0 0 12px' }}
        >
          {t('editKeysHint')}
        </p>
      )}
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
  return Math.min(40, Math.min(w, h) * KEY_UNIT - GAP - CATEGORY_BAR - 10)
}

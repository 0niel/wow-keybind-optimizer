'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Ability, BindAssignment, Slot } from '@/core/model/ability'
import type { HardwareConfig, KeyPriority, Modifier } from '@/core/model/hardware'
import type { SpellMetaShard } from '@/core/model/snapshot'
import { buildKeyboardGeometry } from '@/core/hardware/keyboards'
import { MOVEMENT_SCHEMES } from '@/core/hardware/movement-schemes'
import { MOUSE_BUTTONS, WHEEL_BUTTONS } from '@/core/hardware/mice'
import type { TextShard, ZeroSpellLabels } from '@/lib/data'
import { abilityIconName, spellIconUrl, zeroSpellLabel } from '@/lib/data'
import { SegmentedControl } from './controls'
import { HoverCard } from './HoverCard'
import type { HoverInfo } from './HoverCard'
import { useClampedOverlay } from './overlay-position'

export type HeatmapMode = 'none' | 'accessibility' | 'frequency'

export interface KeyboardEditing {
  pinnedBinds: Record<string, string>
  excludedAbilityIds: string[]
  onToggleKeyBan: (keyId: string) => void
  onSetKeyPriority: (keyId: string, priority: KeyPriority | null) => void
  onPinAbility: (abilityId: string, slotId: string) => void
  onUnpinSlot: (slotId: string) => void
  onExcludeAbility: (abilityId: string) => void
  onRestoreAbility: (abilityId: string) => void
  onPinAll: () => void
  onClearOverrides: () => void
}

interface EditorTarget {
  keyId: string
  keyLabel: string
  x: number
  y: number
}

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
  editing?: KeyboardEditing
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
  editing,
}: Props) {
  const t = useTranslations('results')
  const tCat = useTranslations('categories')
  const [layer, setLayer] = useState<Modifier>('none')
  const [heatmap, setHeatmap] = useState<HeatmapMode>('none')
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null)
  const bannedKeys = new Set(hardware.bannedKeyIds)
  const keyPriorities = hardware.keyPriorities ?? {}
  const pinnedSlotIds = useMemo(
    () => new Set(Object.values(editing?.pinnedBinds ?? {})),
    [editing?.pinnedBinds],
  )

  useEffect(() => {
    if (!editorTarget) return
    const close = () => setEditorTarget(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [editorTarget])

  useEffect(() => {
    if (!editMode) setEditorTarget(null)
  }, [editMode])

  const zeroLabels: ZeroSpellLabels = useMemo(
    () => ({
      trinket: t('trinket'),
      pvpTrinket: t('pvpTrinket'),
      targetArena: (n: number) => t('targetArena', { n }),
      setFocus: t('setFocus'),
    }),
    [t],
  )

  const abilityDisplayName = (abilityId: string, spellId?: number): string => {
    if (abilityId.startsWith('spell:')) {
      const resolvedSpellId = spellId ?? Number(abilityId.split(':')[1] ?? 0)
      return text.spells[String(resolvedSpellId)]?.name ?? `#${resolvedSpellId}`
    }
    return zeroSpellLabel(abilityId, zeroLabels)
  }

  const slotDisplayLabel = (slotId: string): string => {
    const slot = slots.find((candidate) => candidate.id === slotId)
    if (!slot) return slotId
    return slot.modifier === 'none' ? slot.keyLabel : `${slot.modifier}+${slot.keyLabel}`
  }

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
        ? zeroSpellLabel(ability.id, {
            trinket: t('trinket'),
            pvpTrinket: t('pvpTrinket'),
            targetArena: (n) => t('targetArena', { n }),
            setFocus: t('setFocus'),
          })
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
            setEditorTarget({ keyId, keyLabel: label, x: event.clientX, y: event.clientY })
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
            {ability.category === 'targeting' && ability.id.startsWith('target:arena') ? (
              <g
                transform={`translate(${(w * KEY_UNIT - GAP) / 2}, ${(h * KEY_UNIT - GAP - CATEGORY_BAR) / 2})`}
                opacity={dimmed ? 0.3 : 1}
              >
                <circle r={13} fill="var(--cat-targeting)" opacity={0.25} />
                <circle r={13} fill="none" stroke="var(--cat-targeting)" strokeWidth={1.5} />
                <text
                  textAnchor="middle"
                  y={5.5}
                  fontSize={15}
                  fontWeight={800}
                  fill="var(--text)"
                >
                  {ability.id.slice(-1)}
                </text>
                <title>{abilityName ?? ''}</title>
              </g>
            ) : iconName ? (
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
        {ability &&
          ability.variantKind !== 'base' &&
          ability.category !== 'targeting' &&
          heatmap === 'none' && (
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
        {pinnedSlotIds.has(slotId) && heatmap === 'none' && (
          <g transform={`translate(${w * KEY_UNIT - GAP - 12}, ${h * KEY_UNIT - GAP - 14})`}>
            <circle r={8} fill="var(--panel)" opacity={0.95} />
            <text textAnchor="middle" y={3.5} fontSize={9}>
              🔒
            </text>
          </g>
        )}
        {keyPriorities[keyId] && heatmap === 'none' && !isBanned && (
          <g transform={`translate(12, ${h * KEY_UNIT - GAP - 14})`}>
            <circle
              r={8}
              fill={keyPriorities[keyId] === 'boost' ? 'var(--accent)' : 'var(--inset-strong)'}
              opacity={0.95}
            />
            <text
              textAnchor="middle"
              y={3.8}
              fontSize={11}
              fontWeight={800}
              fill={keyPriorities[keyId] === 'boost' ? 'var(--on-accent)' : 'var(--text-soft)'}
            >
              {keyPriorities[keyId] === 'boost' ? '↑' : '↓'}
            </text>
          </g>
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
          {editing && (
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
          )}
        </div>
      </div>
      {editMode && editing && (
        <div className="fade-in" style={{ margin: '0 0 12px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-soft)', margin: 0, flex: '1 1 320px' }}>
              {t('editKeysHint')}
            </p>
            <button className="pill" onClick={editing.onPinAll}>
              🔒 {t('editPinAll')}
            </button>
            <button className="pill" onClick={editing.onClearOverrides}>
              ↺ {t('editReset')}
            </button>
          </div>
          {(Object.keys(editing.pinnedBinds).length > 0 || editing.excludedAbilityIds.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {Object.entries(editing.pinnedBinds).map(([abilityId, slotId]) => (
                <span
                  key={abilityId}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 9px',
                    borderRadius: 9,
                    background: 'var(--inset)',
                    fontSize: '0.78rem',
                  }}
                >
                  🔒 {abilityDisplayName(abilityId)}
                  <b style={{ fontFamily: 'monospace' }}>{slotDisplayLabel(slotId)}</b>
                  <button
                    onClick={() => editing.onUnpinSlot(slotId)}
                    title={t('editUnpin')}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-faint)',
                      cursor: 'pointer',
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {editing.excludedAbilityIds.map((abilityId) => (
                <span
                  key={abilityId}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 9px',
                    borderRadius: 9,
                    background: 'var(--inset)',
                    fontSize: '0.78rem',
                    textDecoration: 'line-through',
                    color: 'var(--text-faint)',
                  }}
                >
                  {abilityDisplayName(abilityId)}
                  <button
                    onClick={() => editing.onRestoreAbility(abilityId)}
                    title={t('editRestore')}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      padding: 0,
                      lineHeight: 1,
                      textDecoration: 'none',
                    }}
                  >
                    ↺
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
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
      {editorTarget && editing && (
        <KeyEditorPopover
          target={editorTarget}
          layer={layer}
          editing={editing}
          abilities={abilities}
          assignments={assignments}
          spellMeta={spellMeta}
          isBanned={bannedKeys.has(editorTarget.keyId)}
          priority={keyPriorities[editorTarget.keyId] ?? null}
          abilityDisplayName={abilityDisplayName}
          slotDisplayLabel={slotDisplayLabel}
          onClose={() => setEditorTarget(null)}
        />
      )}
    </div>
  )
}

function KeyEditorPopover({
  target,
  layer,
  editing,
  abilities,
  assignments,
  spellMeta,
  isBanned,
  priority,
  abilityDisplayName,
  slotDisplayLabel,
  onClose,
}: {
  target: EditorTarget
  layer: Modifier
  editing: KeyboardEditing
  abilities: Ability[]
  assignments: BindAssignment[]
  spellMeta: SpellMetaShard
  isBanned: boolean
  priority: KeyPriority | null
  abilityDisplayName: (abilityId: string, spellId?: number) => string
  slotDisplayLabel: (slotId: string) => string
  onClose: () => void
}) {
  const t = useTranslations('results')
  const [search, setSearch] = useState('')
  const { ref, left, top } = useClampedOverlay(target.x, target.y, 312)
  const slotId = layer === 'none' ? target.keyId : `${layer}+${target.keyId}`
  const slotLabel = layer === 'none' ? target.keyLabel : `${layerLabel(layer)} + ${target.keyLabel}`
  const currentBind = assignments.find((assignment) => assignment.slotId === slotId)
  const currentAbility = currentBind
    ? abilities.find((ability) => ability.id === currentBind.abilityId)
    : undefined
  const isPinnedHere = currentAbility
    ? editing.pinnedBinds[currentAbility.id] === slotId
    : Object.values(editing.pinnedBinds).includes(slotId)
  const slotByAbility = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.abilityId, assignment.slotId])),
    [assignments],
  )
  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase()
    return abilities
      .map((ability) => ({ ability, name: abilityDisplayName(ability.id, ability.spellId) }))
      .filter(({ name }) => query === '' || name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 60)
  }, [abilities, search, abilityDisplayName])

  const sectionLabel = { fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 6px' }

  return (
    <div
      ref={ref}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: 'fixed',
        left,
        top,
        width: 312,
        zIndex: 70,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        boxShadow: '0 18px 44px rgba(0,0,0,0.45)',
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <b style={{ fontSize: '0.95rem' }}>{slotLabel}</b>
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', fontSize: '1rem', padding: 0 }}
        >
          ×
        </button>
      </div>
      {isBanned ? (
        <button className="action" data-primary onClick={() => { editing.onToggleKeyBan(target.keyId); onClose() }}>
          {t('editUnbanKey')}
        </button>
      ) : (
        <>
          <p style={sectionLabel}>{t('editPriority')}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <button
              className="pill"
              data-active={priority === 'boost'}
              onClick={() => editing.onSetKeyPriority(target.keyId, priority === 'boost' ? null : 'boost')}
            >
              ↑ {t('editPriorityUp')}
            </button>
            <button
              className="pill"
              data-active={priority === 'lower'}
              onClick={() => editing.onSetKeyPriority(target.keyId, priority === 'lower' ? null : 'lower')}
            >
              ↓ {t('editPriorityDown')}
            </button>
            <button
              className="pill"
              onClick={() => { editing.onToggleKeyBan(target.keyId); onClose() }}
              style={{ color: 'var(--danger)' }}
            >
              ⛔ {t('editBanKey')}
            </button>
          </div>
          <p style={sectionLabel}>{t('editCurrentBind')}</p>
          {currentAbility ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <AbilityIcon ability={currentAbility} spellMeta={spellMeta} />
              <span style={{ fontSize: '0.86rem', flex: 1, minWidth: 120 }}>
                {abilityDisplayName(currentAbility.id, currentAbility.spellId)}
              </span>
              {isPinnedHere ? (
                <button className="pill" onClick={() => editing.onUnpinSlot(slotId)}>
                  {t('editUnpin')}
                </button>
              ) : (
                <button className="pill" onClick={() => editing.onPinAbility(currentAbility.id, slotId)}>
                  🔒 {t('editPin')}
                </button>
              )}
              <button
                className="pill"
                onClick={() => { editing.onExcludeAbility(currentAbility.id); onClose() }}
                style={{ color: 'var(--danger)' }}
              >
                {t('editExclude')}
              </button>
            </div>
          ) : (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-faint)', margin: '0 0 12px' }}>
              {isPinnedHere ? `🔒 ${t('editUnpin')}` : t('editEmptySlot')}
              {isPinnedHere && (
                <button className="pill" style={{ marginLeft: 8 }} onClick={() => editing.onUnpinSlot(slotId)}>
                  {t('editUnpin')}
                </button>
              )}
            </p>
          )}
          <p style={sectionLabel}>{t('editAssign')}</p>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('editSearch')}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '7px 10px',
              borderRadius: 9,
              border: '1px solid var(--border)',
              background: 'var(--inset)',
              color: 'var(--text)',
              fontSize: '0.84rem',
              marginBottom: 8,
            }}
          />
          <div style={{ maxHeight: 210, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {candidates.map(({ ability, name }) => {
              const assignedSlot = slotByAbility.get(ability.id)
              const pinned = editing.pinnedBinds[ability.id] !== undefined
              return (
                <button
                  key={ability.id}
                  onClick={() => { editing.onPinAbility(ability.id, slotId); onClose() }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 6px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '0.84rem',
                  }}
                  onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--inset)' }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent' }}
                >
                  <AbilityIcon ability={ability} spellMeta={spellMeta} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pinned ? '🔒 ' : ''}
                    {name}
                  </span>
                  {assignedSlot && (
                    <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-faint)' }}>
                      {slotDisplayLabel(assignedSlot)}
                    </span>
                  )}
                </button>
              )
            })}
            {candidates.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-faint)', margin: 0 }}>{t('editNoResults')}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function AbilityIcon({ ability, spellMeta }: { ability: Ability; spellMeta: SpellMetaShard }) {
  const icon = abilityIconName(ability.spellId, ability.id, spellMeta[String(ability.spellId)]?.icon)
  if (!icon) {
    return <span style={{ width: 22, textAlign: 'center', flexShrink: 0 }}>🎯</span>
  }
  return (
    <img
      src={spellIconUrl(icon)}
      alt=""
      width={22}
      height={22}
      loading="lazy"
      style={{ borderRadius: 6, flexShrink: 0 }}
    />
  )
}

function layerLabel(layer: Modifier): string {
  if (layer === 'shift') return 'Shift'
  if (layer === 'ctrl') return 'Ctrl'
  return 'Alt'
}

function iconSize(w: number, h: number): number {
  return Math.min(40, Math.min(w, h) * KEY_UNIT - GAP - CATEGORY_BAR - 10)
}

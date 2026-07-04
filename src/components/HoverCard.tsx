'use client'

import { useTranslations } from 'next-intl'
import type { Ability, BindAssignment, Slot } from '@/core/model/ability'
import { spellIconUrl } from '@/lib/data'

export interface HoverInfo {
  ability: Ability
  bind: BindAssignment
  slot: Slot
  name: string
  description: string
  icon: string | null
  partners: Array<{ name: string; slotLabel: string }>
  x: number
  y: number
}

export function HoverCard({ info }: { info: HoverInfo }) {
  const t = useTranslations('hover')
  const tCat = useTranslations('categories')
  const tierLabel =
    info.slot.accessibility >= 0.75
      ? 'S'
      : info.slot.accessibility >= 0.6
        ? 'A'
        : info.slot.accessibility >= 0.4
          ? 'B'
          : 'C'

  const reasons: string[] = []
  if (info.ability.reactivity >= 0.9) reasons.push(t('reasonReactive'))
  if (info.ability.panic >= 0.95) reasons.push(t('reasonPanic'))
  if (info.ability.frequency >= 0.5) reasons.push(t('reasonFrequent'))
  if (info.slot.modifier === 'none' && info.slot.accessibility >= 0.75) reasons.push(t('reasonSTier'))
  if (info.bind.constraintNotes.includes('locked')) reasons.push(t('reasonLocked'))
  if (info.ability.variantKind === 'focus') reasons.push(t('reasonFocusVariant'))
  if (info.ability.variantKind.startsWith('arena')) reasons.push(t('reasonArenaVariant'))
  if (info.bind.synergyScore > 0.01) reasons.push(t('reasonSynergy'))

  const left = Math.min(info.x + 16, typeof window !== 'undefined' ? window.innerWidth - 340 : info.x)
  const top = Math.min(info.y + 16, typeof window !== 'undefined' ? window.innerHeight - 260 : info.y)

  return (
    <div
      className="overlay-card"
      style={{
        position: 'fixed',
        left,
        top,
        width: 320,
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        {info.icon && (
          <img
            src={spellIconUrl(info.icon)}
            alt=""
            width={40}
            height={40}
            style={{ borderRadius: 10 }}
          />
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{info.name}</div>
          <div style={{ fontSize: '0.8rem', color: `var(--cat-${info.ability.category})`, fontWeight: 600 }}>
            {tCat(info.ability.category)}
          </div>
        </div>
      </div>
      {info.description && (
        <p
          style={{
            fontSize: '0.82rem',
            color: 'var(--text-soft)',
            marginBottom: 10,
            maxHeight: 96,
            overflow: 'hidden',
            whiteSpace: 'pre-line',
          }}
        >
          {info.description}
        </p>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="pill">{t('keyTier', { tier: tierLabel })}</span>
        <span className="pill">
          {t('marginal', { value: (info.bind.linearScore + info.bind.synergyScore).toFixed(2) })}
        </span>
      </div>
      {reasons.length > 0 && (
        <ul style={{ fontSize: '0.8rem', color: 'var(--text-soft)', paddingLeft: 18 }}>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {info.partners.length > 0 && (
        <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-faint)' }}>
          {t('partners')}: {info.partners.map((p) => `${p.name} (${p.slotLabel})`).join(', ')}
        </div>
      )}
    </div>
  )
}

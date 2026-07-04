'use client'

import type { ReactNode } from 'react'

interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 4,
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius-control)',
        padding: 4,
        flexWrap: 'wrap',
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          style={{
            padding: '8px 16px',
            borderRadius: 9,
            fontSize: '0.88rem',
            fontWeight: 500,
            background: option.value === value ? 'var(--surface-1)' : 'transparent',
            color: option.value === value ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: option.value === value ? 'var(--shadow-1)' : 'none',
            transition: 'all 0.15s ease-out',
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function ChipToggle({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  title?: string
}) {
  return (
    <button className="chip" data-active={active} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

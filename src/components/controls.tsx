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
    <div className="seg">
      {options.map((option) => (
        <button
          key={option.value}
          className="seg-item"
          data-active={option.value === value}
          onClick={() => onChange(option.value)}
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
    <button className="pill" data-active={active} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

'use client'

import { useLayoutEffect, useRef, useState } from 'react'

export function useClampedOverlay(x: number, y: number, width: number) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ left: x + 16, top: y + 16 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof window === 'undefined') {
      setPosition({ left: x + 16, top: y + 16 })
      return
    }
    const height = element.offsetHeight
    const left = Math.max(8, Math.min(x + 16, window.innerWidth - width - 12))
    let top = y + 16
    if (top + height > window.innerHeight - 12) {
      top = y - height - 12
    }
    top = Math.min(top, window.innerHeight - height - 12)
    top = Math.max(8, top)
    setPosition({ left, top })
  }, [x, y, width])

  return { ref, ...position }
}

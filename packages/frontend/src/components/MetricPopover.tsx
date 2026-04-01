import { useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import type { PopoverSection } from '../hooks/useMetrics.ts'

interface Props {
  visible: boolean
  anchor: HTMLElement | null
  sections: PopoverSection[]
}

export function MetricPopover({ visible, anchor, sections }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!visible || !anchor || !ref.current) return
    const el = ref.current
    const rect = anchor.getBoundingClientRect()
    const elW = el.offsetWidth
    const elH = el.offsetHeight

    // Position above the card, centered horizontally
    let left = rect.left + rect.width / 2 - elW / 2
    let top = rect.top - elH - 8

    // Clamp horizontal
    left = Math.max(8, Math.min(left, window.innerWidth - elW - 8))

    // Flip below if no room above
    if (top < 8) {
      top = rect.bottom + 8
    }

    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [visible, anchor, sections])

  if (!visible || !anchor || sections.length === 0) return null

  return createPortal(
    <div
      ref={ref}
      className={`metric-popover${visible ? ' visible' : ''}`}
    >
      {sections.map((s, i) => (
        <div key={i} className="metric-popover-section">
          {s.heading && (
            <div className="metric-popover-heading">{s.heading}</div>
          )}
          <ul>
            {s.lines.map((line, j) => (
              <li key={j}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>,
    document.body,
  )
}

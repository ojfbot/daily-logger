import { useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  visible: boolean
  anchor: HTMLElement | null
  resolution?: string
  closedDate?: string
}

export function ActionPopover({ visible, anchor, resolution, closedDate }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!visible || !anchor || !popoverRef.current) return

    const el = popoverRef.current
    const rect = anchor.getBoundingClientRect()
    const popW = el.offsetWidth
    const popH = el.offsetHeight
    const gap = 8

    // Try left-positioning: right edge of popover at left edge of anchor
    const leftX = rect.left - popW - gap
    if (leftX >= 12) {
      el.style.left = `${leftX}px`
      el.style.top = `${rect.top + rect.height / 2 - popH / 2}px`
    } else {
      // Fallback: above, centered
      el.style.left = `${Math.max(12, rect.left + rect.width / 2 - popW / 2)}px`
      el.style.top = `${rect.top - popH - gap}px`
    }
  }, [visible, anchor])

  if (!visible || !anchor || (!resolution && !closedDate)) return null

  return createPortal(
    <div ref={popoverRef} className="action-popover">
      <div className="action-popover-type">RESOLVED</div>
      {resolution && <div className="action-popover-resolution">{resolution}</div>}
      {closedDate && <div className="action-popover-date">Closed {closedDate}</div>}
    </div>,
    document.body,
  )
}

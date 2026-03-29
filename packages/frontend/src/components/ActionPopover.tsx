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
    const isMobile = window.innerWidth < 600

    // On mobile, CSS handles positioning as a bottom sheet
    if (isMobile) {
      el.style.left = ''
      el.style.top = ''
      return
    }

    const rect = anchor.getBoundingClientRect()
    const popW = el.offsetWidth
    const popH = el.offsetHeight
    const gap = 8

    // Try left-positioning: right edge of popover at left edge of anchor
    const leftX = rect.left - popW - gap
    if (leftX >= 12) {
      el.style.left = `${leftX}px`
      el.style.top = `${Math.max(12, Math.min(rect.top + rect.height / 2 - popH / 2, window.innerHeight - popH - 12))}px`
    } else {
      // Fallback: above, centered
      el.style.left = `${Math.max(12, Math.min(rect.left + rect.width / 2 - popW / 2, window.innerWidth - popW - 12))}px`
      el.style.top = `${Math.max(12, rect.top - popH - gap)}px`
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

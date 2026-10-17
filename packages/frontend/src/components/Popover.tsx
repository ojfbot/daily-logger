import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { TYPE_LABELS, type CodeReferenceType } from '../utils/codeRefUtils.ts'
import type { CacheEntry, CommitData, PRData } from '../hooks/useGithubCache.ts'
import type { TimeReference } from '../../../../src/time-reference-schema.ts'
import type { ClockDisplay } from '../utils/timeDisplay.ts'
import { TimePopoverContent } from './TimePopoverContent.tsx'

export interface PopoverState {
  visible: boolean
  anchor: HTMLElement | null
  variant:
    | { kind: 'ref'; type: CodeReferenceType; label: string; detail: string; url: string | null }
    | { kind: 'commit'; entry: CacheEntry<CommitData>; text: string; repo: string }
    | { kind: 'pr'; entry: CacheEntry<PRData>; repo: string; number: number }
    | { kind: 'time'; reference: TimeReference; viewer: ClockDisplay; tooltipId: string }
}

export function Popover({ state, onMouseEnter, onMouseLeave }: { state: PopoverState; onMouseEnter?: () => void; onMouseLeave?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!state.visible || !state.anchor || !ref.current) return
    const pop = ref.current
    const anchor = state.anchor
    const reposition = () => positionPopover(pop, anchor)
    reposition()
    if (onMouseEnter) pop.addEventListener('mouseenter', onMouseEnter)
    if (onMouseLeave) pop.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      if (onMouseEnter) pop.removeEventListener('mouseenter', onMouseEnter)
      if (onMouseLeave) pop.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [state, onMouseEnter, onMouseLeave])

  if (!state.visible || !state.anchor) return null

  const { variant } = state

  let typeBadge: string
  let typeClass: string
  let sha: string
  let message = ''
  let messageClass = 'commit-popover-message'
  let prLine = ''
  let meta = ''
  let url = ''

  if (variant.kind === 'time') {
    typeBadge = ''; typeClass = ''; sha = ''
  } else if (variant.kind === 'ref') {
    typeBadge = TYPE_LABELS[variant.type]
    typeClass = `ref-type-${variant.type}`
    sha = variant.label
    meta = variant.detail
    url = variant.url ?? ''
  } else if (variant.kind === 'commit') {
    typeBadge = 'COMMIT'
    typeClass = 'ref-type-commit'
    const { entry } = variant
    if (entry.status === 'loading') {
      sha = variant.text; message = 'Loading...'; messageClass += ' commit-popover-loading'; meta = variant.repo
    } else if (entry.status === 'error') {
      sha = variant.text; message = entry.message; messageClass += ' commit-popover-error'; meta = variant.repo
    } else {
      const d = entry.data
      sha = d.sha.slice(0, 7); message = d.message
      if (d.pr) prLine = `#${d.pr.number}${d.pr.title ? ` — ${d.pr.title}` : ''}`
      const dateStr = d.date ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
      meta = `ojfbot/${d.repo}${dateStr ? ` · ${dateStr}` : ''}`
      url = d.url
    }
  } else {
    typeBadge = 'PULL REQUEST'
    typeClass = 'ref-type-pr'
    const { entry } = variant
    if (entry.status === 'loading') {
      sha = `#${variant.number}`; message = 'Loading...'; messageClass += ' commit-popover-loading'; meta = `ojfbot/${variant.repo}`
    } else if (entry.status === 'error') {
      sha = `#${variant.number}`; message = entry.message; messageClass += ' commit-popover-error'; meta = `ojfbot/${variant.repo}`
    } else {
      const d = entry.data
      sha = `#${d.number}`; message = d.title
      const stateBadge = d.merged ? 'merged' : d.state
      const diffStr = (d.additions || d.deletions) ? ` · +${d.additions} −${d.deletions}` : ''
      prLine = `${stateBadge}${diffStr}`
      const dateStr = d.date ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
      meta = `ojfbot/${d.repo}${dateStr ? ` · ${dateStr}` : ''}${d.author ? ` · ${d.author}` : ''}`
      url = d.url
    }
  }

  const popover = (
    <div
      ref={ref}
      className={`commit-popover visible${variant.kind === 'time' ? ' time-popover' : ''}`}
      id={variant.kind === 'time' ? variant.tooltipId : undefined}
      role="tooltip"
      data-url={url}
      onClick={() => { if (url) window.open(url, '_blank', 'noopener') }}
    >
      {variant.kind === 'time' ? <TimePopoverContent reference={variant.reference} viewer={variant.viewer} /> : <>
      <div className={`commit-popover-type ${typeClass}`}>{typeBadge}</div>
      <div className="commit-popover-sha">{sha}</div>
      {message && <div className={messageClass}>{message}</div>}
      {prLine && <div className="commit-popover-pr">{prLine}</div>}
      <div className="commit-popover-meta">{meta}</div>
      </>}
    </div>
  )

  return createPortal(popover, document.body)
}

function positionPopover(pop: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect()
  const gap = 8

  pop.style.left = '-9999px'
  pop.style.top = '-9999px'
  pop.style.maxHeight = `${window.innerHeight - 24}px`
  const popRect = pop.getBoundingClientRect()

  const above = Math.max(0, rect.top - gap - 12)
  const below = Math.max(0, window.innerHeight - rect.bottom - gap - 12)
  const placeAbove = above >= popRect.height || above >= below
  const available = placeAbove ? above : below
  pop.style.maxHeight = `${Math.max(1, available)}px`
  const height = Math.min(popRect.height, available)
  const top = placeAbove ? rect.top - height - gap : rect.bottom + gap

  let left = rect.left + rect.width / 2 - popRect.width / 2
  left = Math.max(12, Math.min(left, window.innerWidth - popRect.width - 12))

  pop.style.top = `${top}px`
  pop.style.left = `${left}px`
}

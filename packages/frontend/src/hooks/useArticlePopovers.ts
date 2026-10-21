import { useEffect, useId, useRef, useState, useCallback } from 'react'
import type { TimeReferenceInput } from '../../../../src/time-reference-schema.ts'
import type { ShipmentTime } from '../../../../src/shipment-times.ts'
import type { IssueTime } from '../../../../src/issue-times.ts'
import type { CodeReference } from '../store/types.ts'
import { findCodeElements, resolveRef, PR_LINK_RE } from '../utils/codeRefUtils.ts'
import { useGithubCache } from './useGithubCache.ts'
import type { PopoverState } from '../components/Popover.tsx'
import { attachTimeReferences, type TimePopoverReference } from '../utils/timeReferences.ts'
import { attachShipmentTimes, shipmentTimeReference } from '../utils/shipmentTimes.ts'
import { attachIssueTimes, issueTimeReference } from '../utils/issueTimes.ts'
import { scanVisibleTimeText } from '../../../../src/time-reference-text.ts'
import { scanTimeExpressions } from '../../../../src/time-expression-text.ts'

const SHOW_DELAY = 200
const EMPTY_SHIPMENT_TIMES: ShipmentTime[] = []
const EMPTY_ISSUE_TIMES: IssueTime[] = []

export function useArticlePopovers(
  contentRef: React.RefObject<HTMLDivElement | null>,
  codeReferences: CodeReference[],
  reposActive: string[],
  timeReferences: TimeReferenceInput[],
  contentRevision?: string,
  shipmentTimes: ShipmentTime[] = EMPTY_SHIPMENT_TIMES,
  issueTimes: IssueTime[] = EMPTY_ISSUE_TIMES,
) {
  const [popover, setPopover] = useState<PopoverState>({ visible: false, anchor: null, variant: { kind: 'ref', type: 'config', label: '', detail: '', url: null } })
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeAnchor = useRef<HTMLElement | null>(null)
  const pinnedAnchor = useRef<HTMLElement | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useId()
  const { getCommit, getPR, cacheRevision } = useGithubCache()

  const hidePopover = useCallback(() => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null }
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    activeAnchor.current?.setAttribute('aria-expanded', 'false')
    activeAnchor.current?.removeAttribute('aria-describedby')
    activeAnchor.current = null
    pinnedAnchor.current = null
    setPopover(p => p.visible || p.anchor ? { ...p, visible: false, anchor: null } : p)
  }, [])

  const keepOpen = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
  }, [])

  const scheduleHide = useCallback(() => {
    if (pinnedAnchor.current || activeAnchor.current?.matches(':focus-visible')) return
    keepOpen()
    hideTimer.current = setTimeout(hidePopover, 180)
  }, [hidePopover, keepOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || (event.key === 'Tab' && pinnedAnchor.current)) hidePopover()
    }
    const onOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (activeAnchor.current?.contains(event.target) || document.getElementById(tooltipId)?.contains(event.target)) return
      hidePopover()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onOutside)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onOutside)
      hidePopover()
    }
  }, [hidePopover, tooltipId])

  useEffect(() => {
    const anchor = activeAnchor.current
    if (anchor && (!anchor.isConnected || !contentRef.current?.contains(anchor))) hidePopover()
  })

  useEffect(() => {
    setPopover((current) => {
      if (!current.visible) return current
      if (!current.anchor?.isConnected || !contentRef.current?.contains(current.anchor)) {
        activeAnchor.current = null
        return { ...current, visible: false, anchor: null }
      }
      if (current.variant.kind === 'commit') {
        const latest = getCommit(current.variant.repo, current.variant.text)
        return latest === current.variant.entry
          ? current
          : { ...current, variant: { ...current.variant, entry: latest } }
      }
      if (current.variant.kind === 'pr') {
        const latest = getPR(current.variant.repo, current.variant.number, current.variant.sourceKind)
        return latest === current.variant.entry
          ? current
          : { ...current, variant: { ...current.variant, entry: latest } }
      }
      return current
    })
  }, [cacheRevision, contentRef, getCommit, getPR])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const refsIndex = new Map<string, CodeReference>()
    for (const ref of codeReferences) refsIndex.set(ref.text, ref)

    const codeRefEls = findCodeElements(el, refsIndex, reposActive)
    const cleanups: (() => void)[] = []

    for (const { element, ref } of codeRefEls) {
      // Clock tokens have their own evidence gate, including when Markdown uses inline code.
      if (scanVisibleTimeText(ref.text).some(token => token.text === ref.text) || scanTimeExpressions(ref.text).some(expression => expression.text === ref.text)) continue
      element.classList.add('code-ref', `ref-type-${ref.type}`)
      element.dataset.refType = ref.type
      if (ref.repo) element.dataset.repo = ref.repo
      if (ref.type === 'commit') element.classList.add('commit-hash')

      const onEnter = () => {
        hidePopover()
        activeAnchor.current = element
        if (ref.type === 'commit' && ref.repo) {
          const entry = getCommit(ref.repo, ref.text)
          if (entry.status === 'ok') {
            setPopover({ visible: true, anchor: element, variant: { kind: 'commit', entry, text: ref.text, repo: ref.repo } })
            return
          }
          showTimer.current = setTimeout(() => {
            if (activeAnchor.current !== element || !element.isConnected || !el.contains(element)) return
            const latest = getCommit(ref.repo!, ref.text)
            setPopover({ visible: true, anchor: element, variant: { kind: 'commit', entry: latest, text: ref.text, repo: ref.repo! } })
          }, SHOW_DELAY)
        } else {
          showTimer.current = setTimeout(() => {
            if (activeAnchor.current !== element || !element.isConnected || !el.contains(element)) return
            const resolved = resolveRef(ref)
            setPopover({ visible: true, anchor: element, variant: { kind: 'ref', type: ref.type, label: resolved.label, detail: resolved.detail, url: resolved.url } })
          }, SHOW_DELAY)
        }
      }

      const onLeave = () => hidePopover()

      const onClick = (e: MouseEvent) => {
        const resolved = resolveRef(ref)
        if (resolved.url) { e.preventDefault(); window.open(resolved.url, '_blank', 'noopener') }
      }

      element.addEventListener('mouseenter', onEnter)
      element.addEventListener('mouseleave', onLeave)
      element.addEventListener('click', onClick)
      cleanups.push(() => {
        element.removeEventListener('mouseenter', onEnter)
        element.removeEventListener('mouseleave', onLeave)
        element.removeEventListener('click', onClick)
      })
    }

    // PR link popovers
    const prLinks = el.querySelectorAll('a[href*="github.com/ojfbot"]')
    for (const link of prLinks) {
      const href = (link as HTMLAnchorElement).href
      const match = href.match(PR_LINK_RE)
      if (!match) continue

      const repo = match[1]
      const sourceKind = match[2] === 'issues' ? 'issues' : 'pull'
      if (sourceKind === 'issues' && match[4] && !match[4].startsWith('issuecomment-')) continue
      const prNumber = parseInt(match[3], 10)
      const prEl = link as HTMLElement
      prEl.classList.add('code-ref', sourceKind === 'issues' ? 'ref-type-issue' : 'ref-type-pr')

      const onEnter = () => {
        hidePopover()
        activeAnchor.current = prEl
        const entry = getPR(repo, prNumber, sourceKind)
        if (entry.status === 'ok') {
          setPopover({ visible: true, anchor: prEl, variant: { kind: 'pr', entry, repo, number: prNumber, sourceKind, targetUrl: href } })
          return
        }
        showTimer.current = setTimeout(() => {
          if (activeAnchor.current !== prEl || !prEl.isConnected || !el.contains(prEl)) return
          const latest = getPR(repo, prNumber, sourceKind)
          setPopover({ visible: true, anchor: prEl, variant: { kind: 'pr', entry: latest, repo, number: prNumber, sourceKind, targetUrl: href } })
        }, SHOW_DELAY)
      }

      const onLeave = () => hidePopover()

      prEl.addEventListener('mouseenter', onEnter)
      prEl.addEventListener('mouseleave', onLeave)
      cleanups.push(() => {
        prEl.removeEventListener('mouseenter', onEnter)
        prEl.removeEventListener('mouseleave', onLeave)
      })
    }

    return () => cleanups.forEach(fn => fn())
  }, [contentRef, codeReferences, reposActive, getCommit, getPR, hidePopover, contentRevision])

  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    const proseTimes = attachTimeReferences(root, timeReferences)
    const shipmentStates = attachShipmentTimes(root, shipmentTimes)
    const issueStates = attachIssueTimes(root, issueTimes)
    const show = (element: HTMLButtonElement, reference: TimePopoverReference) => {
        if (!element.isConnected || !root.contains(element)) return
        hidePopover()
        activeAnchor.current = element
        element.setAttribute('aria-describedby', tooltipId)
        element.setAttribute('aria-expanded', 'true')
        setPopover({ visible: true, anchor: element, variant: {
          kind: 'time', reference, tooltipId,
        } })
    }
    const cleanups = proseTimes.attached.map(({ element, reference }) => {
      const enter = () => {
        keepOpen()
        if (activeAnchor.current === element) return
        hidePopover()
        activeAnchor.current = element
        showTimer.current = setTimeout(() => {
          if (activeAnchor.current === element) show(element, reference)
        }, SHOW_DELAY)
      }
      const leave = () => {
        if (showTimer.current) { hidePopover(); return }
        scheduleHide()
      }
      const focus = () => { if (element.matches(':focus-visible')) show(element, reference) }
      const blur = (event: FocusEvent) => {
        const next = event.relatedTarget
        const popover = document.getElementById(tooltipId)
        // Clicking nonfocusable map content blurs the trigger to the document body.
        if (pinnedAnchor.current === element && (next === null || (next instanceof Node && popover?.contains(next)))) return
        hidePopover()
      }
      const click = () => {
        if (pinnedAnchor.current === element) { hidePopover(); return }
        show(element, reference)
        pinnedAnchor.current = element
      }
      element.addEventListener('mouseenter', enter)
      element.addEventListener('mouseleave', leave)
      element.addEventListener('focus', focus)
      element.addEventListener('blur', blur)
      element.addEventListener('click', click)
      return () => {
        element.removeEventListener('mouseenter', enter)
        element.removeEventListener('mouseleave', leave)
        element.removeEventListener('focus', focus)
        element.removeEventListener('blur', blur)
        element.removeEventListener('click', click)
      }
    })
    const shipmentByUrl = new Map(shipmentTimes.flatMap((shipment) => shipment.status === 'available' ? [[shipment.source.url, shipment] as const] : []))
    const issueByUrl = new Map(issueTimes.map((issue) => [issue.source.url, issue]))
    const shipmentTarget = (event: Event): { element: HTMLButtonElement; reference: TimePopoverReference } | undefined => {
      if (!(event.target instanceof Element)) return undefined
      const element = event.target.closest<HTMLButtonElement>('.shipment-time-ref, .issue-time-ref')
      if (!element || !root.contains(element)) return undefined
      const shipmentUrl = element.closest<HTMLElement>('.shipment-time-state')?.dataset.shipmentUrl
      const shipment = shipmentUrl ? shipmentByUrl.get(shipmentUrl) : undefined
      if (shipment) return { element, reference: { reference: shipmentTimeReference(shipment), certainty: 'exact' } }
      const issueUrl = element.closest<HTMLElement>('.issue-time-state')?.dataset.issueUrl
      const issue = issueUrl ? issueByUrl.get(issueUrl) : undefined
      return issue ? { element, reference: { reference: issueTimeReference(issue), certainty: 'exact' } } : undefined
    }
    const onShipmentOver = (event: MouseEvent) => {
      const target = shipmentTarget(event)
      if (!target || (event.relatedTarget instanceof Node && target.element.contains(event.relatedTarget))) return
      keepOpen()
      if (activeAnchor.current === target.element) return
      hidePopover()
      activeAnchor.current = target.element
      showTimer.current = setTimeout(() => {
        if (activeAnchor.current === target.element) show(target.element, target.reference)
      }, SHOW_DELAY)
    }
    const onShipmentOut = (event: MouseEvent) => {
      const target = shipmentTarget(event)
      if (!target || (event.relatedTarget instanceof Node && target.element.contains(event.relatedTarget))) return
      if (showTimer.current) { hidePopover(); return }
      scheduleHide()
    }
    const onShipmentFocus = (event: FocusEvent) => {
      const target = shipmentTarget(event)
      if (target) show(target.element, target.reference)
    }
    const onShipmentBlur = (event: FocusEvent) => {
      const target = shipmentTarget(event)
      if (!target) return
      const next = event.relatedTarget
      const popover = document.getElementById(tooltipId)
      if (pinnedAnchor.current === target.element && (next === null || (next instanceof Node && popover?.contains(next)))) return
      hidePopover()
    }
    const onShipmentClick = (event: MouseEvent) => {
      const target = shipmentTarget(event)
      if (!target) return
      if (pinnedAnchor.current === target.element) { hidePopover(); return }
      show(target.element, target.reference)
      pinnedAnchor.current = target.element
    }
    root.addEventListener('mouseover', onShipmentOver)
    root.addEventListener('mouseout', onShipmentOut)
    root.addEventListener('focusin', onShipmentFocus)
    root.addEventListener('focusout', onShipmentBlur)
    root.addEventListener('click', onShipmentClick)
    return () => {
      root.removeEventListener('mouseover', onShipmentOver)
      root.removeEventListener('mouseout', onShipmentOut)
      root.removeEventListener('focusin', onShipmentFocus)
      root.removeEventListener('focusout', onShipmentBlur)
      root.removeEventListener('click', onShipmentClick)
      cleanups.forEach(cleanup => cleanup())
      hidePopover()
      shipmentStates.restore()
      issueStates.restore()
      proseTimes.restore()
    }
  }, [contentRef, timeReferences, shipmentTimes, issueTimes, contentRevision, hidePopover, keepOpen, scheduleHide, tooltipId])

  return { state: popover, keepOpen, scheduleHide }
}

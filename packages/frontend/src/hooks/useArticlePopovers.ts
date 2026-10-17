import { useEffect, useId, useRef, useState, useCallback } from 'react'
import type { TimeReference } from '../../../../src/time-reference-schema.ts'
import type { CodeReference } from '../store/types.ts'
import { findCodeElements, resolveRef, PR_LINK_RE } from '../utils/codeRefUtils.ts'
import { useGithubCache } from './useGithubCache.ts'
import type { PopoverState } from '../components/Popover.tsx'
import { attachTimeReferences } from '../utils/timeReferences.ts'
import { viewerClock } from '../utils/timeDisplay.ts'
import { scanVisibleTimeText } from '../../../../src/time-reference-text.ts'

const SHOW_DELAY = 200

export function useArticlePopovers(
  contentRef: React.RefObject<HTMLDivElement | null>,
  codeReferences: CodeReference[],
  reposActive: string[],
  timeReferences: TimeReference[],
  bodyHtml?: string,
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
        const latest = getPR(current.variant.repo, current.variant.number)
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
      if (scanVisibleTimeText(ref.text).some(token => token.text === ref.text)) continue
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
      const prNumber = parseInt(match[3], 10)
      const prEl = link as HTMLElement
      prEl.classList.add('code-ref', 'ref-type-pr')

      const onEnter = () => {
        hidePopover()
        activeAnchor.current = prEl
        const entry = getPR(repo, prNumber)
        if (entry.status === 'ok') {
          setPopover({ visible: true, anchor: prEl, variant: { kind: 'pr', entry, repo, number: prNumber } })
          return
        }
        showTimer.current = setTimeout(() => {
          if (activeAnchor.current !== prEl || !prEl.isConnected || !el.contains(prEl)) return
          const latest = getPR(repo, prNumber)
          setPopover({ visible: true, anchor: prEl, variant: { kind: 'pr', entry: latest, repo, number: prNumber } })
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
  }, [contentRef, codeReferences, reposActive, getCommit, getPR, hidePopover, bodyHtml])

  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    const { attached, restore } = attachTimeReferences(root, timeReferences)
    const cleanups = attached.map(({ element, reference }) => {
      const show = () => {
        if (!element.isConnected || !root.contains(element)) return
        hidePopover()
        activeAnchor.current = element
        element.setAttribute('aria-describedby', tooltipId)
        element.setAttribute('aria-expanded', 'true')
        setPopover({ visible: true, anchor: element, variant: {
          kind: 'time', reference, tooltipId, viewer: viewerClock(new Date(reference.at), reference.precision),
        } })
      }
      const enter = () => {
        keepOpen()
        if (activeAnchor.current === element) return
        hidePopover()
        activeAnchor.current = element
        showTimer.current = setTimeout(() => {
          if (activeAnchor.current === element) show()
        }, SHOW_DELAY)
      }
      const leave = () => {
        if (showTimer.current) { hidePopover(); return }
        scheduleHide()
      }
      const focus = () => { if (element.matches(':focus-visible')) show() }
      const blur = (event: FocusEvent) => {
        const next = event.relatedTarget
        const popover = document.getElementById(tooltipId)
        // Clicking nonfocusable map content blurs the trigger to the document body.
        if (pinnedAnchor.current === element && (next === null || (next instanceof Node && popover?.contains(next)))) return
        hidePopover()
      }
      const click = () => {
        if (pinnedAnchor.current === element) { hidePopover(); return }
        show()
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
    return () => { cleanups.forEach(cleanup => cleanup()); hidePopover(); restore() }
  }, [contentRef, timeReferences, bodyHtml, hidePopover, keepOpen, scheduleHide, tooltipId])

  return { state: popover, keepOpen, scheduleHide }
}

import { useEffect, useRef, useState, useCallback } from 'react'
import type { CodeReference } from '../store/types.ts'
import { findCodeElements, resolveRef, PR_LINK_RE } from '../utils/codeRefUtils.ts'
import { useGithubCache } from './useGithubCache.ts'
import type { PopoverState } from '../components/Popover.tsx'

const SHOW_DELAY = 200

export function useArticlePopovers(
  contentRef: React.RefObject<HTMLDivElement | null>,
  codeReferences: CodeReference[],
  reposActive: string[],
) {
  const [popover, setPopover] = useState<PopoverState>({ visible: false, anchor: null, variant: { kind: 'ref', type: 'config', label: '', detail: '', url: null } })
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeAnchor = useRef<HTMLElement | null>(null)
  const { getCommit, getPR } = useGithubCache()

  const hidePopover = useCallback(() => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null }
    activeAnchor.current = null
    setPopover(p => ({ ...p, visible: false }))
  }, [])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const refsIndex = new Map<string, CodeReference>()
    for (const ref of codeReferences) refsIndex.set(ref.text, ref)

    const codeRefEls = findCodeElements(el, refsIndex, reposActive)
    const cleanups: (() => void)[] = []

    for (const { element, ref } of codeRefEls) {
      element.classList.add('code-ref', `ref-type-${ref.type}`)
      element.dataset.refType = ref.type
      if (ref.repo) element.dataset.repo = ref.repo
      if (ref.type === 'commit') element.classList.add('commit-hash')

      const onEnter = () => {
        if (ref.type === 'commit' && ref.repo) {
          const entry = getCommit(ref.repo, ref.text)
          if (entry.status === 'ok') {
            activeAnchor.current = element
            setPopover({ visible: true, anchor: element, variant: { kind: 'commit', entry, text: ref.text, repo: ref.repo } })
            return
          }
          showTimer.current = setTimeout(() => {
            activeAnchor.current = element
            const latest = getCommit(ref.repo!, ref.text)
            setPopover({ visible: true, anchor: element, variant: { kind: 'commit', entry: latest, text: ref.text, repo: ref.repo! } })
          }, SHOW_DELAY)
        } else {
          showTimer.current = setTimeout(() => {
            activeAnchor.current = element
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
        const entry = getPR(repo, prNumber)
        if (entry.status === 'ok') {
          activeAnchor.current = prEl
          setPopover({ visible: true, anchor: prEl, variant: { kind: 'pr', entry, repo, number: prNumber } })
          return
        }
        showTimer.current = setTimeout(() => {
          activeAnchor.current = prEl
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
  }, [contentRef, codeReferences, reposActive, getCommit, getPR, hidePopover])

  return popover
}

import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from 'react'

interface Draft { input: string; submittedMessageId: string | null }
type ChangeDraft = (draft: Draft) => Draft
type LayoutFocus = { epoch: symbol; threadId: string } & (
  | { kind: 'toggle' }
  | { kind: 'input'; start: number; end: number; direction: 'forward' | 'backward' | 'none' }
)
interface DraftOwner {
  epoch: symbol
  drafts: Record<string, Draft>
  update: (threadId: string, change: ChangeDraft) => void
  layoutFocus: MutableRefObject<LayoutFocus | null>
}
const emptyDraft: Draft = { input: '', submittedMessageId: null }
const DraftContext = createContext<DraftOwner | null>(null)

export function usePageDiscussionDrafts(scope: string): DraftOwner {
  const [stored, setStored] = useState<{ scope: string; epoch: symbol; drafts: Record<string, Draft> }>(() => ({ scope, epoch: Symbol(), drafts: {} }))
  const layoutFocus = useRef<LayoutFocus | null>(null)
  let current = stored
  if (stored.scope !== scope) {
    current = { scope, epoch: Symbol(), drafts: {} }
    setStored(current)
    layoutFocus.current = null
  }
  const epoch = current.epoch
  const update = useCallback((threadId: string, change: ChangeDraft) => {
    setStored((previous) => {
      if (previous.epoch !== epoch) return previous
      const draft = previous.drafts[threadId] ?? emptyDraft
      const next = change(draft)
      if (draft.input === next.input && draft.submittedMessageId === next.submittedMessageId) return previous
      return { ...previous, drafts: { ...previous.drafts, [threadId]: next } }
    })
  }, [epoch])
  return { epoch, drafts: current.drafts, update, layoutFocus }
}

export function DiscussionDrafts({ owner, children }: { owner: DraftOwner; children: ReactNode }) {
  return <DraftContext.Provider value={owner}>{children}</DraftContext.Provider>
}

export function useDiscussionDraft(threadId: string, inputRef: RefObject<HTMLTextAreaElement>, toggleRef: RefObject<HTMLButtonElement>) {
  const owner = useContext(DraftContext)
  if (!owner) throw new Error('Discussion drafts require a page-owned provider.')
  const { update, epoch, layoutFocus } = owner
  const change = useCallback((apply: ChangeDraft) => {
    update(threadId, apply)
  }, [update, threadId])
  const setInput = useCallback((input: string) => change((draft) => ({ ...draft, input })), [change])
  const setSubmittedMessageId = useCallback((submittedMessageId: string | null) => change((draft) => ({ ...draft, submittedMessageId })), [change])

  useLayoutEffect(() => {
    const input = inputRef.current
    const toggle = toggleRef.current
    const pending = layoutFocus.current
    if (pending && pending.epoch === epoch && pending.threadId === threadId) {
      layoutFocus.current = null
      if (pending.kind === 'input' && input && !input.disabled) {
        input.focus()
        input.setSelectionRange(pending.start, pending.end, pending.direction)
      } else toggle?.focus()
    }
    return () => {
      if (input && document.activeElement === input) {
        layoutFocus.current = { epoch, threadId, kind: 'input', start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection }
        const value = input.value
        update(threadId, (draft) => ({ ...draft, input: value }))
      } else if (toggle && document.activeElement === toggle) layoutFocus.current = { epoch, threadId, kind: 'toggle' }
    }
  }, [epoch, layoutFocus, threadId, inputRef, toggleRef, update])

  const draft = owner.drafts[threadId] ?? emptyDraft
  return { ...draft, setInput, setSubmittedMessageId }
}

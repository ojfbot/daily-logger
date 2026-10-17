import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { saveMessage, sendMessage, collapseThread, expandThread, removeThread, setRevisionInclusion, clearStream } from '../store/chatSlice.ts'
import type { ChatThread } from '../store/chatSlice.ts'
import { ChatMessage } from './ChatMessage.tsx'
import { refreshAssistantStatus, useAssistantStatus } from '../utils/assistantConfig.ts'
import { useAssistantSettings } from './AssistantSettings.tsx'
import type { DiscussionAvailability } from './IndependentArticleReviews.tsx'
import '../styles/discussion-composer.css'
import { useDiscussionDraft } from './DiscussionDrafts.tsx'

interface Props {
  thread: ChatThread
  articleTitle: string
  visibleBlobSha?: string
  discussionAvailability: DiscussionAvailability
  onHide?: () => void
  extractSection: (heading: string) => { heading: string; content: string; codeRefs: string[] } | null
}

type InputError = { kind: 'validation'; message: string } | { kind: 'save'; messageId: string; message: string }

export function InlineChatThread({ thread, articleTitle, visibleBlobSha, discussionAvailability, extractSection, onHide }: Props) {
  const dispatch = useAppDispatch()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const { input: draftInput, setInput, submittedMessageId, setSubmittedMessageId } = useDiscussionDraft(thread.id, inputRef, toggleRef)
  const [inputError, setInputError] = useState<InputError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submissionActive = useRef(false)
  const assistantStatus = useAssistantStatus()
  const openSettings = useAssistantSettings()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { user } = useAppSelector((s) => s.auth)
  const queuedSubmission = !!submittedMessageId && thread.messages.some((message) => message.id === submittedMessageId && message.actor === user?.login)
  const input = queuedSubmission ? '' : draftInput
  const canEdit = !!user?.authorized
  const discussionReady = discussionAvailability === 'ready'
  const busy = submitting || thread.isStreaming || thread.messages.some((message) => message.save.kind === 'saving')
  const canPost = canEdit && !!visibleBlobSha && discussionReady && !!input.trim() && !busy
  const threadNum = thread.messages.filter((message) => message.role === 'user').length
  const panelId = `discussion-panel-${thread.id}`
  const inputId = `discussion-input-${thread.id}`
  const reasonId = `discussion-reason-${thread.id}`
  const consequenceId = `discussion-consequence-${thread.id}`
  const section = extractSection(thread.section)
  const canAsk = canPost && assistantStatus === 'saved_unverified' && !!section
  const commonReason = !canEdit ? 'An authorized GitHub account is required to save.'
    : !visibleBlobSha ? 'Article source unavailable. Saving is paused.'
      : busy ? thread.isStreaming ? 'Assistant request in progress. Response not saved yet.' : 'Saving correspondence…'
        : discussionAvailability === 'loading' ? 'Loading correspondence…'
          : discussionAvailability === 'stale' ? 'Article changed. Refresh before saving.'
            : discussionAvailability === 'unavailable' ? 'Correspondence unavailable. Your draft is kept here.'
              : !input.trim() ? 'Write a note or question.' : null
  const actionReason = commonReason ?? (!section ? 'Section context unavailable. You can save a note.'
    : assistantStatus !== 'saved_unverified' ? 'Save note works without an API key.' : null)
  const visibleInputError = inputError && (inputError.kind === 'validation' || !thread.messages.some((message) => message.id === inputError.messageId)) ? inputError.message : null

  useEffect(() => { if (!thread.isCollapsed && !thread.isHidden) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) },
    [thread.messages.length, thread.streamingContent, thread.isCollapsed, thread.isHidden])
  useLayoutEffect(() => {
    if (thread.isCollapsed && panelRef.current?.contains(document.activeElement)) toggleRef.current?.focus()
  }, [thread.isCollapsed])

  useEffect(() => {
    if (queuedSubmission) {
      setInput('')
      setSubmittedMessageId(null)
    }
  }, [queuedSubmission, setInput, setSubmittedMessageId])

  async function handleSave() {
    if (!canPost || !visibleBlobSha || submissionActive.current) return
    if (input.length > 30000) { setInputError({ kind: 'validation', message: 'A note may contain at most 30,000 characters. Your text is retained.' }); return }
    submissionActive.current = true
    setSubmitting(true)
    setInputError(null)
    const messageId = crypto.randomUUID()
    setSubmittedMessageId(messageId)
    const result = await dispatch(saveMessage({ kind: 'new', messageId, threadId: thread.id, visibleBlobSha, content: input, speaker: { kind: 'human' } }))
    if (saveMessage.rejected.match(result)) setInputError({ kind: 'save', messageId, message: result.error.message ?? 'The note was not saved.' })
    submissionActive.current = false
    setSubmitting(false)
  }
  async function handleAsk() {
    if (!canAsk || !visibleBlobSha || submissionActive.current) return
    if (input.length > 30000) { setInputError({ kind: 'validation', message: 'A question may contain at most 30,000 characters. Your text is retained.' }); return }
    if (refreshAssistantStatus() !== 'saved_unverified') return
    const section = extractSection(thread.section)
    if (!section) return
    submissionActive.current = true
    setSubmitting(true)
    setInputError(null)
    const pending = dispatch(sendMessage({ threadId: thread.id, visibleBlobSha, sectionContent: section.content,
      articleTitle, codeReferences: section.codeRefs, message: input }))
    setSubmittedMessageId(pending.requestId)
    await pending
    submissionActive.current = false
    setSubmitting(false)
  }

  return (
    <div className="chat-thread discussion-card">
      <div className="discussion-header">
        <button ref={toggleRef} id={`discussion-toggle-${thread.id}`} className="discussion-toggle" type="button"
          aria-label={`Discussion about ${thread.section}`} aria-expanded={!thread.isCollapsed} aria-controls={panelId}
          onClick={() => dispatch(thread.isCollapsed ? expandThread(thread.id) : collapseThread(thread.id))}>
          <span>Discussion · {threadNum} {threadNum === 1 ? 'message' : 'messages'}</span><span aria-hidden="true">{thread.isCollapsed ? '+' : '−'}</span>
        </button>
        <button type="button" className="discussion-hide" aria-label="Hide discussion locally" aria-describedby={`discussion-hide-help-${thread.id}`}
          onClick={() => { if (!busy) { onHide?.(); dispatch(removeThread(thread.id)) } }} disabled={busy}>×</button>
        <span id={`discussion-hide-help-${thread.id}`} className="discussion-sr-only">Saved correspondence stays on GitHub. Unsent text stays here while hidden.</span>
      </div>
      <div ref={panelRef} id={panelId} hidden={thread.isCollapsed}>
      <div className="chat-thread-messages">
        {thread.messages.map((message) => {
          const current = !!visibleBlobSha && message.articleBlobSha === visibleBlobSha
          const label = message.speaker.kind === 'human'
            ? `GitHub account ${message.actor}`
            : `Assistant output submitted by ${message.actor}${message.speaker.reportedModel ? ` · reported model ${message.speaker.reportedModel}` : ' · model unknown'}`
          return <div className="saved-chat-message" key={`${message.actor}:${message.id}`}>
            <ChatMessage role={message.role} content={message.content} label={label} />
            <div className="chat-message-receipt">
              {current ? 'Matches visible article' : `Historical article ${message.articleBlobSha.slice(0, 12)}`}
              {' · '}{message.save.kind === 'saved'
                ? <><a href={message.save.url} target="_blank" rel="noopener noreferrer">Saved on GitHub</a>{message.save.observation === 'unavailable' && ' · Last observed; refresh could not verify current correspondence'}</>
                : message.save.kind === 'saving' ? 'Saving…' : 'Not saved'}
            </div>
            {message.save.kind === 'unsaved' && <div>
              {message.save.error && <p role="alert">{message.save.error}</p>}
              <button disabled={!canEdit || !discussionReady || busy || message.actor !== user?.login}
                onClick={() => dispatch(saveMessage({ kind: 'retry', threadId: thread.id, messageId: message.id }))}>
                Retry saving {message.role === 'assistant' ? 'response' : 'note'}
              </button>
              {message.role === 'assistant' && <p>The assistant is not called again when retrying this save.</p>}
            </div>}
            {message.role === 'user' && current && canEdit && <label className="chat-revision-choice">
              <input type="checkbox" checked={message.includeInRevision}
                onChange={(event) => dispatch(setRevisionInclusion({ threadId: thread.id, messageId: message.id, actor: message.actor, included: event.target.checked }))} />
              Include this note in my next editorial revision
            </label>}
          </div>
        })}
        {thread.streamingContent && <div>
          <ChatMessage role="assistant" content={thread.streamingContent} isStreaming={thread.isStreaming}
            label={thread.isStreaming ? 'Assistant response · not saved yet' : 'Interrupted assistant response · not saved'} />
          {!thread.isStreaming && <button onClick={() => dispatch(clearStream(thread.id))}>Discard interrupted response</button>}
        </div>}
        {thread.error && <p role="alert">{thread.error}</p>}
        <div ref={messagesEndRef} />
      </div>
      {!canEdit ? <p>{commonReason}</p> : <>
        <div className="assistant-config-status">
          <p role="status">{assistantStatus === 'missing'
            ? 'Assistant setup needed.'
            : assistantStatus === 'saved_unverified' ? 'Key saved in this browser. Connection not verified.'
              : 'Assistant settings are unavailable. Notes still work.'}</p>
          <button type="button" onClick={(event) => openSettings(event.currentTarget)}>{assistantStatus === 'missing' ? 'Set up assistant' : 'Assistant settings'}</button>
        </div>
        <div className="chat-input-area">
          <label htmlFor={inputId}>Note or question</label>
          <textarea ref={inputRef} id={inputId} className="chat-input" value={input} onChange={(event) => { setInput(event.target.value); setInputError(null) }}
            placeholder="Write a note or question..." disabled={busy} rows={2} maxLength={30000} />
          {visibleInputError && <p role="alert">{visibleInputError}</p>}
          <p className="discussion-privacy">Saved notes follow this repository's GitHub visibility. Do not include secrets.</p>
          <p id={reasonId} className="discussion-action-reason" role="status">{actionReason}</p>
          <p id={consequenceId} className="discussion-consequence">{canAsk && 'Saves your question, then calls the assistant.'}</p>
          <div className="chat-input-actions">
            <button type="button" className="discussion-action discussion-save" onClick={handleSave} disabled={!canPost} aria-describedby={reasonId}>Save note</button>
            <button type="button" className="discussion-action" onClick={handleAsk} disabled={!canAsk} aria-describedby={`${reasonId} ${consequenceId}`}>Ask assistant</button>
          </div>
          <details className="discussion-help"><summary>How discussion works</summary><p>Save note writes to GitHub without calling a model or accepting this article. Ask assistant saves your question first. Responses have their own save receipt. Press Enter for a new line.</p></details>
        </div>
      </>}
      </div>
    </div>
  )
}

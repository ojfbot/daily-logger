import { useState, useRef, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { saveMessage, sendMessage, collapseThread, expandThread, removeThread, setRevisionInclusion, clearStream } from '../store/chatSlice.ts'
import type { ChatThread } from '../store/chatSlice.ts'
import { ChatMessage } from './ChatMessage.tsx'

interface Props {
  thread: ChatThread
  articleTitle: string
  visibleBlobSha?: string
  discussionReady: boolean
  extractSection: (heading: string) => { heading: string; content: string; codeRefs: string[] } | null
}

export function InlineChatThread({ thread, articleTitle, visibleBlobSha, discussionReady, extractSection }: Props) {
  const dispatch = useAppDispatch()
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submittedMessageId, setSubmittedMessageId] = useState<string | null>(null)
  const submissionActive = useRef(false)
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(() => !!localStorage.getItem('dl-anthropic-key'))
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { user } = useAppSelector((s) => s.auth)
  const canEdit = !!user?.authorized
  const busy = submitting || thread.isStreaming || thread.messages.some((message) => message.save.kind === 'saving')
  const canPost = canEdit && !!visibleBlobSha && discussionReady && !!input.trim() && !busy
  const threadNum = thread.messages.filter((message) => message.role === 'user').length

  useEffect(() => { if (!thread.isCollapsed) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) },
    [thread.messages.length, thread.streamingContent, thread.isCollapsed])
  useEffect(() => { if (!thread.isCollapsed) inputRef.current?.focus() }, [thread.isCollapsed])

  useEffect(() => {
    if (submittedMessageId && thread.messages.some((message) => message.id === submittedMessageId && message.actor === user?.login)) {
      setInput('')
      setSubmittedMessageId(null)
    }
  }, [submittedMessageId, thread.messages, user?.login])

  async function handleSave() {
    if (!canPost || !visibleBlobSha || submissionActive.current) return
    if (input.length > 30000) { setInputError('A note may contain at most 30,000 characters. Your text is retained.'); return }
    submissionActive.current = true
    setSubmitting(true)
    setInputError(null)
    const messageId = crypto.randomUUID()
    setSubmittedMessageId(messageId)
    const result = await dispatch(saveMessage({ kind: 'new', messageId, threadId: thread.id, visibleBlobSha, content: input, speaker: { kind: 'human' } }))
    if (saveMessage.rejected.match(result)) setInputError(result.error.message ?? 'The note was not saved.')
    submissionActive.current = false
    setSubmitting(false)
  }
  async function handleAsk() {
    if (!canPost || !visibleBlobSha || submissionActive.current) return
    if (input.length > 30000) { setInputError('A question may contain at most 30,000 characters. Your text is retained.'); return }
    if (!hasApiKey) { setShowKeyPrompt(true); return }
    const section = extractSection(thread.section)
    if (!section) return
    submissionActive.current = true
    setSubmitting(true)
    setInputError(null)
    const pending = dispatch(sendMessage({ threadId: thread.id, visibleBlobSha, sectionContent: section.content,
      articleTitle, codeReferences: section.codeRefs, message: input }))
    setSubmittedMessageId(pending.requestId)
    const result = await pending
    if (sendMessage.rejected.match(result)) setInputError(result.error.message ?? 'The assistant request was not completed.')
    submissionActive.current = false
    setSubmitting(false)
  }
  function handleSaveKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const keyInput = new FormData(event.currentTarget).get('apiKey')
    if (typeof keyInput === 'string' && keyInput.trim()) {
      localStorage.setItem('dl-anthropic-key', keyInput.trim())
      setHasApiKey(true)
      setShowKeyPrompt(false)
    }
  }

  if (thread.isCollapsed) return (
    <div className="chat-thread chat-thread-collapsed">
      <div className="chat-thread-collapsed-bar">
        <button className="chat-thread-collapsed-label" onClick={() => dispatch(expandThread(thread.id))}>
          Thread · {threadNum} {threadNum === 1 ? 'message' : 'messages'}
        </button>
        <button className="chat-thread-remove" onClick={() => dispatch(removeThread(thread.id))}
          title="Hide thread locally; saved correspondence stays on GitHub" disabled={busy}>×</button>
      </div>
    </div>
  )

  return (
    <div className="chat-thread">
      <div className="chat-thread-header">
        <span className="chat-thread-label">Discussion</span>
        <div className="chat-thread-actions">
          <button onClick={() => dispatch(collapseThread(thread.id))} title="Collapse">—</button>
          <button onClick={() => dispatch(removeThread(thread.id))} title="Hide thread locally; saved correspondence stays on GitHub" disabled={busy}>×</button>
        </div>
      </div>
      <div className="chat-thread-messages">
        {thread.messages.length === 0 && !thread.isStreaming && <div className="chat-empty">
          Save a note to GitHub, or explicitly ask the assistant. Saving a note does not call a model or accept this article.
        </div>}
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
      {!canEdit ? <p>Sign in with an authorized account to save correspondence.</p> : <>
        {!visibleBlobSha && <p>Article source identity is unavailable. Saving is disabled.</p>}
        {visibleBlobSha && !discussionReady && <p>GitHub correspondence is unavailable for this article. New saves and retries are disabled.</p>}
        {showKeyPrompt && <form className="chat-key-prompt" onSubmit={handleSaveKey}>
          <label>Anthropic API Key</label>
          <input type="password" name="apiKey" placeholder="sk-ant-..." autoFocus />
          <div className="chat-key-actions"><button type="submit">Save key</button>
            <button type="button" onClick={() => setShowKeyPrompt(false)}>Cancel</button></div>
        </form>}
        <div className="chat-input-area">
          <textarea ref={inputRef} className="chat-input" value={input} onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSave() } }}
            placeholder="Write a note or question..." disabled={busy} rows={2} maxLength={30000} />
          {inputError && <p role="alert">{inputError}</p>}
          <p>Saved correspondence uses this GitHub repository's visibility. Do not include secrets.</p>
          <div className="chat-input-actions">
            <button className="chat-send-btn" onClick={handleSave} disabled={!canPost}>Save note</button>
            <button onClick={handleAsk} disabled={!canPost || !extractSection(thread.section)}>Ask assistant</button>
          </div>
        </div>
      </>}
    </div>
  )
}

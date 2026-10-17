import { createContext, useContext, useRef, useState, type ReactNode, type FormEvent, type KeyboardEvent } from 'react'
import { refreshAssistantStatus, removeAssistantKey, saveAssistantKey, useAssistantStatus } from '../utils/assistantConfig.ts'
import '../styles/assistant-settings.css'

const SettingsContext = createContext<((opener: HTMLButtonElement) => void) | null>(null)

export function useAssistantSettings() {
  const open = useContext(SettingsContext)
  return (opener: HTMLButtonElement) => {
    if (!open) throw new Error('Assistant settings must be opened within the settings host.')
    open(opener)
  }
}

export function AssistantSettingsButton() {
  const open = useAssistantSettings()
  return <button type="button" data-assistant-settings-entry="" className="assistant-settings-entry" onClick={(event) => open(event.currentTarget)}>Assistant settings</button>
}

export function AssistantSettings({ children, onOpen }: { children: ReactNode; onOpen?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const status = useAssistantStatus()

  function open(button: HTMLButtonElement) {
    if (!dialog.current || dialog.current.open) return
    onOpen?.()
    opener.current = button
    setError(null)
    if (field.current) field.current.value = ''
    refreshAssistantStatus()
    dialog.current.showModal()
    field.current?.focus()
  }
  function finishClose() {
    if (field.current) field.current.value = ''
    setError(null)
    if (opener.current) {
      const target = opener.current.isConnected && !opener.current.disabled ? opener.current : document.querySelector<HTMLButtonElement>('[data-assistant-settings-entry]')
      opener.current = null
      target?.focus()
    }
  }
  function close() {
    if (field.current) field.current.value = ''
    dialog.current?.close()
    finishClose()
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = saveAssistantKey(field.current?.value ?? '')
    if (field.current) field.current.value = ''
    if (result === 'saved') close()
    else setError(result === 'blank' ? 'Enter an API key, or cancel to keep your current settings.' : 'Browser storage did not confirm the saved key. Your note is unchanged.')
  }
  function remove() {
    if (field.current) field.current.value = ''
    if (removeAssistantKey() === 'removed') close()
    else setError('Browser storage did not confirm key removal. Your note is unchanged.')
  }
  function handleKey(event: KeyboardEvent<HTMLDialogElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      event.stopPropagation()
    }
    if (event.key !== 'Tab') return
    const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (first && last && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (first && last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return <SettingsContext.Provider value={open}>
    {children}
    <dialog ref={dialog} className="assistant-settings-dialog" aria-labelledby="assistant-settings-title" aria-describedby="assistant-settings-description"
      onCancel={(event) => { event.preventDefault(); close() }} onClose={finishClose}
      onKeyDown={handleKey}>
      <div className="assistant-settings-heading">
        <h2 id="assistant-settings-title">Assistant settings</h2>
        <button type="button" aria-label="Close assistant settings" onClick={close}>×</button>
      </div>
      <p id="assistant-settings-description">Your Anthropic API key stays in this browser and is sent to Anthropic only when you explicitly ask the assistant. Saving notes does not need a key.</p>
      <p className="assistant-settings-status" role="status">{status === 'saved_unverified'
        ? 'API key saved in this browser. Connection not verified.'
        : status === 'missing' ? 'No API key saved in this browser.' : 'Browser storage is unavailable. You can still save notes.'}</p>
      <form onSubmit={save}>
        <label htmlFor="assistant-api-key">{status === 'saved_unverified' ? 'Replacement Anthropic API key' : 'Anthropic API key'}</label>
        <input ref={field} id="assistant-api-key" type="password" autoComplete="off" spellCheck={false} aria-describedby="assistant-key-help" />
        <p id="assistant-key-help">Saving a key does not test connectivity or send your question. Press Ask assistant separately when ready.</p>
        {error && <p role="alert">{error}</p>}
        <div className="assistant-settings-actions">
          <button type="submit">Save key</button>
          {status !== 'missing' && <button type="button" onClick={remove}>Remove saved key</button>}
          <button type="button" onClick={close}>Cancel</button>
        </div>
      </form>
    </dialog>
  </SettingsContext.Provider>
}

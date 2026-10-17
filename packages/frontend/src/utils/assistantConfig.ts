import { useSyncExternalStore } from 'react'

const storageKey = 'dl-anthropic-key'
type KeyObservation = { kind: 'missing' } | { kind: 'saved_unverified'; key: string } | { kind: 'storage_unavailable' }
export type AssistantStatus = KeyObservation['kind']
const listeners = new Set<() => void>()

export function readAssistantKey(): KeyObservation {
  try {
    const key = localStorage.getItem(storageKey)?.trim()
    return key ? { kind: 'saved_unverified', key } : { kind: 'missing' }
  } catch { return { kind: 'storage_unavailable' } }
}

function notify() { for (const listener of listeners) listener() }
function status(): AssistantStatus { return readAssistantKey().kind }
function storageChanged(event: StorageEvent) {
  if (event.key === storageKey || event.key === null) notify()
}
function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    window.addEventListener('storage', storageChanged)
    window.addEventListener('focus', notify)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('storage', storageChanged)
      window.removeEventListener('focus', notify)
    }
  }
}

export function useAssistantStatus(): AssistantStatus {
  return useSyncExternalStore(subscribe, status, () => 'storage_unavailable')
}

export function refreshAssistantStatus(): AssistantStatus {
  notify()
  return status()
}

export function saveAssistantKey(value: string): 'saved' | 'blank' | 'storage_unavailable' {
  const key = value.trim()
  if (!key) return 'blank'
  try {
    localStorage.setItem(storageKey, key)
    const observed = readAssistantKey()
    return observed.kind === 'saved_unverified' && observed.key === key ? 'saved' : 'storage_unavailable'
  } catch { return 'storage_unavailable' }
  finally { notify() }
}

export function removeAssistantKey(): 'removed' | 'storage_unavailable' {
  try {
    localStorage.removeItem(storageKey)
    return status() === 'missing' ? 'removed' : 'storage_unavailable'
  } catch { return 'storage_unavailable' }
  finally { notify() }
}

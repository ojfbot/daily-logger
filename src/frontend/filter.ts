// Client-side filter state + URL hash sync

import type { EntryData } from './types'

let activeFilters = new Map<string, Set<string>>()
let onFilterChange: (() => void) | null = null

export function initFilters(callback: () => void): void {
  onFilterChange = callback
  loadFromHash()
  window.addEventListener('hashchange', () => {
    loadFromHash()
    onFilterChange?.()
  })
}

function loadFromHash(): void {
  activeFilters = new Map()
  const hash = window.location.hash.slice(1)
  if (!hash) return

  for (const part of hash.split('&')) {
    const [key, value] = part.split('=')
    if (key && value) {
      if (!activeFilters.has(key)) activeFilters.set(key, new Set())
      for (const v of value.split(',')) {
        activeFilters.get(key)!.add(decodeURIComponent(v))
      }
    }
  }
}

function saveToHash(): void {
  const parts: string[] = []
  for (const [type, names] of activeFilters) {
    if (names.size > 0) {
      parts.push(`${type}=${[...names].map(encodeURIComponent).join(',')}`)
    }
  }
  const newHash = parts.join('&')
  if (newHash) {
    history.replaceState(null, '', `#${newHash}`)
  } else {
    history.replaceState(null, '', window.location.pathname)
  }
}

export function toggleFilter(type: string, name: string): void {
  if (!activeFilters.has(type)) activeFilters.set(type, new Set())
  const set = activeFilters.get(type)!
  if (set.has(name)) {
    set.delete(name)
    if (set.size === 0) activeFilters.delete(type)
  } else {
    set.add(name)
  }
  saveToHash()
  onFilterChange?.()
}

export function clearFilters(): void {
  activeFilters = new Map()
  saveToHash()
  onFilterChange?.()
}

export function isFilterActive(type: string, name: string): boolean {
  return activeFilters.get(type)?.has(name) ?? false
}

export function hasActiveFilters(): boolean {
  return activeFilters.size > 0
}

/**
 * Filter logic: OR within a type, AND across types.
 * An entry matches if, for every active filter type,
 * at least one of the entry's tags matches.
 */
export function matchesFilters(entry: EntryData): boolean {
  if (activeFilters.size === 0) return true

  for (const [filterType, filterNames] of activeFilters) {
    const entryTagNames = entry.tags
      .filter(t => t.type === filterType)
      .map(t => t.name)

    // Also check reposActive for repo filters
    const candidates = filterType === 'repo'
      ? [...entryTagNames, ...(entry.reposActive ?? [])]
      : entryTagNames

    const hasMatch = [...filterNames].some(name => candidates.includes(name))
    if (!hasMatch) return false
  }
  return true
}

export function getActiveFilters(): Map<string, Set<string>> {
  return activeFilters
}

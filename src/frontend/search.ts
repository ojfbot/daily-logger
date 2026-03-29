// Cmd+K search overlay — client-side substring search

import type { EntryData } from './types'

const BASE = (document.querySelector('meta[name="baseurl"]') as HTMLMetaElement | null)?.content ?? '/daily-logger'
let entries: EntryData[] = []
let overlay: HTMLElement | null = null
let input: HTMLInputElement | null = null
let resultsList: HTMLElement | null = null

export function initSearch(entriesData: EntryData[]): void {
  entries = entriesData
  overlay = document.querySelector('.search-overlay')
  input = document.querySelector('.search-input')
  resultsList = document.querySelector('.search-results')
  if (!overlay || !input || !resultsList) return

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      openSearch()
    }
    if (e.key === 'Escape' && overlay!.classList.contains('open')) {
      closeSearch()
    }
  })

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSearch()
  })

  input.addEventListener('input', () => {
    renderResults(input!.value.trim().toLowerCase())
  })
}

function openSearch(): void {
  overlay!.classList.add('open')
  input!.value = ''
  input!.focus()
  renderResults('')
}

function closeSearch(): void {
  overlay!.classList.remove('open')
}

function renderResults(query: string): void {
  resultsList!.innerHTML = ''
  if (!query) {
    // Show recent 5
    for (const entry of entries.slice(0, 5)) {
      resultsList!.appendChild(makeResult(entry))
    }
    return
  }

  const matches = entries.filter(e => {
    const haystack = [
      e.title,
      e.summary,
      ...e.tags.map(t => t.name),
      ...(e.decisions ?? []).map(d => d.title),
    ].join(' ').toLowerCase()
    return haystack.includes(query)
  })

  if (matches.length === 0) {
    resultsList!.innerHTML = '<div class="search-result" style="color:var(--text-secondary)">No results</div>'
    return
  }

  for (const entry of matches.slice(0, 10)) {
    resultsList!.appendChild(makeResult(entry))
  }
}

function makeResult(entry: EntryData): HTMLDivElement {
  const div = document.createElement('div')
  div.className = 'search-result'
  div.innerHTML = `<div class="search-result-date">${entry.date}</div><div>${entry.title}</div>`
  div.addEventListener('click', () => {
    window.location.href = `${BASE}/articles/${entry.date}/`
    closeSearch()
  })
  return div
}

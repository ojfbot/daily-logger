// Cmd+K search overlay — client-side substring search

const BASE = document.querySelector('meta[name="baseurl"]')?.content ?? '/daily-logger'
let entries = []
let overlay = null
let input = null
let resultsList = null

export function initSearch(entriesData) {
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
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeSearch()
    }
  })

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSearch()
  })

  input.addEventListener('input', () => {
    render(input.value.trim().toLowerCase())
  })
}

function openSearch() {
  overlay.classList.add('open')
  input.value = ''
  input.focus()
  render('')
}

function closeSearch() {
  overlay.classList.remove('open')
}

function render(query) {
  resultsList.innerHTML = ''
  if (!query) {
    // Show recent 5
    for (const entry of entries.slice(0, 5)) {
      resultsList.appendChild(makeResult(entry))
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
    resultsList.innerHTML = '<div class="search-result" style="color:var(--text-secondary)">No results</div>'
    return
  }

  for (const entry of matches.slice(0, 10)) {
    resultsList.appendChild(makeResult(entry))
  }
}

function makeResult(entry) {
  const div = document.createElement('div')
  div.className = 'search-result'
  div.innerHTML = `<div class="search-result-date">${entry.date}</div><div>${entry.title}</div>`
  div.addEventListener('click', () => {
    window.location.href = `${BASE}/articles/${entry.date}/`
    closeSearch()
  })
  return div
}

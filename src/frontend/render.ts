// DOM builders for dashboard components

import type { EntryData, TagCount, RepoStats, FilterCallbacks } from './types'

const BASE = (document.querySelector('meta[name="baseurl"]') as HTMLMetaElement | null)?.content ?? '/daily-logger'

export function renderMetrics(container: HTMLElement, entries: EntryData[]): void {
  const totalEntries = entries.length
  const allRepos = new Set(entries.flatMap(e => e.reposActive ?? []))
  const allActions = entries.reduce((sum, e) => sum + (e.actions?.length ?? 0), 0)

  // Calculate streak (consecutive days from most recent)
  let streak = 0
  if (entries.length > 0) {
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
    let checkDate = new Date(sorted[0].date + 'T12:00:00Z')

    for (const entry of sorted) {
      const entryDate = new Date(entry.date + 'T12:00:00Z')
      const diff = Math.round((checkDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))
      if (diff <= 1) {
        streak++
        checkDate = entryDate
      } else {
        break
      }
    }
  }

  container.innerHTML = `
    <div class="metric-cell"><div class="metric-value">${totalEntries}</div><div class="metric-label">ENTRIES</div></div>
    <div class="metric-cell"><div class="metric-value">${allRepos.size}</div><div class="metric-label">ACTIVE REPOS</div></div>
    <div class="metric-cell"><div class="metric-value">${allActions}</div><div class="metric-label">ACTIONS</div></div>
    <div class="metric-cell"><div class="metric-value">${streak}</div><div class="metric-label">DAY STREAK</div></div>
  `
}

interface FilterBarOptions extends FilterCallbacks {
  filteredCount: number
  totalCount: number
}

export function renderFilterBar(container: HTMLElement, tags: TagCount[], options: FilterBarOptions): void {
  const { toggleFilter, clearFilters, hasActiveFilters, getActiveFilters, filteredCount, totalCount } = options
  container.innerHTML = ''

  const isFiltering = hasActiveFilters()

  // Active filter banner — shown prominently when filters are applied
  if (isFiltering) {
    const banner = document.createElement('div')
    banner.className = 'filter-active-banner'

    const activeFilters = getActiveFilters()
    const chips: string[] = []
    for (const [type, names] of activeFilters) {
      for (const name of names) {
        chips.push(`<span class="filter-active-chip" data-type="${type}" data-name="${name}">${name} <span class="filter-chip-x">&times;</span></span>`)
      }
    }

    banner.innerHTML = `
      <span class="filter-active-label">SHOWING ${filteredCount} OF ${totalCount}</span>
      <span class="filter-active-chips">${chips.join('')}</span>
      <span class="filter-clear">CLEAR ALL</span>
    `

    // Bind remove on each chip
    banner.querySelectorAll('.filter-active-chip').forEach(chip => {
      const el = chip as HTMLElement
      el.addEventListener('click', () => toggleFilter(el.dataset.type!, el.dataset.name!))
    })
    banner.querySelector('.filter-clear')!.addEventListener('click', clearFilters)

    container.appendChild(banner)
    return // Don't show the full tag cloud when filtering — the banner is enough
  }

  // Default state: compact filter bar with top tags only
  const label = document.createElement('span')
  label.className = 'filter-label'
  label.textContent = 'FILTER'
  container.appendChild(label)

  // Show only the most-used tags (top 12 across all types)
  const topTags = tags.slice(0, 12)
  for (const tag of topTags) {
    const chip = document.createElement('span')
    chip.className = 'tag'
    chip.dataset.type = tag.type
    chip.textContent = tag.name
    chip.addEventListener('click', () => toggleFilter(tag.type, tag.name))
    container.appendChild(chip)
  }
}

export function renderEntryList(container: HTMLElement, entries: EntryData[]): void {
  container.innerHTML = ''

  if (entries.length === 0) {
    container.innerHTML = '<div class="empty-state">No entries match these filters. <a class="filter-clear-link">Clear filters</a></div>'
    return
  }

  for (const entry of entries) {
    const card = document.createElement('div')
    card.className = 'entry-card'

    const tagsHTML = entry.tags
      .map(t => `<span class="tag" data-type="${t.type}">${t.name}</span>`)
      .join('')

    const reposCount = entry.reposActive?.length ?? 0
    const commitStr = entry.commitCount > 0 ? `${entry.commitCount} commits` : 'rest day'

    card.innerHTML = `
      <a href="${BASE}/articles/${entry.date}/">
        <div class="entry-date">${entry.date}</div>
        <div class="entry-title">${entry.title}</div>
        <div class="entry-summary">${entry.summary}</div>
        <div class="entry-meta">
          <div class="entry-tags">${tagsHTML}</div>
          <span class="entry-stat">${reposCount} repos</span>
          <span class="entry-stat">${commitStr}</span>
        </div>
      </a>
    `
    container.appendChild(card)
  }
}

interface SidebarOptions {
  repos: RepoStats[]
  tags: TagCount[]
  toggleFilter: (type: string, name: string) => void
  isFilterActive: (type: string, name: string) => boolean
}

export function renderSidebar(container: HTMLElement, options: SidebarOptions): void {
  const { repos, tags, toggleFilter, isFilterActive } = options
  container.innerHTML = ''

  function addSection(heading: string, items: Array<{ name: string; count: number }>, type: string): void {
    const section = document.createElement('div')
    section.className = 'sidebar-section'
    section.innerHTML = `<div class="sidebar-heading">${heading}</div>`
    for (const { name, count } of items) {
      const active = isFilterActive(type, name)
      const item = document.createElement('div')
      item.className = 'sidebar-item' + (active ? ' active' : '')
      item.innerHTML = `<span>${name}</span><span class="sidebar-count">${count}</span>`
      item.addEventListener('click', () => toggleFilter(type, name))
      section.appendChild(item)
    }
    container.appendChild(section)
  }

  addSection('REPOS', repos.slice(0, 10).map(r => ({ name: r.name, count: r.articleCount })), 'repo')

  const archTags = tags.filter(t => t.type === 'arch').slice(0, 8)
  if (archTags.length > 0) addSection('ARCHITECTURE', archTags, 'arch')

  const phaseTags = tags.filter(t => t.type === 'phase').slice(0, 6)
  if (phaseTags.length > 0) addSection('PHASES', phaseTags, 'phase')
}

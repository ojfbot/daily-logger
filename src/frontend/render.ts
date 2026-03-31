// DOM builders for dashboard components

import type { EntryData, TagCount, RepoStats, FilterCallbacks } from './types'

const BASE = (document.querySelector('meta[name="baseurl"]') as HTMLMetaElement | null)?.content ?? '/daily-logger'

// ─── Metric popover helpers ─────────────────────────────────────────────────

let metricPopoverEl: HTMLElement | null = null
let metricPopoverTimer: ReturnType<typeof setTimeout> | null = null

function getMetricPopover(): HTMLElement {
  if (!metricPopoverEl) {
    metricPopoverEl = document.createElement('div')
    metricPopoverEl.className = 'metric-popover'
    document.body.appendChild(metricPopoverEl)
  }
  return metricPopoverEl
}

function showMetricPopover(cell: HTMLElement, html: string): void {
  if (metricPopoverTimer) clearTimeout(metricPopoverTimer)
  metricPopoverTimer = setTimeout(() => {
    const pop = getMetricPopover()
    pop.innerHTML = html
    pop.classList.add('visible')

    const rect = cell.getBoundingClientRect()
    const popWidth = pop.offsetWidth
    let left = rect.left + rect.width / 2 - popWidth / 2
    if (left < 8) left = 8
    if (left + popWidth > window.innerWidth - 8) left = window.innerWidth - 8 - popWidth
    pop.style.left = `${left}px`
    pop.style.top = `${rect.bottom + 6}px`
  }, 200)
}

function hideMetricPopover(): void {
  if (metricPopoverTimer) { clearTimeout(metricPopoverTimer); metricPopoverTimer = null }
  metricPopoverEl?.classList.remove('visible')
}

function popRow(label: string, value: string | number): string {
  return `<div class="metric-popover-row"><span class="mp-label">${label}</span><span class="mp-value">${value}</span></div>`
}

// ─── Popover content builders ───────────────────────────────────────────────

function buildEntriesPopover(entries: EntryData[]): string {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
  const last7 = sorted.filter(e => {
    const d = new Date(e.date + 'T12:00:00Z')
    return Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000
  }).length

  const types: Record<string, number> = {}
  for (const e of entries) {
    const t = e.activityType || 'build'
    types[t] = (types[t] ?? 0) + 1
  }
  const typeStr = Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${n} ${t}`)
    .join(', ')

  const latest = sorted[0]
  const latestLine = latest
    ? `<div class="metric-popover-latest">Latest: "${latest.title}" (${latest.date})</div>`
    : ''

  return `<div class="metric-popover-title">Entries</div>`
    + popRow('Last 7 days', last7)
    + popRow('Activity types', typeStr)
    + latestLine
}

function buildReposPopover(repos: RepoStats[]): string {
  const top5 = repos.slice(0, 5)
  const rows = top5
    .map(r => popRow(r.name, `${r.articleCount} articles, ${r.totalCommits} commits`))
    .join('')

  return `<div class="metric-popover-title">Top repos by coverage</div>` + rows
}

function buildActionsPopover(entries: EntryData[]): string {
  const allActions = entries.flatMap(e => e.actions ?? [])
  const open = allActions.filter(a => a.status === 'open')
  const cmdCounts: Record<string, number> = {}
  for (const a of open) {
    cmdCounts[a.command] = (cmdCounts[a.command] ?? 0) + 1
  }
  const cmdStr = Object.entries(cmdCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cmd, n]) => `${cmd}: ${n}`)
    .join(', ')

  const oldest = open.sort((a, b) => a.sourceDate.localeCompare(b.sourceDate))[0]
  const oldestLine = oldest
    ? `<div class="metric-popover-latest">Oldest: "${oldest.description.slice(0, 60)}..." (${oldest.sourceDate})</div>`
    : ''

  return `<div class="metric-popover-title">Action items</div>`
    + popRow('Open', open.length)
    + popRow('Closed', allActions.length - open.length)
    + (cmdStr ? popRow('By type', cmdStr) : '')
    + oldestLine
}

function buildCommitsPopover(entries: EntryData[], repos: RepoStats[]): string {
  const totalCommits = entries.reduce((sum, e) => sum + (e.commitCount ?? 0), 0)
  const avg = entries.length > 0 ? Math.round(totalCommits / entries.length) : 0

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
  const last7 = sorted
    .filter(e => Date.now() - new Date(e.date + 'T12:00:00Z').getTime() < 7 * 24 * 60 * 60 * 1000)
    .reduce((sum, e) => sum + (e.commitCount ?? 0), 0)

  const topRepo = repos[0]
  const topLine = topRepo
    ? popRow('Top repo', `${topRepo.name} (${topRepo.totalCommits})`)
    : ''

  return `<div class="metric-popover-title">Commit volume</div>`
    + popRow('Average', `${avg} / day`)
    + popRow('This week', last7)
    + topLine
}

// ─── Main metrics render ────────────────────────────────────────────────────

export function renderMetrics(container: HTMLElement, entries: EntryData[], repos: RepoStats[]): void {
  const totalEntries = entries.length
  const allRepos = new Set(entries.flatMap(e => e.reposActive ?? []))
  const allActions = entries.reduce((sum, e) => sum + (e.actions?.length ?? 0), 0)
  const totalCommits = entries.reduce((sum, e) => sum + (e.commitCount ?? 0), 0)

  container.innerHTML = `
    <div class="metric-cell" data-metric="entries"><div class="metric-value">${totalEntries}</div><div class="metric-label">ENTRIES</div></div>
    <div class="metric-cell" data-metric="repos"><div class="metric-value">${allRepos.size}</div><div class="metric-label">ACTIVE REPOS</div></div>
    <div class="metric-cell" data-metric="actions"><div class="metric-value">${allActions}</div><div class="metric-label">ACTIONS</div></div>
    <div class="metric-cell" data-metric="commits"><div class="metric-value">${totalCommits.toLocaleString()}</div><div class="metric-label">TOTAL COMMITS</div></div>
  `

  // Pre-build popover content
  const popovers: Record<string, string> = {
    entries: buildEntriesPopover(entries),
    repos: buildReposPopover(repos),
    actions: buildActionsPopover(entries),
    commits: buildCommitsPopover(entries, repos),
  }

  // Attach hover handlers
  container.querySelectorAll('.metric-cell').forEach(cell => {
    const el = cell as HTMLElement
    const key = el.dataset.metric
    if (!key || !popovers[key]) return
    el.addEventListener('mouseenter', () => showMetricPopover(el, popovers[key]))
    el.addEventListener('mouseleave', hideMetricPopover)
  })
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

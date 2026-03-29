// Main entry point — hydrates the Jekyll-rendered HTML with client-side data

import { getEntries, getTags, getRepos } from './data'
import { initTheme } from './theme'
import { initFilters, toggleFilter, clearFilters, isFilterActive, hasActiveFilters, matchesFilters, getActiveFilters } from './filter'
import { initSearch } from './search'
import { renderMetrics, renderFilterBar, renderEntryList, renderSidebar } from './render'
import { initCommitPopovers } from './popover'

async function initIndex(): Promise<void> {
  const metricsEl = document.querySelector('.metrics-bar') as HTMLElement | null
  const filterEl = document.querySelector('.filter-bar') as HTMLElement | null
  const listEl = document.querySelector('.entry-list') as HTMLElement | null
  const sidebarEl = document.querySelector('.sidebar') as HTMLElement | null

  if (!listEl) return // Not on the index page

  const [entries, tags, repos] = await Promise.all([
    getEntries(),
    getTags(),
    getRepos(),
  ])

  function renderAll(): void {
    const filtered = entries.filter(matchesFilters)
    if (metricsEl) renderMetrics(metricsEl, entries)
    if (filterEl) renderFilterBar(filterEl, tags, { toggleFilter, isFilterActive, clearFilters, hasActiveFilters, getActiveFilters, filteredCount: filtered.length, totalCount: entries.length })
    renderEntryList(listEl!, filtered)
    if (sidebarEl) renderSidebar(sidebarEl, { repos, tags, toggleFilter, isFilterActive })

    // Bind clear link in empty state
    const clearLink = listEl!.querySelector('.filter-clear-link')
    if (clearLink) clearLink.addEventListener('click', clearFilters)
  }

  initFilters(renderAll)
  initSearch(entries)
  renderAll()
}

async function initArticleDetail(): Promise<void> {
  const relatedEl = document.querySelector('.related-articles') as HTMLElement | null
  if (!relatedEl) return

  const entries = await getEntries()
  const currentDate = relatedEl.dataset.date
  const current = entries.find(e => e.date === currentDate)
  if (!current) return

  // Find related articles (share 2+ tags)
  const currentTagNames = new Set(current.tags.map(t => t.name))
  const related = entries
    .filter(e => e.date !== currentDate)
    .map(e => {
      const overlap = e.tags.filter(t => currentTagNames.has(t.name)).length
      return { ...e, overlap }
    })
    .filter(e => e.overlap >= 2)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 5)

  if (related.length === 0) {
    relatedEl.style.display = 'none'
    return
  }

  const BASE = (document.querySelector('meta[name="baseurl"]') as HTMLMetaElement | null)?.content ?? '/daily-logger'
  relatedEl.innerHTML = `
    <div class="related-heading">RELATED ARTICLES</div>
    ${related.map(e => `
      <div class="related-item">
        <a href="${BASE}/articles/${e.date}/">${e.date} — ${e.title}</a>
        <span class="entry-stat">${e.overlap} shared tags</span>
      </div>
    `).join('')}
  `
}

// Init based on what's on the page
document.addEventListener('DOMContentLoaded', () => {
  initTheme()
  initIndex()
  initArticleDetail()
  initCommitPopovers()
})

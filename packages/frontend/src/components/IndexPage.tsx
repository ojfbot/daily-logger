import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEntries } from '../hooks/useEntries.ts'
import { useFilters } from '../hooks/useFilters.ts'
import type { EntryData } from '../store/types.ts'

function MetricsBar({ entries }: { entries: EntryData[] }) {
  const stats = useMemo(() => {
    const allRepos = new Set(entries.flatMap((e) => e.reposActive ?? []))
    const allActions = entries.reduce((sum, e) => sum + (e.actions?.length ?? 0), 0)

    let streak = 0
    if (entries.length > 0) {
      const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
      let checkDate = new Date(sorted[0].date + 'T12:00:00Z')
      for (const entry of sorted) {
        const entryDate = new Date(entry.date + 'T12:00:00Z')
        const diff = Math.round((checkDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))
        if (diff <= 1) { streak++; checkDate = entryDate } else break
      }
    }

    return { total: entries.length, repos: allRepos.size, actions: allActions, streak }
  }, [entries])

  return (
    <div className="metrics-bar">
      <div className="metric-cell"><div className="metric-value">{stats.total}</div><div className="metric-label">ENTRIES</div></div>
      <div className="metric-cell"><div className="metric-value">{stats.repos}</div><div className="metric-label">ACTIVE REPOS</div></div>
      <div className="metric-cell"><div className="metric-value">{stats.actions}</div><div className="metric-label">ACTIONS</div></div>
      <div className="metric-cell"><div className="metric-value">{stats.streak}</div><div className="metric-label">DAY STREAK</div></div>
    </div>
  )
}

function FilterBar({ filtered, total }: { filtered: number; total: number }) {
  const { active, toggleFilter, clearFilters, hasActiveFilters } = useFilters()

  if (!hasActiveFilters()) return null

  return (
    <div className="filter-bar">
      <div className="filter-active-banner">
        <span className="filter-count">Showing {filtered} of {total}</span>
        {Object.entries(active).map(([type, names]) =>
          names.map((name) => (
            <span
              key={`${type}-${name}`}
              className="filter-active-chip"
              onClick={() => toggleFilter(type, name)}
            >
              {name} <span className="filter-chip-x">&times;</span>
            </span>
          )),
        )}
        <button className="filter-clear-btn" onClick={clearFilters}>Clear all</button>
      </div>
    </div>
  )
}

function EntryCard({ entry }: { entry: EntryData }) {
  return (
    <article className="entry-card">
      <Link to={`/articles/${entry.date}`} className="entry-link">
        <div className="entry-header">
          <time className="entry-date">{entry.date}</time>
          <span className="entry-stat">{entry.commitCount} commits</span>
        </div>
        <h2 className="entry-title">{entry.title}</h2>
        <p className="entry-summary">{entry.summary}</p>
        <div className="entry-tags">
          {entry.tags.map((t) => (
            <span key={t.name} className={`tag tag-${t.type}`}>{t.name}</span>
          ))}
        </div>
      </Link>
    </article>
  )
}

function Sidebar() {
  const { repos, tags } = useEntries()
  const { toggleFilter, isFilterActive } = useFilters()

  return (
    <aside className="sidebar">
      <section className="sidebar-section">
        <h3 className="sidebar-heading">REPOS</h3>
        {repos.slice(0, 10).map((r) => (
          <button
            key={r.name}
            className={`sidebar-item ${isFilterActive('repo', r.name) ? 'active' : ''}`}
            onClick={() => toggleFilter('repo', r.name)}
          >
            <span>{r.name}</span>
            <span className="sidebar-count">{r.articleCount}</span>
          </button>
        ))}
      </section>
      <section className="sidebar-section">
        <h3 className="sidebar-heading">TOP TAGS</h3>
        {tags.filter((t) => t.type !== 'repo').slice(0, 10).map((t) => (
          <button
            key={t.name}
            className={`sidebar-item ${isFilterActive(t.type, t.name) ? 'active' : ''}`}
            onClick={() => toggleFilter(t.type, t.name)}
          >
            <span>{t.name}</span>
            <span className="sidebar-count">{t.count}</span>
          </button>
        ))}
      </section>
    </aside>
  )
}

export function IndexPage() {
  const { entries, loading, error } = useEntries()
  const { matchesFilters } = useFilters()

  const filtered = useMemo(() => entries.filter(matchesFilters), [entries, matchesFilters])

  if (loading) return <div className="loading">Loading articles...</div>
  if (error) return <div className="error">Error: {error}</div>

  return (
    <div className="index-layout">
      <div className="index-main">
        <MetricsBar entries={entries} />
        <FilterBar filtered={filtered.length} total={entries.length} />
        <div className="entry-list">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <p>No articles match your filters.</p>
              <button className="filter-clear-link">Clear filters</button>
            </div>
          ) : (
            filtered.map((e) => <EntryCard key={e.date} entry={e} />)
          )}
        </div>
      </div>
      <Sidebar />
    </div>
  )
}

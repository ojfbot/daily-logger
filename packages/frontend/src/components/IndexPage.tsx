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

function FilterBar({ tags, filtered, total }: { tags: { name: string; type: string; count: number }[]; filtered: number; total: number }) {
  const { active, toggleFilter, clearFilters, hasActiveFilters } = useFilters()

  if (hasActiveFilters()) {
    return (
      <div className="filter-bar">
        <div className="filter-active-banner">
          <span className="filter-active-label">SHOWING {filtered} OF {total}</span>
          <span className="filter-active-chips">
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
          </span>
          <span className="filter-clear" onClick={clearFilters}>CLEAR ALL</span>
        </div>
      </div>
    )
  }

  // Default: compact filter bar with top 12 tags
  const topTags = tags.slice(0, 12)
  return (
    <div className="filter-bar">
      <span className="filter-label">FILTER</span>
      {topTags.map((tag) => (
        <span
          key={tag.name}
          className="tag"
          data-type={tag.type}
          onClick={() => toggleFilter(tag.type, tag.name)}
        >
          {tag.name}
        </span>
      ))}
    </div>
  )
}

function EntryCard({ entry }: { entry: EntryData }) {
  const reposCount = entry.reposActive?.length ?? 0
  const commitStr = entry.commitCount > 0 ? `${entry.commitCount} commits` : 'rest day'

  return (
    <div className="entry-card">
      <Link to={`/articles/${entry.date}`}>
        <div className="entry-date">{entry.date}</div>
        <div className="entry-title">{entry.title}</div>
        <div className="entry-summary">{entry.summary}</div>
        <div className="entry-meta">
          <div className="entry-tags">
            {entry.tags.map((t) => (
              <span key={t.name} className="tag" data-type={t.type}>{t.name}</span>
            ))}
          </div>
          <span className="entry-stat">{reposCount} repos</span>
          <span className="entry-stat">{commitStr}</span>
        </div>
      </Link>
    </div>
  )
}

function Sidebar() {
  const { repos, tags } = useEntries()
  const { toggleFilter, isFilterActive } = useFilters()

  const archTags = tags.filter((t) => t.type === 'arch').slice(0, 8)
  const phaseTags = tags.filter((t) => t.type === 'phase').slice(0, 6)

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-heading">REPOS</div>
        {repos.slice(0, 10).map((r) => (
          <div
            key={r.name}
            className={`sidebar-item${isFilterActive('repo', r.name) ? ' active' : ''}`}
            onClick={() => toggleFilter('repo', r.name)}
          >
            <span>{r.name}</span>
            <span className="sidebar-count">{r.articleCount}</span>
          </div>
        ))}
      </div>
      {archTags.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-heading">ARCHITECTURE</div>
          {archTags.map((t) => (
            <div
              key={t.name}
              className={`sidebar-item${isFilterActive('arch', t.name) ? ' active' : ''}`}
              onClick={() => toggleFilter('arch', t.name)}
            >
              <span>{t.name}</span>
              <span className="sidebar-count">{t.count}</span>
            </div>
          ))}
        </div>
      )}
      {phaseTags.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-heading">PHASES</div>
          {phaseTags.map((t) => (
            <div
              key={t.name}
              className={`sidebar-item${isFilterActive('phase', t.name) ? ' active' : ''}`}
              onClick={() => toggleFilter('phase', t.name)}
            >
              <span>{t.name}</span>
              <span className="sidebar-count">{t.count}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}

export function IndexPage() {
  const { entries, tags, loading, error } = useEntries()
  const { matchesFilters } = useFilters()

  const filtered = useMemo(() => entries.filter(matchesFilters), [entries, matchesFilters])

  if (loading) return <div className="loading">Loading articles...</div>
  if (error) return <div className="error">Error: {error}</div>

  return (
    <>
      <MetricsBar entries={entries} />
      <FilterBar tags={tags} filtered={filtered.length} total={entries.length} />
      <div className="layout-with-sidebar">
        <div className="entry-list">
          {filtered.length === 0 ? (
            <div className="empty-state">No entries match these filters.</div>
          ) : (
            filtered.map((e) => <EntryCard key={e.date} entry={e} />)
          )}
        </div>
        <Sidebar />
      </div>
    </>
  )
}

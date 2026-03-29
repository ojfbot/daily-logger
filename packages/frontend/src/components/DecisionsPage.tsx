import { useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useEntries } from '../hooks/useEntries.ts'

export function DecisionsPage() {
  const { entries, loading } = useEntries()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = useCallback((idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const decisions = useMemo(() =>
    entries.flatMap((e) =>
      (e.decisions ?? []).map((d) => ({ ...d, date: e.date })),
    ).sort((a, b) => b.date.localeCompare(a.date)),
  [entries])

  if (loading) return <div className="loading">Loading decisions...</div>

  return (
    <div className="decisions-page">
      <div className="article-header">
        <h1 className="article-title">Decisions</h1>
        <p className="entry-summary">{decisions.length} architectural decisions across {entries.length} articles</p>
      </div>
      <div className="decisions-list">
        {decisions.map((d, i) => {
          const isOpen = expanded.has(i)
          return (
            <div key={`${d.date}-${i}`} className={`decision-card ${isOpen ? 'decision-open' : ''}`}>
              <div className="decision-card-header" onClick={() => toggle(i)}>
                <span className={`decision-expand ${isOpen ? 'decision-expand-open' : ''}`}>&#9656;</span>
                <h3 className="decision-title">{d.title}</h3>
                <span className="decision-date-badge">{d.date}</span>
                <span className="decision-repo">{d.repo}</span>
              </div>
              {isOpen && (
                <div className="decision-card-body">
                  {d.summary && <p className="decision-summary">{d.summary}</p>}
                  {!d.summary && <p className="decision-summary decision-summary-empty">No summary available — see source article for details.</p>}
                  <div className="decision-meta">
                    {d.pillar && <span className="pillar-badge">{d.pillar}</span>}
                    {d.relatedTags.length > 0 && (
                      <div className="entry-tags">
                        {d.relatedTags.map((t) => <span key={t} className="tag">{t}</span>)}
                      </div>
                    )}
                  </div>
                  <Link to={`/articles/${d.date}`} className="decision-article-link">View source article &rarr;</Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

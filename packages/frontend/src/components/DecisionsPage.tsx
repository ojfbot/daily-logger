import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEntries } from '../hooks/useEntries.ts'

export function DecisionsPage() {
  const { entries, loading } = useEntries()

  const decisions = useMemo(() =>
    entries.flatMap((e) =>
      (e.decisions ?? []).map((d) => ({ ...d, date: e.date })),
    ).sort((a, b) => b.date.localeCompare(a.date)),
  [entries])

  if (loading) return <div className="loading">Loading decisions...</div>

  return (
    <div className="decisions-page">
      <h1>Decisions</h1>
      <p className="page-subtitle">{decisions.length} architectural decisions across {entries.length} articles</p>
      <div className="decisions-list">
        {decisions.map((d, i) => (
          <div key={`${d.date}-${i}`} className="decision-card">
            <div className="decision-header">
              <Link to={`/articles/${d.date}`} className="decision-date">{d.date}</Link>
              <span className="decision-repo">{d.repo}</span>
              {d.pillar && <span className="decision-pillar">{d.pillar}</span>}
            </div>
            <h3 className="decision-title">{d.title}</h3>
            {d.summary && <p className="decision-summary">{d.summary}</p>}
            {d.relatedTags.length > 0 && (
              <div className="entry-tags">
                {d.relatedTags.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

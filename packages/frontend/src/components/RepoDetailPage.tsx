import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useEntries } from '../hooks/useEntries.ts'

export function RepoDetailPage() {
  const { name } = useParams<{ name: string }>()
  const { entries, repos, loading } = useEntries()

  const repo = repos.find((r) => r.name === name)
  const repoEntries = useMemo(() =>
    entries.filter((e) => e.reposActive?.includes(name ?? '')),
  [entries, name])

  if (loading) return <div className="loading">Loading repo data...</div>

  if (!repo) {
    return (
      <div className="error">
        <h1>Repo not found</h1>
        <p>No data for repo "{name}".</p>
        <Link to="/">Back to index</Link>
      </div>
    )
  }

  return (
    <div className="repo-detail-page">
      <h1>{repo.name}</h1>
      <div className="metrics-bar">
        <div className="metric-cell"><div className="metric-value">{repo.articleCount}</div><div className="metric-label">ARTICLES</div></div>
        <div className="metric-cell"><div className="metric-value">{repo.totalCommits}</div><div className="metric-label">TOTAL COMMITS</div></div>
      </div>
      {repo.relatedTags.length > 0 && (
        <div className="entry-tags" style={{ marginBottom: '1.5rem' }}>
          {repo.relatedTags.map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
      )}
      <h2>Articles mentioning {repo.name}</h2>
      <div className="entry-list">
        {repoEntries.map((e) => (
          <article key={e.date} className="entry-card">
            <Link to={`/articles/${e.date}`} className="entry-link">
              <div className="entry-header">
                <time className="entry-date">{e.date}</time>
                <span className="entry-stat">{e.commitCount} commits</span>
              </div>
              <h3 className="entry-title">{e.title}</h3>
              <p className="entry-summary">{e.summary}</p>
            </Link>
          </article>
        ))}
      </div>
    </div>
  )
}

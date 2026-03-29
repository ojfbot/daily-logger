import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEntries } from '../hooks/useEntries.ts'

export function ActionsPage() {
  const { actions, doneActions, loading } = useEntries()

  const sorted = useMemo(() =>
    [...actions].sort((a, b) => b.sourceDate.localeCompare(a.sourceDate)),
  [actions])

  const sortedDone = useMemo(() =>
    [...doneActions].sort((a, b) => b.sourceDate.localeCompare(a.sourceDate)),
  [doneActions])

  if (loading) return <div className="loading">Loading actions...</div>

  return (
    <div className="actions-page">
      <h1>Actions</h1>
      <p className="page-subtitle">{sorted.length} open action items{sortedDone.length > 0 ? `, ${sortedDone.length} completed` : ''}</p>
      <div className="actions-list">
        {sorted.map((a, i) => (
          <div key={`${a.sourceDate}-${i}`} className="action-card">
            <div className="action-header">
              <Link to={`/articles/${a.sourceDate}`} className="action-date">{a.sourceDate}</Link>
              <code className="action-command">{a.command}</code>
              <span className="action-repo">{a.repo}</span>
              <span className={`action-status status-${a.status}`}>{a.status}</span>
            </div>
            <p className="action-description">{a.description}</p>
          </div>
        ))}
      </div>
      {sortedDone.length > 0 && (
        <>
          <h2>Completed</h2>
          <div className="actions-list">
            {sortedDone.map((a, i) => (
              <div key={`done-${a.sourceDate}-${i}`} className="action-card action-done">
                <div className="action-header">
                  <Link to={`/articles/${a.sourceDate}`} className="action-date">{a.sourceDate}</Link>
                  <code className="action-command">{a.command}</code>
                  <span className="action-repo">{a.repo}</span>
                  <span className="action-status status-done">done</span>
                </div>
                <p className="action-description">{a.description}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

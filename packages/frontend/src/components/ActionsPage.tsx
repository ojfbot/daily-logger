import { useMemo, useState } from 'react'
import { useEntries } from '../hooks/useEntries.ts'
import type { ActionItem } from '../store/types.ts'

const STALE_DAYS = 14

function daysSince(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z')
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function actionHash(a: ActionItem): string {
  return `${a.sourceDate}:${a.command}:${a.repo}:${a.description}`
}

function ActionItemRow({ a, extraClass = '' }: { a: ActionItem; extraClass?: string }) {
  return (
    <div className={`action-item ${extraClass}`}>
      <span className="action-command">{a.command}</span>
      <span>
        {a.description}{' '}
        <span className="entry-stat">({a.repo}, {a.sourceDate})</span>
      </span>
    </div>
  )
}

export function ActionsPage() {
  const { actions, doneActions, loading } = useEntries()
  const [filter, setFilter] = useState<string | null>(null)

  const doneSet = useMemo(() => {
    const s = new Set<string>()
    for (const a of doneActions) s.add(actionHash(a))
    return s
  }, [doneActions])

  const commands = useMemo(() => {
    const s = new Set<string>()
    for (const a of actions) s.add(a.command)
    return Array.from(s).sort()
  }, [actions])

  const { open, stale, done } = useMemo(() => {
    const open: ActionItem[] = []
    const stale: ActionItem[] = []
    const done: ActionItem[] = []

    const sorted = [...actions].sort((a, b) => b.sourceDate.localeCompare(a.sourceDate))

    for (const a of sorted) {
      if (filter && a.command !== filter) continue
      if (doneSet.has(actionHash(a))) {
        done.push(a)
      } else if (daysSince(a.sourceDate) > STALE_DAYS) {
        stale.push(a)
      } else {
        open.push(a)
      }
    }
    return { open, stale, done }
  }, [actions, doneSet, filter])

  if (loading) return <div className="loading">Loading actions...</div>

  return (
    <div className="actions-page">
      <div className="article-header">
        <h1 className="article-title">Actions</h1>
        <p className="entry-summary">Suggested action items extracted from daily articles.</p>
      </div>

      <hr />

      {commands.length > 0 && (
        <div className="actions-filter">
          <button
            className={`filter-btn ${filter === null ? 'active' : ''}`}
            onClick={() => setFilter(null)}
          >
            FILTER
          </button>
          {commands.map(cmd => (
            <button
              key={cmd}
              className={`filter-btn ${filter === cmd ? 'active' : ''}`}
              onClick={() => setFilter(filter === cmd ? null : cmd)}
            >
              {cmd}
            </button>
          ))}
        </div>
      )}

      <div className="actions-columns">
        <div className="actions-column">
          <div className="actions-column-header">Open</div>
          <div id="actions-open">
            {open.length === 0
              ? <p className="entry-stat">No open items.</p>
              : open.map((a, i) => <ActionItemRow key={`open-${i}`} a={a} />)}
          </div>
        </div>

        <div className="actions-column">
          <div className="actions-column-header">Stale (&gt;14 days)</div>
          <div id="actions-stale">
            {stale.length === 0
              ? <p className="entry-stat">No stale items.</p>
              : stale.map((a, i) => <ActionItemRow key={`stale-${i}`} a={a} extraClass="action-stale" />)}
          </div>
        </div>

        <div className="actions-column">
          <div className="actions-column-header">Done</div>
          <div id="actions-done">
            {done.length === 0
              ? <p className="entry-stat">No completed items.</p>
              : done.map((a, i) => <ActionItemRow key={`done-${i}`} a={a} extraClass="action-done" />)}
          </div>
        </div>
      </div>
    </div>
  )
}

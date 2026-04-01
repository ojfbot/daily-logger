import { useMemo, useState, useRef, useCallback } from 'react'
import { useEntries } from '../hooks/useEntries.ts'
import { ActionPopover } from './ActionPopover.tsx'
import type { ActionItem } from '../store/types.ts'

const STALE_DAYS = 5
const RECENT_DONE_DAYS = 14
const SHOW_DELAY = 200

function daysSince(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z')
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
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

function ArchivedRow({ a }: { a: ActionItem }) {
  return (
    <div className="action-item action-archived">
      <span className="action-command">{a.command}</span>
      <span className="action-archived-meta">{a.repo}</span>
      <span className="entry-stat">{a.sourceDate}</span>
    </div>
  )
}

export function ActionsPage() {
  const { actions, doneActions, loading } = useEntries()
  const [filter, setFilter] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [popover, setPopover] = useState<{ anchor: HTMLElement | null; item: ActionItem | null }>({ anchor: null, item: null })
  const hoverTimer = useRef<number>(0)

  const commands = useMemo(() => {
    const s = new Set<string>()
    for (const a of actions) s.add(a.command)
    for (const a of doneActions) s.add(a.command)
    return Array.from(s).sort()
  }, [actions, doneActions])

  const { open, stale } = useMemo(() => {
    const open: ActionItem[] = []
    const stale: ActionItem[] = []

    const sorted = [...actions].sort((a, b) => b.sourceDate.localeCompare(a.sourceDate))

    for (const a of sorted) {
      if (filter && a.command !== filter) continue
      if (daysSince(a.sourceDate) > STALE_DAYS) {
        stale.push(a)
      } else {
        open.push(a)
      }
    }
    return { open, stale }
  }, [actions, filter])

  const { recentDone, archivedDone } = useMemo(() => {
    const recentDone: ActionItem[] = []
    const archivedDone: ActionItem[] = []

    const sorted = [...doneActions].sort((a, b) => {
      const dateA = a.closedDate || a.sourceDate
      const dateB = b.closedDate || b.sourceDate
      return dateB.localeCompare(dateA)
    })

    for (const a of sorted) {
      if (filter && a.command !== filter) continue
      const refDate = a.closedDate || a.sourceDate
      if (daysSince(refDate) <= RECENT_DONE_DAYS) {
        recentDone.push(a)
      } else {
        archivedDone.push(a)
      }
    }
    return { recentDone, archivedDone }
  }, [doneActions, filter])

  const handleDoneEnter = useCallback((e: React.MouseEvent, a: ActionItem) => {
    if (!a.resolution && !a.closedDate) return
    const target = e.currentTarget as HTMLElement
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => {
      setPopover({ anchor: target, item: a })
    }, SHOW_DELAY)
  }, [])

  const handleDoneLeave = useCallback(() => {
    window.clearTimeout(hoverTimer.current)
    setPopover({ anchor: null, item: null })
  }, [])

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
          <div className="actions-column-header">Open ({open.length})</div>
          <div>
            {open.length === 0
              ? <p className="entry-stat">No open items.</p>
              : open.map((a, i) => <ActionItemRow key={`open-${i}`} a={a} />)}
          </div>
        </div>

        <div className="actions-column">
          <div className="actions-column-header">Stale (&gt;{STALE_DAYS} days) ({stale.length})</div>
          <div>
            {stale.length === 0
              ? <p className="entry-stat">No stale items.</p>
              : stale.map((a, i) => <ActionItemRow key={`stale-${i}`} a={a} extraClass="action-stale" />)}
          </div>
        </div>

        <div className="actions-column">
          <div className="actions-column-header">
            Recently Done ({recentDone.length})
          </div>
          <div>
            {recentDone.length === 0
              ? <p className="entry-stat">No recently completed items.</p>
              : recentDone.map((a, i) => (
                <div
                  key={`recent-${i}`}
                  onMouseEnter={(e) => handleDoneEnter(e, a)}
                  onMouseLeave={handleDoneLeave}
                >
                  <ActionItemRow a={a} extraClass="action-recent-done" />
                </div>
              ))}
          </div>

          {archivedDone.length > 0 && (
            <>
              <div
                className="actions-column-header action-archive-toggle"
                style={{ marginTop: '1.5rem' }}
                onClick={() => setArchiveOpen(!archiveOpen)}
              >
                <span>{archiveOpen ? '▾' : '▸'} Archived ({archivedDone.length})</span>
              </div>
              {archiveOpen && (
                <div>
                  {archivedDone.map((a, i) => (
                    <div
                      key={`arch-${i}`}
                      onMouseEnter={(e) => handleDoneEnter(e, a)}
                      onMouseLeave={handleDoneLeave}
                    >
                      <ArchivedRow a={a} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ActionPopover
        visible={!!popover.anchor}
        anchor={popover.anchor}
        resolution={popover.item?.resolution}
        closedDate={popover.item?.closedDate}
      />
    </div>
  )
}

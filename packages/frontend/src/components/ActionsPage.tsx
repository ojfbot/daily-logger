import { useMemo, useState, useRef, useCallback } from 'react'
import { useEntries } from '../hooks/useEntries.ts'
import { ActionPopover } from './ActionPopover.tsx'
import type { ActionItem, ReviewedActionItem } from '../store/types.ts'

const STALE_DAYS = 5
const RECENT_DONE_DAYS = 14
const SHOW_DELAY = 200

function daysSince(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z')
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function isReviewedAction(action: ActionItem): action is ReviewedActionItem {
  return 'review' in action && action.review !== undefined
}

function closedDate(action: ActionItem): string | undefined {
  return 'closedDate' in action ? action.closedDate : undefined
}

function resolution(action: ActionItem): string | undefined {
  return 'resolution' in action ? action.resolution : undefined
}

function ActionItemRow({ a, extraClass = '' }: { a: ActionItem; extraClass?: string }) {
  return (
    <div className={`action-item ${extraClass}`}>
      <span className="action-command">{a.command}</span>
      <span>
        {('currentDescription' in a ? a.currentDescription : undefined) ?? a.description}{' '}
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

const dispositionLabels = {
  deferred: 'Deferred',
  'completed-existing-evidence': 'Evidence complete · unsettled',
  'pending-receipt': 'Pending receipt',
} as const

function ReviewedActionRow({ action }: { action: ReviewedActionItem }) {
  const { disposition, source } = action.review
  const owner = disposition.kind === 'deferred' || disposition.kind === 'pending-receipt'
    ? `${disposition.owner.title} (${disposition.owner.threadId})`
    : null
  const explanation = disposition.kind === 'deferred'
    ? disposition.reason
    : disposition.kind === 'completed-existing-evidence'
      ? disposition.qualification
      : disposition.acceptanceCriteria.join(' ')

  return (
    <article className={`action-item action-reviewed action-reviewed-${disposition.kind}`}>
      <div>
        <div className="action-reviewed-heading">
          <span className="action-disposition">{dispositionLabels[disposition.kind]}</span>
          <code className="action-id">{action.id}</code>
        </div>
        <code className="action-invocation">{action.invocation}</code>
        <p>{action.description}</p>
        <p className="entry-stat">{explanation}</p>
        {owner && <p className="entry-stat">Owner: {owner}</p>}
        {disposition.kind === 'completed-existing-evidence' && (
          <ul className="action-evidence">
            {disposition.evidence.map((evidence) => (
              <li key={evidence.kind === 'repository-file' ? evidence.path : evidence.locator}>
                {evidence.kind === 'repository-file'
                  ? <a href={`https://github.com/ojfbot/daily-logger/blob/${evidence.commitSha}/${evidence.path}`}>{evidence.path}</a>
                  : <span>{evidence.locator} ({evidence.verification})</span>}
                {' — '}{evidence.qualification}
              </li>
            ))}
          </ul>
        )}
        <p className="entry-stat">Next safe retry: {disposition.nextSafeRetry}</p>
        <a className="entry-stat" href={source.url}>Source {source.articlePath}:{source.line}</a>
      </div>
    </article>
  )
}

export function ActionsPage() {
  const { actions, doneActions, proposedActions, loading, error, proposedError } = useEntries()
  const [filter, setFilter] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [popover, setPopover] = useState<{ anchor: HTMLElement | null; item: ActionItem | null }>({ anchor: null, item: null })
  const hoverTimer = useRef<number>(0)

  const commands = useMemo(() => {
    const s = new Set<string>()
    for (const a of actions) s.add(a.command)
    for (const a of doneActions) s.add(a.command)
    for (const a of proposedActions) s.add(a.command)
    return Array.from(s).sort()
  }, [actions, doneActions, proposedActions])
  const proposed = proposedActions.filter(action => action.status === 'proposed' && (!filter || action.command === filter))
  const needsReview = proposedActions.filter(action => action.status === 'needs-review' && (!filter || action.command === filter))

  const { open, stale, reviewed } = useMemo(() => {
    const open: ActionItem[] = []
    const stale: ActionItem[] = []
    const reviewed: ReviewedActionItem[] = []

    const sorted = [...actions].sort((a, b) => b.sourceDate.localeCompare(a.sourceDate))

    for (const a of sorted) {
      if (filter && a.command !== filter) continue
      if (isReviewedAction(a)) {
        reviewed.push(a)
        continue
      }
      if (daysSince(a.sourceDate) > STALE_DAYS) {
        stale.push(a)
      } else {
        open.push(a)
      }
    }
    return { open, stale, reviewed }
  }, [actions, filter])

  const { recentDone, archivedDone } = useMemo(() => {
    const recentDone: ActionItem[] = []
    const archivedDone: ActionItem[] = []

    const sorted = [...doneActions].sort((a, b) => {
      const dateA = closedDate(a) || a.sourceDate
      const dateB = closedDate(b) || b.sourceDate
      return dateB.localeCompare(dateA)
    })

    for (const a of sorted) {
      if (filter && a.command !== filter) continue
      const refDate = closedDate(a) || a.sourceDate
      if (daysSince(refDate) <= RECENT_DONE_DAYS) {
        recentDone.push(a)
      } else {
        archivedDone.push(a)
      }
    }
    return { recentDone, archivedDone }
  }, [doneActions, filter])

  const handleDoneEnter = useCallback((e: React.MouseEvent, a: ActionItem) => {
    if (!resolution(a) && !closedDate(a)) return
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
        <p className="entry-summary">Verified suggestions and tracked work from daily articles.</p>
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

      {error && <p role="alert">{error}</p>}
      {proposedError && <p role="alert">{proposedError}</p>}
      <div className="actions-columns">
        {needsReview.length > 0 && <div className="actions-column actions-column-needs-review">
          <div className="actions-column-header">Needs review ({needsReview.length})</div>
          {needsReview.map(action => <article className="action-item" data-draft-candidate-id={action.id} key={action.id}><div><code>{action.command}</code><p>{action.description}</p><p className="entry-stat">Accepted article {action.sourceDate} · Needs review · Review needed before use</p><p className="entry-stat">{action.status === 'needs-review' ? action.reason : ''}</p><a href={`/articles/${action.sourceDate}`}>Read the original suggestion</a></div></article>)}
        </div>}
        <div className="actions-column">
          <div className="actions-column-header">Proposed ({proposed.length})</div>
          {proposed.length === 0 ? <p className="entry-stat">No draft proposals.</p> : proposed.map(action => <article className="action-item" key={action.id}><div><code>{action.command}</code><p>{action.description}</p><p className="entry-stat">Draft {action.sourceDate} · {action.includeInIndex ? 'Included on acceptance' : 'Article only on acceptance'}</p></div></article>)}
        </div>
        <div className="actions-column actions-column-reviewed">
          <div className="actions-column-header">Reviewed ({reviewed.length})</div>
          <div>
            {reviewed.length === 0
              ? <p className="entry-stat">No reviewed items.</p>
              : reviewed.map((action) => <ReviewedActionRow key={action.id} action={action} />)}
          </div>
        </div>

        <div className="actions-column">
          <div className="actions-column-header">Open ({open.length})</div>
          <div>
            {open.length === 0
              ? <p className="entry-stat">No open items.</p>
              : open.map((a) => <ActionItemRow key={a.id ?? `${a.command}-${a.sourceDate}-${a.description}`} a={a} />)}
          </div>
        </div>

        <div className="actions-column">
          <div className="actions-column-header">Stale (&gt;{STALE_DAYS} days) ({stale.length})</div>
          <div>
            {stale.length === 0
              ? <p className="entry-stat">No stale items.</p>
              : stale.map((a) => <ActionItemRow key={a.id ?? `${a.command}-${a.sourceDate}-${a.description}`} a={a} extraClass="action-stale" />)}
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
        resolution={popover.item ? resolution(popover.item) : undefined}
        closedDate={popover.item ? closedDate(popover.item) : undefined}
      />
    </div>
  )
}

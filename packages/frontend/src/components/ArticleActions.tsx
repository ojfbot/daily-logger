import { useEffect, useState } from 'react'
import type { ActionRecord } from '../../../../src/action-registry-schema.ts'
import { loadEditorialActions, saveActionInclusion, type EditorialActions } from '../utils/actionInclusion.ts'

export function ArticleActions({ date, records, login, visibleBlobSha, draft, onReadyChange }: { date: string; records: ActionRecord[]; login?: string; visibleBlobSha?: string; draft: boolean; onReadyChange?: (ready: boolean) => void }) {
  const [saved, setSaved] = useState<EditorialActions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ key: string; include: boolean } | null>(null)
  const hasEditable = records.some(record => record.origin === 'suggested' && record.introducedBy === date && ['open', 'proposed'].includes(record.state))
  useEffect(() => { onReadyChange?.(!!saved && !busy && !error) }, [saved, busy, error, onReadyChange])
  useEffect(() => {
    setSaved(null); setError(null)
    if (!login || !visibleBlobSha || !draft || !hasEditable) return
    let active = true
    loadEditorialActions(date, visibleBlobSha).then(value => { if (active) setSaved(value) }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Action state unavailable') })
    return () => { active = false }
  }, [date, login, visibleBlobSha, draft, hasEditable])
  const candidates = records.filter(record => record.origin === 'suggested' && ['open', 'proposed'].includes(record.state))
  if (candidates.length === 0) return null
  async function update(key: string, include: boolean) {
    if (!saved || !login || !visibleBlobSha) return
    setPending({ key, include }); setBusy(true); setError(null)
    try { setSaved(await saveActionInclusion({ date, visibleBlobSha, expectedSha: saved.sha, key, include, login })) }
    catch (error) { setSaved(null); setError(error instanceof Error ? error.message : 'Action choice was not confirmed') }
    finally { setBusy(false); setPending(null) }
  }
  return <section className="article-action-options" aria-label="Suggested action tracking">
    <h3>Action tracking</h3>
    {candidates.map(record => {
      const current = saved?.registry.records.find(item => item.key === record.key) ?? record
      return <div key={record.key} className="article-action-option">
        <p><code>{record.original.command}</code> {record.history.at(-1)?.description ?? record.original.description}</p>
        {record.introducedBy !== date ? <p>Existing suggestion from {record.introducedBy}. Its tracking choice is retained.</p> : draft && login ? <label><input type="checkbox" checked={pending?.key === record.key ? pending.include : current.includeInIndex} disabled={!saved || busy || !saved.draft} onChange={event => { void update(record.key, event.currentTarget.checked) }} /> Include in master actions index</label> : <p>{current.includeInIndex ? 'Included in master actions index' : 'Article only'}</p>}
      </div>
    })}
    {draft && <p className="entry-stat" role="status">{busy ? 'Saving choice to the editorial branch…' : saved && !saved.draft ? 'Acceptance is staged. Tracking choices are read-only; editorial feedback can continue.' : saved ? 'Choices saved on the editorial branch. They take effect with article acceptance.' : 'Default on. Checked suggestions enter the index when accepted.'}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}

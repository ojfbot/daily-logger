import { describe, expect, it } from 'vitest'
import { createReviewService } from '../../api/_lib/article-review-service.js'
import { requestSchema } from '../../shared/article-review.js'
import { blob, createFixture, recordPath, review, today } from './fixture.js'

async function setup() {
  const fixture = createFixture()
  const service = createReviewService(fixture.github)
  const projection = await service.load(today, blob)
  const entry = projection.entries[0]
  if (!entry) throw new Error('Missing seeded record')
  const request = requestSchema.parse({ schemaVersion: 1, intent: 'request_changes', requestId: crypto.randomUUID(), date: today,
    visibleBlobSha: blob, selections: [{ reviewId: review.id, recordBlobSha: entry.recordBlobSha, findingId: 'C1' }], feedback: ' \t\n雪\n---\n<!-- EDITORIAL_FEEDBACK_V2_END -->\n\t ' })
  return { ...fixture, service, projection, request }
}

describe('registered article review and request-changes seam', () => {
  it('gives an agent the same pinned findings as the UI, with only registered visibility', async () => {
    const { projection } = await setup()
    expect(projection.discovery).toBe('registered_records_only')
    expect(projection.entries[0]?.review.result).toBe('completed')
    expect(projection.entries[0]?.review).toEqual(review)
    expect(projection.entries[0]?.freshness).toBe('current')
    expect(projection.entries[0]?.lifecycle).toBe('published')
  })
  it('persists exact feedback and finding identity using only a comment; replays the same request without another write', async () => {
    const { state, service, request } = await setup()
    const receipt = await service.requestChanges(request, 'editor')
    const again = await service.requestChanges(request, 'editor')
    expect(again).toEqual({ ...receipt, reused: true })
    const writes = state.calls.filter((call) => !call.startsWith('GET '))
    expect(writes).toEqual(['POST /repos/ojfbot/daily-logger/issues/357/comments'])
    const body = state.comments[0]?.body ?? ''
    const encoded = body.split('<!-- ARTICLE_REVIEW_REQUEST_V1_START -->')[1]?.split('<!-- ARTICLE_REVIEW_REQUEST_V1_END -->')[0]?.trim() ?? ''
    const actual: unknown = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    expect(actual).toEqual({ ...request, actor: 'editor' })
    expect((await service.load(today, blob)).requests[0]?.findingIds).toEqual(['C1'])
  })
  it('shows changed article as stale and refuses a request before any mutation', async () => {
    const { state, service, request } = await setup()
    state.blob = 'b'.repeat(40)
    const view = await service.load(today, state.blob)
    expect(view.entries).toHaveLength(0) // mismatched claimed source blob is unavailable, never eligible
    expect(view.unavailable.join()).toContain('disagree')
    await expect(service.requestChanges(request, 'editor')).rejects.toThrow('article changed')
    expect(state.comments).toHaveLength(0)
  })
  it('marks a review stale against a changed visible blob and unknown without a visible fingerprint', async () => {
    const { service } = await setup()
    expect((await service.load(today, 'a'.repeat(40))).entries[0]?.freshness).toBe('stale')
    expect((await service.load(today, null)).entries[0]?.freshness).toBe('visible_revision_unknown')
  })
  it('retains historical October 13 T1 finding, independently stale after #356', async () => {
    const { service } = await setup()
    const old = await service.load('2026-10-13', '069636cadb3a468ce9cdee15e461f763c17cb674')
    expect(old.entries[0]?.review.result === 'completed' && old.entries[0]?.review.findings[0]?.id).toBe('C1')
    expect(old.entries[0]?.freshness).toBe('stale')
  })
  it('distinguishes an absent registration from unavailable or failed review', async () => {
    const { state, service } = await setup()
    state.registry.records = []
    expect((await service.load(today, blob)).entries).toEqual([])
    state.registry.records = [{ date: today, path: recordPath }]
    state.files.set(recordPath, '{broken')
    expect((await service.load(today, blob)).unavailable).toHaveLength(1)
    state.files.set(recordPath, JSON.stringify({ ...review, result: 'failed', reason: 'Worker interrupted', findings: undefined }))
    expect((await service.load(today, blob)).entries[0]?.review.result).toBe('failed')
  })
  it('shows only registered exact-head proposals; a moved PR is unavailable instead of published', async () => {
    const { state, service } = await setup()
    state.registry.records = []
    state.registry.proposals = [{ date: today, path: recordPath, pullRequest: 999, headSha: state.prHead }]
    expect((await service.load(today, blob)).entries[0]?.lifecycle).toBe('proposed')
    state.prHead = 'b'.repeat(40)
    const view = await service.load(today, blob)
    expect(view.entries).toEqual([])
    expect(view.unavailable.join()).toContain('head changed')
  })
  it('rejects changed record bindings, unknown findings, duplicate selections, blank feedback, and absent routing', async () => {
    const { state, service, request } = await setup()
    const selection = request.selections[0]
    if (!selection) throw new Error('No seed finding')
    await expect(service.requestChanges({ ...request, selections: [{ ...selection, recordBlobSha: 'a'.repeat(40) }] }, 'editor')).rejects.toThrow('Selected review')
    await expect(service.requestChanges({ ...request, selections: [{ ...selection, findingId: 'C999' }] }, 'editor')).rejects.toThrow('no longer open')
    await expect(service.requestChanges({ ...request, selections: [...request.selections, ...request.selections] }, 'editor')).rejects.toThrow('only once')
    await expect(service.requestChanges({ ...request, feedback: '  \n\t' }, 'editor')).rejects.toThrow('Enter revision feedback')
    state.registry.requestTargets = []
    await expect(service.requestChanges(request, 'editor')).rejects.toThrow('No editorial correspondence')
    expect(state.comments).toEqual([])
  })
  it('never treats an outage as a clean review', async () => {
    const { state, service } = await setup()
    state.outage = true
    await expect(service.load(today, blob)).rejects.toThrow('unavailable')
  })
})

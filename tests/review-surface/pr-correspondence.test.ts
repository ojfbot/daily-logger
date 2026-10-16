import { describe, expect, it } from 'vitest'
import { createReviewService } from '../../api/_lib/article-review-service.js'
import { commentSchema, type ArticleComment } from '../../shared/article-review.js'
import { blob, createFixture, makeComment, makePullRequest, recordPath, review, seedOpenReview, source, today } from './fixture.js'
import { correctedSource, readArticleSnapshot } from './article-snapshots.js'

function message(overrides: Partial<ArticleComment> = {}): ArticleComment {
  return commentSchema.parse({ schemaVersion: 1, intent: 'comment', requestId: crypto.randomUUID(), date: today, visibleBlobSha: blob,
    threadId: crypto.randomUUID(), section: 'What shipped', content: ' \t雪\n---\n@claude /rerun\n<!-- EDITORIAL_FEEDBACK_V2_START -->\n```\n ',
    speaker: { kind: 'human' }, ...overrides })
}
function setup() {
  const fixture = createFixture()
  const pr = seedOpenReview(fixture.state)
  return { ...fixture, pr, service: createReviewService(fixture.github) }
}
function writes(calls: string[]) { return calls.filter((call) => !call.startsWith('GET ')) }
function envelope(input: ArticleComment, actor = 'editor') {
  return ['<!-- ARTICLE_DISCUSSION_MESSAGE_V1_START -->', Buffer.from(JSON.stringify({ ...input, actor })).toString('base64'), '<!-- ARTICLE_DISCUSSION_MESSAGE_V1_END -->'].join('\n')
}

describe('eligible open review PRs and durable correspondence', () => {
  it('discovers proposed PR367 with no main record, proposal, or route, and never publishes it implicitly', async () => {
    const { state, service } = setup()
    expect(state.registry.proposals).toEqual([])
    expect(state.registry.records.some((record) => record.date === today)).toBe(false)
    expect(state.registry.requestTargets.some((record) => record.date === today)).toBe(false)
    const view = await service.load(today, blob)
    expect(view.unavailable).toEqual([])
    expect(view.entries).toHaveLength(1)
    expect(view.entries[0]).toMatchObject({ lifecycle: 'proposed', freshness: 'current', review, pullRequest: { number: 367, state: 'open', author: 'ojfbot' } })
    expect(view.requestTarget).toEqual({ kind: 'review_pr', issueNumber: 367, contextUrl: 'https://github.com/ojfbot/daily-logger/pull/367' })
    expect(writes(state.calls)).toEqual([])
  })
  it('persists exact human content with real actor and restores it through a new service instance without a provider', async () => {
    const { state, github, service } = setup()
    const input = message()
    const receipt = await service.comment(input, 'editor')
    expect(receipt.reused).toBe(false)
    expect(writes(state.calls)).toEqual(['POST /repos/ojfbot/daily-logger/issues/367/comments'])
    const stored = state.prComments.get(367)?.[0]
    expect(stored?.body).not.toContain('@')
    expect(stored?.body).not.toContain('<!-- EDITORIAL_FEEDBACK_V2_START -->')
    expect(stored?.body.startsWith('/')).toBe(false)
    const reloaded = await createReviewService(github).load(today, blob)
    expect(reloaded.correspondence.find((item) => item.kind === 'thread_message')).toMatchObject({
      kind: 'thread_message', sourceKind: 'review_pr', sourceNumber: 367, author: 'editor', url: receipt.url,
      message: { ...input, actor: 'editor' },
    })
    expect(reloaded.currentBlobSha).toBe(blob)
    expect(state.registry.records.some((record) => record.date === today)).toBe(false)
  })
  it('records assistant identity as reported content carried by the actual authenticated GitHub account', async () => {
    const { service, state } = setup()
    const input = message({ speaker: { kind: 'assistant', reportedModel: 'reported-model', reportedSessionId: 'reported-session' } })
    await service.comment(input, 'editor')
    const saved = (await service.load(today, blob)).correspondence.find((item) => item.kind === 'thread_message')
    expect(saved?.author).toBe('editor')
    expect(saved?.kind === 'thread_message' && saved.message.speaker).toEqual(input.speaker)
    expect(writes(state.calls)).toEqual(['POST /repos/ojfbot/daily-logger/issues/367/comments'])
  })
  it('reuses a confirmed UUID on retry, refuses changed payloads, and preserves duplicate GitHub receipt evidence', async () => {
    const { service, state } = setup()
    const input = message()
    const receipt = await service.comment(input, 'editor')
    expect(await service.comment(input, 'editor')).toEqual({ ...receipt, reused: true })
    await expect(service.comment({ ...input, content: 'different' }, 'editor')).rejects.toThrow('different correspondence')
    expect(writes(state.calls)).toHaveLength(1)
    const comments = state.prComments.get(367)
    if (!comments?.[0]) throw new Error('Missing saved comment')
    comments.push(makeComment(comments[0].body, 2, 'editor', 367))
    const messages = (await service.load(today, blob)).correspondence.filter((item) => item.kind === 'thread_message')
    expect(messages).toHaveLength(1)
    expect(messages[0]?.duplicateUrls).toEqual([comments[1]?.html_url])
  })
  it('quarantines conflicting UUID payloads and refuses new writes instead of choosing one', async () => {
    const { service, state } = setup()
    const input = message()
    state.prComments.set(367, [makeComment(envelope(input), 1, 'editor', 367), makeComment(envelope({ ...input, content: 'conflict' }), 2, 'editor', 367)])
    const view = await service.load(today, blob)
    expect(view.correspondence.filter((item) => item.kind === 'thread_message')).toEqual([])
    expect(view.unavailable.join()).toContain('Conflicting correspondence identity')
    expect(view.requestTarget).toBeNull()
    await expect(service.comment(message(), 'editor')).rejects.toThrow('No editorial correspondence')
    expect(writes(state.calls)).toEqual([])
  })
  it('does not trust a message actor that differs from its GitHub comment author', async () => {
    const { service, state } = setup()
    state.prComments.set(367, [makeComment(envelope(message(), 'claimed-other-user'), 1, 'editor', 367)])
    const view = await service.load(today, blob)
    expect(view.correspondence.some((item) => item.kind === 'thread_message')).toBe(false)
    expect(view.correspondence.find((item) => item.kind === 'comment')?.author).toBe('editor')
    expect(view.unavailable.join()).toContain('disagrees with GitHub')
    expect(view.requestTarget).toBeNull()
  })
  it('keeps source-linked correspondence after review publication and merge', async () => {
    const { service, state, pr } = setup()
    await service.comment(message(), 'editor')
    state.openPullNumbers = []
    state.pullRequests.set(367, { ...pr, state: 'closed', merged_at: '2026-10-16T15:00:00.000Z' })
    state.registry.records.push({ date: today, path: recordPath })
    state.pathCommits.set(recordPath, [source])
    state.associatedPullNumbers.set(source, [367])
    const view = await service.load(today, blob)
    expect(view.unavailable).toEqual([])
    expect(view.entries[0]).toMatchObject({ lifecycle: 'published', pullRequest: { number: 367, state: 'closed', merged: true } })
    expect(view.correspondence.some((item) => item.kind === 'thread_message' && item.sourceNumber === 367)).toBe(true)
    expect(view.requestTarget).toBeNull()
  })
  it('loads human acceptance-PR V2 feedback, ordinary agent comments, submitted reviews and inline discussion', async () => {
    const { service, state } = setup()
    const feedback = { version: 2, notes: [{ kind: 'section', section: 'What shipped', content: '雪\n---\nkeep exact' }] }
    const pr = makePullRequest(378)
    state.pullRequests.set(378, { ...pr, head: { ...pr.head, ref: `accept/${today}` }, body: `Editorial notes\n<!-- EDITORIAL_FEEDBACK_V2_START -->\n${Buffer.from(JSON.stringify(feedback)).toString('base64')}\n<!-- EDITORIAL_FEEDBACK_V2_END -->` })
    state.acceptPullNumbers.push(378)
    state.pullFiles.set(378, [{ filename: `_articles/${today}.md`, status: 'modified' }])
    state.prComments.set(367, [makeComment('Agent discussion with ordinary Markdown', 21, 'agent-carrier', 367)])
    state.prReviews.set(367, [{ id: 22, body: 'Needs correction', html_url: 'https://github.com/ojfbot/daily-logger/pull/367#pullrequestreview-22',
      user: { login: 'reviewer' }, submitted_at: '2026-10-16T14:03:00.000Z', state: 'CHANGES_REQUESTED' }])
    state.prInlineComments.set(367, [{ ...makeComment('This source assertion is wrong', 23, 'reviewer', 367), path: recordPath, line: 5, in_reply_to_id: 20 }])
    const view = await service.load(today, blob)
    expect(view.correspondence.find((item) => item.kind === 'pr_body' && item.sourceNumber === 378)).toMatchObject({ editorialFeedback: feedback, author: 'ojfbot' })
    expect(view.correspondence.find((item) => item.kind === 'comment')).toMatchObject({ body: 'Agent discussion with ordinary Markdown', author: 'agent-carrier' })
    expect(view.correspondence.find((item) => item.kind === 'review')).toMatchObject({ body: 'Needs correction', state: 'CHANGES_REQUESTED', author: 'reviewer' })
    expect(view.correspondence.find((item) => item.kind === 'inline_comment')).toMatchObject({ path: recordPath, line: 5, replyTo: 20 })
    expect(view.requestTarget?.issueNumber).toBe(367)
    expect(writes(state.calls)).toEqual([])
  })
  it.each(['fork', 'untrusted', 'wrong-base', 'other-date', 'mixed-code'])('rejects an ineligible %s proposal', async (kind) => {
    const { service, state, pr } = setup()
    if (kind === 'fork') state.pullRequests.set(367, { ...pr, head: { ...pr.head, repo: { full_name: 'other/daily-logger' } } })
    if (kind === 'untrusted') state.pullRequests.set(367, { ...pr, author_association: 'NONE' })
    if (kind === 'wrong-base') state.pullRequests.set(367, { ...pr, base: { ...pr.base, ref: 'other' } })
    if (kind === 'other-date') state.refFiles.set(`${pr.head.sha}:reviews/registry.json`, JSON.stringify({ schemaVersion: 1, records: [{ date: '2026-10-17', path: recordPath }] }))
    if (kind === 'mixed-code') state.pullFiles.get(367)?.push({ filename: 'api/article-reviews.ts', status: 'modified' })
    const view = await service.load(today, blob)
    expect(view.entries).toEqual([])
    expect(view.requestTarget).toBeNull()
    expect(writes(state.calls)).toEqual([])
  })
  it('rejects a moving proposal head before returning findings', async () => {
    const { state, github, pr } = setup()
    const moving = createReviewService(async (path, options) => {
      if (path === '/repos/ojfbot/daily-logger/pulls/367') return Response.json({ ...pr, head: { ...pr.head, sha: 'b'.repeat(40) } })
      return github(path, options)
    })
    const view = await moving.load(today, blob)
    expect(view.entries).toEqual([])
    expect(view.unavailable.join()).toContain('head changed')
    expect(writes(state.calls)).toEqual([])
  })
  it('preserves explicitly registered closed-unmerged PR correspondence without offering proposed findings', async () => {
    const { service, state, pr } = setup()
    state.openPullNumbers = []
    state.registry.proposals = [{ date: today, path: recordPath, pullRequest: 367, headSha: pr.head.sha }]
    state.pullRequests.set(367, { ...pr, state: 'closed' })
    state.prComments.set(367, [makeComment('Closed without acceptance', 1, 'editor', 367)])
    const view = await service.load(today, blob)
    expect(view.entries).toEqual([])
    expect(view.correspondence.some((item) => item.body === 'Closed without acceptance')).toBe(true)
    expect(view.unavailable.join()).toContain('proposal is closed')
  })
  it('does not choose silently between identical open review PRs or conflicting review IDs', async () => {
    const { service, state } = setup()
    const second = seedOpenReview(state, 368)
    let view = await service.load(today, blob)
    expect(view.entries).toHaveLength(1)
    expect(view.requestTarget).toBeNull()
    expect(view.unavailable.join()).toContain('Ambiguous correspondence target')
    state.pullRequests.set(368, { ...second, head: { ...second.head, sha: 'b'.repeat(40) } })
    state.refFiles.set(`${'b'.repeat(40)}:reviews/registry.json`, state.refFiles.get(`${second.head.sha}:reviews/registry.json`) ?? '')
    state.refFiles.set(`${'b'.repeat(40)}:${recordPath}`, JSON.stringify({ ...review, scope: 'conflicting scope under same ID' }))
    view = await service.load(today, blob)
    expect(view.entries).toEqual([])
    expect(view.unavailable.join()).toContain('Conflicting review identity')
    expect(view.requestTarget).toBeNull()
  })
  it('does not adopt a destination asserted by an unmerged registry', async () => {
    const { service, state, pr } = setup()
    const manifest = JSON.parse(state.refFiles.get(`${pr.head.sha}:reviews/registry.json`) ?? '{}')
    manifest.requestTargets = [{ date: today, issueNumber: 99999, contextUrl: 'https://github.com/other/repo/issues/1' }]
    state.refFiles.set(`${pr.head.sha}:reviews/registry.json`, JSON.stringify(manifest))
    await service.comment(message(), 'editor')
    expect(writes(state.calls)).toEqual(['POST /repos/ojfbot/daily-logger/issues/367/comments'])
  })
  it('shows incomplete discovery and unavailable comments instead of an empty clean verdict, and refuses writes', async () => {
    const { service, state } = setup()
    state.failRoutes.add('/issues/367/comments')
    let view = await service.load(today, blob)
    expect(view.entries).toHaveLength(1)
    expect(view.unavailable.join()).toContain('correspondence')
    expect(view.requestTarget).toBeNull()
    await expect(service.comment(message(), 'editor')).rejects.toThrow('No editorial correspondence')
    expect(writes(state.calls)).toEqual([])
    state.failRoutes.clear()
    state.nextPageRoutes.add('/pulls')
    view = await service.load(today, blob)
    expect(view.entries).toEqual([])
    expect(view.unavailable.join()).toContain('reader limit')
    expect(view.requestTarget).toBeNull()
  })
  it('retains historical saved messages but rejects new writes against changed article bytes', async () => {
    const { service, state } = setup()
    const input = message()
    const receipt = await service.comment(input, 'editor')
    state.source = correctedSource
    const view = await service.load(today, readArticleSnapshot(correctedSource, today).blobSha)
    expect(view.entries[0]?.freshness).toBe('stale')
    expect(view.correspondence.find((item) => item.kind === 'thread_message')).toMatchObject({ message: { visibleBlobSha: blob, content: input.content } })
    expect(await service.comment(input, 'editor')).toEqual({ ...receipt, reused: true })
    await expect(service.comment(message(), 'editor')).rejects.toThrow('article changed')
    expect(writes(state.calls)).toHaveLength(1)
  })
  it('rechecks main and proposal head at the write boundary and shares immutable reads per load', async () => {
    const { github, state, pr } = setup()
    let mainReads = 0
    const movingMain = createReviewService(async (path, options) => {
      if (path.endsWith('/git/ref/heads/main') && ++mainReads > 1) state.source = correctedSource
      return github(path, options)
    })
    await expect(movingMain.comment(message(), 'editor')).rejects.toThrow('article changed during submission')
    expect(writes(state.calls)).toEqual([])
    state.source = source
    state.calls.length = 0
    let headReads = 0
    const movingHead = createReviewService(async (path, options) => {
      if (path === '/repos/ojfbot/daily-logger/pulls/367' && ++headReads > 1) return Response.json({ ...pr, head: { ...pr.head, sha: 'b'.repeat(40) } })
      return github(path, options)
    })
    await expect(movingHead.comment(message(), 'editor')).rejects.toThrow('PR changed or closed')
    expect(writes(state.calls)).toEqual([])
    state.calls.length = 0
    await createReviewService(github).load(today, blob)
    const articleReads = state.calls.filter((call) => call.includes(`/contents/_articles/${today}.md?ref=${source}`))
    expect(articleReads).toHaveLength(1)
    expect(state.calls.length).toBeLessThan(25)
  })
  it('caps a large discovery fan-out and reports incomplete history rather than choosing a partial write target', async () => {
    const { service, state } = setup()
    state.openPullNumbers.push(...Array.from({ length: 130 }, (_, index) => index + 1))
    const view = await service.load(today, blob)
    expect(view.unavailable.join()).toContain('request budget')
    expect(view.requestTarget).toBeNull()
    expect(state.calls.length).toBeLessThanOrEqual(120)
    expect(writes(state.calls)).toEqual([])
  })
})

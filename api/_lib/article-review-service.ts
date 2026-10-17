import { z } from 'zod'
import {
  commentRecordSchema, commentSchema, correspondenceSchema, editorialFeedbackSchema, entrySchema,
  projectionSchema, registrySchema, requestRecordSchema, requestSchema, reviewSchema,
  type ArticleComment, type Correspondence, type ReviewEntry, type ReviewProjection, type ReviewPullRequest, type ReviewRequest,
} from '../../shared/article-review.js'
import { boundedMap, createReviewSource, ReviewError, trustedAssociation, trustedPullRequest, type GitHub, type GitHubPullRequest } from './article-review-sources.js'
export { ReviewError } from './article-review-sources.js'

const requestStart = '<!-- ARTICLE_REVIEW_REQUEST_V1_START -->'
const requestEnd = '<!-- ARTICLE_REVIEW_REQUEST_V1_END -->'
const messageStart = '<!-- ARTICLE_DISCUSSION_MESSAGE_V1_START -->'
const messageEnd = '<!-- ARTICLE_DISCUSSION_MESSAGE_V1_END -->'
const feedbackStart = '<!-- EDITORIAL_FEEDBACK_V2_START -->'
const feedbackEnd = '<!-- EDITORIAL_FEEDBACK_V2_END -->'
const manifestSchema = registrySchema.pick({ schemaVersion: true, records: true }).strip()
const recordPath = /^reviews\/registered\/[a-zA-Z0-9-]+\.json$/
const reviewDataPath = /^(?:reviews\/registry\.json|reviews\/registered\/[a-zA-Z0-9-]+\.json|reviews\/articles\/[^/]+\.md)$/

function decodeEnvelope(body: string, start: string, end: string): unknown {
  const offset = body.indexOf(start)
  if (offset < 0) return null
  const finish = body.indexOf(end, offset + start.length)
  if (finish < 0) throw new Error('Encoded correspondence is missing its end marker.')
  const encoded = body.slice(offset + start.length, finish).trim()
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid correspondence encoding.')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64') !== encoded) throw new Error('Invalid correspondence encoding.')
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}
function detail(error: unknown) { return error instanceof Error ? error.message : 'Source unavailable' }
function metadata(pr: GitHubPullRequest, kind: ReviewPullRequest['kind']): ReviewPullRequest {
  return { kind, number: pr.number, url: pr.html_url, state: pr.state, merged: pr.merged_at !== null, headSha: pr.head.sha, author: pr.user.login }
}
function identity(record: z.infer<typeof requestRecordSchema> | z.infer<typeof commentRecordSchema>) {
  return JSON.stringify({ ...record, actor: record.actor.toLowerCase() })
}
function safeComment(title: string, display: unknown, record: unknown, start: string, end: string) {
  const escaped = JSON.stringify(display, null, 2).replaceAll('@', '\\u0040').replaceAll('<', '\\u003c').replaceAll('`', '\\u0060')
  const body = [title, '', 'Recorded correspondence only. Article acceptance, model execution and revision remain separate actions.', '',
    '```json', escaped, '```', '', start, Buffer.from(JSON.stringify(record), 'utf8').toString('base64'), end].join('\n')
  if (body.includes('@') || body.startsWith('/') || body.includes(feedbackStart) || body.includes(feedbackEnd)) {
    throw new ReviewError(400, 'Comment display contains an automation trigger; no correspondence was submitted.')
  }
  return body
}

export function createReviewService(github: GitHub, allowedActors: ReadonlySet<string> = new Set()) {
  const trustedActor = (login: string, association: string) =>
    trustedAssociation(association) || allowedActors.has(login.toLowerCase())
  async function read(articleDate: string, visibleBlobSha: string | null) {
    const source = createReviewSource(github)
    const sourceCommitSha = await source.main()
    const [current, registryFile] = await Promise.all([
      source.file(`_articles/${articleDate}.md`, sourceCommitSha), source.file('reviews/registry.json', sourceCommitSha),
    ])
    const registry = registrySchema.parse(JSON.parse(registryFile.text))
    const unavailable: string[] = []
    let complete = true
    const pullRequests = new Map<number, { pr: GitHubPullRequest; kind: ReviewPullRequest['kind'] }>()
    const eligibleOpenReviews = new Set<number>()
    async function verifiedRecord(path: string, ref: string, lifecycle: ReviewEntry['lifecycle'], pr: ReviewPullRequest | null) {
      const record = await source.file(path, ref)
      const review = reviewSchema.parse(JSON.parse(record.text))
      if (review.article.date !== articleDate) throw new Error('Conflicting review article date.')
      const [article, full] = await Promise.all([
        source.file(`_articles/${articleDate}.md`, review.article.sourceCommitSha), source.file(review.fullRecordPath, ref),
      ])
      if (article.blobSha !== review.article.blobSha) throw new Error('Review source commit and article blob disagree.')
      if (full.blobSha !== review.fullRecordBlobSha) throw new Error('Full review artifact changed without a matching registration update.')
      return entrySchema.parse({
        lifecycle, recordRef: ref, recordBlobSha: record.blobSha,
        recordUrl: `https://github.com/ojfbot/daily-logger/blob/${ref}/${path}`,
        fullRecordUrl: `https://github.com/ojfbot/daily-logger/blob/${ref}/${review.fullRecordPath.split('/').map(encodeURIComponent).join('/')}`,
        review, pullRequest: pr,
        freshness: !visibleBlobSha ? 'visible_revision_unknown' : review.article.blobSha === visibleBlobSha ? 'current' : 'stale',
      })
    }
    const publishedRegistrations = registry.records.filter((record) => record.date === articleDate)
    const published = (await boundedMap(publishedRegistrations, async (registration) => {
      try { return await verifiedRecord(registration.path, sourceCommitSha, 'published', null) }
      catch (error) { unavailable.push(`${registration.path}: ${detail(error)}`); return null }
    })).filter((entry) => entry !== null)
    const openWork = (async () => {
      try {
        const open = await source.openPulls()
        return (await boundedMap(open.filter(trustedPullRequest), async (pr) => {
          try {
            const files = await source.files(pr.number)
            const changedRecords = files.filter((file) => recordPath.test(file.filename) && ['added', 'modified'].includes(file.status))
            if (!changedRecords.length) return []
            // The branch supplies a manifest, never a trusted write destination.
            const manifest = manifestSchema.parse(JSON.parse((await source.file('reviews/registry.json', pr.head.sha)).text))
            const registrations = manifest.records.filter((record) => record.date === articleDate && changedRecords.some((file) => file.filename === record.path))
            if (!registrations.length) return []
            if (files.some((file) => !reviewDataPath.test(file.filename) || !['added', 'modified'].includes(file.status))) throw new Error('Proposed review PR must contain only added/modified review data files.')
            const records = await boundedMap(registrations, (registration) => verifiedRecord(registration.path, pr.head.sha, 'proposed', metadata(pr, 'review_pr')))
            const fresh = await source.pull(pr.number, true)
            if (!trustedPullRequest(fresh) || fresh.state !== 'open' || fresh.head.sha !== pr.head.sha) throw new Error('Proposed review PR head changed or closed; refresh before using it.')
            pullRequests.set(pr.number, { pr: fresh, kind: 'review_pr' })
            if (records.some((entry) => entry.freshness === 'current')) eligibleOpenReviews.add(pr.number)
            return records
          } catch (error) { complete = false; unavailable.push(`PR #${pr.number}: ${detail(error)}`); return [] }
        })).flat()
      } catch (error) { complete = false; unavailable.push(`Open review discovery: ${detail(error)}`); return [] }
    })()
    const closedReviewWork = (async () => {
      try {
        const reviews = await source.reviewPulls(articleDate)
        await boundedMap(reviews.filter((pr) => trustedPullRequest(pr) && pr.state === 'closed' && pr.head.ref === `codex/review-article-${articleDate}`), async (pr) => {
          try {
            const files = await source.files(pr.number)
            const changedRecords = files.filter((file) => recordPath.test(file.filename) && ['added', 'modified'].includes(file.status))
            if (!changedRecords.length || files.some((file) => !reviewDataPath.test(file.filename) || !['added', 'modified'].includes(file.status))) return
            const manifest = manifestSchema.parse(JSON.parse((await source.file('reviews/registry.json', pr.head.sha)).text))
            const registrations = manifest.records.filter((record) => record.date === articleDate && changedRecords.some((file) => file.filename === record.path))
            if (!registrations.length) return
            await boundedMap(registrations, (registration) => verifiedRecord(registration.path, pr.head.sha, 'proposed', metadata(pr, 'review_pr')))
            const fresh = await source.pull(pr.number, true)
            if (!trustedPullRequest(fresh) || fresh.state !== 'closed' || fresh.head.sha !== pr.head.sha) throw new Error('Closed review PR changed while its history was loaded.')
            pullRequests.set(pr.number, { pr: fresh, kind: 'review_pr' })
          } catch (error) { complete = false; unavailable.push(`Closed review PR #${pr.number}: ${detail(error)}`) }
        })
      } catch (error) { complete = false; unavailable.push(`Closed review history: ${detail(error)}`) }
    })()
    const legacyWork = boundedMap(registry.proposals.filter((record) => record.date === articleDate), async (registration) => {
      try {
        const pr = await source.pull(registration.pullRequest)
        if (!trustedPullRequest(pr)) throw new Error('Registered proposal is not a trusted same-repository PR to main.')
        if (pr.head.sha !== registration.headSha) throw new Error('Registered proposal head changed; re-registration is required.')
        if (pr.state !== 'open') {
          pullRequests.set(pr.number, { pr, kind: 'review_pr' })
          unavailable.push(`${registration.path}: Registered proposal is closed. Its correspondence remains history; proposed findings are unavailable.`)
          return null
        }
        const record = await verifiedRecord(registration.path, registration.headSha, 'proposed', metadata(pr, 'review_pr'))
        const fresh = await source.pull(pr.number, true)
        if (!trustedPullRequest(fresh) || fresh.head.sha !== registration.headSha || fresh.state !== pr.state) throw new Error('Registered proposal head changed; refresh is required.')
        pullRequests.set(pr.number, { pr: fresh, kind: 'review_pr' })
        if (record.freshness === 'current') eligibleOpenReviews.add(pr.number)
        return record
      } catch (error) { complete = false; unavailable.push(`${registration.path}: ${detail(error)}`); return null }
    })
    const originsWork = boundedMap(publishedRegistrations, async (registration) => {
      const entry = published.find((entry) => entry.recordUrl.endsWith(`/${registration.path}`))
      if (!entry) return
      try {
        const commits = await source.pathCommits(registration.path, sourceCommitSha)
        await boundedMap(commits, async (commit) => {
          if ((await source.file(registration.path, commit.sha)).blobSha !== entry.recordBlobSha) return
          const associated = await source.associatedPulls(commit.sha)
          await boundedMap(associated.filter(trustedPullRequest), async (pr) => {
            const files = await source.files(pr.number)
            if (!files.some((file) => file.filename === registration.path) || files.some((file) => !reviewDataPath.test(file.filename))) return
            if (!pullRequests.has(pr.number)) pullRequests.set(pr.number, { pr, kind: 'review_pr' })
          })
        })
      } catch (error) { complete = false; unavailable.push(`Published review origin ${registration.path}: ${detail(error)}`) }
    })
    const acceptanceWork = (async () => {
      try {
        const prs = await source.acceptPulls(articleDate)
        await boundedMap(prs.filter((pr) => trustedPullRequest(pr) && pr.head.ref === `accept/${articleDate}`), async (pr) => {
          const files = await source.files(pr.number)
          if (!files.some(file => file.filename === `_articles/${articleDate}.md`) || files.some(file => ![`_articles/${articleDate}.md`, 'actions/registry.json'].includes(file.filename) || !['added', 'modified'].includes(file.status))) return
          pullRequests.set(pr.number, { pr, kind: 'acceptance_pr' })
        })
      } catch (error) { complete = false; unavailable.push(`Editorial PR history: ${detail(error)}`) }
    })()
    const [open, legacy] = await Promise.all([openWork, legacyWork, originsWork, acceptanceWork, closedReviewWork])
    const byId = new Map<string, ReviewEntry>()
    const conflicts = new Set<string>()
    for (const entry of [...published, ...open, ...legacy.filter((entry) => entry !== null)]) {
      const previous = byId.get(entry.review.id)
      if (conflicts.has(entry.review.id)) continue
      if (previous && previous.recordBlobSha !== entry.recordBlobSha) {
        byId.delete(entry.review.id); conflicts.add(entry.review.id)
        complete = false; unavailable.push(`Conflicting review identity: ${entry.review.id}`)
      } else if (!previous) byId.set(entry.review.id, entry)
      else if (!previous.pullRequest && entry.pullRequest) byId.set(entry.review.id, { ...previous, pullRequest: entry.pullRequest })
    }
    const entries = [...byId.values()]
    for (const entry of entries.filter((entry) => entry.lifecycle === 'published' && !entry.pullRequest)) {
      const registration = publishedRegistrations.find((registration) => entry.recordUrl.endsWith(`/${registration.path}`))
      if (!registration) continue
      for (const { pr, kind } of pullRequests.values()) {
        if (kind === 'review_pr' && (await source.files(pr.number)).some((file) => file.filename === registration.path)) {
          entry.pullRequest = metadata(pr, kind); break
        }
      }
    }
    const targets = registry.requestTargets.filter((target) => target.date === articleDate)
    if (targets.length > 1) throw new ReviewError(503, 'Conflicting article correspondence targets.')
    const pilot = targets[0]
    const correspondence: Correspondence[] = []
    type SourceIdentity = { kind: 'review_pr' | 'acceptance_pr' | 'pilot_issue'; number: number }
    async function history(target: SourceIdentity) {
      const local: Correspondence[] = []
      const comments = await source.comments(target.number)
      for (const comment of comments) {
        const base = { id: `comment:${comment.id}`, sourceKind: target.kind, sourceNumber: target.number, url: comment.html_url,
          author: comment.user.login, createdAt: comment.created_at, updatedAt: comment.updated_at, body: comment.body }
        let item: Correspondence = correspondenceSchema.parse({ ...base, kind: 'comment' })
        try {
          const trusted = trustedActor(comment.user.login, comment.author_association)
          if (trusted && comment.body.startsWith(`## Article revision request: ${articleDate}\n`) && comment.body.includes(requestStart)) {
            const request = requestRecordSchema.parse(decodeEnvelope(comment.body, requestStart, requestEnd))
            if (request.actor.toLowerCase() !== comment.user.login.toLowerCase()) throw new Error('Recorded actor disagrees with GitHub comment author.')
            if (request.date !== articleDate) continue
            item = correspondenceSchema.parse({ ...base, kind: 'revision_request', request })
          } else if (trusted && comment.body.startsWith(`## Article discussion: ${articleDate}\n`) && comment.body.includes(messageStart)) {
            const message = commentRecordSchema.parse(decodeEnvelope(comment.body, messageStart, messageEnd))
            if (message.actor.toLowerCase() !== comment.user.login.toLowerCase()) throw new Error('Recorded actor disagrees with GitHub comment author.')
            if (message.date !== articleDate) continue
            item = correspondenceSchema.parse({ ...base, kind: 'thread_message', message })
          }
        } catch (error) { complete = false; unavailable.push(`Unrecognized correspondence ${comment.html_url}: ${detail(error)}`) }
        local.push(item)
      }
      if (target.kind !== 'pilot_issue') {
        const [reviews, inline] = await Promise.all([source.reviews(target.number), source.inlineComments(target.number)])
        for (const review of reviews) {
          if (!review.submitted_at) continue
          local.push(correspondenceSchema.parse({ kind: 'review', id: `review:${review.id}`, sourceKind: target.kind, sourceNumber: target.number,
            url: review.html_url, author: review.user.login, createdAt: review.submitted_at, updatedAt: review.submitted_at, body: review.body ?? '', state: review.state }))
        }
        for (const comment of inline) local.push(correspondenceSchema.parse({ kind: 'inline_comment', id: `inline:${comment.id}`, sourceKind: target.kind, sourceNumber: target.number,
          url: comment.html_url, author: comment.user.login, createdAt: comment.created_at, updatedAt: comment.updated_at, body: comment.body,
          path: comment.path, line: comment.line, replyTo: comment.in_reply_to_id ?? null }))
      }
      return local
    }
    const sourceHistory = [...pullRequests.values()].sort((a, b) => a.pr.number - b.pr.number)
    await boundedMap(sourceHistory, async ({ pr, kind }) => {
      let editorialFeedback: z.infer<typeof editorialFeedbackSchema> | null = null
      if (kind === 'acceptance_pr' && pr.body?.includes(feedbackStart)) {
        try { editorialFeedback = editorialFeedbackSchema.parse(decodeEnvelope(pr.body, feedbackStart, feedbackEnd)) }
        catch (error) { unavailable.push(`PR #${pr.number} editorial feedback: ${detail(error)}`) }
      }
      correspondence.push(correspondenceSchema.parse({ kind: 'pr_body', id: `pr:${pr.number}:body`, sourceKind: kind, sourceNumber: pr.number,
        url: pr.html_url, author: pr.user.login, createdAt: pr.created_at, updatedAt: pr.updated_at, body: pr.body ?? '', editorialFeedback }))
      try { correspondence.push(...await history({ kind, number: pr.number })) }
      catch (error) { complete = false; unavailable.push(`PR #${pr.number} correspondence: ${detail(error)}`) }
    })
    if (pilot) {
      try { correspondence.push(...await history({ kind: 'pilot_issue', number: pilot.issueNumber })) }
      catch (error) { complete = false; unavailable.push(`Pilot correspondence: ${detail(error)}`) }
    }
    correspondence.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    const unique: Correspondence[] = []
    const recorded = new Map<string, Correspondence>()
    const conflictingMessages = new Set<string>()
    for (const item of correspondence) {
      const record = item.kind === 'thread_message' ? item.message : item.kind === 'revision_request' ? item.request : null
      if (!record) { unique.push(item); continue }
      const key = `${record.actor.toLowerCase()}:${record.requestId}`
      const previous = recorded.get(key)
      const previousRecord = previous?.kind === 'thread_message' ? previous.message : previous?.kind === 'revision_request' ? previous.request : null
      if (previous && previousRecord) {
        if (identity(previousRecord) === identity(record)) previous.duplicateUrls.push(item.url)
        else { complete = false; conflictingMessages.add(key); unavailable.push(`Conflicting correspondence identity: ${key}`) }
      } else { recorded.set(key, item); unique.push(item) }
    }
    const visibleCorrespondence = unique.filter((item) => {
      const record = item.kind === 'thread_message' ? item.message : item.kind === 'revision_request' ? item.request : null
      return !record || !conflictingMessages.has(`${record.actor.toLowerCase()}:${record.requestId}`)
    })
    const openReviews = [...pullRequests.values()].filter(({ pr, kind }) => pr.state === 'open' && kind === 'review_pr' && eligibleOpenReviews.has(pr.number))
    const openAcceptance = [...pullRequests.values()].filter(({ pr, kind }) => pr.state === 'open' && kind === 'acceptance_pr')
    const candidates = openReviews.length ? openReviews : openAcceptance
    let requestTarget: ReviewProjection['requestTarget'] = null
    if (candidates.length > 1) { complete = false; unavailable.push('Ambiguous correspondence target: multiple eligible open PRs. No write destination was selected.') }
    else if (complete && candidates[0]) requestTarget = { issueNumber: candidates[0].pr.number, kind: candidates[0].kind, contextUrl: candidates[0].pr.html_url }
    else if (complete && pilot) requestTarget = { issueNumber: pilot.issueNumber, kind: 'pilot_issue', contextUrl: pilot.contextUrl }
    const projection = projectionSchema.parse({
      schemaVersion: 1, date: articleDate, sourceCommitSha, currentBlobSha: current.blobSha, visibleBlobSha,
      observedAt: new Date().toISOString(), discovery: 'registered_and_eligible_pull_requests', requestTarget,
      entries, unavailable, pullRequests: sourceHistory.map(({ pr, kind }) => metadata(pr, kind)), correspondence: visibleCorrespondence,
      requests: visibleCorrespondence.flatMap((item) => item.kind === 'revision_request' ? [{ requestId: item.request.requestId, actor: item.author, url: item.url,
        reviewIds: item.request.selections.map((selection) => selection.reviewId), findingIds: item.request.selections.map((selection) => selection.findingId) }] : []),
    })
    return { projection, source }
  }
  async function load(articleDate: string, visibleBlobSha: string | null): Promise<ReviewProjection> { return (await read(articleDate, visibleBlobSha)).projection }
  function existingReceipt(projection: ReviewProjection, record: z.infer<typeof requestRecordSchema> | z.infer<typeof commentRecordSchema>) {
    for (const item of projection.correspondence) {
      const previous = item.kind === 'thread_message' ? item.message : item.kind === 'revision_request' ? item.request : null
      if (previous?.requestId === record.requestId && previous.actor.toLowerCase() === record.actor.toLowerCase()) {
        if (identity(previous) !== identity(record)) throw new ReviewError(409, 'This request ID already records different correspondence. Reload the history.')
        return { url: item.url, requestId: record.requestId, reused: true }
      }
    }
    return null
  }
  async function write(record: z.infer<typeof requestRecordSchema> | z.infer<typeof commentRecordSchema>, context: Awaited<ReturnType<typeof read>>, body: string) {
    const { projection, source } = context
    const target = projection.requestTarget
    if (!target) throw new ReviewError(409, 'No editorial correspondence target is available. Refresh source history before submitting.')
    if (projection.currentBlobSha !== record.visibleBlobSha) throw new ReviewError(409, 'The article changed. Reload it before submitting; your unsaved text is retained.')
    const latestSha = await source.main(true)
    if ((await source.file(`_articles/${record.date}.md`, latestSha)).blobSha !== record.visibleBlobSha) throw new ReviewError(409, 'The article changed during submission. Reload it before submitting.')
    if (target.kind !== 'pilot_issue') {
      const pr = await source.pull(target.issueNumber, true)
      const observed = projection.pullRequests.find((item) => item.number === target.issueNumber)
      if (!trustedPullRequest(pr) || pr.state !== 'open' || pr.head.sha !== observed?.headSha) throw new ReviewError(409, 'The correspondence PR changed or closed. Refresh before submitting.')
    }
    const response = await source.postComment(target.issueNumber, body)
    if (response.user.login.toLowerCase() !== record.actor.toLowerCase()) throw new ReviewError(503, 'GitHub returned an unexpected comment author. Refresh history before retrying; submission is not confirmed.')
    return { url: response.html_url, requestId: record.requestId, reused: false }
  }
  async function requestChanges(input: ReviewRequest, actor: string) {
    const request = requestSchema.parse(input)
    if (!request.feedback.trim()) throw new ReviewError(400, 'Enter revision feedback before requesting changes.')
    const context = await read(request.date, request.visibleBlobSha)
    const record = requestRecordSchema.parse({ ...request, actor })
    const duplicate = existingReceipt(context.projection, record)
    if (duplicate) return duplicate
    const selected = request.selections.map((selection) => {
      const entry = context.projection.entries.find((entry) => entry.review.id === selection.reviewId && entry.recordBlobSha === selection.recordBlobSha)
      if (!entry || entry.freshness !== 'current' || entry.review.result !== 'completed') throw new ReviewError(409, 'Selected review is unavailable, changed, failed, or stale. Reload the review.')
      const finding = entry.review.findings.find((finding) => finding.id === selection.findingId)
      if (!finding || finding.disposition.kind !== 'open') throw new ReviewError(409, 'Selected finding is no longer open.')
      return { entry, finding }
    })
    if (new Set(selected.map(({ entry, finding }) => `${entry.review.id}:${finding.id}`)).size !== selected.length) throw new ReviewError(400, 'A finding may appear only once in a request.')
    const body = safeComment(`## Article revision request: ${request.date}`, { feedback: request.feedback }, record, requestStart, requestEnd)
    const evidence = selected.map(({ entry, finding }) => `- [${entry.review.id}/${finding.id}](${entry.fullRecordUrl}) at record blob \`${entry.recordBlobSha}\` (${entry.lifecycle}, ${finding.classification}).`).join('\n')
    const completeBody = `${body}\n\n${evidence}`
    if (completeBody.includes('@') || completeBody.startsWith('/') || completeBody.includes(feedbackStart) || completeBody.includes(feedbackEnd)) throw new ReviewError(400, 'Comment display contains an automation trigger; no request was submitted.')
    return write(record, context, completeBody)
  }
  async function comment(input: ArticleComment, actor: string) {
    const request = commentSchema.parse(input)
    if (!request.content.trim()) throw new ReviewError(400, 'Enter comment text before posting.')
    const record = commentRecordSchema.parse({ ...request, actor })
    const context = await read(request.date, request.visibleBlobSha)
    const duplicate = existingReceipt(context.projection, record)
    if (duplicate) return duplicate
    const body = safeComment(`## Article discussion: ${request.date}`, { section: request.section, speaker: request.speaker, content: request.content }, record, messageStart, messageEnd)
    return write(record, context, body)
  }
  return { load, requestChanges, comment }
}

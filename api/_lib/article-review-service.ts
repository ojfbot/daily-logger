import { z } from 'zod'
import { entrySchema, projectionSchema, registrySchema, requestRecordSchema, requestSchema, reviewSchema, sha, type ReviewProjection, type ReviewRequest } from '../../shared/article-review.js'

const repo = '/repos/ojfbot/daily-logger'
const sourceFileSchema = z.object({ sha, content: z.string(), encoding: z.literal('base64'), type: z.literal('file') })
const commentSchema = z.object({ body: z.string(), html_url: z.url(), user: z.object({ login: z.string() }) })
const commentsSchema = z.array(commentSchema)
const start = '<!-- ARTICLE_REVIEW_REQUEST_V1_START -->'
const end = '<!-- ARTICLE_REVIEW_REQUEST_V1_END -->'

export class ReviewError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

type GitHub = (path: string, options?: RequestInit) => Promise<Response>

export function createReviewService(github: GitHub) {
  async function json(path: string, options?: RequestInit): Promise<unknown> {
    const response = await github(`${repo}${path}`, options)
    if (!response.ok) throw new ReviewError(503, `Review source unavailable (${response.status}). Retry after checking GitHub access.`)
    return response.json()
  }
  async function file(path: string, ref: string) {
    const data = sourceFileSchema.parse(await json(`/contents/${path}?ref=${ref}`))
    if (data.content.length > 700000) throw new ReviewError(503, 'Review record exceeds the bounded reader limit.')
    return { blobSha: data.sha, text: Buffer.from(data.content, 'base64').toString('utf8') }
  }
  async function requests(issueNumber: number) {
    const found: Array<{ record: z.infer<typeof requestRecordSchema>; url: string }> = []
    for (let page = 1; page <= 10; page++) {
      const response = await github(`${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`)
      if (!response.ok) throw new ReviewError(503, 'Revision-request history is unavailable.')
      const comments = commentsSchema.parse(await response.json())
      for (const comment of comments) {
        const offset = comment.body.indexOf(start)
        if (offset < 0) continue
        const encoded = comment.body.slice(offset + start.length).split(end)[0]?.trim()
        if (!encoded || !comment.body.includes(end)) continue
        try {
          const parsed = requestRecordSchema.safeParse(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')))
          if (parsed.success && parsed.data.actor.toLowerCase() === comment.user.login.toLowerCase()) {
            found.push({ record: parsed.data, url: comment.html_url })
          }
        } catch { /* Unstructured or malformed comments are not registered requests. */ }
      }
      if (!response.headers.get('link')?.includes('rel="next"')) return found
    }
    throw new ReviewError(503, 'Revision-request history exceeds the reader limit. Do not infer that no request exists.')
  }
  async function load(articleDate: string, visibleBlobSha: string | null): Promise<ReviewProjection> {
    const sourceCommitSha = z.object({ object: z.object({ sha }) }).parse(await json('/git/ref/heads/main')).object.sha
    const current = await file(`_articles/${articleDate}.md`, sourceCommitSha)
    const registry = registrySchema.parse(JSON.parse((await file('reviews/registry.json', sourceCommitSha)).text))
    const entries: ReviewProjection['entries'] = []
    const unavailable: string[] = []
    const registrations = [
      ...registry.records.filter((record) => record.date === articleDate).map((record) => ({ ...record, lifecycle: 'published' as const, ref: sourceCommitSha })),
      ...registry.proposals.filter((record) => record.date === articleDate).map((record) => ({ ...record, lifecycle: 'proposed' as const, ref: record.headSha })),
    ]
    const identities = new Set<string>()
    for (const registration of registrations) {
      try {
        if (registration.lifecycle === 'proposed') {
          const pr = z.object({ state: z.literal('open'), head: z.object({ sha, repo: z.object({ full_name: z.literal('ojfbot/daily-logger') }) }) }).parse(await json(`/pulls/${registration.pullRequest}`))
          if (pr.head.sha !== registration.ref) throw new Error('Registered proposal head changed; re-registration is required.')
        }
        const record = await file(registration.path, registration.ref)
        const review = reviewSchema.parse(JSON.parse(record.text))
        if (review.article.date !== articleDate || identities.has(review.id)) throw new Error('Conflicting review identity or article date.')
        identities.add(review.id)
        // Confirm the source revision really contains the claimed article blob.
        if ((await file(`_articles/${articleDate}.md`, review.article.sourceCommitSha)).blobSha !== review.article.blobSha) {
          throw new Error('Review source commit and article blob disagree.')
        }
        if ((await file(review.fullRecordPath, registration.ref)).blobSha !== review.fullRecordBlobSha) throw new Error('Full review artifact changed without a matching registration update.')
        entries.push(entrySchema.parse({
          lifecycle: registration.lifecycle, recordRef: registration.ref, recordBlobSha: record.blobSha,
          recordUrl: `https://github.com/ojfbot/daily-logger/blob/${registration.ref}/${registration.path}`,
          fullRecordUrl: `https://github.com/ojfbot/daily-logger/blob/${registration.ref}/${review.fullRecordPath}`,
          review,
          freshness: !visibleBlobSha ? 'visible_revision_unknown' : review.article.blobSha === visibleBlobSha ? 'current' : 'stale',
        }))
      } catch (error) {
        unavailable.push(`${registration.path}: ${error instanceof Error ? error.message : 'Record unavailable'}`)
      }
    }
    const targets = registry.requestTargets.filter((target) => target.date === articleDate)
    if (targets.length > 1) throw new ReviewError(503, 'Conflicting article correspondence targets.')
    const target = targets[0]
    const requestTarget = target ? { issueNumber: target.issueNumber, contextUrl: target.contextUrl } : null
    const history = requestTarget ? await requests(requestTarget.issueNumber) : []
    return projectionSchema.parse({
      schemaVersion: 1, date: articleDate, sourceCommitSha, currentBlobSha: current.blobSha, visibleBlobSha,
      observedAt: new Date().toISOString(), discovery: 'registered_records_only', requestTarget, entries, unavailable,
      requests: history.filter(({ record }) => record.date === articleDate).map(({ record, url }) => ({
        requestId: record.requestId, actor: record.actor, url,
        reviewIds: record.selections.map((selection) => selection.reviewId), findingIds: record.selections.map((selection) => selection.findingId),
      })),
    })
  }
  async function requestChanges(input: ReviewRequest, actor: string) {
    const request = requestSchema.parse(input)
    if (!request.feedback.trim()) throw new ReviewError(400, 'Enter revision feedback before requesting changes.')
    const projection = await load(request.date, request.visibleBlobSha)
    if (!projection.requestTarget) throw new ReviewError(409, 'No editorial correspondence target is registered for this article.')
    const history = await requests(projection.requestTarget.issueNumber)
    const record = requestRecordSchema.parse({ ...request, actor })
    const duplicate = history.find((item) => item.record.requestId === request.requestId && item.record.actor === actor)
    if (duplicate) {
      if (JSON.stringify(duplicate.record) !== JSON.stringify(record)) throw new ReviewError(409, 'This request ID already records different feedback. Reload the review.')
      return { url: duplicate.url, requestId: request.requestId, reused: true }
    }
    if (projection.currentBlobSha !== request.visibleBlobSha) throw new ReviewError(409, 'The article changed. Reload it and review the new revision before submitting.')
    const selected = request.selections.map((selection) => {
      const entry = projection.entries.find((entry) => entry.review.id === selection.reviewId && entry.recordBlobSha === selection.recordBlobSha)
      if (!entry || entry.freshness !== 'current' || entry.review.result !== 'completed') throw new ReviewError(409, 'Selected review is unavailable, changed, failed, or stale. Reload the review.')
      const finding = entry.review.findings.find((finding) => finding.id === selection.findingId)
      if (!finding || finding.disposition.kind !== 'open') throw new ReviewError(409, 'Selected finding is no longer open.')
      return { entry, finding }
    })
    const keys = selected.map(({ entry, finding }) => `${entry.review.id}:${finding.id}`)
    if (new Set(keys).size !== keys.length) throw new ReviewError(400, 'A finding may appear only once in a request.')
    const latestSha = z.object({ object: z.object({ sha }) }).parse(await json('/git/ref/heads/main')).object.sha
    if ((await file(`_articles/${request.date}.md`, latestSha)).blobSha !== request.visibleBlobSha) throw new ReviewError(409, 'The article changed during submission. Reload it before requesting changes.')
    const body = [
      `## Article revision request: ${request.date}`,
      '',
      `Requested by @${actor}. Intent: request_changes. This records feedback only; article acceptance and correction-PR creation require separate actions.`,
      '',
      `Visible article blob: \`${request.visibleBlobSha}\`. Checked against main commit \`${latestSha}\` before recording.`,
      ...selected.map(({ entry, finding }) => `- [${entry.review.id}/${finding.id}](${entry.fullRecordUrl}) at record blob \`${entry.recordBlobSha}\` (${entry.lifecycle}, ${finding.classification}).`),
      '', '### Editable feedback, recorded verbatim', '',
      // JSON strings keep delimiters and literal newlines unambiguous in the display.
      '```json', JSON.stringify({ feedback: request.feedback }, null, 2), '```', '',
      start, Buffer.from(JSON.stringify(record), 'utf8').toString('base64'), end,
    ].join('\n')
    const response = commentSchema.parse(await json(`/issues/${projection.requestTarget.issueNumber}/comments`, { method: 'POST', body: JSON.stringify({ body }) }))
    return { url: response.html_url, requestId: request.requestId, reused: false }
  }
  return { load, requestChanges }
}

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { editorialInputSchema, editorialProjectionSchema, editorialRecordSchema,
  type EditorialInput, type EditorialRecord, type EditorialHistory, type EditorialWriteFailureResponse } from '../../shared/article-review.js'
import { createReviewSource, ReviewError, trustedPullRequest, type GitHub } from './article-review-sources.js'
import { ArticleActionFileSchema, isArticleFileInclusionChange, actionArticlePath } from '../../src/action-registry-schema.js'
import { verifyEditorialProof } from '../../shared/editorial-action-proof.js'
import { sha } from '../../shared/article-review.js'

export const revisionTitle = '## Explicit editorial revision request\n'
export const versionTitle = '## Superseding editorial feedback\n'
const start = '<!-- EDITORIAL_CONTINUATION_V1_START -->'
const end = '<!-- EDITORIAL_CONTINUATION_V1_END -->'
export const repo = '/repos/ojfbot/daily-logger'
export class EditorialWriteFailure extends Error {
  readonly requestId: EditorialInput['requestId']
  readonly intent: EditorialInput['intent']
  readonly outcome: EditorialWriteFailureResponse['outcome']
  constructor({ cause, request, outcome }: { cause: unknown; request: EditorialInput; outcome: EditorialWriteFailureResponse['outcome'] }) {
    super('Editorial write failed', { cause })
    this.name = 'EditorialWriteFailure'
    this.requestId = request.requestId
    this.intent = request.intent
    this.outcome = outcome
  }
}
export function editorialDigest(value: unknown) { return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex') }
export function decodeEditorial(body: string): EditorialRecord | null {
  if (!body.startsWith(revisionTitle) && !body.startsWith(versionTitle)) return null
  const pattern = new RegExp(`^${body.startsWith(revisionTitle) ? revisionTitle : versionTitle}\\n${start}\\n([A-Za-z0-9+/]+={0,2})\\n${end}$`)
  const encoded = pattern.exec(body)?.[1]
  if (!encoded) throw new ReviewError(409, 'Malformed editorial continuation record.')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64') !== encoded) throw new ReviewError(409, 'Invalid editorial encoding.')
  const record = editorialRecordSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  if (body.startsWith(revisionTitle) !== (record.intent === 'request_editorial_revision')) throw new ReviewError(409, 'Editorial title and intent disagree.')
  return record
}
export function encodeEditorial(record: EditorialRecord) {
  const body = `${record.intent === 'request_editorial_revision' ? revisionTitle : versionTitle}\n${start}\n${Buffer.from(JSON.stringify(record), 'utf8').toString('base64')}\n${end}`
  if (body.length > 60000) throw new ReviewError(400, 'Feedback exceeds the saved correspondence size limit. Your draft is retained.')
  return body
}
export function createEditorialService(github: GitHub) {
  async function load(articleDate: string, actor: string) {
    const source = createReviewSource(github)
    const prs = (await source.acceptPulls(articleDate)).filter(pr => pr.head.ref === `accept/${articleDate}`)
    if (!prs.length) {
      const branch = await github(`${repo}/git/ref/heads/accept/${articleDate}`)
      if (branch.status === 404) return editorialProjectionSchema.parse({ status: 'none' })
      if (!branch.ok) throw new ReviewError(409, 'Acceptance branch discovery is unavailable. Refresh before accepting.')
      const head = z.object({ object: z.object({ sha }) }).parse(await branch.json()).object.sha
      const main = await source.main()
      const compared = await github(`${repo}/compare/${main}...${head}?per_page=100`)
      if (!compared.ok) throw new ReviewError(409, 'Cannot verify staged action choices. Refresh before accepting.')
      const diff = z.object({ status: z.enum(['ahead', 'identical']), ahead_by: z.number().int().max(100), total_commits: z.number().int(), commits: z.array(z.unknown()),
        merge_base_commit: z.object({ sha }), files: z.array(z.object({ filename: z.string(), status: z.literal('modified') })).max(1) }).parse(await compared.json())
      if (diff.merge_base_commit.sha !== main || diff.total_commits !== diff.commits.length || diff.files.some(file => file.filename !== actionArticlePath(articleDate))) throw new ReviewError(409, 'Acceptance branch contains changes beyond staged action choices. Reconcile it before accepting.')
      const articlePath = `_articles/${articleDate}.md`
      const [beforeArticle, afterArticle, beforeRegistry, afterRegistry] = await Promise.all([
        source.regularFile(articlePath, main), source.regularFile(articlePath, head), source.regularFile(actionArticlePath(articleDate), main), source.regularFile(actionArticlePath(articleDate), head),
      ])
      if (!await source.onlyFileChanged(actionArticlePath(articleDate), main, head) || beforeArticle.blobSha !== afterArticle.blobSha || !/^status:\s*"?draft"?\s*$/m.test(afterArticle.text) ||
          !isArticleFileInclusionChange(ArticleActionFileSchema.parse(JSON.parse(beforeRegistry.text)), ArticleActionFileSchema.parse(JSON.parse(afterRegistry.text)), actor)) throw new ReviewError(409, 'Acceptance branch contains changes beyond staged action choices. Reconcile it before accepting.')
      const current = await github(`${repo}/git/ref/heads/accept/${articleDate}`)
      if (!current.ok || z.object({ object: z.object({ sha }) }).parse(await current.json()).object.sha !== head || await source.main(true) !== main) throw new ReviewError(409, 'Staged action choices moved during discovery. Refresh before accepting.')
      return editorialProjectionSchema.parse({ status: 'none', stagedHeadSha: head })
    }
    if (prs.length !== 1) throw new ReviewError(409, 'Ambiguous acceptance history. No new acceptance or continuation is enabled.')
    const pr = prs[0]
    if (!pr || !trustedPullRequest(pr)) throw new ReviewError(409, 'Acceptance PR is not a trusted same-repository target.')
    const files = await source.files(pr.number)
    const articlePath = `_articles/${articleDate}.md`
    if (!files.some(file => file.filename === articlePath) || files.some(file => ![articlePath, actionArticlePath(articleDate)].includes(file.filename) || !['added', 'modified'].includes(file.status))) throw new ReviewError(409, 'Acceptance PR may change only its dated article and canonical action registry.')
    const [article, registry] = await Promise.all([source.regularFile(articlePath, pr.head.sha), source.regularFile(actionArticlePath(articleDate), pr.head.sha)])
    ArticleActionFileSchema.parse(JSON.parse(registry.text))
    if (!/^status:\s*"?accepted"?\s*$/m.test(article.text)) throw new ReviewError(409, 'Continuation requires the accepted PR article.')
    const comments = await source.comments(pr.number)
    const versions: EditorialHistory[] = [], requests: EditorialHistory[] = []
    const seen = new Map<string, EditorialHistory>()
    let originalBody = pr.body ?? ''
    const terminals = new Map<string, number>()
    for (const comment of comments.sort((a,b) => a.id - b.id)) {
      if (comment.body.startsWith('## Editorial execution receipt\n')) {
        // Claims are checked by the consumer; any claim leaves a request outstanding until a verified terminal receipt.
        continue
      }
      if (comment.user.login.toLowerCase() !== 'ojfbot') continue
      const record = decodeEditorial(comment.body)
      if (!record) continue
      if (comment.user.login.toLowerCase() !== 'ojfbot' || record.actor !== 'ojfbot' || pr.user.login.toLowerCase() !== 'ojfbot' || comment.created_at !== comment.updated_at || record.date !== articleDate || record.pullRequest !== pr.number) throw new ReviewError(409, 'Editorial history has an untrusted or edited record.')
      const digest = editorialDigest(record)
      const prior = seen.get(record.requestId)
      if (prior) {
        if (prior.digest !== digest) throw new ReviewError(409, 'Conflicting editorial retry identity.')
        prior.duplicateUrls.push(comment.html_url); continue
      }
      const item = { record, digest, commentId: comment.id, url: comment.html_url, createdAt: comment.created_at, duplicateUrls: [] }
      if (record.intent === 'append_editorial_feedback') {
        if (versions.length === 0) originalBody = record.originalBody
        if (record.originalBody !== originalBody || (pr.body ?? '') !== originalBody || record.supersedes !== (versions.at(-1)?.digest ?? editorialDigest(originalBody))) throw new ReviewError(409, 'Original feedback changed or superseding history has a conflict.')
        versions.push(item)
      } else requests.push(item)
      seen.set(record.requestId, item)
    }
    // A terminal outcome is bound to the exact request digest and issued by Actions.
    if (requests.length) {
      for (const comment of comments) {
        if (comment.user.login !== 'github-actions[bot]' || !comment.body.startsWith('## Editorial execution receipt\n') || comment.created_at !== comment.updated_at) continue
        const parsed = z.object({ requestDigest: z.string(), requestCommentId: z.number().int().positive(), runId: z.number().int().positive(), policySha: z.string().regex(/^[a-f0-9]{40}$/), outcome: z.enum(['changed', 'no_change', 'failed', 'stale', 'uncertain']) }).passthrough().safeParse(JSON.parse(comment.body.slice('## Editorial execution receipt\n'.length)))
        if (!parsed.success || !requests.some(item => item.digest === parsed.data.requestDigest) || !['changed', 'no_change'].includes(parsed.data.outcome)) continue
        if (!await verifyEditorialProof(github, parsed.data) || parsed.data.pullRequest !== pr.number || parsed.data.date !== articleDate) continue
        const response = await github(`${repo}/actions/runs/${parsed.data.runId}`)
        if (!response.ok) throw new ReviewError(503, 'Execution receipt provenance unavailable.')
        const run = z.object({ id: z.number(), run_attempt: z.literal(1), event: z.literal('issue_comment'), head_branch: z.literal('main'), head_sha: z.string(), display_title: z.string(), path: z.string().regex(/^\.github\/workflows\/editorial-revise\.yml(?:@(?:main|refs\/heads\/main))?$/) }).parse(await response.json())
        const canonical = requests.find(item => item.digest === parsed.data.requestDigest)
        if (parsed.data.requestCommentId !== canonical?.commentId || run.display_title !== `Editorial continuation comment ${canonical?.commentId}` || run.id !== parsed.data.runId || run.head_sha !== parsed.data.policySha) throw new ReviewError(409, 'Execution receipt disagrees with trusted workflow provenance.')
        terminals.set(parsed.data.requestDigest, comment.id)
      }
    }
    for (let index = 1; index < requests.length; index++) {
      const previous = requests[index - 1], current = requests[index]
      if (previous && current && (terminals.get(previous.digest) ?? Infinity) >= current.commentId) throw new ReviewError(409, 'Concurrent or unresolved explicit requests require diagnosis. No execution is enabled.')
    }
    const latest = await source.pull(pr.number, true)
    if (latest.head.sha !== pr.head.sha || latest.state !== pr.state || latest.body !== pr.body) throw new ReviewError(409, 'Acceptance PR changed during discovery. Refresh.')
    const eligible = actor.toLowerCase() === 'ojfbot' && pr.user.login.toLowerCase() === 'ojfbot' && pr.state === 'open' && !pr.merged_at
    return editorialProjectionSchema.parse({ status: 'existing', eligible,
      reason: 'Continued revisions are available only to ojfbot for acceptance PRs opened by ojfbot. Shared-account identity does not identify a person or agent.',
      originalBody, originalDigest: editorialDigest(originalBody),
      pullRequest: { kind: 'acceptance_pr', number: pr.number, url: pr.html_url, state: pr.state, merged: !!pr.merged_at, author: pr.user.login, headSha: pr.head.sha },
      article, versions, requests, outstanding: requests.length > 0 && !terminals.has(requests.at(-1)?.digest ?? '') })
  }
  async function write(input: EditorialInput, actor: string) {
    const request = editorialInputSchema.parse(input)
    let outcome: EditorialWriteFailureResponse['outcome'] = 'rejected_before_append'
    try {
      if (actor.toLowerCase() !== 'ojfbot') throw new ReviewError(403, 'This pilot is owner-only.')
      const view = await load(request.date, actor)
      if (view.status !== 'existing' || view.pullRequest.author.toLowerCase() !== 'ojfbot') throw new ReviewError(403, 'The owner must have opened the original acceptance PR.')
      const record = editorialRecordSchema.parse({ ...request, actor: 'ojfbot', ...(request.intent === 'append_editorial_feedback' ? { originalBody: view.originalBody } : {}) })
      const digest = editorialDigest(record)
      const old = [...view.versions, ...view.requests].find(item => item.record.requestId === request.requestId)
      if (old) {
        if (old.digest !== digest) throw new ReviewError(409, 'Request ID already binds different editorial content.')
        return { requestId: request.requestId, url: old.url, reused: true, execution: request.intent === 'append_editorial_feedback' ? 'not_started' : 'requested' }
      }
      if (!view.eligible || view.pullRequest.number !== request.pullRequest || view.pullRequest.headSha !== request.headSha) throw new ReviewError(409, 'Acceptance PR closed or changed. Your draft is retained.')
      if (request.intent === 'append_editorial_feedback') {
        if (view.outstanding) throw new ReviewError(409, 'Resolve the outstanding revision request before saving another version.')
        const source = createReviewSource(github)
        const main = await source.file(`_articles/${request.date}.md`, await source.main())
        if (![main.blobSha, view.article.blobSha].includes(request.visibleBlobSha)) throw new ReviewError(409, 'Viewed article is stale.')
        if (request.supersedes !== (view.versions.at(-1)?.digest ?? view.originalDigest) || request.feedback.notes.some(note => !note.content.trim())) throw new ReviewError(409, 'Feedback parent changed or a note is blank.')
      } else {
        const version = view.versions.at(-1)
        if (view.outstanding || !version || version.record.requestId !== request.feedbackId || version.digest !== request.feedbackDigest || request.articleBlobSha !== view.article.blobSha) throw new ReviewError(409, 'Feedback, reviewed article, or outstanding request changed.')
      }
      // Re-read without the request-scoped cache immediately before the append.
      const current = await createReviewSource(github).pull(request.pullRequest)
      if (current.head.sha !== request.headSha || current.state !== 'open' || current.body !== view.originalBody || current.user.login.toLowerCase() !== 'ojfbot') throw new ReviewError(409, 'Acceptance changed during submission.')
      const body = encodeEditorial(record)
      outcome = 'uncertain'
      const response = await createReviewSource(github).postComment(request.pullRequest, body)
      if (response.user.login.toLowerCase() !== 'ojfbot') throw new ReviewError(503, 'Unexpected GitHub author. Refresh history before retrying.')
      await load(request.date, actor)
      return { requestId: request.requestId, url: response.html_url, reused: false, execution: request.intent === 'append_editorial_feedback' ? 'not_started' : 'requested' }
    } catch (cause) {
      throw new EditorialWriteFailure({ cause, request, outcome })
    }
  }
  return { load, write }
}

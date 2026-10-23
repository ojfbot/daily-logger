import { createHash } from 'node:crypto'
import { z } from 'zod'
import { editorialInputSchema, editorialProjectionSchema, editorialRecordSchema,
  resolveEditorialRequestSchema, resolutionEvidenceSchema,
  type EditorialInput, type EditorialRecord, type EditorialHistory, type EditorialWriteFailureResponse } from '../../shared/article-review.js'
import { createReviewSource, githubCommentSchema, ReviewError, trustedPullRequest, type GitHub } from './article-review-sources.js'
import { ArticleActionFileSchema, isArticleFileInclusionChange, actionArticlePath } from '../../src/action-registry-schema.js'
import { verifyEditorialProof } from '../../shared/editorial-action-proof.js'
import { sha } from '../../shared/article-review.js'

export const revisionTitle = '## Explicit editorial revision request\n'
export const versionTitle = '## Superseding editorial feedback\n'
export const cleanAcceptanceTitle = '## Explicit clean acceptance request\n'
export const resolutionTitle = '## Owner resolution of editorial request\n'
const start = '<!-- EDITORIAL_CONTINUATION_V1_START -->'
const end = '<!-- EDITORIAL_CONTINUATION_V1_END -->'
export const repo = '/repos/ojfbot/daily-logger'
const claimTitle = '## Editorial execution claim\n'
const receiptTitle = '## Editorial execution receipt\n'
const claimSchema = z.object({ requestDigest: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.uuid(), requestCommentId: z.number().int().positive(),
  intent: z.enum(['request_editorial_revision', 'request_clean_acceptance']), actionReviewMode: z.enum(['revision', 'clean-acceptance']),
  inputHead: sha, inputBlob: sha, inputRegistryBlob: sha, policySha: sha, runId: z.number().int().positive(), attempt: z.literal(1) }).passthrough()
const executionReceiptSchema = z.object({ requestDigest: z.string().regex(/^[a-f0-9]{64}$/), requestCommentId: z.number().int().positive(),
  runId: z.number().int().positive(), policySha: sha, requestIntent: z.enum(['request_editorial_revision', 'request_clean_acceptance']).optional(),
  actionReviewMode: z.enum(['clean-acceptance', 'revision']).optional(), outcome: z.enum(['changed', 'no_change', 'failed', 'stale', 'uncertain']) }).passthrough()
const failedAttemptSchema = z.object({ id: z.number().int().positive(), run_attempt: z.literal(1), status: z.literal('completed'), conclusion: z.literal('failure'),
  event: z.literal('issue_comment'), head_sha: sha, head_branch: z.literal('main'),
  path: z.string().regex(/^\.github\/workflows\/editorial-revise\.yml(?:@(?:main|refs\/heads\/main))?$/), display_title: z.string().min(1) }).passthrough()
const listedRunSchema = z.object({ id: z.number().int().positive(), run_attempt: z.number().int().positive().optional(), status: z.string().optional(),
  conclusion: z.string().nullable().optional(), display_title: z.string().min(1) }).passthrough()
type EditorialComment = z.infer<typeof githubCommentSchema>
type ResolutionInput = z.infer<typeof resolveEditorialRequestSchema>
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
function editorialTitle(record: EditorialRecord) {
  switch (record.intent) {
    case 'append_editorial_feedback': return versionTitle
    case 'request_editorial_revision': return revisionTitle
    case 'request_clean_acceptance': return cleanAcceptanceTitle
    case 'resolve_editorial_request': return resolutionTitle
  }
}
export function decodeEditorial(body: string): EditorialRecord | null {
  const title = [revisionTitle, versionTitle, cleanAcceptanceTitle, resolutionTitle].find(candidate => body.startsWith(candidate))
  if (!title) return null
  const pattern = new RegExp(`^${title}\\n${start}\\n([A-Za-z0-9+/]+={0,2})\\n${end}$`)
  const encoded = pattern.exec(body)?.[1]
  if (!encoded) throw new ReviewError(409, 'Malformed editorial continuation record.')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64') !== encoded) throw new ReviewError(409, 'Invalid editorial encoding.')
  const record = editorialRecordSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  if (title !== editorialTitle(record)) throw new ReviewError(409, 'Editorial title and intent disagree.')
  return record
}
export function encodeEditorial(record: EditorialRecord) {
  const body = `${editorialTitle(record)}\n${start}\n${Buffer.from(JSON.stringify(record), 'utf8').toString('base64')}\n${end}`
  if (body.length > 60000) throw new ReviewError(400, 'Feedback exceeds the saved correspondence size limit. Your draft is retained.')
  return body
}

function botExecutionRecords(comments: readonly EditorialComment[]) {
  const claims: Array<{ comment: EditorialComment; value: z.infer<typeof claimSchema>; digest: string }> = []
  const receipts: Array<{ comment: EditorialComment; value: z.infer<typeof executionReceiptSchema>; digest: string }> = []
  for (const comment of comments) {
    if (comment.user.login !== 'github-actions[bot]') continue
    if (comment.body.startsWith(claimTitle)) {
      if (comment.created_at !== comment.updated_at) throw new ReviewError(409, 'An execution claim was edited; owner resolution is blocked.')
      let value: z.infer<typeof claimSchema>
      try { value = claimSchema.parse(JSON.parse(comment.body.slice(claimTitle.length))) }
      catch { throw new ReviewError(409, 'An execution claim is malformed; owner resolution is blocked.') }
      claims.push({ comment, value, digest: editorialDigest(value) })
    }
    if (comment.body.startsWith(receiptTitle)) {
      if (comment.created_at !== comment.updated_at) throw new ReviewError(409, 'An execution receipt was edited; owner resolution is blocked.')
      let value: z.infer<typeof executionReceiptSchema>
      try { value = executionReceiptSchema.parse(JSON.parse(comment.body.slice(receiptTitle.length))) }
      catch { throw new ReviewError(409, 'An execution receipt is malformed; owner resolution is blocked.') }
      receipts.push({ comment, value, digest: editorialDigest(value) })
    }
  }
  return { claims, receipts }
}

function missingReceiptCorrespondence(bot: ReturnType<typeof botExecutionRecords>, request: EditorialHistory, runId: number) {
  return {
    claims: bot.claims.filter(item => item.value.requestDigest === request.digest || item.value.requestCommentId === request.commentId || item.value.requestId === request.record.requestId || item.value.runId === runId),
    receipts: bot.receipts.filter(item => item.value.requestDigest === request.digest || item.value.requestCommentId === request.commentId || item.value.runId === runId),
  }
}

function canonicalPrefix(comments: readonly EditorialComment[], throughCommentId: number) {
  const entries: Array<{ commentId: number; kind: 'owner-record' | 'claim' | 'receipt'; semanticDigest: string }> = []
  const bot = botExecutionRecords(comments.filter(comment => comment.id <= throughCommentId))
  for (const comment of comments.filter(comment => comment.id <= throughCommentId && comment.user.login.toLowerCase() === 'ojfbot')) {
    const record = decodeEditorial(comment.body)
    if (!record) continue
    if (comment.created_at !== comment.updated_at) throw new ReviewError(409, 'Editorial history has an edited canonical record.')
    entries.push({ commentId: comment.id, kind: 'owner-record', semanticDigest: editorialDigest(record) })
  }
  entries.push(...bot.claims.map(item => ({ commentId: item.comment.id, kind: 'claim' as const, semanticDigest: item.digest })))
  entries.push(...bot.receipts.map(item => ({ commentId: item.comment.id, kind: 'receipt' as const, semanticDigest: item.digest })))
  entries.sort((left, right) => left.commentId - right.commentId || left.kind.localeCompare(right.kind))
  return { throughCommentId, sha256: editorialDigest(entries), entries }
}

async function workflowRuns(github: GitHub, createdAt: string, { requireTotal = false } = {}) {
  const runs: z.infer<typeof listedRunSchema>[] = []
  let declaredTotal: number | undefined
  for (let page = 1; page <= 5; page++) {
    const query = new URLSearchParams({ event: 'issue_comment', created: `>=${createdAt}`, per_page: '100', page: String(page) })
    const response = await github(`${repo}/actions/workflows/editorial-revise.yml/runs?${query}`)
    if (!response.ok) throw new ReviewError(503, 'Editorial execution history is unavailable.')
    const result = z.object({ total_count: z.number().int().nonnegative().optional(), workflow_runs: z.array(listedRunSchema) }).parse(await response.json())
    if (requireTotal && result.total_count === undefined) throw new ReviewError(503, 'Complete execution history requires an explicit total before resolving a missing receipt.')
    if (result.total_count !== undefined) {
      if (declaredTotal !== undefined && declaredTotal !== result.total_count) throw new ReviewError(503, 'Editorial execution history count changed during pagination.')
      declaredTotal = result.total_count
    }
    runs.push(...result.workflow_runs)
    if (!response.headers.get('link')?.includes('rel="next"')) {
      if (declaredTotal !== undefined && new Set(runs.map(run => run.id)).size !== declaredTotal) throw new ReviewError(503, 'Editorial execution history is incomplete.')
      return runs
    }
  }
  throw new ReviewError(503, 'Editorial execution history exceeds the bounded reader; owner resolution is blocked.')
}

async function runArtifacts(github: GitHub, runId: number) {
  const artifacts: unknown[] = []
  let total = 0
  for (let page = 1; page <= 3; page++) {
    const response = await github(`${repo}/actions/runs/${runId}/artifacts?per_page=100&page=${page}`)
    if (!response.ok) throw new ReviewError(503, 'Editorial artifact history is unavailable.')
    const result = z.object({ total_count: z.number().int().nonnegative(), artifacts: z.array(z.unknown()) }).parse(await response.json())
    total = result.total_count
    artifacts.push(...result.artifacts)
    if (!response.headers.get('link')?.includes('rel="next"')) {
      if (artifacts.length !== total) throw new ReviewError(503, 'Editorial artifact history is incomplete.')
      return artifacts
    }
  }
  throw new ReviewError(503, 'Editorial artifact history exceeds the bounded reader; owner resolution is blocked.')
}

async function failedAttempt(github: GitHub, runId: number) {
  const response = await github(`${repo}/actions/runs/${runId}/attempts/1`)
  if (!response.ok) throw new ReviewError(503, 'The original workflow attempt is unavailable.')
  return failedAttemptSchema.parse(await response.json())
}

function resolvedAttemptAssociationIssue(input: {
  request: Extract<EditorialRecord, { intent: 'request_clean_acceptance' }>; requestDigest: string; requestCommentId: number;
  claim: z.infer<typeof claimSchema>; receipt: z.infer<typeof executionReceiptSchema> | null; attempt: z.infer<typeof failedAttemptSchema>;
}) {
  const { request, requestDigest, requestCommentId, claim, receipt, attempt } = input
  if (claim.requestDigest !== requestDigest || claim.requestCommentId !== requestCommentId || claim.requestId !== request.requestId ||
      claim.intent !== request.intent || claim.actionReviewMode !== 'clean-acceptance' || claim.inputHead !== request.headSha ||
      claim.inputBlob !== request.articleBlobSha || claim.inputRegistryBlob !== request.registryBlobSha || claim.policySha !== request.policySha) {
    return 'The execution claim and original clean request do not bind the same immutable input.'
  }
  if (receipt && (receipt.requestDigest !== requestDigest || receipt.requestCommentId !== requestCommentId || receipt.outcome !== 'uncertain' ||
      receipt.runId !== claim.runId || receipt.policySha !== claim.policySha ||
      (receipt.requestIntent !== undefined && receipt.requestIntent !== request.intent) ||
      (receipt.actionReviewMode !== undefined && receipt.actionReviewMode !== 'clean-acceptance'))) {
    return 'The uncertain receipt and clean request do not bind the same immutable attempt.'
  }
  if (attempt.id !== claim.runId || attempt.head_sha !== claim.policySha || attempt.display_title !== `Editorial continuation comment ${requestCommentId}`) {
    return 'The immutable failed attempt does not match the request, claim, and receipt.'
  }
  return null
}

function resolutionInputFromRecord(record: Extract<EditorialRecord, { intent: 'resolve_editorial_request' }>): ResolutionInput {
  return resolveEditorialRequestSchema.parse({ schemaVersion: record.schemaVersion, intent: record.intent, requestId: record.requestId,
    date: record.date, pullRequest: record.pullRequest, headSha: record.headSha, priorRequestDigest: record.priorRequestDigest,
    articleBlobSha: record.articleBlobSha, registryBlobSha: record.registryBlobSha, policySha: record.policySha,
    prefix: record.prefix, acknowledgment: record.acknowledgment, reason: record.reason })
}

function resolutionProjectionInput(record: ResolutionInput) {
  return { schemaVersion: record.schemaVersion, date: record.date, pullRequest: record.pullRequest, headSha: record.headSha,
    priorRequestDigest: record.priorRequestDigest, articleBlobSha: record.articleBlobSha, registryBlobSha: record.registryBlobSha,
    policySha: record.policySha, prefix: record.prefix }
}

async function inspectRecovery(input: { github: GitHub; comments: readonly EditorialComment[]; request: EditorialHistory;
  pullRequest: number; headSha: string; articleBlobSha: string; registryBlobSha: string; policySha: string }) {
  const blocked = (reason: string) => ({ kind: 'blocked' as const, reason })
  if (input.request.record.intent !== 'request_clean_acceptance') return { kind: 'none' as const }
  try {
    const bot = botExecutionRecords(input.comments)
    const claims = bot.claims.filter(item => item.value.requestDigest === input.request.digest && item.value.requestCommentId === input.request.commentId)
    const receipts = bot.receipts.filter(item => item.value.requestDigest === input.request.digest && item.value.requestCommentId === input.request.commentId)
    if (claims.length !== 1) return blocked('Owner resolution requires one immutable execution claim for the outstanding clean request.')
    const missingReceipt = receipts.length === 0
    if (!missingReceipt && (receipts.length !== 1 || receipts[0]?.value.outcome !== 'uncertain')) return blocked('Owner resolution requires one immutable uncertain receipt or a proven missing terminal receipt, and no competing outcome.')
    const claim = claims[0], receipt = receipts[0]
    if (!claim) return blocked('Owner resolution evidence is incomplete.')
    if (missingReceipt) {
      const related = missingReceiptCorrespondence(bot, input.request, claim.value.runId)
      if (related.claims.length !== 1 || related.receipts.length) return blocked('Missing-receipt recovery has competing or mismatched execution correspondence.')
    }
    const request = input.request.record
    if (input.headSha !== request.headSha || input.articleBlobSha !== request.articleBlobSha || input.registryBlobSha !== request.registryBlobSha) {
      return blocked('The current PR head, article, or action map no longer equals the claimed input. Resolve before integrating new branch data.')
    }
    const attempt = await failedAttempt(input.github, claim.value.runId)
    const associationIssue = resolvedAttemptAssociationIssue({ request, requestDigest: input.request.digest,
      requestCommentId: input.request.commentId, claim: claim.value, receipt: receipt?.value ?? null, attempt })
    if (associationIssue) return blocked(associationIssue)
    const expectedTitle = `Editorial continuation comment ${input.request.commentId}`
    const matchingRuns = (await workflowRuns(input.github, input.request.createdAt, { requireTotal: missingReceipt })).filter(run => run.display_title === expectedTitle)
    if (matchingRuns.length !== 1 || matchingRuns[0]?.id !== claim.value.runId || matchingRuns[0]?.run_attempt !== 1 ||
        matchingRuns[0]?.status !== 'completed' || matchingRuns[0]?.conclusion !== 'failure') {
      return blocked('A unique completed failure on attempt 1 is not established for this request.')
    }
    if ((await runArtifacts(input.github, claim.value.runId)).length) return blocked('The failed run has output artifacts and cannot use the no-output owner-resolution path.')
    const full = canonicalPrefix(input.comments, Number.MAX_SAFE_INTEGER)
    const throughCommentId = Math.max(...full.entries.map(entry => entry.commentId))
    if (!Number.isSafeInteger(throughCommentId)) return blocked('The canonical recovery prefix is empty.')
    const prefix = canonicalPrefix(input.comments, throughCommentId)
    const evidence = resolutionEvidenceSchema.parse({ requestCommentId: input.request.commentId, requestDigest: input.request.digest,
      claim: { commentId: claim.comment.id, semanticDigest: claim.digest }, receipt: receipt
        ? { commentId: receipt.comment.id, semanticDigest: receipt.digest } : { kind: 'missing-terminal-receipt' },
      attempt: { runId: attempt.id, number: attempt.run_attempt, policySha: attempt.head_sha, event: attempt.event, branch: attempt.head_branch,
        path: attempt.path.replace(/@(?:main|refs\/heads\/main)$/, ''), displayTitle: attempt.display_title, status: attempt.status, conclusion: attempt.conclusion } })
    return { kind: 'available' as const, input: { schemaVersion: 1 as const, date: request.date, pullRequest: input.pullRequest,
      headSha: request.headSha, priorRequestDigest: input.request.digest, articleBlobSha: request.articleBlobSha,
      registryBlobSha: request.registryBlobSha, policySha: input.policySha, prefix: { throughCommentId, sha256: prefix.sha256 } }, evidence }
  } catch (error) {
    if (error instanceof ReviewError) return blocked(error.message)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return blocked('Owner resolution evidence is malformed or incomplete.')
    throw error
  }
}

async function validateHistoricalResolution(input: { github: GitHub; comments: readonly EditorialComment[]; resolution: EditorialHistory; requests: readonly EditorialHistory[] }) {
  const record = input.resolution.record
  if (record.intent !== 'resolve_editorial_request') throw new ReviewError(409, 'Resolution history contains an executable record.')
  const request = input.requests.find(item => item.digest === record.priorRequestDigest)
  if (!request || request.record.intent !== 'request_clean_acceptance' || request.commentId !== record.evidence.requestCommentId ||
      request.digest !== record.evidence.requestDigest || request.record.headSha !== record.headSha || request.record.articleBlobSha !== record.articleBlobSha ||
      request.record.registryBlobSha !== record.registryBlobSha || input.resolution.commentId <= record.prefix.throughCommentId) {
    throw new ReviewError(409, 'Owner resolution no longer binds its original clean request.')
  }
  const prefix = canonicalPrefix(input.comments, record.prefix.throughCommentId)
  if (prefix.sha256 !== record.prefix.sha256) throw new ReviewError(409, 'Owner resolution canonical history prefix changed.')
  const bot = botExecutionRecords(input.comments)
  const claim = bot.claims.find(item => item.comment.id === record.evidence.claim.commentId)
  const receiptEvidence = record.evidence.receipt
  const missingReceipt = 'kind' in receiptEvidence
  const receipt = 'kind' in receiptEvidence ? undefined : bot.receipts.find(item => item.comment.id === receiptEvidence.commentId)
  if (!claim || claim.digest !== record.evidence.claim.semanticDigest ||
      (!('kind' in receiptEvidence) && (!receipt || receipt.digest !== receiptEvidence.semanticDigest))) {
    throw new ReviewError(409, 'Owner resolution claim or uncertain receipt changed.')
  }
  if (missingReceipt) {
    const prior = missingReceiptCorrespondence(botExecutionRecords(input.comments.filter(comment => comment.id <= record.prefix.throughCommentId)), request, claim.value.runId)
    if (prior.claims.length !== 1 || prior.receipts.length) throw new ReviewError(409, 'Owner resolution did not prove a missing terminal receipt in its canonical prefix.')
  }
  const attempt = await failedAttempt(input.github, record.evidence.attempt.runId)
  const observed = resolutionEvidenceSchema.parse({ requestCommentId: request.commentId, requestDigest: request.digest,
    claim: record.evidence.claim, receipt: record.evidence.receipt,
    attempt: { runId: attempt.id, number: attempt.run_attempt, policySha: attempt.head_sha, event: attempt.event, branch: attempt.head_branch,
      path: attempt.path.replace(/@(?:main|refs\/heads\/main)$/, ''), displayTitle: attempt.display_title, status: attempt.status, conclusion: attempt.conclusion } })
  if (editorialDigest(observed) !== editorialDigest(record.evidence)) throw new ReviewError(409, 'Owner resolution immutable attempt facts changed.')
  const associationIssue = resolvedAttemptAssociationIssue({ request: request.record, requestDigest: request.digest,
      requestCommentId: request.commentId, claim: claim.value, receipt: receipt?.value ?? null, attempt })
  const gap = canonicalPrefix(input.comments, input.resolution.commentId - 1).entries
    .some(entry => entry.commentId > record.prefix.throughCommentId)
  return { request, holdReason: associationIssue ?? (gap ? 'Material editorial correspondence appeared before the owner resolution was recorded.' : undefined) }
}

async function resolutionExecutionReadiness(github: GitHub, comments: readonly EditorialComment[], resolutions: readonly EditorialHistory[], requests: readonly EditorialHistory[], terminals: ReadonlyMap<string, number>, holds: ReadonlyMap<string, string>) {
  const bot = botExecutionRecords(comments)
  for (const resolution of resolutions) {
    const record = resolution.record
    if (record.intent !== 'resolve_editorial_request') continue
    const request = requests.find(item => item.digest === record.priorRequestDigest)
    if (!request) return { kind: 'blocked' as const, reason: 'A resolved request is missing from canonical history.' }
    const hold = holds.get(request.digest)
    if (hold) return { kind: 'blocked' as const, reason: hold }
    if (terminals.has(request.digest)) return { kind: 'blocked' as const, reason: 'A resolved request later acquired a successful output receipt and requires diagnosis.' }
    const receiptEvidence = record.evidence.receipt
    const missingReceipt = 'kind' in receiptEvidence
    const related = missingReceipt ? missingReceiptCorrespondence(bot, request, record.evidence.attempt.runId) : {
      claims: bot.claims.filter(item => item.value.requestDigest === request.digest && item.value.requestCommentId === request.commentId),
      receipts: bot.receipts.filter(item => item.value.requestDigest === request.digest && item.value.requestCommentId === request.commentId),
    }
    const relatedClaims = related.claims, relatedReceipts = related.receipts
    const receiptMatches = 'kind' in receiptEvidence ? relatedReceipts.length === 0 : relatedReceipts.length === 1 &&
      relatedReceipts[0]?.comment.id === receiptEvidence.commentId && relatedReceipts[0]?.digest === receiptEvidence.semanticDigest
    if (relatedClaims.length !== 1 || relatedClaims[0]?.comment.id !== record.evidence.claim.commentId ||
        relatedClaims[0]?.digest !== record.evidence.claim.semanticDigest || !receiptMatches) {
      return { kind: 'blocked' as const, reason: 'A resolved request has additional or changed execution correspondence.' }
    }
    const title = `Editorial continuation comment ${request.commentId}`
    const matching = (await workflowRuns(github, request.createdAt, { requireTotal: missingReceipt })).filter(run => run.display_title === title)
    if (matching.length !== 1 || matching[0]?.id !== record.evidence.attempt.runId || matching[0]?.run_attempt !== 1 ||
        missingReceipt && (matching[0]?.status !== 'completed' || matching[0]?.conclusion !== 'failure')) {
      return { kind: 'blocked' as const, reason: 'A resolved request has an uncovered execution or incomplete execution history.' }
    }
    if ((await runArtifacts(github, record.evidence.attempt.runId)).length) return { kind: 'blocked' as const, reason: 'A resolved request later acquired an unexpected output artifact.' }
  }
  return { kind: 'ready' as const }
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
    const [article, registry, policySha] = await Promise.all([source.regularFile(articlePath, pr.head.sha), source.regularFile(actionArticlePath(articleDate), pr.head.sha), source.main()])
    ArticleActionFileSchema.parse(JSON.parse(registry.text))
    if (!/^status:\s*"?accepted"?\s*$/m.test(article.text)) throw new ReviewError(409, 'Continuation requires the accepted PR article.')
    const comments = await source.comments(pr.number)
    const versions: EditorialHistory[] = [], requests: EditorialHistory[] = [], resolutions: EditorialHistory[] = []
    const seen = new Map<string, EditorialHistory>()
    let originalBody = pr.body ?? ''
    const terminals = new Map<string, number>()
    for (const comment of comments.sort((a,b) => a.id - b.id)) {
      if (comment.body.startsWith(receiptTitle)) {
        // Claims are checked by the consumer; any claim leaves a request outstanding until a verified terminal receipt.
        continue
      }
      if (comment.body.startsWith(resolutionTitle) && comment.user.login.toLowerCase() !== 'ojfbot') throw new ReviewError(409, 'Owner resolution has an untrusted author.')
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
      } else if (record.intent === 'resolve_editorial_request') resolutions.push(item)
      else requests.push(item)
      seen.set(record.requestId, item)
    }
    // A terminal outcome is bound to the exact request digest and issued by Actions.
    if (requests.length) {
      for (const comment of comments) {
        if (comment.user.login !== 'github-actions[bot]' || !comment.body.startsWith(receiptTitle) || comment.created_at !== comment.updated_at) continue
        const parsed = executionReceiptSchema.safeParse(JSON.parse(comment.body.slice(receiptTitle.length)))
        if (!parsed.success || !requests.some(item => item.digest === parsed.data.requestDigest) || !['changed', 'no_change'].includes(parsed.data.outcome)) continue
        if (!await verifyEditorialProof(github, parsed.data) || parsed.data.pullRequest !== pr.number || parsed.data.date !== articleDate) continue
        const response = await github(`${repo}/actions/runs/${parsed.data.runId}`)
        if (!response.ok) throw new ReviewError(503, 'Execution receipt provenance unavailable.')
        const run = z.object({ id: z.number(), run_attempt: z.literal(1), event: z.literal('issue_comment'), head_branch: z.literal('main'), head_sha: z.string(), display_title: z.string(), path: z.string().regex(/^\.github\/workflows\/editorial-revise\.yml(?:@(?:main|refs\/heads\/main))?$/) }).parse(await response.json())
        const canonical = requests.find(item => item.digest === parsed.data.requestDigest)
        const expectedMode = canonical?.record.intent === 'request_clean_acceptance' ? 'clean-acceptance' : 'revision'
        if (parsed.data.actionReviewMode !== expectedMode
          || (canonical?.record.intent === 'request_clean_acceptance' && parsed.data.requestIntent !== 'request_clean_acceptance')
          || (parsed.data.requestIntent && parsed.data.requestIntent !== canonical?.record.intent)) continue
        if (parsed.data.requestCommentId !== canonical?.commentId || run.display_title !== `Editorial continuation comment ${canonical?.commentId}` || run.id !== parsed.data.runId || run.head_sha !== parsed.data.policySha) throw new ReviewError(409, 'Execution receipt disagrees with trusted workflow provenance.')
        terminals.set(parsed.data.requestDigest, comment.id)
      }
    }
    const resolved = new Map<string, number>()
    const resolutionHolds = new Map<string, string>()
    for (const resolution of resolutions) {
      const validated = await validateHistoricalResolution({ github, comments, resolution, requests })
      if (resolved.has(validated.request.digest)) throw new ReviewError(409, 'Competing owner resolutions require diagnosis.')
      resolved.set(validated.request.digest, resolution.commentId)
      if (validated.holdReason) resolutionHolds.set(validated.request.digest, validated.holdReason)
    }
    for (let index = 1; index < requests.length; index++) {
      const previous = requests[index - 1], current = requests[index]
      if (previous && current && (terminals.get(previous.digest) ?? resolved.get(previous.digest) ?? Infinity) >= current.commentId) throw new ReviewError(409, 'Concurrent or unresolved explicit requests require diagnosis. No execution is enabled.')
    }
    const latest = await source.pull(pr.number, true)
    if (latest.head.sha !== pr.head.sha || latest.state !== pr.state || latest.body !== pr.body) throw new ReviewError(409, 'Acceptance PR changed during discovery. Refresh.')
    const eligible = actor.toLowerCase() === 'ojfbot' && pr.user.login.toLowerCase() === 'ojfbot' && pr.state === 'open' && !pr.merged_at
    const latestRequest = requests.at(-1)
    const terminalCommentId = latestRequest ? terminals.get(latestRequest.digest) : undefined
    const resolutionCommentId = latestRequest ? resolved.get(latestRequest.digest) : undefined
    const requestState = !latestRequest ? { kind: 'none' as const }
      : resolutionCommentId !== undefined ? { kind: 'owner_resolved' as const, request: { digest: latestRequest.digest, commentId: latestRequest.commentId }, resolutionCommentId }
      : terminalCommentId !== undefined ? { kind: 'artifact_verified' as const, request: { digest: latestRequest.digest, commentId: latestRequest.commentId }, receiptCommentId: terminalCommentId }
      : { kind: 'outstanding' as const, request: { digest: latestRequest.digest, commentId: latestRequest.commentId } }
    const recovery = requestState.kind === 'outstanding' && latestRequest
      ? await inspectRecovery({ github, comments, request: latestRequest, pullRequest: pr.number, headSha: pr.head.sha,
        articleBlobSha: article.blobSha, registryBlobSha: registry.blobSha, policySha })
      : { kind: 'none' as const }
    const executionReadiness = await resolutionExecutionReadiness(github, comments, resolutions, requests, terminals, resolutionHolds)
    return editorialProjectionSchema.parse({ status: 'existing', eligible,
      reason: 'Continued revisions are available only to ojfbot for acceptance PRs opened by ojfbot. Shared-account identity does not identify a person or agent.',
      originalBody, originalDigest: editorialDigest(originalBody),
      pullRequest: { kind: 'acceptance_pr', number: pr.number, url: pr.html_url, state: pr.state, merged: !!pr.merged_at, author: pr.user.login, headSha: pr.head.sha },
      article, registryBlobSha: registry.blobSha, policySha, versions, requests, resolutions, requestState, recovery, executionReadiness,
      outstanding: requestState.kind === 'outstanding' })
  }
  async function write(input: EditorialInput, actor: string) {
    const request = editorialInputSchema.parse(input)
    let outcome: EditorialWriteFailureResponse['outcome'] = 'rejected_before_append'
    try {
      if (actor.toLowerCase() !== 'ojfbot') throw new ReviewError(403, 'This pilot is owner-only.')
      const view = await load(request.date, actor)
      if (view.status !== 'existing' || view.pullRequest.author.toLowerCase() !== 'ojfbot') throw new ReviewError(403, 'The owner must have opened the original acceptance PR.')
      const old = [...view.versions, ...view.requests, ...view.resolutions].find(item => item.record.requestId === request.requestId)
      if (old) {
        const matches = old.record.intent === 'resolve_editorial_request' && request.intent === 'resolve_editorial_request'
          ? editorialDigest(resolutionInputFromRecord(old.record)) === editorialDigest(request)
          : old.record.intent !== 'resolve_editorial_request' && request.intent !== 'resolve_editorial_request' &&
            old.digest === editorialDigest(editorialRecordSchema.parse({ ...request, actor: 'ojfbot', ...(request.intent === 'append_editorial_feedback' ? { originalBody: view.originalBody } : {}) }))
        if (!matches) throw new ReviewError(409, 'Request ID already binds different editorial content.')
        return { requestId: request.requestId, url: old.url, reused: true,
          execution: request.intent === 'request_editorial_revision' || request.intent === 'request_clean_acceptance' ? 'requested' as const : 'not_started' as const }
      }
      if (!view.eligible || view.pullRequest.number !== request.pullRequest || view.pullRequest.headSha !== request.headSha) throw new ReviewError(409, 'Acceptance PR closed or changed. Your draft is retained.')
      let record: EditorialRecord
      if (request.intent === 'append_editorial_feedback') {
        if (view.outstanding) throw new ReviewError(409, 'Resolve the outstanding revision request before saving another version.')
        const source = createReviewSource(github)
        const main = await source.file(`_articles/${request.date}.md`, await source.main())
        if (![main.blobSha, view.article.blobSha].includes(request.visibleBlobSha)) throw new ReviewError(409, 'Viewed article is stale.')
        if (request.supersedes !== (view.versions.at(-1)?.digest ?? view.originalDigest) || request.feedback.notes.some(note => !note.content.trim())) throw new ReviewError(409, 'Feedback parent changed or a note is blank.')
        record = editorialRecordSchema.parse({ ...request, actor: 'ojfbot', originalBody: view.originalBody })
      } else if (request.intent === 'request_editorial_revision') {
        const version = view.versions.at(-1)
        if (view.executionReadiness.kind === 'blocked' || view.outstanding || !version || version.record.requestId !== request.feedbackId || version.digest !== request.feedbackDigest || request.articleBlobSha !== view.article.blobSha) throw new ReviewError(409, 'Feedback, reviewed article, execution history, or outstanding request changed.')
        record = editorialRecordSchema.parse({ ...request, actor: 'ojfbot' })
      } else if (request.intent === 'request_clean_acceptance') {
        if (view.executionReadiness.kind === 'blocked') throw new ReviewError(409, view.executionReadiness.reason)
        if (view.outstanding || view.versions.length || /EDITORIAL_FEEDBACK(?:_V2)?_START/.test(view.originalBody)) throw new ReviewError(409, 'A clean acceptance request cannot consume or hide genuine editorial feedback.')
        if (request.articleBlobSha !== view.article.blobSha || request.registryBlobSha !== view.registryBlobSha || request.policySha !== view.policySha) throw new ReviewError(409, 'Clean acceptance input or trusted policy changed.')
        record = editorialRecordSchema.parse({ ...request, actor: 'ojfbot' })
      } else {
        if (view.resolutions.some(item => item.record.intent === 'resolve_editorial_request' && item.record.priorRequestDigest === request.priorRequestDigest)) throw new ReviewError(409, 'This request already has an owner resolution.')
        if (view.recovery.kind !== 'available' || editorialDigest(view.recovery.input) !== editorialDigest(resolutionProjectionInput(request))) throw new ReviewError(409, 'The owner-resolution target or observed inputs changed.')
        const current = await load(request.date, actor)
        if (current.status !== 'existing' || current.recovery.kind !== 'available' || current.executionReadiness.kind === 'blocked' ||
            editorialDigest(current.recovery.input) !== editorialDigest(view.recovery.input) ||
            editorialDigest(current.recovery.evidence) !== editorialDigest(view.recovery.evidence)) throw new ReviewError(409, 'Owner-resolution evidence changed during submission.')
        record = editorialRecordSchema.parse({ ...request, actor: 'ojfbot', evidence: current.recovery.evidence })
      }
      if (request.intent !== 'resolve_editorial_request') {
        // Re-read without the request-scoped cache immediately before the append.
        const current = await createReviewSource(github).pull(request.pullRequest)
        if (current.head.sha !== request.headSha || current.state !== 'open' || current.body !== view.originalBody || current.user.login.toLowerCase() !== 'ojfbot') throw new ReviewError(409, 'Acceptance changed during submission.')
      }
      if (request.intent === 'request_clean_acceptance') {
        const source = createReviewSource(github)
        const currentRegistry = await source.regularFile(actionArticlePath(request.date), request.headSha)
        if (await source.main(true) !== request.policySha || currentRegistry.blobSha !== request.registryBlobSha) throw new ReviewError(409, 'Clean acceptance input or trusted policy changed during submission.')
      }
      const body = encodeEditorial(record)
      outcome = 'uncertain'
      const response = await createReviewSource(github).postComment(request.pullRequest, body)
      if (response.user.login.toLowerCase() !== 'ojfbot') throw new ReviewError(503, 'Unexpected GitHub author. Refresh history before retrying.')
      await load(request.date, actor)
      return { requestId: request.requestId, url: response.html_url, reused: false,
        execution: request.intent === 'request_editorial_revision' || request.intent === 'request_clean_acceptance' ? 'requested' as const : 'not_started' as const }
    } catch (cause) {
      throw new EditorialWriteFailure({ cause, request, outcome })
    }
  }
  return { load, write }
}

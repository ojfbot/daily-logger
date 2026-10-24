import { execFile, execFileSync, type ExecFileOptionsWithStringEncoding } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { createEditorialService, cleanAcceptanceTitle, decodeEditorial, editorialDigest, repo, revisionTitle } from '../../api/_lib/editorial-continuation.js'
import { createReviewSource, githubCommentSchema, ReviewError, type GitHub } from '../../api/_lib/article-review-sources.js'
import { cleanAcceptanceSchema, isExecutableEditorialRecord, runEditorialSchema, sha } from '../../shared/article-review.js'
import { ArticleActionFileSchema } from '../../src/action-registry-schema.js'
import { editorialProofSchema, verifyEditorialProof } from '../../shared/editorial-action-proof.js'
import { admitActionRegistry } from './editorial-action-registry.js'

const execFileAsync = promisify(execFile)
// Preserve execFileSync's stdin EOF and shared raw-byte output budget.
async function runEditorialCommand(file: string, args: string[], options: ExecFileOptionsWithStringEncoding & { maxBuffer: number }) {
  const pending = execFileAsync(file, args, { ...options, encoding: 'buffer' })
  const stdout: Buffer[] = [], stderr: Buffer[] = []
  let bytes = 0, overflow = false, failed = false
  const capture = (chunks: Buffer[]) => (chunk: Buffer) => {
    if (overflow) return
    const remaining = options.maxBuffer - bytes
    chunks.push(Buffer.from(chunk.subarray(0, remaining)))
    bytes += chunk.length
    if (bytes > options.maxBuffer) {
      overflow = true
      if (!pending.child.killed && pending.child.exitCode === null && pending.child.signalCode === null) pending.child.kill('SIGTERM')
      pending.child.stdout?.destroy()
      pending.child.stderr?.destroy()
    }
  }
  pending.child.stdout?.on('data', capture(stdout))
  pending.child.stderr?.on('data', capture(stderr))
  pending.child.stdin?.end()
  try { await pending }
  catch (error) {
    failed = true
    if (!overflow) {
      if (error instanceof Error) {
        if ('stdout' in error && Buffer.isBuffer(error.stdout)) error.stdout = error.stdout.toString('utf8')
        if ('stderr' in error && Buffer.isBuffer(error.stderr)) error.stderr = error.stderr.toString('utf8')
      }
      throw error
    }
  }
  finally {
    try { if (stderr.length) process.stderr.write(Buffer.concat(stderr)) }
    catch (error) { if (!failed && !overflow) throw error }
  }
  if (overflow) throw Object.assign(new Error('Editorial command stdout and stderr exceeded maxBuffer'), {
    code: 'ENOBUFS', signal: pending.child.signalCode, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'),
  })
}

const registryPath = (articlePath: string) => `actions/articles/${articlePath.match(/([0-9-]+)\.md$/)?.[1]}.json`
function editorialPaths(articlePath: string, changed: string) { return changed.split('\n').filter(Boolean).every(path => [articlePath, registryPath(articlePath)].includes(path)) }
function regularBlob(workspace: string, ref: string, path: string) {
  if (git(workspace, 'ls-tree', ref, '--', path).split(' ')[0] !== '100644') throw new ReviewError(409, 'Only the pinned regular article and canonical registry are allowed; rebase pre-cutover acceptance branches before requesting revision.')
  return git(workspace, 'rev-parse', `${ref}:${path}`)
}

const eventSchema = z.object({ action: z.literal('created'), repository: z.object({ full_name: z.literal('ojfbot/daily-logger') }),
  sender: z.object({ login: z.string() }), issue: z.object({ number: z.number().int().positive(), pull_request: z.object({ url: z.string() }) }), comment: githubCommentSchema })
export interface Execution { github: GitHub; workspace: string; policyDirectory?: string; policySha: string; runId: number; attempt: number; event: unknown }
function git(workspace: string, ...args: string[]) { return execFileSync('git', args, { cwd: workspace, encoding: 'utf8' }).trim() }
export async function admitEditorial(execution: Execution) {
  const event = eventSchema.parse(execution.event)
  z.number().int().positive().parse(execution.runId)
  sha.parse(execution.policySha)
  if (execution.attempt !== 1 || ![revisionTitle, cleanAcceptanceTitle].some(title => event.comment.body.startsWith(title)) || event.sender.login.toLowerCase() !== 'ojfbot' || event.comment.user.login.toLowerCase() !== 'ojfbot') throw new ReviewError(403, 'Only a new explicit owner request can execute. A rerun cannot replay a provider attempt.')
  if (Date.now() - Date.parse(event.comment.created_at) > 86400000 || Date.parse(event.comment.created_at) > Date.now() + 300000) throw new ReviewError(409, 'Request is outside the supported execution-history window. Create a new explicit request.')
  const record = decodeEditorial(event.comment.body)
  if (!record || !isExecutableEditorialRecord(record) || record.pullRequest !== event.issue.number || event.issue.pull_request.url !== `https://api.github.com${repo}/pulls/${record.pullRequest}`) throw new ReviewError(409, 'Request event target disagrees with its executable record.')
  const source = createReviewSource(execution.github)
  if (record.intent === 'request_clean_acceptance' && (record.policySha !== execution.policySha || await source.main(true) !== execution.policySha)) throw new ReviewError(409, 'Clean acceptance policy is not the still-current trusted main.')
  const comments = await source.comments(record.pullRequest)
  const live = comments.find(comment => comment.id === event.comment.id)
  if (!live || live.body !== event.comment.body || live.user.login.toLowerCase() !== 'ojfbot' || live.created_at !== live.updated_at || event.comment.created_at !== event.comment.updated_at) throw new ReviewError(409, 'Request was edited, deleted, or forged.')
  const view = await createEditorialService(execution.github).load(record.date, 'ojfbot')
  if (view.status !== 'existing' || !view.eligible || view.pullRequest.number !== record.pullRequest || view.pullRequest.headSha !== record.headSha || view.article.blobSha !== record.articleBlobSha) throw new ReviewError(409, 'Request PR head, owner, state or article is stale.')
  const request = view.requests.find(item => item.record.requestId === record.requestId)
  const version = view.versions.at(-1)
  if (!request || request.commentId !== event.comment.id || request.digest !== editorialDigest(record)) throw new ReviewError(409, 'Only the canonical request for the current input can execute.')
  if (view.executionReadiness.kind === 'blocked') throw new ReviewError(409, view.executionReadiness.reason)
  if (view.requestState.kind === 'owner_resolved' && view.requestState.request.digest === request.digest && view.requestState.request.commentId === request.commentId) throw new ReviewError(409, 'This editorial request is owner-resolved and is no longer executable.')
  if (record.intent === 'request_editorial_revision') {
    if (!version || version.digest !== record.feedbackDigest || version.record.requestId !== record.feedbackId || version.record.intent !== 'append_editorial_feedback') throw new ReviewError(409, 'Only the canonical request for the latest saved version can execute.')
  } else if (view.versions.length || (view.outstanding && view.requests.at(-1)?.digest !== request.digest) || view.registryBlobSha !== record.registryBlobSha || view.policySha !== record.policySha || /EDITORIAL_FEEDBACK(?:_V2)?_START/.test(view.originalBody)) {
    throw new ReviewError(409, 'Clean acceptance requires current reviewed inputs and no genuine editorial feedback.')
  }
  const later = view.requests.filter(item => item.commentId > request.commentId)
  if (later.length) throw new ReviewError(409, 'A later request conflicts with this execution.')
  for (const comment of comments) if (comment.user.login === 'github-actions[bot]' && comment.body.startsWith('## Editorial execution claim\n')) {
    const claim = z.object({ requestDigest: z.string().regex(/^[a-f0-9]{64}$/) }).passthrough().parse(JSON.parse(comment.body.slice('## Editorial execution claim\n'.length)))
    if (claim.requestDigest === request.digest) throw new ReviewError(409, 'This request already has a durable invocation claim. Resolve its outcome without replay.')
  }
  if (await hasEarlierExecution(execution, request.commentId, request.createdAt)) throw new ReviewError(409, 'A prior workflow exists for this request. No automatic replay is allowed.')
  return { record, request, version, source }
}
async function hasEarlierExecution(execution: Execution, commentId: number, createdAt: string) {
  // The event is at most 24h old. Scope server-side before bounded complete pagination.
  for (let page = 1; page <= 5; page++) {
    const query = new URLSearchParams({ event: 'issue_comment', created: `>=${createdAt}`, per_page: '100', page: String(page) })
    const response = await execution.github(`${repo}/actions/workflows/editorial-revise.yml/runs?${query}`)
    if (!response.ok) throw new ReviewError(503, 'Relevant execution history is unavailable.')
    const history = z.object({ workflow_runs: z.array(z.object({ id: z.number(), display_title: z.string() })) }).parse(await response.json())
    if (history.workflow_runs.some(run => run.id < execution.runId && run.display_title === `Editorial continuation comment ${commentId}`)) return true
    if (!response.headers.get('link')?.includes('rel="next"')) return false
  }
  throw new ReviewError(503, 'Relevant execution history exceeds the bounded reader. No absence or safe retry is established.')
}
const preparedRequestSchema = z.discriminatedUnion('intent', [runEditorialSchema.extend({ actor: z.literal('ojfbot') }).strict(), cleanAcceptanceSchema.extend({ actor: z.literal('ojfbot') }).strict()])
const preparedSchema = z.object({ request: preparedRequestSchema, requestDigest: z.string(),
  policySha: sha, runId: z.number(), worktree: z.string(), inputRegistryBlob: sha, outputCommit: sha, outputBlob: sha, outputRegistryBlob: sha, changed: z.boolean() }).strict()
export type Prepared = z.infer<typeof preparedSchema>
async function receipt(execution: Execution, requestDigest: string, outcome: string, extra: object = {}) {
  if (outcome === 'changed' || outcome === 'no_change') {
    const record = decodeEditorial(eventSchema.parse(execution.event).comment.body)
    if (!record || !isExecutableEditorialRecord(record)) throw new Error('A non-executable editorial record cannot produce an execution receipt')
    const manifest = editorialProofSchema.parse({ repository: 'ojfbot/daily-logger', date: record.date, pullRequest: record.pullRequest, requestDigest, requestCommentId: eventSchema.parse(execution.event).comment.id, requestIntent: record.intent, outcome, actionReviewMode: record.intent === 'request_clean_acceptance' ? 'clean-acceptance' : 'revision', runId: execution.runId, runAttempt: execution.attempt, policySha: execution.policySha, ...extra })
    writeFileSync(resolve(execution.workspace, '.git/editorial-output.json'), JSON.stringify(manifest))
    return
  }
  return createReviewSource(execution.github).postComment(eventSchema.parse(execution.event).issue.number,
    `## Editorial execution receipt\n${JSON.stringify({ requestDigest, requestCommentId: eventSchema.parse(execution.event).comment.id, outcome, runId: execution.runId, policySha: execution.policySha, ...extra })}`)
}
const transportCodeSchema = z.enum(['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'ABORT_ERR',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'])
function receiptTransportCodes(error: unknown) {
  const codes: z.infer<typeof transportCodeSchema>[] = []
  let current: unknown = error
  for (let depth = 0; depth < 4 && current !== null && typeof current === 'object'; depth++) {
    try {
      const code = transportCodeSchema.safeParse(Object.getOwnPropertyDescriptor(current, 'code')?.value)
      if (code.success && !codes.includes(code.data)) codes.push(code.data)
      current = Object.getOwnPropertyDescriptor(current, 'cause')?.value
    } catch { break }
  }
  return codes
}
async function receiptAfterFailure(execution: Execution, requestDigest: string, reason: string) {
  try { await receipt(execution, requestDigest, 'uncertain', { reason }) }
  catch (error) {
    try { console.error(JSON.stringify({ event: 'editorial_receipt_delivery_uncertain', runId: execution.runId,
      requestDigest, outcome: 'uncertain', transportCodes: receiptTransportCodes(error) })) }
    catch { /* Diagnostic reporting must not replace the primary failure. */ }
  }
}
async function prepare(execution: Execution): Promise<Prepared | null> {
  const admitted = await admitEditorial(execution)
  const { record, version, request, source } = admitted
  const path = `_articles/${record.date}.md`
  sha.parse(execution.policySha)
  git(execution.workspace, 'fetch', '--no-tags', 'origin', record.headSha)
  // Validate the PR's changes, not unrelated commits subsequently published on main.
  // Each merge base is reachable from the trusted policy; ambiguity cannot prove one PR change set.
  let ancestors: string[]
  try { ancestors = git(execution.workspace, 'merge-base', '--all', execution.policySha, record.headSha).split('\n') }
  catch { throw new ReviewError(409, 'A unique common ancestor with trusted policy is required.') }
  const ancestor = ancestors[0]
  if (ancestors.length !== 1 || !ancestor) throw new ReviewError(409, 'A unique common ancestor with trusted policy is required.')
  if (record.intent === 'request_clean_acceptance') {
    try { git(execution.workspace, 'merge-base', '--is-ancestor', execution.policySha, record.headSha) }
    catch { throw new ReviewError(409, 'Clean acceptance requires the pinned trusted policy and data to be fully integrated into the PR head.') }
  }
  if (!editorialPaths(path, git(execution.workspace, 'diff', '--no-renames', '--name-only', ancestor, record.headSha)) || regularBlob(execution.workspace, record.headSha, path) !== record.articleBlobSha) throw new ReviewError(409, 'Only the pinned regular article and canonical registry may differ from the trusted common ancestor.')
  const inputRegistryBlob = regularBlob(execution.workspace, record.headSha, registryPath(path))
  if (record.intent === 'request_clean_acceptance' && inputRegistryBlob !== record.registryBlobSha) throw new ReviewError(409, 'Clean acceptance registry input is stale.')
  await admitActionRegistry({ workspace: execution.workspace, base: execution.policySha, head: record.headSha, date: record.date, actor: record.actor, pullRequest: record.pullRequest, github: execution.github })
  const worktree = resolve(execution.workspace, '.git', `editorial-${execution.runId}`)
  git(execution.workspace, 'worktree', 'add', '--detach', worktree, record.headSha)
  const latest = await source.pull(record.pullRequest, true)
  if (latest.head.sha !== record.headSha || latest.state !== 'open') throw new ReviewError(409, 'PR moved before invocation.')
  if (record.intent === 'request_clean_acceptance' && await source.main(true) !== execution.policySha) throw new ReviewError(409, 'Trusted main moved before the clean acceptance claim.')
  const claim = { requestDigest: request.digest, requestId: record.requestId, requestCommentId: request.commentId,
    intent: record.intent, actionReviewMode: record.intent === 'request_clean_acceptance' ? 'clean-acceptance' : 'revision',
    ...(record.intent === 'request_editorial_revision' ? { feedbackDigest: version?.digest } : {}), inputHead: record.headSha, inputBlob: record.articleBlobSha, inputRegistryBlob,
    policySha: execution.policySha, runId: execution.runId, attempt: execution.attempt }
  // A lost claim response stops before the provider. It never falls through to a retry.
  const posted = await source.postComment(record.pullRequest, `## Editorial execution claim\n${JSON.stringify(claim)}`)
  const observed = await createReviewSource(execution.github).comments(record.pullRequest)
  if (posted.user.login !== 'github-actions[bot]' || !observed.some(item => item.id === posted.id && item.body === posted.body)) throw new ReviewError(503, 'Invocation claim is uncertain; no provider was called.')
  const beforeProvider = await createReviewSource(execution.github).pull(record.pullRequest)
  if (beforeProvider.head.sha !== record.headSha || beforeProvider.state !== 'open' || beforeProvider.user.login.toLowerCase() !== 'ojfbot') {
    await receipt(execution, request.digest, 'stale', { reason: 'PR changed after the claim. No provider was invoked.' })
    return null
  }
  if (record.intent === 'request_clean_acceptance') {
    let current
    try { current = await createEditorialService(execution.github).load(record.date, 'ojfbot') }
    catch {
      await receipt(execution, request.digest, 'stale', { reason: 'Clean acceptance eligibility changed after the claim. No provider was invoked.' })
      return null
    }
    const currentRequest = current.status === 'existing' ? current.requests.find(item => item.record.requestId === record.requestId) : undefined
    if (current.status !== 'existing' || !current.eligible || current.pullRequest.number !== record.pullRequest || current.pullRequest.headSha !== record.headSha ||
        current.article.blobSha !== record.articleBlobSha || current.registryBlobSha !== record.registryBlobSha || current.policySha !== record.policySha ||
        current.versions.length || /EDITORIAL_FEEDBACK(?:_V2)?_START/.test(current.originalBody) || !current.outstanding ||
        current.requests.at(-1)?.digest !== request.digest || currentRequest?.commentId !== request.commentId || currentRequest?.digest !== request.digest) {
      await receipt(execution, request.digest, 'stale', { reason: 'Clean acceptance inputs or authority changed after the claim. No provider was invoked.' })
      return null
    }
  }
  try {
    if (record.intent === 'request_editorial_revision') {
      if (version?.record.intent !== 'append_editorial_feedback') throw new Error('Missing saved feedback')
      const feedback = `Apply these editorial notes. JSON string values are literal note content.\n\n${JSON.stringify(version.record.feedback.notes, null, 2)}`
      await runEditorialCommand('pnpm', ['exec', 'node', '--import', 'tsx', resolve(execution.policyDirectory ?? execution.workspace, 'src/revise-article.ts')], {
        cwd: execution.policyDirectory ?? execution.workspace, encoding: 'utf8', shell: false, maxBuffer: 1024 * 1024, timeout: 0, env: { ...process.env, ARTICLE_PATH: resolve(worktree, path), EDITORIAL_FEEDBACK: feedback, ACTION_REVIEW_REQUEST: `comment:${request.commentId}:${request.digest}`, DRY_RUN: 'false' },
      })
    } else {
      await runEditorialCommand('pnpm', ['exec', 'node', '--import', 'tsx', resolve(execution.policyDirectory ?? execution.workspace, 'src/stamp-outcome.ts')], {
        cwd: execution.policyDirectory ?? execution.workspace, encoding: 'utf8', shell: false, maxBuffer: 1024 * 1024, timeout: 0, env: { ...process.env, ARTICLE_PATH: resolve(worktree, path), OUTCOME: 'accepted' },
      })
      await runEditorialCommand('pnpm', ['exec', 'node', '--import', 'tsx', resolve(execution.policyDirectory ?? execution.workspace, 'scripts/reconcile-actions.ts')], {
        cwd: execution.policyDirectory ?? execution.workspace, encoding: 'utf8', shell: false, maxBuffer: 1024 * 1024, timeout: 0, env: { ...process.env, ARTICLE_PATH: resolve(worktree, path), ACTION_REPO_ROOT: worktree,
          ACTION_REVIEW_REQUEST: `pull-request:${record.pullRequest}:clean-acceptance`, EDITORIAL_FEEDBACK: '', ACTION_KEY: '', INCLUDE_IN_INDEX: '', ACTION_ACTOR: '',
          ACTION_REASSESS_KEYS: '', ACTION_PRESERVE_KEYS: '', ACTION_EVIDENCE_REPLY: '', DRY_RUN: 'false' },
      })
      const output = ArticleActionFileSchema.parse(JSON.parse(readFileSync(resolve(worktree, registryPath(path)), 'utf8')))
      if (output.snapshot.status !== 'accepted' || output.snapshot.review.state !== 'verified') throw new Error('Clean acceptance did not produce a healthy native action review')
    }
    const changed = !!git(worktree, 'diff', '--name-only')
    if (!changed) {
      await receipt(execution, request.digest, 'no_change', { inputHead: record.headSha, inputBlob: record.articleBlobSha, inputRegistryBlob, outputCommit: record.headSha, outputBlob: record.articleBlobSha, outputRegistryBlob: inputRegistryBlob })
      return null
    }
    const paths = git(worktree, 'diff', '--name-only')
    if (!editorialPaths(path, paths) || !paths.split('\n').includes(registryPath(path))) throw new Error('Editorial continuation must reconcile the canonical registry and may change only the dated article and registry')
    ArticleActionFileSchema.parse(JSON.parse(readFileSync(resolve(worktree, registryPath(path)), 'utf8')))
    git(worktree, 'add', '--', path, registryPath(path))
    git(worktree, '-c', 'user.name=ojfbot-blog[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', record.intent === 'request_clean_acceptance' ? `editorial: retry clean acceptance ${record.date} for request ${record.requestId}` : `editorial: revise ${record.date} for request ${record.requestId}`)
    return preparedSchema.parse({ request: record, requestDigest: request.digest, policySha: execution.policySha, runId: execution.runId, worktree, inputRegistryBlob,
      outputCommit: git(worktree, 'rev-parse', 'HEAD'), outputBlob: regularBlob(worktree, 'HEAD', path), outputRegistryBlob: regularBlob(worktree, 'HEAD', registryPath(path)), changed: true })
  } catch (error) {
    await receiptAfterFailure(execution, request.digest, 'Invocation was claimed. Provider or output preparation failed; do not replay this request automatically.')
    throw error
  }
}
async function recordAdmissionFailure(execution: Execution) {
  // A prior attempt is evidence even when its claim comment was deleted.
  if (execution.attempt !== 1) return
  try {
    const event = eventSchema.parse(execution.event)
    const record = decodeEditorial(event.comment.body)
    if (!record || !isExecutableEditorialRecord(record) || event.sender.login.toLowerCase() !== 'ojfbot' || event.comment.user.login.toLowerCase() !== 'ojfbot' || record.pullRequest !== event.issue.number) return
    const comments = await createReviewSource(execution.github).comments(record.pullRequest)
    const live = comments.find(item => item.id === event.comment.id)
    if (!live || live.body !== event.comment.body || live.user.login.toLowerCase() !== 'ojfbot') return
    const digest = editorialDigest(record)
    const canonical = comments.filter(item => {
      if (item.user.login.toLowerCase() !== 'ojfbot') return false
      try { const value = decodeEditorial(item.body); return value?.requestId === record.requestId && editorialDigest(value) === digest } catch { return false }
    }).sort((a,b) => a.id - b.id)[0]
    if (!canonical || canonical.id !== event.comment.id) return
    if (await hasEarlierExecution(execution, canonical.id, canonical.created_at)) return
    if (comments.some(item => item.user.login === 'github-actions[bot]' && item.body.startsWith('## Editorial execution claim\n') && z.object({ requestDigest: z.string() }).passthrough().parse(JSON.parse(item.body.slice('## Editorial execution claim\n'.length))).requestDigest === digest)) return
    await receipt(execution, digest, 'failed', { reason: 'Admission or preparation failed before an invocation claim. No provider attempt was authorized by this run.' })
  } catch { /* Incomplete evidence cannot establish a safe terminal outcome. */ }
}
export async function prepareEditorial(execution: Execution) {
  try { return await prepare(execution) }
  catch (error) { await recordAdmissionFailure(execution); throw error }
}
export async function pushEditorial(execution: Execution, input: unknown) {
  const prepared = preparedSchema.parse(input)
  if (prepared.worktree !== resolve(execution.workspace, '.git', `editorial-${execution.runId}`) || prepared.runId !== execution.runId || prepared.policySha !== execution.policySha) throw new Error('Prepared execution identity mismatch')
  const { request } = prepared
  const pr = await createReviewSource(execution.github).pull(request.pullRequest)
  if (pr.head.sha !== request.headSha || pr.state !== 'open' || pr.user.login.toLowerCase() !== 'ojfbot') {
    await receipt(execution, prepared.requestDigest, 'stale', { reason: 'PR moved before push. Prepared output was not published.' }); return
  }
  const path = `_articles/${request.date}.md`
  const changedPaths = git(prepared.worktree, 'diff', '--name-only', request.headSha, prepared.outputCommit)
  if (git(prepared.worktree, 'rev-parse', 'HEAD') !== prepared.outputCommit || git(prepared.worktree, 'rev-parse', 'HEAD^') !== request.headSha ||
      !editorialPaths(path, changedPaths) || !changedPaths.split('\n').includes(registryPath(path)) || regularBlob(prepared.worktree, request.headSha, registryPath(path)) !== prepared.inputRegistryBlob ||
      regularBlob(prepared.worktree, 'HEAD', path) !== prepared.outputBlob || regularBlob(prepared.worktree, 'HEAD', registryPath(path)) !== prepared.outputRegistryBlob) throw new Error('Prepared output no longer matches the exact article and registry commit')
  try {
    git(prepared.worktree, 'push', 'origin', `${prepared.outputCommit}:refs/heads/accept/${request.date}`)
    await receipt(execution, prepared.requestDigest, 'changed', { inputHead: request.headSha, inputBlob: request.articleBlobSha, inputRegistryBlob: prepared.inputRegistryBlob, outputCommit: prepared.outputCommit, outputBlob: prepared.outputBlob, outputRegistryBlob: prepared.outputRegistryBlob })
  } catch (error) {
    await receiptAfterFailure(execution, prepared.requestDigest, 'Push or outcome receipt is uncertain. Inspect the actual branch before any new request.'); throw error
  }
}
export async function finalizeEditorial(execution: Execution, artifactId: number) {
  const manifest = editorialProofSchema.parse(JSON.parse(readFileSync(resolve(execution.workspace, '.git/editorial-output.json'), 'utf8')))
  const receipt = { ...manifest, artifactId }
  if (!await verifyEditorialProof(execution.github, receipt)) throw new Error('The uploaded editorial artifact does not bind this output')
  await createReviewSource(execution.github).postComment(manifest.pullRequest, `## Editorial execution receipt\n${JSON.stringify(receipt)}`)
}
async function main() {
  const workspace = process.cwd()
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('Missing execution token')
  const github: GitHub = (path, options) => fetch(`https://api.github.com${path}`, { ...options,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } })
  const execution = { github, workspace, policySha: process.env.GITHUB_SHA ?? '', runId: Number(process.env.GITHUB_RUN_ID), attempt: Number(process.env.GITHUB_RUN_ATTEMPT), event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')) }
  const preparedPath = resolve(workspace, '.git/editorial-prepared.json')
  switch (process.argv[2]) {
    case 'admit': {
      let admitted
      try { admitted = await admitEditorial(execution) } catch (error) { await recordAdmissionFailure(execution); throw error }
      if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `pull_request=${admitted.record.pullRequest}\n`, { flag: 'a' })
      break
    }
    case 'prepare': { const prepared = await prepareEditorial(execution); mkdirSync(resolve(workspace, '.git'), { recursive: true }); writeFileSync(preparedPath, JSON.stringify(prepared)); break }
    case 'finalize': {
      const artifactId = z.number().int().positive().parse(Number(process.env.EDITORIAL_ARTIFACT_ID))
      await finalizeEditorial(execution, artifactId)
      break
    }
    case 'push': { const prepared: unknown = JSON.parse(readFileSync(preparedPath, 'utf8')); if (prepared) await pushEditorial(execution, prepared); break }
    default: throw new Error('Expected admit, prepare, or push')
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error instanceof Error ? error.message : 'Editorial execution failed'); process.exitCode = 1 })

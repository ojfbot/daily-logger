import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { reconcileActions } from './reconcile-actions.js'
import { acceptanceActionCycle } from '../src/action-review-cycle.js'
import { ACTION_EVIDENCE_SELECTION_VERSION, COVERAGE_SOURCE, prepareConservativeDraftCandidateEvidence } from '../src/action-evidence-selection.js'
import { ActionContextNeedError, ActionProviderBudgetObservationSchema, ActionProviderResponseObservationSchema, ActionProviderOutputShapeObservationSchema, ActionProviderInvariantObservationSchema, ActionReviewFailurePhaseSchema, actionReviewEvidenceRequestIdentity, actionReviewFailurePhase, classifyActionReviewFailure } from '../src/review-actions.js'
import { ActionEvidenceRequestError } from '../src/action-evidence-retrieval.js'
import { ArticleActionFileSchema, ActionSourceSchema, ActionEvidenceRequestSchema, ActionEvidenceRequestReceiptSchema, actionArticlePath, articleActionFileBytes, assertActionSnapshotStateIntegrity, readActionRegistry, readArticleStatuses, registryRevision, sha256, splitActionRegistry, stripManagedActions } from '../src/action-registry.js'
import type { GitHub } from '../api/_lib/article-review-sources.js'

const sha = z.string().regex(/^[a-f0-9]{40}$/), digest = z.string().regex(/^[a-f0-9]{64}$/)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const heldActionLimits = { proposer: 'claude-sonnet-4-6', verifier: 'claude-opus-4-6', tokenLimit: 256000, outputReserve: 12000, envelopeBytes: 655360, sharedRepairs: 1, sdkRetries: 0 } as const
export const heldActionInputSchema = z.object({ date, source_sha: sha, operation_id: z.uuid(), grant_id: z.uuid() }).strict()
export const heldActionGrantSchema = z.object({
  schemaVersion: z.literal(1), approvedBy: z.literal('ojfbot'), authorizationId: z.uuid(), authorizationReference: z.string().min(1).max(500),
  operationId: z.uuid(), date, articleBlob: sha, actionBlob: sha, registryRevision: digest, policyFingerprint: digest,
  reviewCycle: z.object({ phase: z.literal('generation') }).strict(), trains: z.literal(1), limits: z.object({
    proposer: z.literal('claude-sonnet-4-6'), verifier: z.literal('claude-opus-4-6'), tokenLimit: z.literal(256000), outputReserve: z.literal(12000), envelopeBytes: z.literal(655360), sharedRepairs: z.literal(1), sdkRetries: z.literal(0),
  }).strict(), output: z.literal('unmerged-dated-proposal-with-selected-citations'),
}).strict()
// Only the native content-addressed coverage metadata may bypass selected quotes.
const coverageSchema = z.object({
  version: z.literal(ACTION_EVIDENCE_SELECTION_VERSION), unit: z.literal('UTF-8 bytes'),
  collection: z.literal('Bounded collector output, not an exhaustive repository/discussion census. Missing or omitted content is unknown, never evidence of absence or approval.'),
  selection: z.literal('Whole-source model views; collector-proved lossless metadata factoring is allowed, with raw identity retained. No chronological comment window or excerpt. Only current carried actions, explicit feedback and retained draft continuation context require GitHub discussions. Shipment prose does not.'),
  authority: z.literal('This coverage index is context only. Hashes, identities, omission reasons and missing evidence cannot justify completion, supersession, dismissal or human approval.'),
  requiredReferences: z.array(z.string().regex(/^[\w-]+#\d+$/)), contextReferences: z.array(z.string().regex(/^[\w-]+#\d+$/)),
  referenceRequirements: z.array(z.object({ reference: z.string().regex(/^[\w-]+#\d+$/), classification: z.enum(['required', 'context']), source: z.string(), reason: z.string().max(512), role: z.enum(['target', 'lifecycle', 'owner', 'gate', 'counterevidence', 'retained-context']).optional() }).strict()),
  reviewActionKeys: z.array(z.string()), preservedTerminalActionKeys: z.array(z.string()), expandedActionKeys: z.array(z.string()), resolvedRequests: z.array(digest),
  sources: z.array(z.object({ id: z.string(), kind: ActionSourceSchema.shape.kind, locator: z.string(), fullContentSha256: digest, collectedContentSha256: digest, bytes: z.number().int().nonnegative(), modelBytes: z.number().int().nonnegative(), modelContentSha256: digest, modelPolicySha256: digest, lines: z.number().int().positive(), required: z.boolean(), included: z.boolean(), reason: z.enum(['outside current action/feedback scope', 'source bytes do not match their full-content identity (excerpt or corruption)', 'exceeds 128 KiB source limit', 'whole source does not fit total budget', 'complete artifact retained; bounded question view selected', 'exact ranges pinned to immutable complete artifact for one open question', 'complete current-action/feedback dependency', 'complete goal or contextual source', 'complete optional whole source omitted so selected sources and complete coverage receipt fit total budget']) }).strict()),
}).strict()
const contextSchema = z.object({ repository: z.literal('ojfbot/daily-logger'), actor: z.literal('ojfbot'), event: z.literal('workflow_dispatch'), ref: z.literal('refs/heads/main'), defaultBranch: z.literal('main'), workflowSha: sha, runId: z.number().int().positive(), attempt: z.literal(1) }).strict()
const runSchema = z.object({ id: z.number().int().positive(), run_attempt: z.literal(1), event: z.literal('workflow_dispatch'), head_branch: z.literal('main'), head_sha: sha, path: z.string().regex(/^\.github\/workflows\/review-held-actions\.yml(?:@(?:main|refs\/heads\/main))?$/), actor: z.object({ login: z.literal('ojfbot') }).strip() }).strip()
const bindingSchema = z.object({ schemaVersion: z.literal(1), inputs: heldActionInputSchema, grant: heldActionGrantSchema, source: z.object({ commit: sha, articleBlob: sha, actionBlob: sha, registryRevision: digest, policyFingerprint: digest }).strict(), runId: z.number().int().positive(), workflow: z.literal('.github/workflows/review-held-actions.yml'), observedRun: runSchema }).strict()
type Binding = z.infer<typeof bindingSchema>
const resultStateSchema = z.enum(['rejected-before-model', 'held-invalid-output', 'held-evidence', 'uncertain-after-entry', 'native-review-completed-unmerged'])
const reasonSchema = z.enum(['none', 'input-mismatch', 'stale-source', 'grant-mismatch', 'review-disabled', 'source-unavailable', 'claim-uncertain', 'native-invalid-output', 'native-evidence-required', 'native-context-or-budget', 'proposal-boundary', 'provider-or-unknown', 'outcome-uncertain'])
export const heldActionReceiptSchema = z.object({
  kind: z.literal('unmerged-held-action-proposal-v1'), applied: z.literal(false), approval: z.literal('not-requested-or-implied'), binding: bindingSchema,
  state: resultStateSchema, files: z.array(z.object({ name: z.enum(['article.md', 'actions.json']), repositoryPath: z.string(), bytes: z.number().int().positive().max(786432), sha256: digest }).strict()).max(2),
  authorization: z.literal('consumed'), nativeEntry: z.enum(['not-entered', 'native-function-entered']),
  stop: z.object({ stage: z.enum(['input', 'reservation', 'native', 'proposal', 'outcome', 'completed']), reason: reasonSchema, httpStatus: z.number().int().min(100).max(599).optional() }).strict(),
  observations: z.object({ billing: z.literal('not-inferred'), budgets: z.array(ActionProviderBudgetObservationSchema).max(3), responses: z.array(ActionProviderResponseObservationSchema).max(3),
    outputShapes: z.array(ActionProviderOutputShapeObservationSchema).max(3).optional(), invariants: z.array(ActionProviderInvariantObservationSchema).max(3).optional(), evidenceRequest: ActionEvidenceRequestReceiptSchema.optional(),
    evidenceRequestIdentity: z.object({ id: digest, kind: ActionEvidenceRequestSchema.shape.kind }).strict().optional(),
    failurePhase: ActionReviewFailurePhaseSchema.optional(),
  }).strict(),
}).strict().superRefine((receipt, ctx) => {
  const expected = new Map([['article.md', `_articles/${receipt.binding.inputs.date}.md`], ['actions.json', actionArticlePath(receipt.binding.inputs.date)]])
  if (receipt.state === 'native-review-completed-unmerged' ? receipt.files.length !== 2 : receipt.files.length !== 0) ctx.addIssue({ code: 'custom', message: 'Only completed native review has the two dated proposal files' })
  if (new Set(receipt.files.map(file => file.name)).size !== receipt.files.length || receipt.files.some(file => expected.get(file.name) !== file.repositoryPath)) ctx.addIssue({ code: 'custom', message: 'Proposal paths must be the exact two dated files' })
  const request = receipt.observations.evidenceRequest
  const sourcePin = request?.sourceId?.match(/@([a-f0-9]{64})$/)?.[1]
  if (request && (request.question !== undefined || request.sourceLocator !== undefined || request.articleDate !== receipt.binding.inputs.date || JSON.stringify(request.cycle) !== JSON.stringify(receipt.binding.grant.reviewCycle) || request.status !== 'open'
    || sourcePin !== undefined && sourcePin !== request.sourceFullContentSha256)) ctx.addIssue({ code: 'custom', message: 'Current evidence diagnostic must match the bound article/cycle and source pin' })
  if (request && receipt.observations.evidenceRequestIdentity) ctx.addIssue({ code: 'custom', message: 'Evidence diagnostic is either a validated current receipt or identity-only' })
})
type Receipt = z.infer<typeof heldActionReceiptSchema>
const claimSchema = z.object({ kind: z.literal('held-action-reservation-v1'), binding: bindingSchema, stage: z.enum(['reserved', 'model-entered', 'finished']), result: resultStateSchema.optional(), receiptSha256: digest.optional() }).strict()
export const heldActionRejectionSchema = z.object({ kind: z.literal('held-action-review-rejection-v1'), applied: z.literal(false), stage: z.enum(['input', 'reservation']), reason: reasonSchema, authorization: z.enum(['not-reserved', 'possibly-consumed']), modelEntry: z.literal(false) }).strict()
const commitSchema = z.object({ sha }), refSchema = z.object({ object: z.object({ sha }) })
const api = '/repos/ojfbot/daily-logger'
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
class HeldActionGateError extends Error {
  constructor(readonly reason: z.infer<typeof reasonSchema>, readonly httpStatus?: number) { super('HELD_ACTION_GATE_REJECTED') }
}
function requireGate(value: unknown, reason: z.infer<typeof reasonSchema> = 'input-mismatch'): asserts value { if (!value) throw new HeldActionGateError(reason) }
function git(root: string, ...args: string[]) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
export function heldActionPolicyFingerprint(root: string) {
  const paths = git(root, 'ls-files', 'src/*.ts', 'shared/*.ts', 'scripts/*.ts', '.github/workflows/review-held-actions.yml', 'package.json', 'pnpm-lock.yaml').split('\n').filter(Boolean)
  return sha256(JSON.stringify(paths.map(path => [path, git(root, 'rev-parse', `HEAD:${path}`)])))
}
async function json(github: GitHub, path: string, options?: RequestInit) {
  const response = await github(api + path, options)
  if (!response.ok) throw new HeldActionGateError(options?.method ? 'claim-uncertain' : 'source-unavailable', response.status)
  return response.json()
}
export async function admitHeldAction(root: string, inputs: unknown, context: unknown, github: GitHub): Promise<Binding> {
  const request = heldActionInputSchema.parse(inputs), execution = contextSchema.parse(context)
  requireGate(process.env.ACTION_REVIEW_DISABLED !== 'true', 'review-disabled')
  requireGate(request.source_sha === execution.workflowSha && git(root, 'rev-parse', 'HEAD') === request.source_sha)
  requireGate(git(root, 'diff', '--name-only', 'HEAD') === '')
  const live = refSchema.parse(await json(github, '/git/ref/heads/main'))
  requireGate(live.object.sha === request.source_sha, 'stale-source')
  const observedRun = runSchema.parse(await json(github, `/actions/runs/${execution.runId}/attempts/1`))
  requireGate(observedRun.id === execution.runId && observedRun.head_sha === request.source_sha)
  const articlePath = `_articles/${request.date}.md`, actionPath = actionArticlePath(request.date), grantPath = `action-review-grants/${request.grant_id}.json`
  const paths = [articlePath, actionPath, grantPath]
  for (const path of paths) requireGate(git(root, 'ls-tree', 'HEAD', '--', path).startsWith('100644 '))
  const grant = heldActionGrantSchema.parse(JSON.parse(readFileSync(join(root, grantPath), 'utf8')))
  requireGate(grant.operationId === request.operation_id && grant.date === request.date, 'grant-mismatch')
  const registry = readActionRegistry(root), snapshot = registry.articles.find(article => article.date === request.date)
  const statuses = readArticleStatuses(root), markdown = readFileSync(join(root, articlePath), 'utf8')
  requireGate(snapshot?.status === 'accepted' && snapshot.review.state === 'pending' && statuses.get(request.date) === 'accepted')
  requireGate(snapshot.draftCandidates?.length && snapshot.draftCandidates.every(candidate => candidate.review.state === 'awaiting-review') && !snapshot.reviewOutput && !snapshot.candidateReviewHistory?.length)
  requireGate(Buffer.byteLength(markdown) <= 786432 && readFileSync(join(root, actionPath)).length <= 786432 && Buffer.byteLength(markdown) + readFileSync(join(root, actionPath)).length <= 1048576)
  assertActionSnapshotStateIntegrity(registry, snapshot)
  const cycle = acceptanceActionCycle(request.operation_id, snapshot)
  requireGate(same(cycle, grant.reviewCycle))
  prepareConservativeDraftCandidateEvidence({ registry, articleDate: request.date, markdown, articleStatuses: statuses, cycle, feedback: '', draftCandidates: snapshot.draftCandidates })
  const source = { commit: request.source_sha, articleBlob: git(root, 'rev-parse', `HEAD:${paths[0]}`), actionBlob: git(root, 'rev-parse', `HEAD:${paths[1]}`), registryRevision: registryRevision(registry), policyFingerprint: heldActionPolicyFingerprint(root) }
  requireGate(source.articleBlob === grant.articleBlob && source.actionBlob === grant.actionBlob && source.registryRevision === grant.registryRevision && source.policyFingerprint === grant.policyFingerprint, 'grant-mismatch')
  return bindingSchema.parse({ schemaVersion: 1, inputs: request, grant, source, runId: execution.runId, workflow: '.github/workflows/review-held-actions.yml', observedRun })
}

function claimRefs(binding: Binding) { return [`action-review-claims/grant-${binding.grant.authorizationId}`, `action-review-claims/operation-${binding.inputs.operation_id}`] }
async function claimCommit(github: GitHub, value: z.infer<typeof claimSchema>, parent?: string) {
  const blob = commitSchema.parse(await json(github, '/git/blobs', { method: 'POST', body: JSON.stringify({ content: JSON.stringify(claimSchema.parse(value)), encoding: 'utf-8' }) }))
  const tree = commitSchema.parse(await json(github, '/git/trees', { method: 'POST', body: JSON.stringify({ tree: [{ path: 'reservation.json', mode: '100644', type: 'blob', sha: blob.sha }] }) }))
  return commitSchema.parse(await json(github, '/git/commits', { method: 'POST', body: JSON.stringify({ message: 'held action review reservation', tree: tree.sha, parents: parent ? [parent] : [] }) })).sha
}
export async function reserveHeldAction(binding: Binding, github: GitHub) {
  const commit = await claimCommit(github, { kind: 'held-action-reservation-v1', binding, stage: 'reserved' })
  // Atomic create fails if either grant or operation is consumed. Never undo a partial claim.
  for (const ref of claimRefs(binding)) {
    requireGate(refSchema.parse(await json(github, '/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${ref}`, sha: commit }) })).object.sha === commit, 'claim-uncertain')
    requireGate(refSchema.parse(await json(github, `/git/ref/heads/${ref}`)).object.sha === commit, 'claim-uncertain')
  }
  return commit
}
export async function moveHeldActionClaim(binding: Binding, previous: string, stage: 'model-entered' | 'finished', github: GitHub, result?: Receipt['state'], receiptSha256?: string) {
  for (const ref of claimRefs(binding)) requireGate(refSchema.parse(await json(github, `/git/ref/heads/${ref}`)).object.sha === previous)
  const commit = await claimCommit(github, { kind: 'held-action-reservation-v1', binding, stage, ...(result ? { result } : {}), ...(receiptSha256 ? { receiptSha256 } : {}) }, previous)
  for (const ref of claimRefs(binding)) {
    requireGate(refSchema.parse(await json(github, `/git/refs/heads/${ref}`, { method: 'PATCH', body: JSON.stringify({ sha: commit, force: false }) })).object.sha === commit, 'claim-uncertain')
    requireGate(refSchema.parse(await json(github, `/git/ref/heads/${ref}`)).object.sha === commit, 'claim-uncertain')
  }
  return commit
}

export function proposalFiles(root: string, binding: Binding, reviewed: Awaited<ReturnType<typeof reconcileActions>>) {
  const before = readActionRegistry(root), after = reviewed.registry, date = binding.inputs.date
  const prior = before.articles.find(article => article.date === date), next = after.articles.find(article => article.date === date)
  requireGate(prior && next?.status === 'accepted' && next.review.state === 'verified')
  assertActionSnapshotStateIntegrity(after, next)
  requireGate(same(next.reviewCycle, prior.reviewCycle) && same(next.draftCandidates?.map(({ candidateId, payload }) => ({ candidateId, payload })), prior.draftCandidates?.map(({ candidateId, payload }) => ({ candidateId, payload }))))
  requireGate(same(after.baseline, before.baseline) && same(after.articles.filter(article => article.date !== date), before.articles.filter(article => article.date !== date)))
  const beforeSplit = splitActionRegistry(before), afterSplit = splitActionRegistry(after)
  requireGate(same(afterSplit.baseline, beforeSplit.baseline) && same(afterSplit.files.filter(file => file.date !== date), beforeSplit.files.filter(file => file.date !== date)), 'proposal-boundary')
  for (const record of before.records) {
    const changed = after.records.find(item => item.key === record.key)
    requireGate(changed && same(changed.original, record.original) && changed.workKey === record.workKey && same(changed.admission, record.admission))
    requireGate(record.history.every(decision => changed.history.some(item => same(item, decision))))
  }
  const original = readFileSync(join(root, `_articles/${date}.md`), 'utf8')
  requireGate(stripManagedActions(reviewed.markdown) === stripManagedActions(original))
  const file = ArticleActionFileSchema.parse(splitActionRegistry(after).files.find(item => item.date === date))
  // Native persisted sources are selected citation excerpts and coverage metadata, never collector captures.
  const quotes = new Map<string, Set<string>>(), priorQuotes = new Set<string>()
  function collectPrior(value: unknown) { if (Array.isArray(value)) value.forEach(collectPrior); else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { if (key === 'quote' && typeof item === 'string') priorQuotes.add(item); else collectPrior(item) } }
  collectPrior(beforeSplit.files.find(item => item.date === date))
  function visit(value: unknown) {
    if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') {
      const citation = z.object({ sourceId: z.string(), quote: z.string() }).safeParse(value)
      if (citation.success) {
        requireGate(priorQuotes.has(citation.data.quote) || Buffer.byteLength(citation.data.quote) <= 8192, 'proposal-boundary')
        const values = quotes.get(citation.data.sourceId) ?? new Set<string>()
        values.add(citation.data.quote); quotes.set(citation.data.sourceId, values)
      }
      for (const [key, item] of Object.entries(value)) if (key !== 'sources') visit(item)
    }
  }
  visit(file)
  for (const source of file.snapshot.sources) {
    requireGate(Buffer.byteLength(source.content) <= 131072)
    if (source.id.startsWith(`${COVERAGE_SOURCE}@`)) {
      requireGate(source.id === `${COVERAGE_SOURCE}@${sha256(source.content)}` && source.kind === 'report' && source.locator === ACTION_EVIDENCE_SELECTION_VERSION && !source.trustedContent && !source.projection && !source.response && (!source.fullContentSha256 || source.fullContentSha256 === sha256(source.content)), 'proposal-boundary')
      coverageSchema.parse(JSON.parse(source.content))
    } else {
      const allowed = [...(quotes.get(source.id) ?? [])].sort((a, b) => b.length - a.length)
      let remaining = source.content
      while (remaining) {
        const quote = allowed.find(value => remaining.startsWith(value))
        requireGate(quote)
        remaining = remaining.slice(quote.length)
        if (remaining) { requireGate(remaining.startsWith('\n\n')); remaining = remaining.slice(2) }
      }
      requireGate(source.trustedContent?.every(value => allowed.includes(value)) ?? true)
    }
  }
  const files = [{ name: 'article.md' as const, repositoryPath: `_articles/${date}.md`, content: reviewed.markdown }, { name: 'actions.json' as const, repositoryPath: actionArticlePath(date), content: articleActionFileBytes(file) }]
  requireGate(files.every(item => Buffer.byteLength(item.content) <= 786432) && files.reduce((total, item) => total + Buffer.byteLength(item.content), 0) <= 1048576)
  return files
}
export function validateHeldActionArtifact(value: unknown, files: Readonly<Record<string, string>>, expectedSource: string) {
  const receipt = heldActionReceiptSchema.parse(value)
  requireGate(receipt.binding.source.commit === sha.parse(expectedSource) && receipt.state === 'native-review-completed-unmerged', 'proposal-boundary')
  requireGate(same(Object.keys(files).sort(), ['actions.json', 'article.md']), 'proposal-boundary')
  for (const file of receipt.files) {
    const content = files[file.name]
    requireGate(typeof content === 'string' && Buffer.byteLength(content) === file.bytes && sha256(content) === file.sha256, 'proposal-boundary')
  }
  return receipt
}
export async function executeHeldAction(options: { root: string; binding: Binding; reserved: string; github: GitHub; native?: typeof reconcileActions }) {
  const { root, binding, github } = options
  let claim = options.reserved, entered = false
  const receipt: Receipt = { kind: 'unmerged-held-action-proposal-v1', applied: false, approval: 'not-requested-or-implied', binding, state: 'rejected-before-model', files: [], authorization: 'consumed', nativeEntry: 'not-entered', stop: { stage: 'input', reason: 'none' }, observations: { billing: 'not-inferred', budgets: [], responses: [] } }
  const original = readFileSync(join(root, `_articles/${binding.inputs.date}.md`), 'utf8'), action = readFileSync(join(root, actionArticlePath(binding.inputs.date)), 'utf8')
  let knownCandidateIds = new Set<string>()
  let files: ReturnType<typeof proposalFiles> = []
  const consoleMethods = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug }
  try {
    const fresh = await admitHeldAction(root, binding.inputs, { repository: 'ojfbot/daily-logger', actor: 'ojfbot', event: 'workflow_dispatch', ref: 'refs/heads/main', defaultBranch: 'main', workflowSha: binding.source.commit, runId: binding.runId, attempt: 1 }, github)
    requireGate(same(fresh, binding))
    knownCandidateIds = new Set(readActionRegistry(root).articles.find(article => article.date === binding.inputs.date)?.draftCandidates?.filter(candidate => candidate.review.state === 'awaiting-review').map(candidate => candidate.candidateId))
    receipt.stop.stage = 'reservation'
    claim = await moveHeldActionClaim(binding, claim, 'model-entered', github)
    // Remote claim writes can queue behind a main update; recheck after their readbacks.
    requireGate(same(await admitHeldAction(root, binding.inputs, { repository: 'ojfbot/daily-logger', actor: 'ojfbot', event: 'workflow_dispatch', ref: 'refs/heads/main', defaultBranch: 'main', workflowSha: binding.source.commit, runId: binding.runId, attempt: 1 }, github), binding))
    entered = true // Before createActionAgents/countTokens/create. A lost claim response never reaches here.
    const env = { DRY_RUN: 'true', ACTION_REVIEW_ARTICLE_COMPLETION: 'disabled', ACTION_REVIEW_REQUEST: binding.inputs.operation_id, ACTION_PROVIDER_TOKEN_LIMIT: '256000', EDITORIAL_FEEDBACK: '', ACTION_KEY: '', ACTION_REASSESS_KEYS: '', ACTION_PRESERVE_KEYS: '', ACTION_EVIDENCE_REPLY: '', MOCK_LLM: '' }
    const prior = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
    Object.assign(process.env, env)
    const capture = (...values: unknown[]) => {
      if (values.length !== 1 || typeof values[0] !== 'string') return
      const budget = /^Action (proposer|verifier) token budget: input=(\d{1,9}); output_reserve=(\d{1,9}); total=(\d{1,10}); limit=(\d{1,9})$/.exec(values[0])
      if (budget && receipt.observations.budgets.length < 3) {
        const observation = ActionProviderBudgetObservationSchema.safeParse({ role: budget[1], input: Number(budget[2]), outputReserve: Number(budget[3]), total: Number(budget[4]), limit: Number(budget[5]) })
        if (observation.success) receipt.observations.budgets.push(observation.data)
      }
      const response = /^Action (proposer|verifier): stop=(tool_use|end_turn|max_tokens|stop_sequence|null|unknown); output_tokens=(\d{1,9}|unavailable)(?:; input_tokens=(\d{1,9}|unavailable))?$/.exec(values[0])
      if (response && receipt.observations.responses.length < 3) {
        const observation = ActionProviderResponseObservationSchema.safeParse({ role: response[1], stop: response[2], outputTokens: response[3] === 'unavailable' ? null : Number(response[3]), ...(response[4] === undefined ? {} : { inputTokens: response[4] === 'unavailable' ? null : Number(response[4]) }) })
        if (observation.success) receipt.observations.responses.push(observation.data)
      }
      if (values[0].startsWith('Action output shape: ') && Buffer.byteLength(values[0]) <= 8256 && (receipt.observations.outputShapes?.length ?? 0) < 3) {
        try {
          const shape = ActionProviderOutputShapeObservationSchema.safeParse(JSON.parse(values[0].slice('Action output shape: '.length)))
          if (shape.success) (receipt.observations.outputShapes ??= []).push(shape.data)
        } catch { /* Retain no unparsed diagnostic text. */ }
      }
      if (values[0].startsWith('Action output invariant: ') && Buffer.byteLength(values[0]) <= 2112 && (receipt.observations.invariants?.length ?? 0) < 3) {
        try {
          const invariant = ActionProviderInvariantObservationSchema.safeParse(JSON.parse(values[0].slice('Action output invariant: '.length)))
          if (invariant.success && (!invariant.data.candidateId || knownCandidateIds.has(invariant.data.candidateId))) (receipt.observations.invariants ??= []).push(invariant.data)
        } catch { /* Retain no unparsed diagnostic, foreign identity or arbitrary error text. */ }
      }
      if (values[0].startsWith('Action evidence request receipt: ') && Buffer.byteLength(values[0]) <= 8192) {
        try {
          const request = ActionEvidenceRequestReceiptSchema.safeParse(JSON.parse(values[0].slice('Action evidence request receipt: '.length)))
          if (request.success && request.data.question === undefined && request.data.sourceLocator === undefined && request.data.articleDate === binding.inputs.date && same(request.data.cycle, binding.grant.reviewCycle) && request.data.status === 'open') receipt.observations.evidenceRequest = request.data
        } catch { /* A request diagnostic must arrive as the closed native receipt. */ }
      }
    }
    for (const key of Object.keys(consoleMethods)) Reflect.set(console, key, capture)
    try {
      receipt.stop.stage = 'native'
      receipt.nativeEntry = 'native-function-entered'
      const reviewed = await (options.native ?? reconcileActions)({ repoRoot: root, articlePath: `_articles/${binding.inputs.date}.md` })
      requireGate(same(await admitHeldAction(root, binding.inputs, { repository: 'ojfbot/daily-logger', actor: 'ojfbot', event: 'workflow_dispatch', ref: 'refs/heads/main', defaultBranch: 'main', workflowSha: binding.source.commit, runId: binding.runId, attempt: 1 }, github), binding))
      receipt.stop.stage = 'proposal'
      files = proposalFiles(root, binding, reviewed)
      receipt.files = files.map(({ name, repositoryPath, content }) => ({ name, repositoryPath, bytes: Buffer.byteLength(content), sha256: sha256(content) }))
      receipt.state = 'native-review-completed-unmerged'
      receipt.stop = { stage: 'completed', reason: 'none' }
    } finally {
      for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
      Object.assign(console, consoleMethods)
    }
  } catch (error) {
    const failure = classifyActionReviewFailure(error)
    const failurePhase = actionReviewFailurePhase(error)
    if (failurePhase) receipt.observations.failurePhase = failurePhase
    const requestIdentity = actionReviewEvidenceRequestIdentity(error)
    if (!receipt.observations.evidenceRequest && requestIdentity) receipt.observations.evidenceRequestIdentity = requestIdentity
    receipt.state = !entered ? 'rejected-before-model' : failure?.kind === 'invalid-output' ? 'held-invalid-output' : failure?.kind === 'evidence-required' ? 'held-evidence' : 'uncertain-after-entry'
    receipt.stop.reason = error instanceof HeldActionGateError ? error.reason : failure?.kind === 'invalid-output' ? 'native-invalid-output' : failure?.kind === 'evidence-required' ? 'native-evidence-required' : receipt.stop.stage === 'proposal' ? 'proposal-boundary' : 'provider-or-unknown'
    let cause: unknown = error
    for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
      if (cause instanceof ActionContextNeedError || cause instanceof ActionEvidenceRequestError && !failure) receipt.stop.reason = 'native-context-or-budget'
      const status = z.number().int().min(100).max(599).safeParse(Object.getOwnPropertyDescriptor(cause, 'status')?.value)
      if (status.success) receipt.stop.httpStatus = status.data
      cause = Object.getOwnPropertyDescriptor(cause, 'cause')?.value
    }
    if (error instanceof HeldActionGateError && error.httpStatus) receipt.stop.httpStatus = error.httpStatus
    files = []; receipt.files = []
  }
  if (readFileSync(join(root, `_articles/${binding.inputs.date}.md`), 'utf8') !== original || readFileSync(join(root, actionArticlePath(binding.inputs.date)), 'utf8') !== action) { receipt.state = 'uncertain-after-entry'; receipt.files = []; files = [] }
  try { await moveHeldActionClaim(binding, claim, 'finished', github, receipt.state, sha256(JSON.stringify(heldActionReceiptSchema.parse(receipt)))) } catch { receipt.state = 'uncertain-after-entry'; receipt.stop = { stage: 'outcome', reason: 'outcome-uncertain' }; receipt.files = []; files = [] }
  return { receipt: heldActionReceiptSchema.parse(receipt), files }
}

async function main() {
  const root = process.cwd(), directory = join(root, '.git', 'held-action-review')
  const event = z.object({ inputs: z.unknown(), repository: z.object({ default_branch: z.string() }) }).parse(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')))
  const context = { repository: process.env.GITHUB_REPOSITORY, actor: process.env.GITHUB_ACTOR, event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF, defaultBranch: event.repository.default_branch, workflowSha: process.env.GITHUB_SHA, runId: Number(process.env.GITHUB_RUN_ID), attempt: Number(process.env.GITHUB_RUN_ATTEMPT) }
  const github: GitHub = (path, options) => fetch(`https://api.github.com${path}`, { ...options, headers: { Authorization: `Bearer ${process.env.GH_TOKEN ?? ''}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) })
  mkdirSync(directory, { recursive: true })
  if (process.argv[2] === 'prepare') {
    let stage: 'input' | 'reservation' = 'input'
    try {
      requireGate(!process.env.ANTHROPIC_API_KEY)
      const binding = await admitHeldAction(root, event.inputs, context, github)
      stage = 'reservation'
      const reserved = await reserveHeldAction(binding, github)
      writeFileSync(join(directory, 'prepared.json'), JSON.stringify({ binding, reserved }), { flag: 'wx', mode: 0o600 })
    } catch (error) {
      const receipt = heldActionRejectionSchema.parse({ kind: 'held-action-review-rejection-v1', applied: false, stage, reason: error instanceof HeldActionGateError ? error.reason : stage === 'reservation' ? 'claim-uncertain' : 'input-mismatch', authorization: stage === 'reservation' ? 'possibly-consumed' : 'not-reserved', modelEntry: false })
      writeFileSync(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
      process.exitCode = 1
    }
  } else if (process.argv[2] === 'execute') {
    contextSchema.parse(context)
    const prepared = z.object({ binding: bindingSchema, reserved: sha }).strict().parse(JSON.parse(readFileSync(join(directory, 'prepared.json'), 'utf8')))
    requireGate(prepared.binding.runId === context.runId && prepared.binding.source.commit === context.workflowSha && same(prepared.binding.inputs, heldActionInputSchema.parse(event.inputs)))
    const result = await executeHeldAction({ root, ...prepared, github })
    for (const file of result.files) writeFileSync(join(directory, file.name), file.content, { flag: 'wx', mode: 0o600 })
    writeFileSync(join(directory, 'receipt.json'), JSON.stringify(result.receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    if (result.receipt.state !== 'native-review-completed-unmerged') process.exitCode = 1
  } else throw new Error('HELD_ACTION_MODE_REJECTED')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('HELD_ACTION_OPERATION_STOPPED; preserve reservations and inspect the bounded receipt before any new authority.'); process.exitCode = 1 })

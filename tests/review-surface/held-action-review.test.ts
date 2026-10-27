import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { admitHeldAction, executeHeldAction, heldActionGrantSchema, heldActionLimits, heldActionPolicyFingerprint, heldActionReceiptSchema, reserveHeldAction, validateHeldActionArtifact } from '../../scripts/review-held-actions.js'
import { reconcileActions } from '../../scripts/reconcile-actions.js'
import { ActionSourceCollection } from '../../src/action-evidence-view.js'
import { ActionRegistrySchema, actionStateDigest, completeArticleWithPendingActions, readActionRegistry, readArticleStatuses, registryRevision, sha256 } from '../../src/action-registry.js'
import { prepareConservativeDraftCandidateEvidence } from '../../src/action-evidence-selection.js'
import { generationActionCycle } from '../../src/action-review-cycle.js'
import { createActionAgents, pendingActionReview } from '../../src/review-actions.js'
import { ActionEvidenceRequestError, actionEvidenceCaseDigest, createActionEvidenceRequest } from '../../src/action-evidence-retrieval.js'
import { writeActionStore } from '../../src/__tests__/action-store-fixture.js'
import { verifyEditorialProof } from '../../shared/editorial-action-proof.js'
import type { GitHub } from '../../api/_lib/article-review-sources.js'

const { create, countTokens, clients } = vi.hoisted(() => ({ create: vi.fn(), countTokens: vi.fn(), clients: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { constructor(options: unknown) { clients(options) } messages = { create, countTokens } } }))
// Synchronous Git fixtures share the host with the full suite; bound tests locally.
const roots: string[] = [], date = '2026-10-22', operation = '11111111-1111-4111-8111-111111111111', grantId = '22222222-2222-4222-8222-222222222222', authorization = '33333333-3333-4333-8333-333333333333'
const sources = [{ id: 'fact', kind: 'repository' as const, locator: 'fixture.md', content: 'Each original concern needs its own owner review.\nPRIVATE_RAW_SOURCE_SENTINEL' }, { id: 'goal', kind: 'goal' as const, locator: 'ROADMAP.md', content: 'Preserve original decisions and review their evidence independently.' }, ...[9001, 9002, 9003].map(number => ({ id: `checkpoint-${number}`, kind: 'github' as const, locator: `https://github.com/ojfbot/core/issues/${number}`, content: `CURRENT API STATE core#${number}: state=open; owner review remains required.`, trustedContent: [`CURRENT API STATE core#${number}: state=open; owner review remains required.`] }))]
const response = (input: unknown) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'offline', name: 'review_actions', input }], usage: { output_tokens: 100 } })
beforeEach(() => { create.mockReset(); countTokens.mockReset().mockResolvedValue({ input_tokens: 1000 }); clients.mockReset() })
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'held-action-route-')); roots.push(root)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const empty = ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [{ key: 'act-existing', original: { id: 'act-existing', command: '/adr', description: 'Unrelated older work.', repo: 'daily-logger', status: 'open', sourceDate: '2026-10-20' }, origin: 'imported', workKey: 'unrelated-older-work', state: 'open', introducedBy: '2026-10-20', includeInIndex: true, inclusionOverride: null, goal: '', doneWhen: '', gates: [], history: [] }], articles: [] })
  const cycle = generationActionCycle(), draftStatuses = new Map([[date, 'draft']])
  const pending = pendingActionReview({ registry: empty, articleDate: date, cycle, markdown: `---\ndate: ${date}\nstatus: draft\noutcome: accepted\n---\nOffline route fixture.\n`, reason: 'Offline held candidates.', articleStatuses: draftStatuses, draftContext: { kind: 'none' }, draftCandidates: ['review', 'validate', 'triage'].map(command => ({ command: `/${command}`, repo: 'core', description: `Review the separate ${command} concern.`, sourceDate: date, status: 'open' })) })
  const snapshot = pending.registry.articles[0]
  if (!snapshot.draftCandidates) throw new Error('Missing fixture custody')
  snapshot.draftCandidateEvidence = prepareConservativeDraftCandidateEvidence({ registry: pending.registry, articleDate: date, markdown: pending.markdown, articleStatuses: draftStatuses, cycle, feedback: '', draftCandidates: snapshot.draftCandidates })
  snapshot.stateDigest = actionStateDigest(pending.registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, { articleDate: date, roundId: snapshot.roundId, includePriorArticleRounds: true, draftCandidates: snapshot.draftCandidates, draftCandidateEvidence: snapshot.draftCandidateEvidence })
  const accepted = pending.markdown.replace('status: draft', 'status: accepted'), statuses = new Map([[date, 'accepted']])
  const requirements = prepareConservativeDraftCandidateEvidence({ registry: pending.registry, articleDate: date, markdown: accepted, articleStatuses: statuses, cycle, feedback: '', draftCandidates: snapshot.draftCandidates })
  const held = completeArticleWithPendingActions({ registry: pending.registry, articleDate: date, markdown: accepted, articleStatuses: statuses, cycle, failureKind: 'invalid-output', sources: [], draftCandidateEvidence: requirements })
  mkdirSync(join(root, '_articles')); writeActionStore(root, held.registry); writeFileSync(join(root, `_articles/${date}.md`), held.markdown)
  mkdirSync(join(root, 'scripts')); writeFileSync(join(root, 'scripts/review-held-actions.ts'), '// Offline policy fingerprint fixture; no provider.\n')
  git('init', '-q'); git('config', 'user.name', 'Offline fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('add', '.'); git('commit', '-qm', 'offline accepted held fixture')
  const grant = heldActionGrantSchema.parse({ schemaVersion: 1, approvedBy: 'ojfbot', authorizationId: authorization, authorizationReference: 'OFFLINE TEST ONLY; no actual user authorization', operationId: operation, date, articleBlob: git('rev-parse', `HEAD:_articles/${date}.md`), actionBlob: git('rev-parse', `HEAD:actions/articles/${date}.json`), registryRevision: registryRevision(readActionRegistry(root)), policyFingerprint: heldActionPolicyFingerprint(root), reviewCycle: cycle, trains: 1, limits: heldActionLimits, output: 'unmerged-dated-proposal-with-selected-citations' })
  mkdirSync(join(root, 'action-review-grants')); writeFileSync(join(root, `action-review-grants/${grantId}.json`), JSON.stringify(grant)); git('add', '.'); git('commit', '-qm', 'offline reviewed grant fixture')
  const source = git('rev-parse', 'HEAD'), inputs = { date, source_sha: source, operation_id: operation, grant_id: grantId }, context = { repository: 'ojfbot/daily-logger', actor: 'ojfbot', event: 'workflow_dispatch', ref: 'refs/heads/main', defaultBranch: 'main', workflowSha: source, runId: 900, attempt: 1 }
  const original = { article: readFileSync(join(root, `_articles/${date}.md`), 'utf8'), action: readFileSync(join(root, `actions/articles/${date}.json`), 'utf8') }
  return { root, git, grant, inputs, context, source, original, snapshot }
}
function transport(source: string) {
  const refs = new Map<string, string>(), blobs = new Map<string, string>(), trees = new Map<string, string>(), commits = new Map<string, { parent?: string; content: string }>()
  const state = { main: source, loseClaim: false, ignorePatch: false, wrongPatchResponse: false, advanceMainOnEntry: false, runPath: '.github/workflows/review-held-actions.yml', mutations: 0, requests: 0 }
  let sequence = 0
  const next = () => (++sequence).toString(16).padStart(40, '0')
  const github: GitHub = async (path, options = {}) => {
    state.requests++
    const method = options.method ?? 'GET', endpoint = path.slice('/repos/ojfbot/daily-logger'.length), body: unknown = options.body ? JSON.parse(String(options.body)) : null
    const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
    if (endpoint === '/git/ref/heads/main') return reply({ object: { sha: state.main } })
    if (endpoint === '/actions/runs/900/attempts/1') return reply({ id: 900, run_attempt: 1, event: 'workflow_dispatch', head_branch: 'main', head_sha: source, path: state.runPath, actor: { login: 'ojfbot' } })
    if (method !== 'GET') state.mutations++
    if (endpoint === '/git/blobs') { const value = z.object({ content: z.string() }).parse(body), sha = next(); blobs.set(sha, value.content); return reply({ sha }) }
    if (endpoint === '/git/trees') { const value = z.object({ tree: z.array(z.object({ sha: z.string() })) }).parse(body), sha = next(); trees.set(sha, value.tree[0].sha); return reply({ sha }) }
    if (endpoint === '/git/commits') { const value = z.object({ tree: z.string(), parents: z.array(z.string()) }).parse(body), sha = next(); commits.set(sha, { parent: value.parents[0], content: blobs.get(trees.get(value.tree) ?? '') ?? '' }); return reply({ sha }) }
    if (endpoint === '/git/refs' && method === 'POST') {
      const value = z.object({ ref: z.string(), sha: z.string() }).parse(body), key = value.ref.slice('refs/heads/'.length)
      if (refs.has(key)) return reply({}, 422)
      refs.set(key, value.sha)
      if (state.loseClaim) throw new Error('PRIVATE_CLAIM_TRANSPORT_SENTINEL')
      return reply({ object: { sha: value.sha } }, 201)
    }
    const ref = endpoint.replace(/^\/git\/refs?\/heads\//, '')
    if (method === 'GET') return refs.has(ref) ? reply({ object: { sha: refs.get(ref) } }) : reply({}, 404)
    const value = z.object({ sha: z.string(), force: z.literal(false) }).parse(body)
    if (commits.get(value.sha)?.parent !== refs.get(ref)) return reply({}, 422)
    if (!state.ignorePatch) refs.set(ref, value.sha)
    if (state.advanceMainOnEntry && ref.startsWith('action-review-claims/operation-') && JSON.parse(commits.get(value.sha)?.content ?? '{}').stage === 'model-entered') state.main = 'e'.repeat(40)
    return reply({ object: { sha: state.wrongPatchResponse ? 'f'.repeat(40) : value.sha } })
  }
  return { github, state, refs, commits }
}
function native(f: ReturnType<typeof fixture>, t: ReturnType<typeof transport>): typeof reconcileActions {
  return async options => {
    expect([...t.refs.values()].every(ref => JSON.parse(t.commits.get(ref)?.content ?? '{}').stage === 'model-entered')).toBe(true)
    return reconcileActions({ ...options, agents: createActionAgents(), collectSources: () => new ActionSourceCollection(sources) })
  }
}
function healthy(f: ReturnType<typeof fixture>) {
  const candidates = f.snapshot.draftCandidates ?? []
  const closingOptions = [9001, 9002, 9003].map(number => ({ kind: 'checkpoint', target: `https://github.com/ojfbot/core/issues/${number}`, title: `Review distinct owner concern ${number}`, entryPoint: `Read core#${number} and ask its owner`, context: 'Offline controlled unresolved owner checkpoint.', whyNow: 'Separate open concern in this fixture.', outcome: `Owner records decision for ${number}.`, nextCheck: `Inspect owner decision on ${number}.`, benefit: 'Resolve the separate concern.', start: `Read core#${number}.`, replaces: [], factCitations: [{ sourceId: `checkpoint-${number}`, startLine: 1, endLine: 1 }], goalCitations: [{ sourceId: 'goal', startLine: 1, endLine: 1 }] }))
  const proposal = { changes: [], suggestions: [], candidateDispositions: candidates.map(candidate => ({ candidateId: candidate.candidateId, kind: 'reject', reason: 'Controlled offline rejection only.', citations: [{ sourceId: 'fact', startLine: 1, endLine: 1 }] })), closingOptions }
  const verification = { changes: [], suggestions: [], candidateDispositions: candidates.map(candidate => ({ candidateId: candidate.candidateId, verdict: 'pass', reason: 'Controlled offline independent verdict only.' })), closingOptions: closingOptions.map((_, optionIndex) => ({ optionIndex, verdict: 'pass', reason: 'Controlled offline checkpoint verification.' })) }
  create.mockResolvedValueOnce(response(proposal)).mockResolvedValueOnce(response(verification))
  return { proposal, verification }
}
it.each([{ repository: 'fork/daily-logger' }, { actor: 'another-owner' }, { ref: 'refs/heads/branch' }, { attempt: 2 }, { event: 'pull_request_target' }])('rejects untrusted execution before provider: %j', async change => {
  const f = fixture(), t = transport(f.source)
  await expect(admitHeldAction(f.root, f.inputs, { ...f.context, ...change }, t.github)).rejects.toThrow()
  expect(t.state.requests).toBe(0); expect(create).not.toHaveBeenCalled(); expect(countTokens).not.toHaveBeenCalled()
}, 15000)
it('rejects unknown inputs, operation/grant mismatch, stale main and changed files before provider', async () => {
  const f = fixture(), t = transport(f.source)
  for (const inputs of [{ ...f.inputs, unexpected: true }, { ...f.inputs, operation_id: '44444444-4444-4444-8444-444444444444' }, { ...f.inputs, source_sha: 'a'.repeat(40) }]) await expect(admitHeldAction(f.root, inputs, f.context, t.github)).rejects.toThrow()
  t.state.main = 'b'.repeat(40); await expect(admitHeldAction(f.root, f.inputs, f.context, t.github)).rejects.toThrow()
  t.state.main = f.source; writeFileSync(join(f.root, `_articles/${date}.md`), f.original.article + '\nConcurrent edit.\n'); await expect(admitHeldAction(f.root, f.inputs, f.context, t.github)).rejects.toThrow()
  expect(t.state.mutations).toBe(0); expect(countTokens).not.toHaveBeenCalled()
}, 15000)
it('atomically consumes grant and operation; concurrent/duplicate/lost reservations never bill', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github)
  const results = await Promise.allSettled([reserveHeldAction(binding, t.github), reserveHeldAction(binding, t.github)])
  expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1); expect(t.refs.size).toBe(2)
  await expect(reserveHeldAction(binding, t.github)).rejects.toThrow()
  const lost = transport(f.source); lost.state.loseClaim = true
  await expect(reserveHeldAction(binding, lost.github)).rejects.toThrow(); expect(lost.refs.size).toBe(1)
  lost.state.loseClaim = false; await expect(reserveHeldAction(binding, lost.github)).rejects.toThrow()
  expect(create).not.toHaveBeenCalled(); expect(countTokens).not.toHaveBeenCalled()
}, 15000)
it('runs real native dry-run proposer/verifier, preserves accepted durable data and emits only the dated unmerged proposal', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  healthy(f)
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.state).toBe('native-review-completed-unmerged'); expect(result.files.map(file => file.name)).toEqual(['article.md', 'actions.json'])
  expect(result.receipt.observations.budgets).toHaveLength(2); expect(result.receipt.observations.responses).toHaveLength(2)
  expect(create).toHaveBeenCalledTimes(2); expect(countTokens).toHaveBeenCalledTimes(2); expect(clients).toHaveBeenCalledWith({ timeout: 120000, maxRetries: 0 })
  expect(create.mock.calls.map(call => call[0].model)).toEqual(['claude-sonnet-4-6', 'claude-opus-4-6'])
  expect(readFileSync(join(f.root, `_articles/${date}.md`), 'utf8')).toBe(f.original.article); expect(readFileSync(join(f.root, `actions/articles/${date}.json`), 'utf8')).toBe(f.original.action)
  expect(readActionRegistry(f.root).articles[0].review.state).toBe('pending'); expect(readArticleStatuses(f.root).get(date)).toBe('accepted')
  expect(result.receipt.binding.grant.reviewCycle).toEqual({ phase: 'generation' }); expect(heldActionReceiptSchema.parse(result.receipt).applied).toBe(false)
  const exported = Object.fromEntries(result.files.map(file => [file.name, file.content]))
  expect(validateHeldActionArtifact(result.receipt, exported, f.source)).toEqual(result.receipt)
  expect(() => validateHeldActionArtifact(result.receipt, { ...exported, 'article.md': exported['article.md'] + 'changed' }, f.source)).toThrow()
  expect(() => validateHeldActionArtifact(result.receipt, exported, 'a'.repeat(40))).toThrow()
  expect(() => validateHeldActionArtifact(result.receipt, { ...exported, 'raw-response.json': 'PRIVATE_RAW' }, f.source)).toThrow()
  expect(await verifyEditorialProof(t.github, result.receipt)).toBe(false)
  expect(() => heldActionReceiptSchema.parse({ ...result.receipt, outcome: 'changed' })).toThrow()
  expect(() => heldActionReceiptSchema.parse({ ...result.receipt, files: [{ ...result.receipt.files[0], repositoryPath: 'actions/registry.json' }, result.receipt.files[1]] })).toThrow()
  await expect(reserveHeldAction(binding, t.github)).rejects.toThrow(); expect(create).toHaveBeenCalledTimes(2)
}, 15000)
it.each(['malformed', 'unknown'] as const)('preserves held originals and records %s without raw diagnostics or replay', async kind => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  if (kind === 'malformed') create.mockResolvedValue(response({ PRIVATE_MODEL_INPUT_SENTINEL: true }))
  else create.mockRejectedValue(new Error('PRIVATE_PROVIDER_SENTINEL'))
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.state).toBe(kind === 'malformed' ? 'held-invalid-output' : 'uncertain-after-entry'); expect(result.files).toEqual([]); expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_')
  expect(readFileSync(join(f.root, `actions/articles/${date}.json`), 'utf8')).toBe(f.original.action); expect(readFileSync(join(f.root, `_articles/${date}.md`), 'utf8')).toBe(f.original.article)
  expect(create).toHaveBeenCalledTimes(1); expect(result.receipt.stop.reason).toBe(kind === 'malformed' ? 'native-invalid-output' : 'provider-or-unknown'); await expect(reserveHeldAction(binding, t.github)).rejects.toThrow()
}, 15000)
it('stops stale main after reservation before every model API', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  t.state.main = 'c'.repeat(40)
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.state).toBe('rejected-before-model'); expect(countTokens).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled()
  expect(result.receipt.stop).toEqual({ stage: 'input', reason: 'stale-source' })
}, 15000)

it('rejects an operator-disabled train before claiming or counting', async () => {
  const f = fixture(), t = transport(f.source)
  vi.stubEnv('ACTION_REVIEW_DISABLED', 'true')
  await expect(admitHeldAction(f.root, f.inputs, f.context, t.github)).rejects.toThrow()
  expect(t.state.requests).toBe(0); expect(countTokens).not.toHaveBeenCalled()
}, 15000)

it('retains the one native shared repair budget within the same consumed operation', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  const { proposal, verification } = healthy(f), [row, ...rest] = proposal.candidateDispositions
  create.mockReset().mockResolvedValueOnce(response({ ...proposal, candidateDispositions: [{ ...row, reason: 123 }, ...rest] })).mockResolvedValueOnce(response(row)).mockResolvedValueOnce(response(verification))
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.state).toBe('native-review-completed-unmerged'); expect(create).toHaveBeenCalledTimes(3); expect(countTokens).toHaveBeenCalledTimes(3)
  expect(create.mock.calls.map(call => call[0].model)).toEqual(['claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-opus-4-6'])
}, 15000)

it('a count/HTTP failure consumes authority without claiming generation or billing success', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  countTokens.mockRejectedValueOnce(Object.assign(new Error('PRIVATE_COUNT_SENTINEL'), { status: 503 }))
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.state).toBe('uncertain-after-entry'); expect(result.receipt.observations).toEqual({ billing: 'not-inferred', budgets: [], responses: [], evidenceRequestIdentity: { id: expect.stringMatching(/^[a-f0-9]{64}$/), kind: 'clarification' }, failurePhase: 'context-or-budget' })
  expect(result.receipt.observations.evidenceRequest).toBeUndefined()
  expect(create).not.toHaveBeenCalled(); expect(countTokens).toHaveBeenCalledTimes(1); expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_')
  await expect(reserveHeldAction(binding, t.github)).rejects.toThrow()
}, 15000)

it('retains a qualified overbudget count without generation or raw evidence', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  countTokens.mockResolvedValueOnce({ input_tokens: 244001, PRIVATE_COUNT_SENTINEL: 'PRIVATE_RAW_COUNT' })
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.observations.budgets).toEqual([{ role: 'proposer', input: 244001, outputReserve: 12000, total: 256001, limit: 256000 }])
  expect(result.receipt.observations.responses).toEqual([])
  expect(result.receipt.stop.reason).toBe('native-context-or-budget')
  expect(countTokens).toHaveBeenCalledTimes(1); expect(create).not.toHaveBeenCalled()
  expect(result.files).toEqual([]); expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_')
  expect(readFileSync(join(f.root, `_articles/${date}.md`), 'utf8')).toBe(f.original.article)
  expect(readFileSync(join(f.root, `actions/articles/${date}.json`), 'utf8')).toBe(f.original.action)
}, 15000)

it.each(['max_tokens', 'end_turn', 'stop_sequence'] as const)('retains %s and actual usage before incomplete output is rejected', async stop => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  create.mockResolvedValueOnce({ stop_reason: stop, usage: { input_tokens: 1234, output_tokens: 12000, PRIVATE_USAGE_SENTINEL: 123 }, content: 'PRIVATE_RAW_RESPONSE_SENTINEL' })
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.state).toBe('held-invalid-output')
  expect(result.receipt.observations.responses).toEqual([{ role: 'proposer', stop, inputTokens: 1234, outputTokens: 12000 }])
  expect(countTokens).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(create.mock.calls[0][0])).toContain('PRIVATE_RAW_SOURCE_SENTINEL')
  expect(result.files).toEqual([]); expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_')
  expect(readFileSync(join(f.root, `_articles/${date}.md`), 'utf8')).toBe(f.original.article)
  expect(readFileSync(join(f.root, `actions/articles/${date}.json`), 'utf8')).toBe(f.original.action)
}, 15000)

it('keeps proposer and verifier usage distinct when the verifier is truncated', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  const { proposal } = healthy(f)
  create.mockReset().mockResolvedValueOnce({ ...response(proposal), usage: { input_tokens: 1111, output_tokens: 100 } }).mockResolvedValueOnce({ stop_reason: 'max_tokens', usage: { input_tokens: 2222, output_tokens: 12000 }, content: 'PRIVATE_VERIFIER_REPLY' })
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.observations.responses).toEqual([{ role: 'proposer', stop: 'tool_use', inputTokens: 1111, outputTokens: 100 }, { role: 'verifier', stop: 'max_tokens', inputTokens: 2222, outputTokens: 12000 }])
  expect(result.receipt.state).toBe('held-invalid-output'); expect(result.files).toEqual([])
  expect(create).toHaveBeenCalledTimes(2); expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_')
}, 15000)

it('retains a bounded unknown stop with unavailable usage without arbitrary provider strings', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  create.mockResolvedValueOnce({ stop_reason: 'PRIVATE_UNKNOWN_STOP', usage: { input_tokens: -1, output_tokens: 12001 }, content: 'PRIVATE_RAW_REPLY' })
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.observations.responses).toEqual([{ role: 'proposer', stop: 'unknown', inputTokens: null, outputTokens: null }])
  expect(result.receipt.state).toBe('uncertain-after-entry'); expect(result.files).toEqual([])
  expect(create).toHaveBeenCalledTimes(1); expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_')
}, 15000)

it('retains valid input usage independently of invalid output usage on an incomplete response', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  create.mockResolvedValueOnce({ stop_reason: 'max_tokens', usage: { input_tokens: 1234, output_tokens: 12001 }, content: 'PRIVATE_INVALID_USAGE_REPLY' })
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.observations.responses).toEqual([{ role: 'proposer', stop: 'max_tokens', inputTokens: 1234, outputTokens: null }])
  expect(result.receipt.state).toBe('held-invalid-output'); expect(result.files).toEqual([])
  expect(create).toHaveBeenCalledTimes(1); expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_')
}, 15000)

it('keeps legacy response measurements readable and rejects out-of-range numeric observations', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  healthy(f)
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  const legacy = { ...result.receipt, observations: { ...result.receipt.observations, responses: [{ role: 'proposer', stop: 'tool_use', outputTokens: 100 }] } }
  expect(heldActionReceiptSchema.parse(legacy).observations.responses[0]).toEqual({ role: 'proposer', stop: 'tool_use', outputTokens: 100 })
  for (const input of [-1, 0.5, Number.MAX_SAFE_INTEGER, 1000000000]) {
    expect(() => heldActionReceiptSchema.parse({ ...legacy, observations: { ...legacy.observations, budgets: [{ role: 'proposer', input, outputReserve: 12000, total: input + 12000, limit: 256000 }] } })).toThrow()
    expect(() => heldActionReceiptSchema.parse({ ...legacy, observations: { ...legacy.observations, responses: [{ role: 'proposer', stop: 'tool_use', inputTokens: input, outputTokens: 100 }] } })).toThrow()
  }
  expect(() => heldActionReceiptSchema.parse({ ...legacy, observations: { ...legacy.observations, responses: [{ role: 'proposer', stop: 'tool_use', inputTokens: 1000, outputTokens: 12001 }] } })).toThrow()
}, 15000)

it('retains closed schema diagnostics for the failed proposal and its one repair without raw canaries', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  const { proposal } = healthy(f), [row, ...rest] = proposal.candidateDispositions
  const invalid = { candidateId: row.candidateId, kind: row.kind, citations: row.citations, PRIVATE_UNKNOWN_KEY_CANARY: 'PRIVATE_RAW_REPLY_CANARY' }
  create.mockReset().mockResolvedValueOnce(response({ ...proposal, candidateDispositions: [invalid, ...rest] })).mockResolvedValueOnce(response(invalid))
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  const shapes = result.receipt.observations.outputShapes
  expect(shapes).toHaveLength(2)
  expect(shapes?.every(shape => shape.role === 'proposer' && shape.phase === 'tool-input' && shape.issues.length <= 4)).toBe(true)
  expect(shapes?.[0].issues).toContainEqual(expect.objectContaining({ path: ['candidateDispositions', 0, 'reason'], code: 'invalid_type', received: 'missing', candidateId: row.candidateId }))
  expect(shapes?.some(shape => shape.issues.some(issue => issue.forbidden?.includes('<unknown-key>')))).toBe(true)
  expect(result.receipt.state).toBe('held-invalid-output'); expect(result.files).toEqual([])
  expect(create).toHaveBeenCalledTimes(2); expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_')
  const first = shapes?.[0]
  if (!first) throw new Error('Expected a native shape observation')
  for (const outputShapes of [Array(4).fill(first), [{ ...first, issues: Array(5).fill(first.issues[0]) }], [{ ...first, phase: 'PRIVATE_PHASE' }], [{ ...first, issues: [{ path: ['PRIVATE_KEY'], code: 'custom' }] }]]) {
    expect(() => heldActionReceiptSchema.parse({ ...result.receipt, observations: { ...result.receipt.observations, outputShapes } })).toThrow()
  }
}, 15000)

it('does not retain a foreign candidate ID or arbitrary field names from malformed output', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  const { proposal } = healthy(f), [row, ...rest] = proposal.candidateDispositions
  create.mockReset().mockResolvedValueOnce(response({ ...proposal, candidateDispositions: [{ candidateId: '9'.repeat(64), kind: row.kind, citations: row.citations, PRIVATE_UNKNOWN_KEY: 'PRIVATE_REPLY' }, ...rest] }))
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.observations.outputShapes).toHaveLength(1)
  expect(JSON.stringify(result.receipt.observations.outputShapes)).not.toContain('9'.repeat(64))
  expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_'); expect(result.files).toEqual([])
  expect(create).toHaveBeenCalledTimes(1)
}, 15000)

it('retains only the actual native current-case request receipt with no question or raw source locator', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  const content = 'PRIVATE_RAW_SOURCE_CANARY\n' + 'x'.repeat(140000), source = { id: `fact@${sha256(content)}`, kind: 'repository' as const, locator: 'PRIVATE_SOURCE_LOCATOR_CANARY', content }
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: options => reconcileActions({ ...options, agents: createActionAgents(), collectSources: () => new ActionSourceCollection([source]) }) })
  const request = result.receipt.observations.evidenceRequest
  expect(request).toMatchObject({ kind: 'source-view', articleDate: date, cycle: { phase: 'generation' }, sourceKey: 'fact', sourceId: source.id, sourceFullContentSha256: sha256(content), status: 'open' })
  expect(request).not.toHaveProperty('question'); expect(request).not.toHaveProperty('sourceLocator')
  expect(result.receipt.state).toBe('held-evidence'); expect(result.files).toEqual([])
  expect(countTokens).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled()
  expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_')
  expect(readFileSync(join(f.root, `actions/articles/${date}.json`), 'utf8')).toBe(f.original.action)
  for (const change of [{ articleDate: '2030-01-01' }, { cycle: { phase: 'revision', requestId: 'foreign' } }, { status: 'resolved' }, { sourceFullContentSha256: 'f'.repeat(64) }, { question: 'PRIVATE_QUESTION' }, { sourceLocator: 'PRIVATE_LOCATOR' }]) {
    expect(() => heldActionReceiptSchema.parse({ ...result.receipt, observations: { ...result.receipt.observations, evidenceRequest: { ...request, ...change } } })).toThrow()
  }
}, 15000)

it('does not label a self-consistent request current when its source pin differs from actual native inputs', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  const registry = readActionRegistry(f.root), statuses = readArticleStatuses(f.root), cycle = generationActionCycle()
  const actualContent = 'Actual complete fixture source.', source = { id: `fact@${sha256(actualContent)}`, kind: 'repository' as const, locator: 'fixture.md', content: actualContent }
  let prepared: ReturnType<typeof prepareConservativeDraftCandidateEvidence> | undefined, requestId: string | undefined
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: options => reconcileActions({ ...options,
    collectSources: (_candidates, evidence) => { prepared = evidence; return new ActionSourceCollection([source]) },
    agents: { propose: async () => {
      if (!prepared) throw new Error('Expected native prepared evidence')
      const wrongContent = 'PRIVATE_FOREIGN_SOURCE_CANARY', wrong = { ...source, id: `fact@${sha256(wrongContent)}`, content: wrongContent }
      const request = createActionEvidenceRequest({ kind: 'source-view', caseDigest: actionEvidenceCaseDigest({ registry, articleDate: date, cycle, markdown: f.original.article, feedback: '', actionKeys: ['article-feedback'], articleStatuses: statuses, draftCandidateEvidence: prepared }), articleDate: date, cycle, actionKeys: ['article-feedback'], sourceKey: 'fact', source: wrong, question: 'PRIVATE_QUESTION_CANARY', obligations: [sha256('source mismatch')] })
      requestId = request.id
      throw new ActionEvidenceRequestError(request, 'PRIVATE_NATIVE_EXCEPTION')
    }, verify: async () => { throw new Error('Unexpected verifier entry') } },
  }) })
  expect(result.receipt.observations.evidenceRequest).toBeUndefined()
  expect(result.receipt.observations.evidenceRequestIdentity).toEqual({ id: requestId, kind: 'source-view' })
  expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_'); expect(result.files).toEqual([])
  expect(countTokens).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled()
}, 15000)

it('retains only request identity when a caught request lacks actual current inputs and sources', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  const request = createActionEvidenceRequest({ kind: 'clarification', caseDigest: sha256('foreign'), articleDate: '2030-01-01', cycle: generationActionCycle(), actionKeys: ['article-feedback'], sourceKey: 'model-context', question: 'PRIVATE_QUESTION_CANARY', obligations: [sha256('unknown obligation')] })
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: async () => { throw new ActionEvidenceRequestError(request, 'PRIVATE_NATIVE_MESSAGE_CANARY') } })
  expect(result.receipt.observations.evidenceRequest).toBeUndefined()
  expect(result.receipt.observations.evidenceRequestIdentity).toEqual({ id: request.id, kind: 'clarification' })
  expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_'); expect(result.files).toEqual([])
  expect(countTokens).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled()
}, 15000)

it('distinguishes a native incomplete ranked shortlist without retaining model reasons or emitting a proposal', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  const { proposal, verification } = healthy(f)
  create.mockReset().mockResolvedValueOnce(response({ ...proposal, closingOptions: proposal.closingOptions.slice(0, 2) }))
    .mockResolvedValueOnce(response({ ...verification, closingOptions: verification.closingOptions.slice(0, 2).map(row => ({ ...row, reason: 'PRIVATE_VERIFIER_REASON_CANARY' })) }))
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.state).toBe('held-evidence'); expect(result.receipt.stop.reason).toBe('native-evidence-required')
  expect(result.receipt.observations.failurePhase).toBe('ranked-shortlist-incomplete')
  expect(result.receipt.observations.evidenceRequest).toBeUndefined()
  expect(result.receipt.observations.evidenceRequestIdentity).toBeUndefined()
  expect(result.files).toEqual([]); expect(create).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_')
  expect(readFileSync(join(f.root, `_articles/${date}.md`), 'utf8')).toBe(f.original.article)
  expect(readFileSync(join(f.root, `actions/articles/${date}.json`), 'utf8')).toBe(f.original.action)
}, 15000)

it('cannot reuse consumed authorization with another operation or reuse an operation under another grant', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github)
  await reserveHeldAction(binding, t.github)
  await expect(reserveHeldAction({ ...binding, inputs: { ...binding.inputs, operation_id: '55555555-5555-4555-8555-555555555555' } }, t.github)).rejects.toThrow()
  await expect(reserveHeldAction({ ...binding, grant: { ...binding.grant, authorizationId: '66666666-6666-4666-8666-666666666666' } }, t.github)).rejects.toThrow()
  expect(countTokens).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled()
}, 15000)

it('rejects a hydrated-index change that the dated artifact could not represent', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  healthy(f)
  const runNative = native(f, t)
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: async options => {
    const reviewed = await runNative(options)
    reviewed.registry.records[0].goal = 'Cross-file change must never be silently dropped.'
    return reviewed
  } })
  expect(result.files).toEqual([]); expect(result.receipt.stop.reason).toBe('proposal-boundary'); expect(result.receipt.state).toBe('uncertain-after-entry')
  expect(readActionRegistry(f.root).records[0].goal).toBe('')
}, 15000)

it('rejects another workflow run before reservation or model APIs', async () => {
  const f = fixture(), t = transport(f.source)
  t.state.runPath = '.github/workflows/editorial-revise.yml'
  await expect(admitHeldAction(f.root, f.inputs, f.context, t.github)).rejects.toThrow()
  expect(t.state.mutations).toBe(0); expect(countTokens).not.toHaveBeenCalled()
}, 15000)

it.each(['ignorePatch', 'wrongPatchResponse'] as const)('requires acknowledged and read-back entry marker: %s', async failure => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  t.state[failure] = true
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.state).toBe('uncertain-after-entry'); expect(result.files).toEqual([])
  expect(result.receipt.nativeEntry).toBe('not-entered')
  expect(countTokens).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled()
}, 15000)

it('rejects main moving during entered-marker writes before native count or generation', async () => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  t.state.advanceMainOnEntry = true
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: native(f, t) })
  expect(result.receipt.state).toBe('rejected-before-model'); expect(result.receipt.nativeEntry).toBe('not-entered'); expect(result.receipt.authorization).toBe('consumed')
  expect(result.receipt.stop.reason).toBe('stale-source'); expect(countTokens).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled()
}, 15000)


it.each(['append', 'rehash-unknown', 'trusted-content', 'wrong-kind'] as const)('rejects uncited or malformed coverage export: %s', async change => {
  const f = fixture(), t = transport(f.source), binding = await admitHeldAction(f.root, f.inputs, f.context, t.github), reserved = await reserveHeldAction(binding, t.github)
  healthy(f)
  const runNative = native(f, t)
  const result = await executeHeldAction({ root: f.root, binding, reserved, github: t.github, native: async options => {
    const reviewed = await runNative(options), coverage = reviewed.registry.articles[0].sources.find(source => source.id.startsWith('action-evidence-coverage@'))
    if (!coverage) throw new Error('Missing native coverage fixture')
    if (change === 'append') coverage.content += 'PRIVATE_COLLECTED_UNCITED_SENTINEL'
    if (change === 'rehash-unknown') { coverage.content = JSON.stringify({ ...JSON.parse(coverage.content), raw: 'PRIVATE_COLLECTED_UNCITED_SENTINEL' }); coverage.id = `action-evidence-coverage@${sha256(coverage.content)}` }
    if (change === 'trusted-content') coverage.trustedContent = ['PRIVATE_COLLECTED_UNCITED_SENTINEL']
    if (change === 'wrong-kind') coverage.kind = 'repository'
    return reviewed
  } })
  expect(result.files).toEqual([]); expect(result.receipt.stop.reason).toBe('proposal-boundary'); expect(result.receipt.state).toBe('uncertain-after-entry')
  expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_')
  expect(readFileSync(join(f.root, `actions/articles/${date}.json`), 'utf8')).toBe(f.original.action)
}, 15000)

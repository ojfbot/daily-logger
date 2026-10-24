import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reconcileActions } from '../../scripts/reconcile-actions.js'
import { ActionSourceCollection } from '../../src/action-evidence-view.js'
import { ActionRegistrySchema, actionStateDigest, projectRegistry, readActionRegistry, readArticleStatuses, sha256 } from '../../src/action-registry.js'
import { draftCandidateEvidenceBinding } from '../../src/action-evidence-selection.js'
import { generationActionCycle } from '../../src/action-review-cycle.js'
import { createActionAgents, pendingActionReview } from '../../src/review-actions.js'
import { writeActionStore } from '../../src/__tests__/action-store-fixture.js'

const { create, countTokens } = vi.hoisted(() => ({ create: vi.fn(), countTokens: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create, countTokens } } }))
const date = '2026-10-21', roots: string[] = []
const sources = [{ id: 'fact', kind: 'repository' as const, locator: 'fixture.md', content: 'Each original concern needs its own owner review.' },
  { id: 'goal', kind: 'goal' as const, locator: 'ROADMAP.md', content: 'Preserve original decisions and review their evidence independently.' },
  ...[9001, 9002, 9003].map(number => ({ id: `checkpoint-${number}`, kind: 'github' as const, locator: `https://github.com/ojfbot/core/issues/${number}`, content: `CURRENT API STATE core#${number}: state=open; owner review remains required.`, trustedContent: [`CURRENT API STATE core#${number}: state=open; owner review remains required.`] }))]
const response = (input: unknown) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'fixture', name: 'review_actions', input }], usage: { output_tokens: 100 } })
beforeEach(() => {
  create.mockReset(); countTokens.mockReset().mockResolvedValue({ input_tokens: 1000 })
  vi.stubEnv('ACTION_REVIEW_REQUEST', 'offline-clean-acceptance'); vi.stubEnv('DRY_RUN', 'false'); vi.stubEnv('MOCK_LLM', 'false')
  vi.stubEnv('ACTION_REVIEW_ARTICLE_COMPLETION', 'article-only')
  for (const name of ['ACTION_KEY', 'EDITORIAL_FEEDBACK', 'ACTION_EVIDENCE_REPLY', 'ACTION_REASSESS_KEYS', 'ACTION_PRESERVE_KEYS']) vi.stubEnv(name, '')
})
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'article-completion-native-')); roots.push(root)
  const empty = ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
  const pending = pendingActionReview({ registry: empty, articleDate: date, cycle: generationActionCycle(), markdown: `---\ndate: ${date}\nstatus: draft\noutcome: accepted\n---\nOffline article fixture.\n`, reason: 'Original concerns await independent review.', articleStatuses: new Map([[date, 'draft']]), draftContext: { kind: 'none' }, draftCandidates: ['review', 'validate', 'triage'].map(command => ({ command: `/${command}`, repo: 'core', description: `Review the separate ${command} concern.`, sourceDate: date, status: 'open' })) })
  const snapshot = pending.registry.articles[0]
  if (!snapshot.draftCandidates) throw new Error('Missing original candidates')
  snapshot.draftCandidateEvidence = { version: 'draft-candidate-evidence-v2', provenance: { kind: 'independent-reviewer', identity: 'offline-completion-control', decision: 'Controlled original associations only.' }, ...draftCandidateEvidenceBinding({ registry: pending.registry, articleDate: date, cycle: generationActionCycle(), markdown: pending.markdown }), candidates: snapshot.draftCandidates.map(candidate => ({ candidateId: candidate.candidateId, payloadSha256: sha256(JSON.stringify(candidate.payload)), references: [], actionRelations: [] })), unassignedReferences: [] }
  snapshot.stateDigest = actionStateDigest(pending.registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, { articleDate: date, roundId: snapshot.roundId, includePriorArticleRounds: true, draftCandidates: snapshot.draftCandidates, draftCandidateEvidence: snapshot.draftCandidateEvidence })
  mkdirSync(join(root, '_articles')); writeActionStore(root, pending.registry)
  const articlePath = `_articles/${date}.md`, path = join(root, articlePath), markdown = pending.markdown.replace('status: draft', 'status: accepted')
  writeFileSync(path, markdown)
  const proposal = { changes: [], suggestions: [], candidateDispositions: snapshot.draftCandidates.map(candidate => ({ candidateId: candidate.candidateId, kind: 'reject', reason: 'Controlled rejection, not an actual October21 verdict.', citations: [{ sourceId: 'fact', startLine: 1, endLine: 1 }] })), closingOptions: [] }
  const verification = { changes: [], suggestions: [], candidateDispositions: snapshot.draftCandidates.map(candidate => ({ candidateId: candidate.candidateId, verdict: 'pass', reason: 'Controlled fixture only.' })), closingOptions: [] }
  return { root, path, markdown, proposal, verification, registry: pending.registry, snapshot, run: () => reconcileActions({ repoRoot: root, articlePath, agents: createActionAgents(), collectSources: () => new ActionSourceCollection(sources) }) }
}

it('completes the actual reconcile path after two malformed proposer responses without admitting an action', async () => {
  const f = setup(), bad = structuredClone(f.proposal)
  const row = bad.candidateDispositions[0]
  const malformed = { ...bad, candidateDispositions: [{ ...row, suggestionIndex: 0 }, ...bad.candidateDispositions.slice(1)] }
  create.mockResolvedValueOnce(response(malformed)).mockResolvedValueOnce(response({ candidateId: row.candidateId, kind: row.kind }))
  const result = await f.run(), reloaded = readActionRegistry(f.root)
  expect(create).toHaveBeenCalledTimes(2); expect(countTokens).toHaveBeenCalledTimes(2)
  expect(result).toMatchObject({ articleCompletion: 'accepted', actionReview: 'pending' })
  expect(reloaded.records).toEqual(f.registry.records)
  expect(reloaded.articles[0].draftCandidates).toEqual(f.snapshot.draftCandidates)
  expect(projectRegistry(reloaded, readArticleStatuses(f.root)).proposed).toHaveLength(3)
  expect(readFileSync(f.path, 'utf8')).toContain('Article accepted. These suggestions still need independent review.')
})

it.each(['proposer', 'verifier'] as const)('holds the originals after an allowlisted incomplete %s response without an extra generation', async role => {
  const f = setup()
  if (role === 'verifier') create.mockResolvedValueOnce(response(f.proposal))
  create.mockResolvedValueOnce({ stop_reason: 'max_tokens', content: [], usage: { output_tokens: 100 } })
  const result = await f.run()
  expect(create).toHaveBeenCalledTimes(role === 'proposer' ? 1 : 2)
  expect(countTokens).toHaveBeenCalledTimes(role === 'proposer' ? 1 : 2)
  expect(result.registry.records).toEqual(f.registry.records)
  expect(result.registry.articles[0].draftCandidates).toEqual(f.snapshot.draftCandidates)
  expect(result.registry.articles[0].review).toMatchObject({ state: 'pending', articleAcceptance: { failureKind: 'invalid-output' } })
  expect(readActionRegistry(f.root).articles[0].status).toBe('accepted')
})

it.each(['provider', 'counter', 'article-cas'] as const)('hard-fails %s without creating a completed article snapshot', async kind => {
  const f = setup(), before = readFileSync(join(f.root, `actions/articles/${date}.json`), 'utf8')
  if (kind === 'counter') countTokens.mockRejectedValueOnce(new Error('Counter transport unavailable'))
  else if (kind === 'article-cas') {
    const held = structuredClone(f.verification); held.candidateDispositions[0].verdict = 'hold'
    create.mockImplementationOnce(async () => { writeFileSync(f.path, f.markdown + '\nConcurrent article edit.\n'); return response(f.proposal) }).mockResolvedValueOnce(response(held))
  }
  else create.mockImplementationOnce(async () => {
    throw new Error('Unknown transport or storage failure')
  })
  await expect(f.run()).rejects.toThrow()
  expect(readFileSync(join(f.root, `actions/articles/${date}.json`), 'utf8')).toBe(before)
  expect(readActionRegistry(f.root).articles[0].status).toBe('draft')
  expect(create).toHaveBeenCalledTimes(kind === 'counter' ? 0 : kind === 'provider' ? 1 : 2)
})

it('discards all local disposition changes after a valid proposal and an independent native hold', async () => {
  const f = setup(), verification = structuredClone(f.verification)
  verification.candidateDispositions[0].verdict = 'hold'
  create.mockResolvedValueOnce(response(f.proposal)).mockResolvedValueOnce(response(verification))
  const result = await f.run()
  expect(create).toHaveBeenCalledTimes(2)
  expect(result.registry.records).toEqual(f.registry.records)
  expect(result.registry.articles[0].draftCandidates).toEqual(f.snapshot.draftCandidates)
  expect(result.registry.articles[0].review).toMatchObject({ state: 'pending', articleAcceptance: { failureKind: 'evidence-required' } })
})

it('keeps the entire pristine input when a fully parsed proposal and verifier leave no supported shortlist', async () => {
  const f = setup()
  const candidateId = f.snapshot.draftCandidates?.[0].candidateId
  const proposal = { ...f.proposal, suggestions: [{ identity: { kind: 'captured', candidateId }, target: 'bounded owner concern', outcome: 'Record the independent owner review.', goal: 'Preserve the original owner concern.', doneWhen: 'The owner records the review.', gates: ['Owner approval remains required.'], existingKey: null, factCitations: [{ sourceId: 'fact', startLine: 1, endLine: 1 }], goalCitations: [{ sourceId: 'goal', startLine: 1, endLine: 1 }] }], candidateDispositions: [{ candidateId, kind: 'promote', suggestionIndex: 0, reason: 'Controlled source-backed promotion before the later shortlist hold.' }, ...f.proposal.candidateDispositions.slice(1)] }
  create.mockResolvedValueOnce(response(proposal)).mockResolvedValueOnce(response({ ...f.verification, suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'Controlled independent review only.', existingKey: null }] }))
  const result = await f.run()
  expect(result.registry.records).toEqual(f.registry.records)
  expect(result.registry.articles[0].draftCandidates).toEqual(f.snapshot.draftCandidates)
  expect(result.registry.articles[0].review.state).toBe('pending')
  expect(projectRegistry(result.registry, readArticleStatuses(f.root)).open).toEqual([])
})

it('later resolves the held originals through the same native entry point and a fully verified shortlist', async () => {
  const f = setup(), row = f.proposal.candidateDispositions[0]
  create.mockResolvedValueOnce(response({ ...f.proposal, candidateDispositions: [{ ...row, suggestionIndex: 0 }, ...f.proposal.candidateDispositions.slice(1)] })).mockResolvedValueOnce(response({ candidateId: row.candidateId, kind: row.kind }))
  await f.run()
  const closingOptions = [9001, 9002, 9003].map(number => ({ kind: 'checkpoint', target: `https://github.com/ojfbot/core/issues/${number}`, title: `Review the distinct owner concern ${number}`, entryPoint: `Read core#${number} and ask its owner`, context: 'This is an offline controlled unresolved owner checkpoint.', whyNow: 'It remains a separate open concern in the fixture.', outcome: `Owner records the decision for ${number}.`, nextCheck: `Inspect the owner decision on ${number}.`, benefit: 'Resolve the separate concern.', start: `Read core#${number}.`, replaces: [], factCitations: [{ sourceId: `checkpoint-${number}`, startLine: 1, endLine: 1 }], goalCitations: [{ sourceId: 'goal', startLine: 1, endLine: 1 }] }))
  create.mockResolvedValueOnce(response({ ...f.proposal, closingOptions })).mockResolvedValueOnce(response({ ...f.verification, closingOptions: closingOptions.map((_, optionIndex) => ({ optionIndex, verdict: 'pass', reason: 'Controlled offline checkpoint verification only.' })) }))
  const result = await f.run(), snapshot = result.registry.articles[0]
  expect(create).toHaveBeenCalledTimes(4)
  expect(snapshot.review.state).toBe('verified')
  expect(snapshot.closing?.kind).toBe('shortlist')
  expect(snapshot.draftCandidates?.every(candidate => candidate.review.state === 'rejected')).toBe(true)
  expect(result.registry.records).toEqual(f.registry.records)
  expect(projectRegistry(result.registry, readArticleStatuses(f.root)).proposed).toEqual([])
})

it('requires the explicit clean-completion mode before allowing an Accepted/pending fallback', async () => {
  const f = setup(), row = f.proposal.candidateDispositions[0]
  vi.stubEnv('ACTION_REVIEW_ARTICLE_COMPLETION', '')
  create.mockResolvedValueOnce(response({ ...f.proposal, candidateDispositions: [{ ...row, suggestionIndex: 0 }, ...f.proposal.candidateDispositions.slice(1)] })).mockResolvedValueOnce(response({ candidateId: row.candidateId, kind: row.kind }))
  await expect(f.run()).rejects.toThrow('pending persistence refused')
  expect(readActionRegistry(f.root).articles[0].status).toBe('draft')
})

import { afterEach, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const control = vi.hoisted(() => ({
  acceptedFromUi: '',
  candidateIds: [] as string[],
  collectCalls: 0,
  proposeCalls: 0,
  verifyCalls: 0,
  sdkCreate: vi.fn(() => { throw new Error('Real provider calls are denied in this regression') }),
  sdkCount: vi.fn(() => { throw new Error('Real token calls are denied in this regression') }),
  github: vi.fn(() => { throw new Error('Real child processes are denied in this regression') }),
}))

vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: control.sdkCreate, countTokens: control.sdkCount } } }))
vi.mock('node:child_process', () => ({ execFileSync: control.github }))
vi.mock('../../src/review-actions.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/review-actions.js')>()
  const { ActionSourceCollection } = await import('../../src/action-evidence-view.js')
  return {
    ...actual,
    collectActionSources: () => {
      control.collectCalls++
      const content = 'CURRENT API STATE core#543: state=open; owner review remains required.'
      return new ActionSourceCollection([{
        id: 'github:core#543',
        kind: 'github' as const,
        locator: 'https://github.com/ojfbot/core/issues/543',
        content,
        trustedContent: [content],
      }])
    },
    createActionAgents: () => ({
      identity: { proposer: 'offline-acceptance-proposer', verifier: 'offline-acceptance-verifier' },
      propose: async (_prompt: string, view: import('../../src/action-evidence-view.js').PreparedActionEvidenceView) => {
        const sources = view.rawSources(true)
        control.proposeCalls++
        const source = sources.find(candidate => candidate.locator === 'https://github.com/ojfbot/core/issues/543')
        if (!source) throw new Error('Missing synthetic current source')
        const citation = { sourceId: source.id, quote: source.content, sourceLineStart: 1, sourceLineEnd: source.content.split('\n').length }
        return {
          changes: [],
          suggestions: [],
          candidateDispositions: control.candidateIds.map(candidateId => ({
            candidateId,
            kind: 'reject' as const,
            reason: 'Synthetic current evidence does not admit this candidate.',
            citations: [citation],
          })),
          closingOptions: Array.from({ length: 3 }, (_, index) => ({
            kind: 'checkpoint' as const,
            title: `Synthetic acceptance checkpoint ${index + 1}`,
            benefit: 'Exercise accepted snapshot persistence only.',
            start: 'Read the synthetic current source.',
            replaces: [],
            target: source.locator,
            entryPoint: 'Read the synthetic current source.',
            context: 'Offline test-double output for control-flow coverage.',
            whyNow: 'Verify the accepted writer boundary.',
            outcome: `Synthetic persistence control ${index + 1}`,
            nextCheck: 'Human review remains required for every real decision.',
            factCitations: [citation],
            goalCitations: [citation],
          })),
        }
      },
      verify: async () => {
        control.verifyCalls++
        return {
          changes: [],
          suggestions: [],
          candidateDispositions: control.candidateIds.map(candidateId => ({ candidateId, verdict: 'pass' as const, reason: 'Synthetic disposition is internally consistent.' })),
          closingOptions: Array.from({ length: 3 }, (_, optionIndex) => ({ optionIndex, verdict: 'pass' as const, reason: 'Synthetic checkpoint is internally consistent.' })),
        }
      },
    }),
  }
})

import { stampDraft } from '../../packages/frontend/src/utils/stampDraft.js'
import { actionStateDigest, ActionRegistrySchema, readActionRegistry, readArticleStatuses, registryRevision, renderArticleActions, sha256 } from '../../src/action-registry.js'
import { draftCandidateEvidenceBinding } from '../../src/action-evidence-selection.js'
import { revisionActionCycle } from '../../src/action-review-cycle.js'
import { pendingActionReview } from '../../src/review-actions.js'
import { stampOutcome } from '../../src/stamp-outcome.js'
import { writeActionStore } from '../../src/__tests__/action-store-fixture.js'

const date = '2030-01-01'
const draft = `---\ntitle: "Synthetic acceptance"\ndate: ${date}\nstatus: draft\n---\n## What shipped\nSynthetic acceptance-order coverage.\n`
const payload = { command: '/review', description: 'Review core #543 current target.', repo: 'core', status: 'open' as const, sourceDate: date }
const roots: string[] = []

function preparedDraftRegistry() {
  const cycle = revisionActionCycle('synthetic-draft-preparation')
  const statuses = new Map([[date, 'draft']])
  const empty = ActionRegistrySchema.parse({
    schemaVersion: 1,
    baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] },
    records: [],
    articles: [],
  })
  const pending = pendingActionReview({ registry: empty, articleStatuses: statuses, articleDate: date, cycle, markdown: draft,
    reason: 'Capture the synthetic producer candidate.', draftCandidates: [payload], draftContext: { kind: 'none' } })
  const snapshot = pending.registry.articles[0]!
  const binding = draftCandidateEvidenceBinding({ registry: pending.registry, articleStatuses: statuses, articleDate: date, cycle, markdown: draft, feedback: '' })
  snapshot.draftCandidateEvidence = {
    version: 'draft-candidate-evidence-v2',
    provenance: { kind: 'independent-reviewer', identity: 'synthetic-acceptance-fixture', decision: 'Classify only the exact candidate target for portable workflow-order coverage.' },
    ...binding,
    candidates: snapshot.draftCandidates!.map(candidate => ({
      candidateId: candidate.candidateId,
      payloadSha256: sha256(JSON.stringify(candidate.payload)),
      references: [{ classification: 'required' as const, reference: 'core#543', role: 'target' as const, reason: 'Exact synthetic candidate target.' }],
      actionRelations: [],
    })),
    unassignedReferences: [],
  }
  snapshot.stateDigest = actionStateDigest(pending.registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, {
    articleDate: date,
    roundId: snapshot.roundId,
    includePriorArticleRounds: true,
    draftCandidates: snapshot.draftCandidates,
    draftCandidateEvidence: snapshot.draftCandidateEvidence,
  })
  return ActionRegistrySchema.parse(pending.registry)
}

async function acceptedWorkspace() {
  vi.stubGlobal('fetch', async (url: unknown, options?: RequestInit) => {
    if (typeof url !== 'string') throw new Error('Unexpected non-string request')
    const method = options?.method ?? 'GET'
    const json = (value: unknown) => Response.json(value)
    if (method === 'GET' && url.endsWith(`/git/refs/heads/accept/${date}`)) return new Response('', { status: 404 })
    if (method === 'GET' && url.startsWith('/api/article-reviews?')) return json({ status: 'none' })
    if (method === 'GET' && url.endsWith('/git/refs/heads/main')) return json({ object: { sha: 'a'.repeat(40) } })
    if (method === 'GET' && url.includes(`/contents/_articles/${date}.md?ref=`)) return json({ content: Buffer.from(draft).toString('base64'), sha: 'b'.repeat(40), encoding: 'base64' })
    if (method === 'POST' && url.endsWith('/git/refs')) return json({})
    if (method === 'GET' && url.endsWith(`/git/commits/${'a'.repeat(40)}`)) return json({ tree: { sha: 'c'.repeat(40) } })
    if (method === 'POST' && url.endsWith('/git/trees')) {
      const body = JSON.parse(String(options?.body)) as { tree: Array<{ content: string }> }
      control.acceptedFromUi = body.tree[0]!.content
      return json({ sha: 'd'.repeat(40) })
    }
    if (method === 'POST' && url.endsWith('/git/commits')) return json({ sha: 'e'.repeat(40) })
    if (method === 'PATCH' && url.endsWith(`/git/refs/heads/accept/${date}`)) return json({})
    if (method === 'POST' && url.endsWith('/pulls')) return json({ number: 42, html_url: 'https://github.com/ojfbot/daily-logger/pull/42' })
    throw new Error(`Unexpected offline route ${method} ${url}`)
  })
  await stampDraft(date, 'Synthetic acceptance', 'fixture-owner')
  expect(control.acceptedFromUi).toMatch(/^status: "accepted"$/m)
  const accepted = stampOutcome(control.acceptedFromUi, 'accepted')
  expect(accepted).toMatch(/^outcome: accepted$/m)

  const root = mkdtempSync(join(tmpdir(), 'acceptance-status-transition-'))
  roots.push(root)
  mkdirSync(join(root, '_articles'))
  writeFileSync(join(root, `_articles/${date}.md`), accepted)
  const registry = preparedDraftRegistry()
  control.candidateIds = registry.articles[0]!.draftCandidates!.map(candidate => candidate.candidateId)
  writeActionStore(root, registry)
  return { root, registry, accepted }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  control.acceptedFromUi = ''
  control.candidateIds = []
  control.collectCalls = 0
  control.proposeCalls = 0
  control.verifyCalls = 0
  control.sdkCreate.mockClear()
  control.sdkCount.mockClear()
  control.github.mockClear()
})

it('persists and reuses the accepted review through the real stamper, outcome stamp, status reader, reconcile entry point, writer, and cache', async () => {
  const fixture = await acceptedWorkspace()
  vi.stubEnv('ACTION_REPO_ROOT', fixture.root)
  vi.stubEnv('ARTICLE_PATH', `_articles/${date}.md`)
  vi.stubEnv('ACTION_REVIEW_REQUEST', 'pull-request:42:clean-acceptance')
  vi.stubEnv('DRY_RUN', 'false')
  vi.stubEnv('MOCK_LLM', 'false')
  vi.stubEnv('EDITORIAL_FEEDBACK', '')
  vi.stubEnv('ACTION_REVIEW_DISABLED', 'false')
  vi.stubEnv('ACTION_EVIDENCE_REPLY', '')
  vi.stubEnv('ACTION_KEY', '')
  vi.spyOn(console, 'log').mockImplementation(() => {})

  await import('../../scripts/reconcile-actions.js')
  const first = readActionRegistry(fixture.root)
  const firstSnapshot = first.articles.find(article => article.date === date)!
  const firstMarkdown = readFileSync(join(fixture.root, `_articles/${date}.md`), 'utf8')
  expect(firstSnapshot).toMatchObject({
    status: 'accepted',
    review: { state: 'verified' },
    verification: { proposer: 'offline-acceptance-proposer', verifier: 'offline-acceptance-verifier' },
    draftCandidateEvidence: { provenance: { lineage: { kind: 'acceptance-status-refresh' } } },
  })
  expect(first.records).toEqual(fixture.registry.records)
  expect(firstSnapshot.draftCandidates?.map(candidate => candidate.payload)).toEqual(fixture.registry.articles[0]!.draftCandidates!.map(candidate => candidate.payload))
  expect(firstSnapshot.draftCandidateEvidence?.candidates).toEqual(fixture.registry.articles[0]!.draftCandidateEvidence?.candidates)
  expect(() => renderArticleActions(firstMarkdown, first, date, readArticleStatuses(fixture.root))).not.toThrow()
  expect([control.proposeCalls, control.verifyCalls]).toEqual([1, 1])

  vi.resetModules()
  await import('../../scripts/reconcile-actions.js')
  const second = readActionRegistry(fixture.root)
  expect(registryRevision(second)).toBe(registryRevision(first))
  expect(readFileSync(join(fixture.root, `_articles/${date}.md`), 'utf8')).toBe(firstMarkdown)
  expect([control.proposeCalls, control.verifyCalls]).toEqual([1, 1])
  expect(control.collectCalls).toBe(2)
  expect(control.sdkCreate).not.toHaveBeenCalled()
  expect(control.sdkCount).not.toHaveBeenCalled()
  expect(control.github).not.toHaveBeenCalled()
})

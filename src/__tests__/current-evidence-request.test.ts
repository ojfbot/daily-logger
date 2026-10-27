import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { readActionRegistry, readArticleStatuses, renderArticleActions } from '../action-registry.js'

const root = mkdtempSync(resolve(tmpdir(), 'current-evidence-request-'))
const date = '2026-10-23'
beforeAll(() => {
  const archive = execFileSync('git', ['archive', '4aa13c5169f898b9a007970452c0862d320a772a', 'actions', '_articles'], { cwd: new URL('../..', import.meta.url), maxBuffer: 32 * 1024 * 1024 })
  execFileSync('tar', ['-x', '-C', root], { input: archive })
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

it('does not present October23 historical #357 request as its latest #416 blocker', () => {
  const registry = readActionRegistry(root)
  const snapshot = registry.articles.find(article => article.date === date)
  expect(snapshot?.evidenceRequests?.[0]).toMatchObject({ id: '099dfcec9392f116ce8bea20872e6e72e4bd014665d1b9609c8f5b7e732ac804', sourceKey: 'github:daily-logger#357', status: 'open' })
  const before = JSON.stringify(snapshot)
  const markdown = readFileSync(resolve(root, '_articles', `${date}.md`), 'utf8')
  const html = renderArticleActions(markdown, registry, date, readArticleStatuses(root))
  expect(html).toContain('The current review did not record a specific evidence request')
  expect(html).toContain('<summary>Earlier evidence requests')
  expect(html).not.toContain('<strong>Evidence request pending:</strong>')
  expect(html).toContain('099dfcec9392f116ce8bea20872e6e72e4bd014665d1b9609c8f5b7e732ac804')
  expect(JSON.stringify(snapshot)).toBe(before)
  expect(html.match(/Needs review/g)).toHaveLength(3)
})

import { actionReviewEvidenceRequest } from '../review-actions.js'
import { actionEvidenceCaseDigest, actionEvidenceRequestReceipt, ActionEvidenceRequestError, createActionEvidenceRequest } from '../action-evidence-retrieval.js'
import { acceptanceActionCycle } from '../action-review-cycle.js'
import { actionEvidenceScope, prepareConservativeDraftCandidateEvidence } from '../action-evidence-selection.js'
import { sha256 } from '../action-registry.js'

function currentCase() {
  const registry = readActionRegistry(root)
  const prior = registry.articles.find(article => article.date === date)
  const markdown = readFileSync(resolve(root, '_articles', `${date}.md`), 'utf8')
  const articleStatuses = readArticleStatuses(root)
  const cycle = acceptanceActionCycle('fixture-only-no-authority', prior)
  if (!prior?.draftCandidates) throw new Error('Frozen October23 candidates missing')
  const draftCandidateEvidence = prepareConservativeDraftCandidateEvidence({ registry, articleDate: date, cycle, markdown, articleStatuses, draftCandidates: prior.draftCandidates })
  const content = 'CURRENT API STATE daily-logger#416: merged. PRIVATE_SOURCE_SENTINEL'
  const source = { id: `github:daily-logger#416@${sha256(content)}`, kind: 'github' as const, locator: 'https://github.com/ojfbot/daily-logger/pull/416', content }
  const input = { registry, articleDate: date, cycle, markdown, articleStatuses, feedback: '', sources: [source], draftCandidateEvidence }
  const scope = actionEvidenceScope(input)
  const keys = scope.reviewActionKeys.length ? scope.reviewActionKeys : scope.ambiguousTerminalActionKeys.length ? scope.ambiguousTerminalActionKeys : ['article-feedback']
  const body = { kind: 'source-view' as const, caseDigest: actionEvidenceCaseDigest({ ...input, actionKeys: keys }), articleDate: date, cycle, actionKeys: keys, sourceKey: 'github:daily-logger#416', source, question: 'Which exact ranges answer this current lifecycle question?', obligations: [sha256('controlled lifecycle obligation')] }
  const request = createActionEvidenceRequest(body)
  return { input, source, body, request }
}

it('captures only safe metadata from a full immutable request in the exact Accepted case', () => {
  const f = currentCase()
  expect(f.input.registry.articles.find(article => article.date === date)?.actionKeys).toEqual([])
  expect(f.request.actionKeys).toEqual(['article-feedback'])
  const receipt = actionReviewEvidenceRequest(new ActionEvidenceRequestError(f.request, 'PRIVATE_ERROR_SENTINEL'), f.input)
  expect(receipt).toEqual(actionEvidenceRequestReceipt(f.request))
  expect(JSON.stringify(receipt)).not.toContain('PRIVATE_')
  expect(receipt).not.toHaveProperty('question')
  expect(receipt).not.toHaveProperty('limits')
})

it.each(['id', 'date', 'case', 'cycle', 'source', 'scope'] as const)('rejects a mismatched %s before recording a current request', kind => {
  const f = currentCase()
  const request = kind === 'id' ? { ...f.request, id: '0'.repeat(64) }
    : createActionEvidenceRequest({ ...f.body,
      ...(kind === 'date' ? { articleDate: '2026-10-24' } : {}),
      ...(kind === 'case' ? { caseDigest: '0'.repeat(64) } : {}),
      ...(kind === 'cycle' ? { cycle: { phase: 'revision' as const, id: 'foreign-cycle' } } : {}),
      ...(kind === 'scope' ? { sourceKey: 'github:core#999' } : {}),
    })
  const input = kind === 'source' ? { ...f.input, sources: [{ ...f.source, content: f.source.content + ' changed' }] } : f.input
  expect(() => actionReviewEvidenceRequest(new ActionEvidenceRequestError(request, 'controlled'), input)).toThrow()
})

it('does not promote an arbitrary error cause into native evidence authority', () => {
  const f = currentCase()
  expect(actionReviewEvidenceRequest(new Error('unknown transport wrapper', { cause: new ActionEvidenceRequestError(f.request, 'controlled') }), f.input)).toBeUndefined()
})

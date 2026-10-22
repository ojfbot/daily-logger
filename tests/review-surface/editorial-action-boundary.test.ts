import { applyVerifiedActionReview } from '../../src/__tests__/evidence-view-fixtures.js'
import { revisionActionCycle } from '../../src/action-review-cycle.js'
import { actionFile } from '../../src/__tests__/action-store-fixture.js'
import { afterEach, expect, it, vi } from 'vitest'
import { createFixture, today } from './fixture.js'
import { createEditorialService, repo } from '../../api/_lib/editorial-continuation.js'
import { ActionRegistrySchema, isArticleFileInclusionChange } from '../../src/action-registry-schema.js'

import { stampDraft } from '../../packages/frontend/src/utils/stampDraft.ts'
import { loadEditorialActions } from '../../packages/frontend/src/utils/actionInclusion.ts'

afterEach(() => vi.unstubAllGlobals())
function setup() {
  const { state, github } = createFixture()
  const head = 'd'.repeat(40), articlePath = `_articles/${today}.md`
  const article = `---\ndate: ${today}\nstatus: draft\n---\nA reviewed draft.\n`
  const before = applyVerifiedActionReview({ cycle: revisionActionCycle('fixture'), registry: ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] }),
    articleDate: today, articleStatuses: new Map([[today, 'draft']]), markdown: article, roundId: 'd'.repeat(64),
    sources: [{ id: 'proof', kind: 'github', locator: 'fixture', content: 'The exact checkpoint requires review before the owner decides readiness.' }],
    proposal: { changes: [], suggestions: [{ command: '/pr-review', description: 'Review the exact checkpoint.', repo: 'daily-logger', target: '#42', outcome: 'Owner receives evidence', goal: 'Verified acceptance', goalCitations: [{ sourceId: 'proof', quote: 'requires review before the owner' }], factCitations: [{ sourceId: 'proof', quote: 'The exact checkpoint requires review' }], doneWhen: 'Review evidence is delivered.', gates: ['Owner decides readiness.'], existingKey: null }] },
    verification: { changes: [], suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'Grounded checkpoint.', existingKey: null }] } })
  const after = structuredClone(before)
  const record = after.records[0]; if (!record) throw new Error('Missing suggestion')
  record.includeInIndex = false; record.inclusionOverride = { include: false, actor: 'ojfbot', instruction: 'Explicit editorial inclusion checkbox' }
  state.refs.set(`accept/${today}`, head)
  state.refFiles.set(`${state.source}:${articlePath}`, article); state.refFiles.set(`${head}:${articlePath}`, article)
  state.refFiles.set(`${state.source}:actions/articles/${today}.json`, JSON.stringify(actionFile(before, today))); state.refFiles.set(`${head}:actions/articles/${today}.json`, JSON.stringify(actionFile(after, today)))
  return { state, github, head, articlePath, article, before, after }
}
it('recognizes only verified staged choices and returns the exact branch head', async () => {
  const f = setup()
  expect(await createEditorialService(f.github).load(today, 'ojfbot')).toEqual({ status: 'none', stagedHeadSha: f.head })
  expect(f.state.calls.every(call => call.startsWith('GET '))).toBe(true)
})
it.each(['other-date', 'history', 'baseline', 'actor', 'instruction', 'hidden-file', 'symlink', 'article', 'truncated-tree'])('staged-choice discovery rejects %s', async kind => {
  const f = setup(), record = f.after.records[0]; if (!record) throw new Error('Missing suggestion')
  if (kind === 'other-date') f.state.refFiles.set(`${f.head}:actions/articles/2026-10-13.json`, '{}')
  if (kind === 'history') record.history[0]!.reason = 'An unrelated rewrite'
  if (kind === 'baseline') f.state.refFiles.set(`${f.head}:actions/registry.json`, 'mutated imported baseline')
  if (kind === 'actor') record.inclusionOverride!.actor = 'someone-else'
  if (kind === 'instruction') record.inclusionOverride!.instruction = 'Unproven approval'
  if (kind === 'hidden-file') f.state.refFiles.set(`${f.head}:unreported.ts`, 'unreported code')
  if (kind === 'symlink') f.state.fileModes.set(`${f.head}:actions/articles/${today}.json`, '120000')
  if (kind === 'article') f.state.refFiles.set(`${f.head}:${f.articlePath}`, `${f.article}Unreviewed prose`)
  f.state.refFiles.set(`${f.state.source}:actions/articles/${today}.json`, JSON.stringify(actionFile(f.before, today))); f.state.refFiles.set(`${f.head}:actions/articles/${today}.json`, JSON.stringify(actionFile(f.after, today)))
  const github: typeof f.github = async (path, options) => kind === 'truncated-tree' && path.includes('/git/trees/') ? Response.json({ truncated: true, tree: [] }) : f.github(path, options)
  await expect(createEditorialService(github).load(today, 'ojfbot')).rejects.toThrow()
})
it('ref movement during discovery invalidates the observed choices', async () => {
  const f = setup(); let reads = 0
  const github: typeof f.github = async (path, options) => {
    if (path.endsWith(`/git/ref/heads/accept/${today}`) && ++reads > 1) return Response.json({ object: { sha: 'e'.repeat(40) } })
    return f.github(path, options)
  }
  await expect(createEditorialService(github).load(today, 'ojfbot')).rejects.toThrow('moved during discovery')
})
it.each([false, true])('real discovery binds the acceptance commit to its proven head; later movement=%s', async move => {
  const f = setup(), service = createEditorialService(f.github)
  const writes: string[] = []
  vi.stubGlobal('fetch', async (input: string, options?: RequestInit) => {
    const url = new URL(input, 'http://fixture'), method = options?.method ?? 'GET'
    if (url.pathname === '/api/article-reviews') return Response.json(await service.load(today, 'ojfbot'))
    const path = url.pathname.replace('/api/github', '')
    if (method !== 'GET') writes.push(`${method} ${path}`)
    if (path.endsWith(`/git/refs/heads/accept/${today}`) && method === 'GET') return Response.json({ object: { sha: f.head } })
    if (path.endsWith('/git/refs/heads/main')) return Response.json({ object: { sha: f.state.source } })
    if (path.endsWith('/git/trees') && method === 'POST') return Response.json({ sha: 'new-tree' })
    if (path.endsWith('/git/commits') && method === 'POST') {
      expect(JSON.parse(String(options?.body)).parents).toEqual([f.head])
      if (move) f.state.refs.set(`accept/${today}`, 'e'.repeat(40))
      return Response.json({ sha: 'new-commit' })
    }
    if (path.endsWith(`/git/refs/heads/accept/${today}`) && method === 'PATCH') {
      expect(JSON.parse(String(options?.body))).toEqual({ sha: 'new-commit', force: false })
      return Response.json({}, { status: f.state.refs.get(`accept/${today}`) === f.head ? 200 : 422 })
    }
    if (path.endsWith('/pulls') && method === 'POST') return Response.json({ number: 42, html_url: 'https://github.com/ojfbot/daily-logger/pull/42' })
    return f.github(`${path}${url.search}`, options)
  })
  const acceptance = stampDraft(today, 'Fixture', 'ojfbot')
  if (move) { await expect(acceptance).rejects.toThrow('branch moved'); expect(writes.some(write => write.endsWith('/pulls'))).toBe(false) }
  else expect(await acceptance).toMatchObject({ prNumber: 42 })
})
it('registry deltas cannot smuggle edits to another date or prior evidence', () => {
  const f = setup()
  expect(isArticleFileInclusionChange(actionFile(f.before, today), actionFile(f.after, today), 'OJFBOT')).toBe(true)
  f.after.records[0]!.history[0]!.description = 'Changed prior decision'
  expect(isArticleFileInclusionChange(actionFile(f.before, today), actionFile(f.after, today), 'OJFBOT')).toBe(false)
})
it('an instructed agent can retain an identified instruction through acceptance admission', async () => {
  const f = setup()
  f.after.records[0]!.inclusionOverride!.instruction = 'Explicit editorial inclusion instruction: Keep this suggestion in the article only.'
  f.state.refFiles.set(`${f.head}:actions/articles/${today}.json`, JSON.stringify(actionFile(f.after, today)))
  expect(await createEditorialService(f.github).load(today, 'ojfbot')).toMatchObject({ stagedHeadSha: f.head })
})
it('large canonical registries use their exact immutable Git blob in both service and browser reader', async () => {
  const f = setup(); f.state.largeFiles.add(`actions/articles/${today}.json`)
  expect(await createEditorialService(f.github).load(today, 'ojfbot')).toMatchObject({ stagedHeadSha: f.head })
  vi.stubGlobal('fetch', (input: string, options?: RequestInit) => {
    const url = new URL(input, 'http://fixture')
    if (url.pathname.endsWith(`/git/refs/heads/accept/${today}`)) return Response.json({ object: { sha: f.head } })
    return f.github(url.pathname.replace('/api/github', '') + url.search.replace(encodeURIComponent(`accept/${today}`), f.head), options)
  })
  const article = await (await f.github(`${repo}/contents/${f.articlePath}?ref=${f.head}`)).json()
  expect((await loadEditorialActions(today, article.sha)).file.suggestions[0]?.includeInIndex).toBe(false)
  expect(f.state.calls.some(call => call.includes('/git/blobs/'))).toBe(true)
})

it.each(['status', 'outcome'])('body %s changes cannot masquerade as status-only staging (F17)', async key => {
  const f = setup()
  f.state.refFiles.set(`${f.state.source}:${f.articlePath}`, `${f.article}\n${key}: before`)
  f.state.refFiles.set(`main:${f.articlePath}`, `${f.article}\n${key}: before`)
  f.state.refFiles.set(`${f.head}:${f.articlePath}`, `${f.article}\n${key}: after`)
  vi.stubGlobal('fetch', (input: string, options?: RequestInit) => {
    const url = new URL(input, 'http://fixture')
    if (url.pathname.endsWith(`/git/refs/heads/accept/${today}`)) return Response.json({ object: { sha: f.head } })
    return f.github(url.pathname.replace('/api/github', '') + url.search.replace(encodeURIComponent(`accept/${today}`), f.head), options)
  })
  const main = await (await f.github(`${repo}/contents/${f.articlePath}?ref=${f.state.source}`)).json()
  await expect(loadEditorialActions(today, main.sha)).rejects.toThrow('different article version')
})

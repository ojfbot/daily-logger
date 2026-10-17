import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractEditorialFeedback } from './extract-editorial-feedback.mjs'
import { stampDraft } from '../../packages/frontend/src/utils/stampDraft.ts'

function v2Body(notes) {
  const payload = Buffer.from(JSON.stringify({ version: 2, notes }), 'utf8').toString('base64')
  return `<!-- EDITORIAL_FEEDBACK_V2_START -->\n${payload}\n<!-- EDITORIAL_FEEDBACK_V2_END -->`
}

test('literal delimiters, headings, markers, and Unicode stay in their original notes', () => {
  const literal = 'Keep this line\n---\n## Section: Fake\n<!-- EDITORIAL_FEEDBACK_END -->\n雪'
  const extracted = extractEditorialFeedback(v2Body([
    { kind: 'root', content: literal },
    { kind: 'section', section: 'What shipped', content: 'Actual section note' },
  ]))
  const parsed = JSON.parse(extracted.slice(extracted.indexOf('[\n')))
  assert.deepEqual(parsed, [
    { kind: 'root', content: literal },
    { kind: 'section', section: 'What shipped', content: 'Actual section note' },
  ])
})

test('legacy PR feedback remains readable', () => {
  const body = '<!-- EDITORIAL_FEEDBACK_START -->\nFirst\n<!-- EDITORIAL_FEEDBACK_END --> inside note\nSecond\n<!-- EDITORIAL_FEEDBACK_END -->'
  assert.equal(extractEditorialFeedback(body), 'First\n<!-- EDITORIAL_FEEDBACK_END --> inside note\nSecond')
})

test('invalid v2 feedback fails closed', () => {
  assert.throws(() => extractEditorialFeedback('<!-- EDITORIAL_FEEDBACK_V2_START -->\nnot base64\n<!-- EDITORIAL_FEEDBACK_V2_END -->'))
  assert.throws(() => extractEditorialFeedback(v2Body([{ kind: 'root', content: '  ' }])))
  assert.throws(() => extractEditorialFeedback(v2Body([{ kind: 'other', content: 'Unknown' }])))
})

test('real stamper HTTP body reaches the workflow extractor without changing note boundaries', async (t) => {
  const date = '2026-10-10'
  const article = '---\nstatus: "draft"\n---\nFriday'
  const literal = ' \t\nKeep literal text\n---\n## Section: Fake\n<!-- EDITORIAL_FEEDBACK_START -->\n<!-- EDITORIAL_FEEDBACK_END -->\n<!-- EDITORIAL_FEEDBACK_V2_START -->\n<!-- EDITORIAL_FEEDBACK_V2_END -->\n雪 🦫 "quoted" \\path\n \t '
  const notes = [
    { kind: 'root', content: literal },
    { kind: 'root', content: 'Second root note' },
    { kind: 'section', section: 'What shipped', content: literal },
  ]
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    const method = options?.method ?? 'GET'
    if (url.includes('/api/article-reviews')) return Response.json({ status: 'none' })
    if (url.includes('/git/refs/heads/accept/') && method === 'GET') return new Response('{}', { status: 404 })
    if (url.includes('/contents/')) return Response.json({ content: Buffer.from(article).toString('base64'), sha: 'article-sha' })
    if (url.includes('/git/refs/heads/main')) return Response.json({ object: { sha: 'base-sha' } })
    if (url.includes('/git/commits/') && method === 'GET') return Response.json({ tree: { sha: 'base-tree' } })
    if (url.endsWith('/git/trees')) return Response.json({ sha: 'accepted-tree' })
    if (url.endsWith('/git/commits')) return Response.json({ sha: 'accepted-commit' })
    if (url.endsWith('/pulls')) return Response.json({ number: 42, html_url: 'https://example.invalid/pull/42' })
    return Response.json({})
  })

  assert.deepEqual(await stampDraft(date, 'Friday', 'editor', { version: 2, notes }), {
    prNumber: 42, prUrl: 'https://example.invalid/pull/42',
  })
  assert.equal(calls.length, 10)
  const tree = calls.find(call => call.url.endsWith('/git/trees'))
  assert.deepEqual(JSON.parse(tree.options.body), { base_tree: 'base-tree', tree: [{ path: `_articles/${date}.md`, mode: '100644', type: 'blob', content: article.replace('status: "draft"', 'status: "accepted"') }] })
  const commit = calls.find(call => call.url.endsWith('/git/commits'))
  assert.deepEqual(JSON.parse(commit.options.body), { message: `editorial: accept ${date} draft`, tree: 'accepted-tree', parents: ['base-sha'] })
  const update = calls.find(call => call.options?.method === 'PATCH')
  assert.deepEqual(JSON.parse(update.options.body), { sha: 'accepted-commit', force: false })
  const pr = calls.find(call => call.url.endsWith('/pulls'))
  assert.equal(pr.url, '/api/github/repos/ojfbot/daily-logger/pulls')
  assert.equal(pr.options.method, 'POST')
  assert.equal(pr.options.credentials, 'same-origin')
  assert.equal(pr.options.headers['X-Requested-With'], 'XMLHttpRequest')
  const payload = JSON.parse(pr.options.body)
  assert.equal(payload.base, 'main')
  assert.equal(payload.head, `accept/${date}`)
  const extracted = extractEditorialFeedback(payload.body)
  assert.deepEqual(JSON.parse(extracted.slice(extracted.indexOf('[\n'))), notes)
})

test('malformed v2 cannot fall back to otherwise valid legacy feedback', () => {
  const legacy = '\n<!-- EDITORIAL_FEEDBACK_START -->\nLegacy note\n<!-- EDITORIAL_FEEDBACK_END -->'
  const encode = (text) => `<!-- EDITORIAL_FEEDBACK_V2_START -->\n${Buffer.from(text).toString('base64')}\n<!-- EDITORIAL_FEEDBACK_V2_END -->`
  for (const text of ['{broken', '{"version":1,"notes":[]}', '{"version":2,"notes":[]}',
    '{"version":2,"notes":[{"kind":"section","section":" ","content":"note"}]}',
    '{"version":2,"notes":[{"kind":"root","content":1}]}']) {
    assert.throws(() => extractEditorialFeedback(encode(text) + legacy))
  }
  assert.throws(() => extractEditorialFeedback('<!-- EDITORIAL_FEEDBACK_V2_START -->' + legacy))
  assert.throws(() => extractEditorialFeedback('<!-- EDITORIAL_FEEDBACK_V2_START -->\n/x==\n<!-- EDITORIAL_FEEDBACK_V2_END -->' + legacy))
  assert.throws(() => extractEditorialFeedback('<!-- EDITORIAL_FEEDBACK_V2_START -->\n/w==\n<!-- EDITORIAL_FEEDBACK_V2_END -->' + legacy))
})

test('ordinary legacy and absent feedback remain compatible', () => {
  assert.equal(extractEditorialFeedback('No editorial feedback'), '')
  assert.equal(extractEditorialFeedback('<!-- EDITORIAL_FEEDBACK_START -->\nRoot note\n---\n## Section: What shipped\nSection note\n<!-- EDITORIAL_FEEDBACK_END -->'),
    'Root note\n---\n## Section: What shipped\nSection note')
})

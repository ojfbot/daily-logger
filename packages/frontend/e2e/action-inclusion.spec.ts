import { expect, test } from '@playwright/test'
import { applyVerifiedActionReview } from '../../../src/review-actions.js'
import { revisionActionCycle } from '../../../src/action-review-cycle.js'
import { ActionRegistrySchema, ArticleActionFileSchema, splitActionRegistry } from '../../../src/action-registry-schema.js'
import { readFileSync } from 'node:fs'

const date = '2026-10-18'
test('the reconciled October 17 article keeps completed and dismissed history collapsed without raw API metadata', async ({ page }) => {
  const reviewed = JSON.parse(readFileSync(new URL('../../../api/articles/2026-10-17.json', import.meta.url), 'utf8'))
  await page.route('**/api/entries.json', route => route.fulfill({ json: [reviewed] }))
  await page.route('**/api/articles/2026-10-17.json', route => route.fulfill({ json: reviewed }))
  await page.route('**/api/article-reviews**', route => route.fulfill({ status: 503, json: {} }))
  await page.goto('/articles/2026-10-17')
  const history = page.locator('details.suggestions-handled')
  const historySummary = history.locator(':scope > summary')
  await expect(history).toBeVisible()
  await expect(history).not.toHaveAttribute('open')
  await expect(historySummary).toContainText('Suggestions handled at draft')
  await historySummary.click()
  await expect(history).toHaveAttribute('open', '')
  await expect(history.locator('article')).toHaveCount(3)
  await expect(history.locator('article > strong')).toHaveText(['/adr · Dismissed', '/pr-review · Completed', '/close-pr · Dismissed'])
  await expect(history.locator('details[open]')).toHaveCount(0)
  await expect(history).not.toContainText('repository_url')
  expect(reviewed.commitCount).toBe(26)
})
const source = `---\ntitle: "Action review"\ndate: ${date}\nstatus: "draft"\n---\n## What's next\nReview the next checkpoint.\n`
function fixture() {
  return applyVerifiedActionReview({
    cycle: revisionActionCycle('browser-inclusion-fixture'),
    registry: ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] }),
    articleDate: date, articleStatuses: new Map([[date, 'draft']]), markdown: source, roundId: 'd'.repeat(64),
    sources: [{ id: 'proof', kind: 'github', locator: 'test proof', content: 'The next checkpoint requires the exact review.' }],
    proposal: { changes: [], suggestions: [{ command: '/pr-review', description: 'Review the exact acceptance checkpoint.', repo: 'daily-logger', target: '#372', outcome: 'Owner receives a bounded review', goal: 'Verified article acceptance', goalCitations: [{ sourceId: 'proof', quote: 'requires the exact review' }], factCitations: [{ sourceId: 'proof', quote: 'The next checkpoint requires' }], doneWhen: 'The owner receives review evidence.', gates: ['The owner decides readiness.'], existingKey: null }] },
    verification: { changes: [], suggestions: [{ candidateIndex: 0, verdict: 'pass', reason: 'A grounded next checkpoint.', existingKey: null }] },
  })
}

for (const conflict of [false, true]) {
  test(conflict ? 'rejects a conflicting checkbox save and keeps the server choice' : 'retains opt-out through reload and acceptance on the same editorial branch', async ({ page }, testInfo) => {
    let registry = fixture(), file = splitActionRegistry(registry).files[0], sha = 'registry-1', branch = false, articleSource = source
    let branchCreations = 0, writes = 0, opened = false
    const article = { date, title: 'Action review', summary: 'Verified suggestions.', tags: [], reposActive: [], commitCount: 0, activityType: 'build', schemaVersion: 2, status: 'draft', sourceBlobSha: 'article-1', actionSuggestions: registry.records, bodyHtml: '<h2>What shipped</h2><p>Reviewed work.</p><section class="suggested-actions-card" aria-labelledby="suggested-actions-fixture"><h3 id="suggested-actions-fixture">Suggested actions</h3><details class="suggestions-handled"><summary>Suggestions handled at draft <span>1</span></summary><article>Earlier suggestion · completed</article></details></section>' }
    await page.route('**/api/entries.json', route => route.fulfill({ json: [article] }))
    await page.route(`**/api/articles/${date}.json`, route => route.fulfill({ json: article }))
    await page.route('**/api/article-reviews**', route => new URL(route.request().url()).searchParams.get('view') === 'editorial' ? route.fulfill({ json: { status: 'none', ...(branch ? { stagedHeadSha: 'a'.repeat(40) } : {}) } }) : route.fulfill({ json: { schemaVersion: 1, date, observedAt: '2026-10-18T12:00:00Z', sourceCommitSha: 'b'.repeat(40), currentBlobSha: article.sourceBlobSha, visibleBlobSha: article.sourceBlobSha, discovery: 'registered_and_eligible_pull_requests', requestTarget: null, entries: [], unavailable: [], requests: [], pullRequests: [], correspondence: [] } }))
    await page.route('**/api/github/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname.replace('/api/github/', ''), method = request.method()
      if (path.endsWith(`/git/refs/heads/accept/${date}`) && method === 'GET') return route.fulfill({ status: branch ? 200 : 404, json: branch ? { object: { sha: 'a'.repeat(40) } } : {} })
      if (path.endsWith('/git/refs/heads/main')) return route.fulfill({ json: { object: { sha: 'main-1' } } })
      if (path.endsWith('/git/refs') && method === 'POST') { branch = true; branchCreations++; return route.fulfill({ status: 201, json: {} }) }
      if (path.endsWith(`/contents/_articles/${date}.md`)) {
        if (method === 'PUT') { articleSource = Buffer.from(request.postDataJSON().content, 'base64').toString('utf8'); return route.fulfill({ json: {} }) }
        return route.fulfill({ json: { sha: 'article-1', content: Buffer.from(articleSource).toString('base64') } })
      }
      if (path.endsWith(`/contents/actions/articles/${date}.json`)) {
        if (method === 'PUT') {
          writes++
          const body = request.postDataJSON()
          expect(body.sha).toBe(sha)
          expect(body.branch).toBe(`accept/${date}`)
          expect(request.headers()['x-requested-with']).toBe('XMLHttpRequest')
          if (conflict) return route.fulfill({ status: 409, json: { message: 'SHA conflict' } })
          file = ArticleActionFileSchema.parse(JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'))); sha = 'registry-2'
          return route.fulfill({ json: {} })
        }
        return route.fulfill({ json: { sha, content: Buffer.from(JSON.stringify(file)).toString('base64') } })
      }
      if (path.includes('/git/commits/') && method === 'GET') return route.fulfill({ json: { tree: { sha: 'tree-1' } } })
      if (path.endsWith('/git/trees') && method === 'POST') { articleSource = request.postDataJSON().tree[0].content; return route.fulfill({ json: { sha: 'tree-2' } }) }
      if (path.endsWith('/git/commits') && method === 'POST') return route.fulfill({ json: { sha: 'commit-1' } })
      if (path.endsWith(`/git/refs/heads/accept/${date}`) && method === 'PATCH') { expect(request.postDataJSON().force).toBe(false); return route.fulfill({ json: {} }) }
      if (path.endsWith('/pulls') && method === 'GET') return route.fulfill({ json: [] })
      if (path.endsWith('/pulls') && method === 'POST') { opened = true; return route.fulfill({ status: 201, json: { number: 42, html_url: 'https://github.com/ojfbot/daily-logger/pull/42' } }) }
      return route.fulfill({ status: 500, json: { message: `Unexpected ${method} ${path}` } })
    })
    await page.goto(`/articles/${date}`)
    const checkbox = page.getByRole('checkbox', { name: 'Include in master actions index' })
    await expect(checkbox).toBeEnabled(); await expect(checkbox).toBeChecked()
    await checkbox.click()
    if (conflict) {
      await expect(page.getByRole('alert').filter({ hasText: 'not confirmed' })).toBeVisible()
      await expect(checkbox).toBeDisabled()
      expect(file.suggestions[0].includeInIndex).toBe(true)
    } else {
      await expect(checkbox).toBeEnabled(); await expect(checkbox).not.toBeChecked()
      expect(file.suggestions[0].inclusionOverride?.actor).toBe('dev')
      await page.reload(); await expect(checkbox).toBeEnabled(); await expect(checkbox).not.toBeChecked()
      await page.getByRole('button', { name: 'ACCEPT DRAFT', exact: true }).click()
      await expect(page.locator('.stamp-success')).toContainText('PR #42 opened')
      expect(opened).toBe(true); expect(branchCreations).toBe(1); expect(articleSource).toContain('status: "accepted"')
      expect(file.suggestions[0].includeInIndex).toBe(false)
      await testInfo.attach('action-review', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    }
    expect(writes).toBe(1)
  })
}

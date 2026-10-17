import { writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { createFixture, makePullRequest, blob, today } from '../../../tests/review-surface/fixture.js'
import { createEditorialService } from '../../../api/_lib/editorial-continuation.js'
import { createReviewService } from '../../../api/_lib/article-review-service.js'
import { editorialInputSchema } from '../../../shared/article-review.js'

test('reload recovers acceptance; literal Save preserves history and explicit Request binds reviewed head', async ({ page }, testInfo) => {
  const fixture = createFixture(); fixture.state.login = 'ojfbot'
  const pr = makePullRequest(42)
  fixture.state.acceptPullNumbers.push(42)
  fixture.state.pullRequests.set(42, { ...pr, body: 'Original submitted notes 雪\n  ', head: { ...pr.head, ref: `accept/${today}` } })
  fixture.state.pullFiles.set(42, [{ filename: `_articles/${today}.md`, status: 'modified' }])
  fixture.state.refFiles.set(`${pr.head.sha}:_articles/${today}.md`, 'Pinned PR-head article. This differs from the main-visible article.')
  const editorial = createEditorialService(fixture.github), reviews = createReviewService(fixture.github)
  const writes: unknown[] = [], unexpected: string[] = []
  let discoveryFails = false
  const article = { date: today, title: 'Continued feedback fixture', summary: 'Fixture', tags: [], reposActive: [], commitCount: 0,
    activityType: 'development', schemaVersion: 2, status: 'draft', sourceBlobSha: blob, bodyHtml: '<h2>What shipped</h2><p>Main-visible article.</p>' }
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:4040') return route.continue()
    unexpected.push(route.request().url()); return route.abort('blockedbyclient')
  })
  await page.route('**/api/auth/me', route => route.fulfill({ json: { login: 'ojfbot', authorized: true, avatarUrl: '', name: 'Shared owner account' } }))
  await page.route('**/api/entries.json', route => route.fulfill({ json: [article] }))
  await page.route(`**/api/articles/${today}.json`, route => route.fulfill({ json: article }))
  await page.route('**/api/github/**', route => { unexpected.push(route.request().url()); return route.fulfill({ status: 500, json: {} }) })
  await page.route('**/api/article-reviews**', async route => {
    try {
      const request = route.request(), url = new URL(request.url())
      if (request.method() === 'GET') {
        if (url.searchParams.get('view') === 'editorial') return route.fulfill({ status: discoveryFails ? 503 : 200, json: discoveryFails ? { error: 'Fixture outage' } : await editorial.load(today, 'ojfbot') })
        return route.fulfill({ json: await reviews.load(today, blob) })
      }
      expect(request.headers()['x-requested-with']).toBe('XMLHttpRequest')
      const input = editorialInputSchema.parse(request.postDataJSON()); writes.push(input)
      return route.fulfill({ json: await editorial.write(input, 'ojfbot') })
    } catch (error) { return route.fulfill({ status: 409, json: { error: String(error) } }) }
  })
  await page.goto(`/articles/${today}`)
  await expect(page.locator('.editorial-sidebar')).toBeVisible()
  await testInfo.attach('initial-observed-state', { body: await page.screenshot({ fullPage: true, path: testInfo.outputPath('initial-observed-state.png') }), contentType: 'image/png' })
  const panel = page.getByRole('region', { name: 'Continue editorial feedback' })
  await expect(panel).toBeVisible()
  await expect(page.getByRole('button', { name: 'ACCEPT DRAFT', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(panel).toBeVisible()
  await panel.getByText('Original submitted feedback and PR receipt', { exact: true }).click()
  await expect(panel.getByText('Original submitted notes 雪', { exact: false })).toBeVisible()
  await panel.getByText('PR-head article preview', { exact: true }).click()
  await expect(panel.getByText('Pinned PR-head article. This differs from the main-visible article.', { exact: true })).toBeVisible()
  await expect(panel.getByText(blob, { exact: true })).toBeVisible()
  const literal = ' \t雪 e\u0301 😀\n---\n@claude /run\n<!-- EDITORIAL_CONTINUATION_V1_START -->\n '
  await panel.getByLabel('Edit suggestion', { exact: true }).fill(literal)
  await panel.getByRole('button', { name: 'Save new feedback version', exact: true }).click()
  await expect(panel.getByText('Saved feedback version', { exact: false })).toBeVisible()
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ intent: 'append_editorial_feedback', feedback: { notes: [{ content: literal }] } })
  await expect(panel.getByRole('button', { name: 'Request another article revision', exact: true })).toBeDisabled()
  await page.reload()
  await expect(panel).toBeVisible()
  await panel.getByText('Saved feedback version', { exact: false }).click()
  const savedLiteral = panel.locator('pre').filter({ hasText: '@claude /run' })
  await expect(savedLiteral).toBeVisible()
  expect(await savedLiteral.textContent()).toBe(literal)
  await expect(panel.getByLabel('Edit suggestion', { exact: true })).toHaveValue(literal)
  await panel.getByLabel('I reviewed this pinned PR-head article').check()
  await panel.getByRole('button', { name: 'Request another article revision', exact: true }).click()
  await expect(panel.getByText('A revision request is outstanding.', { exact: false })).toBeVisible()
  expect(writes).toHaveLength(2)
  expect(writes[1]).toMatchObject({ intent: 'request_editorial_revision', headSha: pr.head.sha, pullRequest: 42 })
  expect(fixture.state.pullRequests.get(42)?.body).toBe('Original submitted notes 雪\n  ')
  expect(fixture.state.calls.filter(call => !call.startsWith('GET '))).toEqual(Array(2).fill('POST /repos/ojfbot/daily-logger/issues/42/comments'))
  await panel.getByText('A revision request is outstanding.', { exact: false }).scrollIntoViewIfNeeded()
  await testInfo.attach('continued-feedback-and-request', { body: await page.screenshot({ fullPage: true, path: testInfo.outputPath('continued-feedback-and-request.png') }), contentType: 'image/png' })
  writeFileSync(testInfo.outputPath('intercepted-writes.json'), JSON.stringify({ writes, githubWrites: fixture.state.calls.filter(call => !call.startsWith('GET ')), unexpected }, null, 2))
  await testInfo.attach('intercepted-writes', { body: JSON.stringify({ writes, githubWrites: fixture.state.calls.filter(call => !call.startsWith('GET ')), unexpected }, null, 2), contentType: 'application/json' })
  discoveryFails = true
  await page.reload()
  await expect(page.getByRole('button', { name: 'ACCEPT DRAFT', exact: true })).toBeDisabled()
  expect(unexpected.filter(url => !/fonts\.(?:googleapis|gstatic)\.com/.test(url))).toEqual([])
})

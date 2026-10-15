import { expect, test, type Page } from '@playwright/test'
import { z } from 'zod'
import { createReviewService } from '../../../api/_lib/article-review-service.js'
import { requestSchema } from '../../../shared/article-review.js'
import { browserArticle, readArticleSnapshot } from '../../../tests/review-surface/article-snapshots.js'
import { blob, createFixture, recordPath, review, today } from '../../../tests/review-surface/fixture.js'

type Fixture = ReturnType<typeof createFixture>
async function mount(page: Page, fixture: Fixture, date: string, visibleBlob: string) {
  const service = createReviewService(fixture.github)
  const baseURL = test.info().project.use.baseURL
  if (!baseURL) throw new Error('Browser base URL is required')
  const origin = new URL(baseURL).origin
  const article = browserArticle(fixture.state.source, date)
  expect(article.sourceBlobSha).toBe(visibleBlob)
  const browserWrites: string[] = []
  page.on('request', (request) => { if (request.method() !== 'GET') browserWrites.push(`${request.method()} ${new URL(request.url()).pathname}`) })
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== origin) return route.abort('blockedbyclient')
    if (url.pathname.startsWith('/api/github')) return route.fulfill({ status: 500, body: 'Acceptance path must not be used' })
    return route.continue()
  })
  await page.route('**/api/entries.json', (route) => route.fulfill({ json: [article] }))
  await page.route(`**/api/articles/${date}.json`, (route) => route.fulfill({ json: article }))
  await page.route('**/api/article-reviews**', async (route) => {
    try {
      const request = route.request()
      if (request.method() === 'GET') {
        const url = new URL(request.url())
        return route.fulfill({ json: await service.load(date, url.searchParams.get('visibleBlobSha')) })
      }
      expect(request.headers()['x-requested-with']).toBe('XMLHttpRequest')
      return route.fulfill({ json: await service.requestChanges(requestSchema.parse(request.postDataJSON()), 'editor') })
    } catch (error) { return route.fulfill({ status: 409, json: { error: error instanceof Error ? error.message : 'Unknown failure' } }) }
  })
  await page.goto(`/articles/${date}`)
  return { browserWrites, service }
}

test('today: editor and agent agree; request changes preserves exact text and existing editorial notes without acceptance', async ({ page }, testInfo) => {
  const fixture = createFixture()
  const { service, browserWrites } = await mount(page, fixture, today, blob)
  const panel = page.locator('.independent-reviews')
  await expect(panel.getByText('Published review record')).toBeVisible()
  await expect(panel.getByText('Matches visible article')).toBeVisible()
  await panel.getByText('Review identity and scope').click()
  await expect(panel.getByText(review.article.sourceCommitSha, { exact: true })).toBeVisible()
  await panel.locator('.independent-review-finding summary').first().click()
  await panel.getByLabel('Select C1 for revision feedback').check()
  await panel.getByRole('button', { name: 'Add selected corrections to feedback' }).click()
  const exact = ' \t\n雪\n---\n<!-- EDITORIAL_FEEDBACK_V2_END -->\nKeep this feedback verbatim. @ClAuDe @codex @copilot\n\t '
  await panel.getByLabel('Revision feedback', { exact: true }).fill(exact)
  await page.locator('.editorial-note textarea').first().fill('Existing editorial note must remain')
  await page.reload()
  await expect(panel.getByLabel('Revision feedback', { exact: true })).toHaveValue(exact)
  await expect(page.locator('.editorial-note textarea').first()).toHaveValue('Existing editorial note must remain')
  const machine = await service.load(today, blob)
  await testInfo.attach('machine-before', { body: JSON.stringify(machine, null, 2), contentType: 'application/json' })
  await panel.getByRole('button', { name: 'Request changes on #357', exact: true }).click()
  await expect(panel.getByText('Revision request recorded.', { exact: false })).toBeVisible()
  expect(browserWrites).toEqual(['POST /api/article-reviews'])
  expect(fixture.state.calls.filter((call) => !call.startsWith('GET '))).toEqual(['POST /repos/ojfbot/daily-logger/issues/357/comments'])
  expect(fixture.state.comments[0]?.body).toContain('request_changes')
  expect(fixture.state.comments[0]?.body).not.toContain('@')
  const encoded = fixture.state.comments[0]?.body.split('<!-- ARTICLE_REVIEW_REQUEST_V1_START -->')[1]?.split('<!-- ARTICLE_REVIEW_REQUEST_V1_END -->')[0]?.trim() ?? ''
  expect(z.object({ feedback: z.string() }).parse(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))).feedback).toBe(exact)
  await expect(page.locator('.editorial-note textarea').first()).toHaveValue('Existing editorial note must remain')
  await testInfo.attach('recorded-request', { body: JSON.stringify(fixture.state.comments, null, 2), contentType: 'application/json' })
  await testInfo.attach('no-acceptance-side-effects', { body: JSON.stringify({ browserWrites, githubWrites: fixture.state.calls.filter((call) => !call.startsWith('GET ')), articleBlobUnchanged: readArticleSnapshot(fixture.state.source, today).blobSha === blob }), contentType: 'application/json' })
  await panel.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: testInfo.outputPath('today-request-recorded.png') })
})

test('historical T1 walkthrough: original pin can request correction, then changed article makes it stale', async ({ page }, testInfo) => {
  const fixture = createFixture()
  const historicalSha = '457809f46579052c829ab8c2abe704ff644bdbf5'
  const historicalBlob = '31c1ef985938a48d1c3648ee9acb36f81893de74'
  fixture.state.source = historicalSha
  const { browserWrites } = await mount(page, fixture, '2026-10-13', historicalBlob)
  const panel = page.locator('.independent-reviews')
  await expect(panel.getByText('Matches visible article')).toBeVisible()
  await panel.locator('.independent-review-finding summary').first().click()
  await expect(panel.getByText('T1 a dependency on T2 fixtures', { exact: false })).toBeVisible()
  await panel.getByLabel('Select C1 for revision feedback').check()
  await panel.getByRole('button', { name: 'Add selected corrections to feedback' }).click()
  await panel.getByRole('button', { name: 'Request changes on #357', exact: true }).click()
  await expect(panel.getByText('Revision request recorded.', { exact: false })).toBeVisible()
  fixture.state.source = 'ce04d6762fa5a8e5dff59388849e3ea164aff940'
  await page.route('**/api/articles/2026-10-13.json', (route) => route.fulfill({ json: browserArticle(fixture.state.source, '2026-10-13') }))
  await page.reload()
  await expect(panel.getByText('Stale: article changed; a fresh review is needed')).toBeVisible()
  await panel.locator('.independent-review-finding summary').first().click()
  await expect(panel.getByLabel('Select C1 for revision feedback')).toBeDisabled()
  expect(browserWrites).toEqual(['POST /api/article-reviews'])
  await testInfo.attach('historical-walkthrough-controls', { body: JSON.stringify({ fixture: true, historicalSha, historicalBlob, changedSource: fixture.state.source, browserWrites, comments: fixture.state.comments }), contentType: 'application/json' })
})

test('narrow screen: proposed records, unknown data and network failure stay distinct and retain feedback', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const fixture = createFixture()
  fixture.state.registry.records = []
  fixture.state.registry.proposals = [{ date: today, path: recordPath, pullRequest: 999, headSha: fixture.state.prHead }]
  await mount(page, fixture, today, blob)
  const panel = page.locator('.independent-reviews')
  await expect(panel.getByText('Proposed, unmerged review record')).toBeVisible()
  await panel.locator('.independent-review-finding summary').first().click()
  await panel.getByLabel('Select C1 for revision feedback').focus()
  await page.keyboard.press('Space')
  await panel.getByLabel('Revision feedback', { exact: true }).fill('Retain after failure')
  fixture.state.outage = true
  await panel.getByRole('button', { name: 'Request changes on #357', exact: true }).click()
  await expect(panel.getByText('Your feedback is retained.', { exact: false })).toBeVisible()
  await expect(panel.getByLabel('Revision feedback', { exact: true })).toHaveValue('Retain after failure')
  expect(fixture.state.comments).toEqual([])
  fixture.state.outage = false
  fixture.state.prHead = 'b'.repeat(40)
  await panel.getByRole('button', { name: 'Refresh reviews and request history' }).click()
  await expect(panel.getByRole('alert')).toContainText('head changed')
  await expect(panel.getByText('No eligible registered review was found. This is not a clean-review verdict.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await panel.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: testInfo.outputPath('narrow-unavailable.png') })
})

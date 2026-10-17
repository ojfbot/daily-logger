import { writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { createFixture, makePullRequest, blob, today } from '../../../tests/review-surface/fixture.js'
import { createEditorialService } from '../../../api/_lib/editorial-continuation.js'
import { createReviewService } from '../../../api/_lib/article-review-service.js'
import { editorialInputSchema } from '../../../shared/article-review.js'

for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 740 }]) {
test(`continued feedback preserves identity and usable controls at ${viewport.width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize(viewport)
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
  const geometry = await panel.locator('textarea').first().evaluate(input => {
    const row = input.closest('.editorial-note')
    const label = row?.querySelector('label')
    if (!row || !label) throw new Error('Missing labelled editor row')
    return { inputWidth: input.getBoundingClientRect().width, rowWidth: row.getBoundingClientRect().width,
      labelDisplay: getComputedStyle(label).display, labelBottom: label.getBoundingClientRect().bottom,
      inputTop: input.getBoundingClientRect().top, font: getComputedStyle(input).fontFamily,
      fontSize: parseFloat(getComputedStyle(input).fontSize), fontLineHeight: parseFloat(getComputedStyle(input).lineHeight) }
  })
  const targets = await panel.locator('button').evaluateAll(buttons => buttons.map(button => ({ label: button.textContent, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })))
  writeFileSync(testInfo.outputPath('initial-geometry.json'), JSON.stringify({ viewport, geometry, targets }, null, 2))
  expect(geometry.labelDisplay).toBe('block')
  expect(geometry.labelBottom).toBeLessThanOrEqual(geometry.inputTop)
  expect(geometry.inputWidth).toBeGreaterThanOrEqual(geometry.rowWidth - 2)
  expect(geometry.fontSize).toBeGreaterThanOrEqual(16)
  expect(geometry.fontLineHeight).toBeGreaterThanOrEqual(geometry.fontSize * 1.5)
  expect(geometry.font).not.toMatch(/mono/i)
  for (const target of targets) { expect(target.height, target.label ?? '').toBeGreaterThanOrEqual(44); expect(target.width, target.label ?? '').toBeGreaterThanOrEqual(44) }
  await expect(panel.getByRole('button', { name: 'Copy prior version', exact: true })).toBeDisabled()
  await expect(panel.getByText('Save a feedback version before requesting another revision.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ACCEPT DRAFT', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(panel).toBeVisible()
  await panel.getByText('Original submitted feedback and PR receipt', { exact: true }).click()
  await expect(panel.getByText('Original submitted notes 雪', { exact: false })).toBeVisible()
  await panel.getByText('PR-head article preview', { exact: true }).click()
  await expect(panel.getByText('Pinned PR-head article. This differs from the main-visible article.', { exact: true })).toBeVisible()
  await expect(panel.getByText(blob, { exact: true })).toBeVisible()
  const literal = ' \t雪 e\u0301 😀\n---\n@claude /run\n<!-- EDITORIAL_CONTINUATION_V1_START -->\n' + 'An editorial sentence with enough words to exercise wrapping and growth. '.repeat(30) + '\n '
  const fields = panel.locator('textarea.editorial-input')
  await fields.nth(0).fill('Remove A')
  await panel.getByRole('button', { name: 'Add another edit suggestion', exact: true }).click()
  await fields.nth(1).fill('Keep B')
  await panel.getByRole('button', { name: 'Add another edit suggestion', exact: true }).click()
  const survivor = await fields.nth(2).elementHandle(); if (!survivor) throw new Error('Missing surviving note')
  const originalId = await survivor.getAttribute('id')
  await fields.nth(2).fill(literal)
  await fields.nth(2).evaluate(input => { input.focus(); input.setSelectionRange(3, 8) })
  const removalTarget = await panel.getByRole('button', { name: 'Remove continued suggestion 1', exact: true }).boundingBox()
  if (!removalTarget) throw new Error('Missing remove target')
  expect(removalTarget.height).toBeGreaterThanOrEqual(44); expect(removalTarget.width).toBeGreaterThanOrEqual(44)
  expect((await panel.locator('.editorial-review-confirmation').boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await panel.getByRole('button', { name: 'Remove continued suggestion 1', exact: true }).evaluate(button => button.click())
  expect(await survivor.evaluate(input => ({ connected: input.isConnected, active: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd, id: input.id, value: input.value }))).toEqual({ connected: true, active: true, start: 3, end: 8, id: originalId, value: literal })
  const prose = await fields.nth(1).evaluate(input => ({ height: input.getBoundingClientRect().height, scroll: input.scrollHeight, client: input.clientHeight, outline: parseFloat(getComputedStyle(input).outlineWidth), viewport: window.visualViewport?.height ?? innerHeight }))
  expect(prose.height).toBeGreaterThan(128)
  expect(prose.height).toBeLessThanOrEqual(prose.viewport * .6 + 2)
  expect(prose.scroll).toBeGreaterThan(prose.client)
  expect(prose.outline).toBeGreaterThanOrEqual(2)
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await fields.nth(1).press('Tab')
  const focused = await page.evaluate(() => ({ tag: document.activeElement?.tagName, outline: document.activeElement ? parseFloat(getComputedStyle(document.activeElement).outlineWidth) : 0 }))
  expect(focused.tag).toBe('BUTTON'); expect(focused.outline).toBeGreaterThanOrEqual(2)
  await testInfo.attach('focused-editor', { body: await page.screenshot({ path: testInfo.outputPath('focused-editor.png') }), contentType: 'image/png' })
  writeFileSync(testInfo.outputPath('editor-geometry.json'), JSON.stringify({ viewport, geometry, targets, removalTarget, prose, focused }, null, 2))
  await panel.getByRole('button', { name: 'Save new feedback version', exact: true }).click()
  await expect(panel.getByText('Saved feedback version', { exact: false })).toBeVisible()
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ intent: 'append_editorial_feedback', feedback: { notes: [{ kind: 'root', content: 'Keep B' }, { kind: 'root', content: literal }] } })
  await expect(panel.getByRole('button', { name: 'Request another article revision', exact: true })).toBeDisabled()
  await page.reload()
  await expect(panel).toBeVisible()
  await panel.getByText('Saved feedback version', { exact: false }).click()
  const savedLiteral = panel.locator('pre').filter({ hasText: '@claude /run' })
  await expect(savedLiteral).toBeVisible()
  expect(await savedLiteral.textContent()).toBe(literal)
  await expect(panel.getByLabel('Edit suggestion', { exact: true }).nth(1)).toHaveValue(literal)
  await expect(panel.getByText('Review the pinned PR-head article before requesting its revision.', { exact: true })).toBeVisible()
  await panel.getByLabel('Edit suggestion', { exact: true }).nth(1).fill('Unsaved change')
  await expect(panel.getByRole('button', { name: 'Request another article revision', exact: true })).toBeDisabled()
  await expect(panel.getByText('Save the edited full version before requesting it.', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Copy prior version', exact: true }).click()
  await expect(panel.getByLabel('Edit suggestion', { exact: true }).nth(1)).toHaveValue(literal)
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
}

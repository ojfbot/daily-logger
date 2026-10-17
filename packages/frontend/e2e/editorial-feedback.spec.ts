import { expect, test } from '@playwright/test'
import { z } from 'zod'
import { commentSchema } from '../../../shared/article-review.ts'

const date = '2026-10-11'
const title = 'Editorial browser fixture'
const literalEditorialNote = ' \t“café” — cafe\u0301 🧭\n\nKeep **literal Markdown**, `pnpm test`, <tag>, & symbols.  Two spaces.\n<!-- EDITORIAL_FEEDBACK_END -->\n' + 'A paragraph about the shipped change and its visible result. '.repeat(24) + '\n \t '
const article = {
  date,
  title,
  summary: 'A draft for browser verification.',
  tags: [],
  reposActive: [],
  commitCount: 0,
  activityType: 'development',
  schemaVersion: 2,
  status: 'draft',
  sourceBlobSha: 'a'.repeat(40),
  bodyHtml: '<h2>What shipped</h2><p>The first claim needs review.</p>',
}

test('restores notes and submits the surviving note with section feedback once', async ({ page }, testInfo) => {
  const githubCalls: string[] = []
  let pullRequestBody = ''
  let savedNote: unknown
  let modelCalls = 0

  // Deny unexpected external traffic; all editorial writes below are intercepted.
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:4040') return route.continue()
    return route.abort('blockedbyclient')
  })

  await page.route('**/api/entries.json', (route) => route.fulfill({ json: [article] }))
  await page.route(`**/api/articles/${date}.json`, (route) => route.fulfill({ json: article }))
  await page.route('https://api.anthropic.com/v1/messages', (route) => {
    modelCalls++
    return route.fulfill({ status: 500, json: { error: 'No provider call expected' } })
  })
  await page.route('**/api/article-reviews**', (route) => {
    if (route.request().method() === 'POST') {
      const message = commentSchema.parse(route.request().postDataJSON())
      savedNote = message
      return route.fulfill({ json: { requestId: message.requestId, url: 'https://github.com/ojfbot/daily-logger/issues/357#issuecomment-1', reused: false } })
    }
    return route.fulfill({ json: { schemaVersion: 1, date, observedAt: '2026-10-16T12:00:00Z', sourceCommitSha: 'b'.repeat(40), currentBlobSha: article.sourceBlobSha, visibleBlobSha: article.sourceBlobSha, discovery: 'registered_and_eligible_pull_requests', requestTarget: { issueNumber: 357, kind: 'pilot_issue', contextUrl: 'https://github.com/ojfbot/daily-logger/issues/357' }, entries: [], unavailable: [], requests: [], pullRequests: [], correspondence: [] } })
  })
  await page.route('**/api/github/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/github/', '')
    githubCalls.push(`${request.method()} ${path}`)

    if (request.method() === 'GET' && path.endsWith(`/git/refs/heads/accept/${date}`)) {
      await route.fulfill({ status: 404, json: { message: 'Not Found' } })
    } else if (request.method() === 'GET' && path.endsWith(`/_articles/${date}.md`)) {
      await route.fulfill({ json: {
        content: Buffer.from(`---\nstatus: "draft"\n---\n${title}`).toString('base64'),
        sha: 'fixture-article-sha',
        encoding: 'base64',
      } })
    } else if (request.method() === 'GET' && path.endsWith('/git/refs/heads/main')) {
      await route.fulfill({ json: { object: { sha: 'fixture-main-sha' } } })
    } else if (request.method() === 'POST' && path.endsWith('/git/refs')) {
      await route.fulfill({ status: 201, json: {} })
    } else if (request.method() === 'PUT' && path.endsWith(`/_articles/${date}.md`)) {
      await route.fulfill({ json: {} })
    } else if (request.method() === 'POST' && path.endsWith('/pulls')) {
      pullRequestBody = z.object({ body: z.string() }).parse(request.postDataJSON()).body
      await route.fulfill({ status: 201, json: {
        number: 42,
        html_url: 'https://github.com/ojfbot/daily-logger/pull/42',
      } })
    } else {
      await route.fulfill({ status: 500, json: { message: `Unexpected mocked request: ${path}` } })
    }
  })

  await page.goto(`/articles/${date}`)
  const notes = page.locator('.editorial-note textarea')
  await expect(notes).toHaveCount(1)
  await notes.nth(0).fill('Remove this note')
  await page.getByRole('button', { name: 'Add another edit suggestion' }).click()
  await notes.nth(1).fill('Surviving note')

  await page.reload()
  await expect(notes).toHaveCount(2)
  await expect(notes.nth(0)).toHaveValue('Remove this note')
  await expect(notes.nth(1)).toHaveValue('Surviving note')
  await testInfo.attach('restored-notes', {
    body: JSON.stringify([await notes.nth(0).inputValue(), await notes.nth(1).inputValue()]),
    contentType: 'application/json',
  })
  await page.getByRole('button', { name: 'Remove edit suggestion 1' }).click()
  await expect(notes).toHaveCount(1)
  await expect(notes).toHaveValue('Surviving note')
  await notes.fill(literalEditorialNote)

  await page.getByRole('button', { name: 'New chat thread for What shipped' }).click()
  await page.getByPlaceholder('Write a note or question...').fill('Section note')
  await page.locator('.chat-thread .chat-send-btn').click()
  await expect(page.locator('.chat-thread-messages')).toContainText('Section note')
  await expect(page.getByRole('link', { name: 'Saved on GitHub' })).toBeVisible()
  expect(savedNote).toMatchObject({ content: 'Section note', visibleBlobSha: article.sourceBlobSha, speaker: { kind: 'human' } })
  expect(modelCalls).toBe(0)

  const submittedInput = await notes.elementHandle()
  await page.getByRole('button', { name: 'ACCEPT WITH REVISIONS' }).click()
  await expect(page.locator('.stamp-success')).toContainText('PR #42 opened')
  if (!submittedInput) throw new Error('Missing submitted input')
  const cleanup = await submittedInput.evaluate(async (input) => {
    let styleChanges = 0
    const observer = new MutationObserver((records) => { styleChanges += records.length })
    observer.observe(input, { attributes: true, attributeFilter: ['style'] })
    window.dispatchEvent(new Event('resize'))
    window.visualViewport?.dispatchEvent(new Event('resize'))
    document.fonts?.dispatchEvent(new Event('loadingdone'))
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    observer.disconnect()
    return { connected: input.isConnected, styleChanges }
  })
  expect(cleanup).toEqual({ connected: false, styleChanges: 0 })
  await testInfo.attach('unmounted-input-cleanup', { body: JSON.stringify(cleanup), contentType: 'application/json' })
  await testInfo.attach('intercepted-editorial-submission', {
    body: JSON.stringify({ githubCalls, pullRequestBody }, null, 2),
    contentType: 'application/json',
  })
  expect(githubCalls).toEqual([
    `GET repos/ojfbot/daily-logger/git/refs/heads/accept/${date}`,
    `GET repos/ojfbot/daily-logger/contents/_articles/${date}.md`,
    'GET repos/ojfbot/daily-logger/git/refs/heads/main',
    'POST repos/ojfbot/daily-logger/git/refs',
    `PUT repos/ojfbot/daily-logger/contents/_articles/${date}.md`,
    'POST repos/ojfbot/daily-logger/pulls',
  ])
  expect(pullRequestBody).not.toContain('Remove this note')

  const v2 = pullRequestBody.match(/<!-- EDITORIAL_FEEDBACK_V2_START -->\n([^\n]+)\n<!-- EDITORIAL_FEEDBACK_V2_END -->/)?.[1]
  if (v2) {
    const feedback = JSON.parse(Buffer.from(v2, 'base64').toString('utf8'))
    expect(feedback).toEqual({ version: 2, notes: [
      { kind: 'root', content: literalEditorialNote },
      { kind: 'section', section: 'What shipped', content: 'Section note' },
    ] })
  } else {
    const feedback = pullRequestBody.match(/<!-- EDITORIAL_FEEDBACK_START -->\n([\s\S]*?)\n<!-- EDITORIAL_FEEDBACK_END -->/)?.[1]
    expect(feedback).toBe(`## Root-level edit suggestion\n\n${literalEditorialNote}\n\n---\n\n## Section: What shipped\n\n- Section note`)
  }
})


test('editorial prose grows, stays viewport bounded and preserves note identity', async ({ page }, testInfo) => {
  const mutations: string[] = []
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:4040') return route.continue()
    if (!['fonts.googleapis.com', 'fonts.gstatic.com'].includes(new URL(route.request().url()).hostname)) mutations.push(route.request().url())
    return route.abort('blockedbyclient')
  })
  await page.route('**/api/**', (route) => {
    if (route.request().method() !== 'GET') mutations.push(route.request().url())
    return route.fulfill({ status: 404, json: {} })
  })
  await page.route('**/api/entries.json', (route) => route.fulfill({ json: [article] }))
  await page.route(`**/api/articles/${date}.json`, (route) => route.fulfill({ json: article }))
  await page.route('**/api/article-reviews**', (route) => route.fulfill({ json: {
    schemaVersion: 1, date, observedAt: '2026-10-16T12:00:00Z', sourceCommitSha: 'b'.repeat(40),
    currentBlobSha: article.sourceBlobSha, visibleBlobSha: article.sourceBlobSha,
    discovery: 'registered_and_eligible_pull_requests', requestTarget: { issueNumber: 357, kind: 'pilot_issue', contextUrl: 'https://github.com/ojfbot/daily-logger/issues/357' },
    entries: [], unavailable: [], requests: [], pullRequests: [], correspondence: [],
  } }))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/articles/${date}`)
  const notes = page.locator('.editorial-note textarea')
  await expect(notes).toHaveCount(1)
  const first = notes.nth(0)
  const initialHeight = await first.evaluate((el) => el.getBoundingClientRect().height)
  await first.fill(literalEditorialNote)
  await expect(first).toBeInViewport({ ratio: .95 })
  await testInfo.attach('desktop-prose', { body: await page.screenshot(), contentType: 'image/png' })
  const measure = () => first.evaluate((el) => {
    const style = getComputedStyle(el)
    return { height: el.getBoundingClientRect().height, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight,
      viewportHeight: window.visualViewport?.height ?? innerHeight }
  })
  const desktop = await measure()
  await testInfo.attach('desktop-geometry', { body: JSON.stringify({ initialHeight, ...desktop }), contentType: 'application/json' })
  for (const [width, height] of [[390, 844], [320, 360]]) {
    await page.setViewportSize({ width, height })
    await first.scrollIntoViewIfNeeded()
    await testInfo.attach(`initial-view-${width}x${height}`, { body: await page.screenshot(), contentType: 'image/png' })
    await testInfo.attach(`initial-geometry-${width}x${height}`, { body: JSON.stringify(await measure()), contentType: 'application/json' })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  expect.soft(desktop.fontFamily).toContain('IBM Plex Sans')
  expect.soft(desktop.fontSize).toBe('16px')
  expect.soft(desktop.lineHeight).toBe('25.6px')
  expect.soft(desktop.height).toBeGreaterThan(initialHeight + 100)
  expect.soft(desktop.height).toBeLessThanOrEqual(desktop.viewportHeight * .6 + 1)
  expect(desktop.scrollHeight).toBeGreaterThan(desktop.clientHeight)
  await expect(page.locator('.editorial-note-label')).toHaveText('Edit suggestion')

  // The same mounted node keeps focus, caret and literal text as a wrapped edit grows.
  await first.focus()
  await first.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(20, 20))
  const scrollBefore = await page.evaluate(() => ({ document: document.documentElement.scrollTop, column: document.querySelector('.chat-column')?.scrollTop }))
  await first.pressSequentially('inserted ')
  expect(await page.evaluate(() => ({ document: document.documentElement.scrollTop, column: document.querySelector('.chat-column')?.scrollTop }))).toEqual(scrollBefore)
  const edited = literalEditorialNote.slice(0, 20) + 'inserted ' + literalEditorialNote.slice(20)
  await expect(first).toHaveValue(edited)
  expect(await first.evaluate((el: HTMLTextAreaElement) => ({ active: el === document.activeElement, start: el.selectionStart, end: el.selectionEnd })))
    .toEqual({ active: true, start: 29, end: 29 })
  await first.press('Tab')
  await expect(page.getByRole('button', { name: 'Add another edit suggestion' })).toBeFocused()

  await page.getByRole('button', { name: 'Add another edit suggestion' }).click()
  const second = notes.nth(1)
  await second.fill('Short second note.')
  const secondId = await second.getAttribute('id')
  expect(await second.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(200)
  await page.reload()
  await expect(notes).toHaveCount(2)
  await expect(first).toHaveValue(edited)
  expect((await measure()).height).toBeGreaterThan(initialHeight + 100)
  await expect(second).toHaveValue('Short second note.')
  await second.focus()
  // Removing an earlier note through the real control must preserve the surviving DOM identity.
  const survivingNode = await second.elementHandle()
  await page.getByRole('button', { name: 'Remove edit suggestion 1' }).click()
  await expect(notes).toHaveCount(1)
  expect(await first.getAttribute('id')).toBe(secondId)
  expect(await survivingNode?.evaluate((el) => el.isConnected)).toBe(true)
  await expect(first).toHaveValue('Short second note.')

  await first.fill('First line.')
  const shortHeight = (await measure()).height
  await first.press('End')
  for (let line = 0; line < 7; line++) {
    await first.press('Enter')
    await first.pressSequentially('Another editorial line.')
  }
  expect((await measure()).height).toBeGreaterThan(shortHeight + 50)

  // Chromium's native composition path exercises the controlled input during IME updates.
  await first.fill('Composition: ')
  await first.press('End')
  const browser = await page.context().newCDPSession(page)
  await browser.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
  await expect(first).toBeFocused()
  await browser.send('Input.imeSetComposition', { text: '日本語', selectionStart: 3, selectionEnd: 3 })
  await browser.send('Input.insertText', { text: '日本語' })
  await expect(first).toHaveValue('Composition: 日本語')

  await first.fill(literalEditorialNote)
  await page.setViewportSize({ width: 1440, height: 1400 })
  await expect.poll(async () => (await measure()).height).toBe(640)
  for (const [width, height] of [[390, 844], [844, 390], [320, 360]]) {
    await page.setViewportSize({ width, height })
    await expect.poll(async () => (await measure()).height).toBeLessThanOrEqual(height * .6 + 1)
    await expect(first).toHaveValue(literalEditorialNote)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await first.scrollIntoViewIfNeeded()
    await testInfo.attach(`prose-${width}x${height}`, { body: await page.screenshot(), contentType: 'image/png' })
  }
  await first.evaluate((el) => { el.scrollTop = el.scrollHeight })
  expect(await first.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)).toBe(true)
  await browser.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 })
  await expect.poll(async () => (await measure()).height).toBeLessThanOrEqual(360 * .3 + 1)
  await expect(first).toHaveValue(literalEditorialNote)
  await testInfo.attach('visual-viewport-cap', { body: JSON.stringify(await measure()), contentType: 'application/json' })
  await browser.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
  await browser.detach()
  await first.fill('Short again.')
  expect((await measure()).height).toBeLessThan(200)
  await page.setViewportSize({ width: 390, height: 844 })
  const widthSample = 'An editorial sentence with enough words to wrap at a narrower width. '.repeat(2)
  await first.fill(widthSample)
  const widerHeight = (await measure()).height
  await first.evaluate((el) => { el.style.width = '150px'; el.style.flex = 'none' })
  await expect.poll(async () => (await measure()).height).toBeGreaterThan(widerHeight + 50)
  await expect(first).toHaveValue(widthSample)
  await first.evaluate((el) => { el.style.width = ''; el.style.flex = '' })
  await first.fill(literalEditorialNote)
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  await expect.poll(async () => (await measure()).fontSize).toBe('32px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; document.documentElement.dataset.theme = 'dark' })
  await first.focus()
  // Keyboard navigation establishes :focus-visible rather than relying on programmatic focus alone.
  await first.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(first).toBeFocused()
  expect(await first.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px')
  await testInfo.attach('dark-keyboard-focus', { body: await page.screenshot(), contentType: 'image/png' })
  expect(mutations).toEqual([])
  expect(browserErrors).toEqual([])
})

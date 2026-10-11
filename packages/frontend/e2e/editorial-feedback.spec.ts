import { expect, test } from '@playwright/test'

const date = '2026-10-11'
const title = 'Editorial browser fixture'
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
  bodyHtml: '<h2>What shipped</h2><p>The first claim needs review.</p>',
}

test('restores notes and submits the surviving note with section feedback once', async ({ page }) => {
  const githubCalls: string[] = []
  let pullRequestBody = ''

  await page.addInitScript(() => localStorage.setItem('dl-anthropic-key', 'browser-fixture-key'))
  await page.route('**/api/entries.json', (route) => route.fulfill({ json: [article] }))
  await page.route(`**/api/articles/${date}.json`, (route) => route.fulfill({ json: article }))
  await page.route('https://api.anthropic.com/v1/messages', (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'data: {"type":"content_block_delta","delta":{"text":"Acknowledged."}}\n\ndata: [DONE]\n\n',
  }))
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
      pullRequestBody = (request.postDataJSON() as { body: string }).body
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
  await page.getByRole('button', { name: 'Remove edit suggestion 1' }).click()
  await expect(notes).toHaveCount(1)
  await expect(notes).toHaveValue('Surviving note')

  await page.getByRole('button', { name: 'New chat thread for What shipped' }).click()
  await page.getByPlaceholder('Ask or suggest changes...').fill('Section note')
  await page.locator('.chat-thread .chat-send-btn').click()
  await expect(page.locator('.chat-thread-messages')).toContainText('Section note')

  await page.getByRole('button', { name: 'ACCEPT WITH REVISIONS' }).click()
  await expect(page.locator('.stamp-success')).toContainText('PR #42 opened')
  expect(githubCalls).toHaveLength(6)
  expect(pullRequestBody).not.toContain('Remove this note')

  const v2 = pullRequestBody.match(/<!-- EDITORIAL_FEEDBACK_V2_START -->\n([^\n]+)\n<!-- EDITORIAL_FEEDBACK_V2_END -->/)?.[1]
  if (v2) {
    const feedback = JSON.parse(Buffer.from(v2, 'base64').toString('utf8'))
    expect(feedback.notes).toEqual([
      { kind: 'root', content: 'Surviving note' },
      { kind: 'section', section: 'What shipped', content: 'Section note' },
    ])
  } else {
    const feedback = pullRequestBody.match(/<!-- EDITORIAL_FEEDBACK_START -->\n([\s\S]*?)\n<!-- EDITORIAL_FEEDBACK_END -->/)?.[1]
    expect(feedback).toBe('## Root-level edit suggestion\n\nSurviving note\n\n---\n\n## Section: What shipped\n\n- Section note')
  }
})

import { expect, test, type Page } from '@playwright/test'

async function mountTimeArticle(page: Page, text = '09:10Z', at = '2026-10-14T09:10:00.000Z', inlineCode = false) {
  const article = {
    date: '2026-10-14', title: 'Time reference browser fixture', summary: 'An evidence-resolved event clock.',
    tags: [], reposActive: [], commitCount: 1, activityType: 'development', schemaVersion: 2, status: 'accepted',
    codeReferences: [], bodyHtml: `<h2>What shipped</h2><p>The change merged at ${inlineCode ? `<code>${text}</code>` : text}. Unresolved recurring clock: ${text}.</p>`,
    timeReferences: [{ text, occurrence: 0, at, precision: 'minute', evidence: {
      kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '359', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/359',
    } }],
  }
  const origin = new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:4040').origin
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  await page.route('**/api/*.json', route => route.fulfill({ json: [] }))
  await page.route('**/api/entries.json', route => route.fulfill({ json: [article] }))
  await page.route('**/api/articles/2026-10-14.json', route => route.fulfill({ json: article }))
  await page.route('**/api/article-reviews**', route => route.fulfill({ status: 503, json: { error: 'No review fixture' } }))
  await page.goto('/articles/2026-10-14')
  await expect(page.locator('.time-ref')).toHaveCount(1)
  return { requests, trigger: page.locator('.time-ref'), popover: page.locator('.time-popover') }
}

test.describe('browser timezone day/night popover', () => {
  test.use({ timezoneId: 'America/Chicago' })

  test('plain prose hover survives moving into the map, shows historical device time, Escape dismisses and keyboard reopens', async ({ page }, testInfo) => {
    const { requests, trigger, popover } = await mountTimeArticle(page)
    const beforeOpen = requests.length
    await trigger.hover()
    await expect(popover).toBeVisible()
    await expect(popover.locator('.time-clock-utc')).toContainText('09:10')
    await expect(popover.locator('.time-clock-viewer')).toContainText('04:10')
    await expect(popover.locator('.time-clock-viewer')).toContainText('America/Chicago')
    await expect(popover.locator('.time-clock-viewer')).toContainText('UTC−05:00')
    await expect(popover.locator('.time-clock').first()).toHaveClass('time-clock time-clock-viewer')
    await expect(popover.locator('.time-map-viewer')).toHaveCSS('stroke', 'rgb(109, 189, 255)')
    await expect(popover.locator('.time-map-viewer')).toHaveCSS('stroke-dasharray', 'none')
    await expect(popover.locator('.time-map-utc')).toHaveCSS('stroke', 'rgb(255, 208, 132)')
    await expect(popover.locator('.time-map-utc')).toHaveCSS('stroke-dasharray', '4px, 2px')
    await expect(popover.locator('svg')).toHaveAttribute('aria-label', /Solid blue marks your time zone's UTC offset; dashed amber marks Greenwich/)
    await expect(popover).toContainText('Blue shows your clock’s UTC offset')
    await expect(trigger).toHaveAttribute('aria-describedby', await popover.getAttribute('id') ?? '')
    await popover.locator('svg').hover()
    await page.waitForTimeout(300)
    await expect(popover).toBeVisible()
    expect(requests.slice(beforeOpen)).toEqual([])
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('Tab')
    await trigger.focus()
    await expect(popover).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    await trigger.click()
    await expect(popover).toBeVisible()
    await popover.locator('svg').click()
    await expect(popover).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Tab')
    await expect(popover).toHaveCount(0)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await trigger.click()
    await expect(popover).toBeVisible()
    await page.locator('h1').click()
    await expect(popover).toHaveCount(0)
    await trigger.click()
    await expect(popover).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('time-popover-chicago.png') })
  })

  test('uses the event date through DST and date rollover', async ({ page }) => {
    const { trigger, popover } = await mountTimeArticle(page, '00:10Z', '2026-01-01T00:10:00.000Z')
    await trigger.click()
    await expect(popover.locator('.time-clock-utc')).toContainText('2026-01-01')
    await expect(popover.locator('.time-clock-viewer')).toContainText('2025-12-31')
    await expect(popover.locator('.time-clock-viewer')).toContainText('18:10')
    await expect(popover.locator('.time-clock-viewer')).toContainText('UTC−06:00')
  })

  test('inline-code clocks use the time evidence gate and keep the map open on hover', async ({ page }) => {
    const { trigger, popover } = await mountTimeArticle(page, '09:10Z', '2026-10-14T09:10:00.000Z', true)
    await expect(page.locator('code .time-ref')).toHaveCount(1)
    await trigger.hover()
    await expect(popover).toBeVisible()
    await popover.locator('svg').hover()
    await page.waitForTimeout(300)
    await expect(popover).toBeVisible()
    await expect(page.locator('code')).not.toHaveClass(/code-ref/)
  })
})

test.describe('UTC mobile popover', () => {
  test.use({ timezoneId: 'UTC', viewport: { width: 320, height: 568 }, hasTouch: true })

  test('tap displays separate coincident meridians and stacked captions within a narrow viewport', async ({ page }, testInfo) => {
    const { trigger, popover } = await mountTimeArticle(page)
    await trigger.tap()
    await expect(popover).toBeVisible()
    await expect(popover).toContainText('Both clocks share Greenwich')
    expect(await popover.locator('.time-map-utc').getAttribute('x1')).toBe('178')
    expect(await popover.locator('.time-map-viewer').getAttribute('x1')).toBe('182')
    const box = await popover.boundingBox()
    expect(box).not.toBeNull()
    if (!box) return
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(568)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('time-popover-utc-mobile.png') })
    await trigger.tap()
    await expect(popover).toHaveCount(0)
  })
})

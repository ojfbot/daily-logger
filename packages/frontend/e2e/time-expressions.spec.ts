import { expect, test, type Page } from '@playwright/test'
import type { TimeExpression, TimeExpressionMember } from '../../../src/time-reference-schema.ts'
import type { ShipmentTime } from '../../../src/shipment-times.ts'
import type { IssueTime } from '../../../src/issue-times.ts'

function member(text: string, at: string, certainty: 'exact' | 'approximate' = 'exact'): TimeExpressionMember {
  return { text, precision: 'minute', certainty, resolution: { kind: 'supported', at, evidence: { kind: 'explicit-offset', value: at } } }
}
const dst: TimeExpression = {
  kind: 'interval', text: '06:30–07:30Z', occurrence: 0, relation: 'elapsed',
  start: member('06:30', '2026-11-01T06:30:00.000Z'), end: member('07:30Z', '2026-11-01T07:30:00.000Z'),
}
async function mount(page: Page, bodyHtml: string, timeReferences: unknown[], metadata: { shipmentTimes?: ShipmentTime[]; issueTimes?: IssueTime[] } = {}) {
  const article = {
    date: '2026-10-18', title: 'Related event clocks', summary: 'Controlled source-backed grouped times.',
    tags: [], reposActive: [], commitCount: 1, activityType: 'development', schemaVersion: 2, status: 'draft',
    codeReferences: [], bodyHtml: `<h2>What shipped</h2>${bodyHtml}`, timeReferences, ...metadata,
  }
  const origin = new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:4040').origin
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  await page.route('**/api/*.json', route => route.fulfill({ json: [] }))
  await page.route('**/api/entries.json', route => route.fulfill({ json: [article] }))
  await page.route('**/api/articles/2026-10-18.json', route => route.fulfill({ json: article }))
  await page.route('**/api/article-reviews**', route => route.fulfill({ status: 503, json: { error: 'No review fixture' } }))
  await page.goto('/articles/2026-10-18')
  await expect(page.locator('h1')).toHaveText(article.title)
  return { trigger: page.locator('.time-ref'), panel: page.locator('.time-popover'), requests }
}

test.describe('existing map popovers on clustered PR timestamps', () => {
  test.use({ timezoneId: 'America/Chicago' })

  test('authored clusters coexist with canonical shipment, unavailable and issue controls after rendering and reload', async ({ page }) => {
    const source = (ref: string) => ({ repo: 'ojfbot/daily-logger', ref, url: `https://github.com/ojfbot/daily-logger/pull/${ref}` })
    const metadata = {
      shipmentTimes: [
        { status: 'available', source: source('369'), at: '2026-11-01T06:30:00.000Z' },
        { status: 'available', source: source('371'), at: '2026-11-01T07:30:00.000Z' },
        { status: 'unavailable', source: source('500'), reason: 'missing-merge-time' },
      ],
      issueTimes: [{ source: { repo: 'ojfbot/daily-logger', ref: '386', url: 'https://github.com/ojfbot/daily-logger/issues/386' }, event: 'created', at: '2026-10-18T15:57:36.000Z' }],
    } satisfies { shipmentTimes: ShipmentTime[]; issueTimes: IssueTime[] }
    const { panel } = await mount(page,
      '<p>PRs <a href="https://github.com/ojfbot/daily-logger/pull/369">#369</a> and <a href="https://github.com/ojfbot/daily-logger/pull/371">#371</a> merged at <strong>06:30</strong> and 07:30Z.</p>'
      + '<p><a href="https://github.com/ojfbot/daily-logger/pull/500/files">#500 files</a>; issue <a href="https://github.com/ojfbot/daily-logger/issues/386">#386</a>.</p>',
      [{ kind: 'list', text: '06:30 and 07:30Z', occurrence: 0, members: [dst.start, dst.end] }], metadata)
    for (const reload of [false, true]) {
      if (reload) await page.reload()
      await expect(page.locator('.shipment-time-ref')).toHaveCount(2)
      await expect(page.locator('.issue-time-ref')).toHaveCount(1)
      await expect(page.locator('.shipment-time-unavailable')).toHaveText(' · timestamp unavailable')
      await expect(page.locator('a[href$="/issues/386"] + .shipment-time-state')).toHaveCount(0)
      for (const [text, at] of [['06:30', '2026-11-01T06:30:00.000Z'], ['07:30Z', '2026-11-01T07:30:00.000Z']]) {
        await page.getByRole('button', { name: `${text}; show UTC and your local time`, exact: true }).click()
        await expect(panel.locator('.time-clock-utc time')).toHaveAttribute('datetime', at)
        await expect(panel.locator('svg')).toHaveCount(1)
        await page.keyboard.press('Escape')
      }
      await page.locator('a[href$="/pull/371"] + .shipment-time-state button').click()
      await expect(panel.locator('.time-clock-viewer')).toContainText('UTC−06:00')
      await page.keyboard.press('Escape')
      await page.locator('.issue-time-ref').click()
      await expect(panel.locator('.time-clock-utc time')).toHaveAttribute('datetime', metadata.issueTimes[0].at)
      await expect(panel).not.toContainText('Related event times')
      await expect(panel.getByRole('button')).toHaveCount(0)
      await page.keyboard.press('Escape')
    }
  })

  test('each formatted timestamp opens the existing clock/map through its own historical offset', async ({ page }, testInfo) => {
    const { trigger, panel, requests } = await mount(page, '<p>PRs #369 and #371 merged at <strong>06:30</strong> and 07:30Z.</p>', [{ kind: 'list', text: '06:30 and 07:30Z', occurrence: 0, members: [dst.start, dst.end] }])
    await expect(trigger).toHaveText(['06:30', '07:30Z'])
    await expect(page.locator('.article-content p').first()).toHaveText('PRs #369 and #371 merged at 06:30 and 07:30Z.')
    await trigger.nth(0).focus()
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('role', 'tooltip')
    await expect(panel.locator('.time-popover-heading')).toHaveText('The same moment, two clocks')
    await expect(panel.locator('.time-clock-viewer')).toContainText('UTC−05:00')
    await expect(panel.locator('.time-clock-viewer time')).toHaveText('01:30')
    await expect(panel.locator('.time-clock-utc time')).toHaveText('06:30')
    await expect(panel.locator('.time-map-viewer')).toHaveAttribute('x1', '105')
    await panel.locator('svg').hover()
    await expect(panel).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await trigger.nth(1).click()
    await expect(panel.locator('.time-clock-viewer')).toContainText('UTC−06:00')
    await expect(panel.locator('.time-clock-utc time')).toHaveText('07:30')
    await expect(panel.locator('.time-map-viewer')).toHaveAttribute('x1', '90')
    await expect(panel.locator('svg')).toHaveCount(1)
    await expect(panel.locator('time')).toHaveCount(2)
    await expect(panel).not.toContainText('Related event times')
    await expect(panel).not.toContainText('Elapsed time')
    await expect(panel.getByRole('button')).toHaveCount(0)
    const before = requests.length
    await panel.locator('svg').click()
    await expect(panel).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(panel).toHaveCount(0)
    expect(requests.slice(before)).toEqual([])
    await trigger.nth(1).click()
    await page.screenshot({ path: testInfo.outputPath('cluster-existing-popover.png') })
  })

  test('approximate clustered events use the same map with an approximation note; unknowns stay plain', async ({ page }) => {
    const approximate: TimeExpression = { ...dst, text: 'around 06:30–07:30Z', relation: 'event-span', start: { ...dst.start, certainty: 'approximate' }, end: { ...dst.end, certainty: 'approximate' } }
    const unknown: TimeExpression = { ...dst, text: '09:10–09:20Z', start: { text: '09:10', precision: 'minute', certainty: 'exact', resolution: { kind: 'unresolved', reason: 'historical-claim-required' } }, end: { text: '09:20Z', precision: 'minute', certainty: 'exact', resolution: { kind: 'unresolved', reason: 'missing-date' } }, relation: 'unestablished' }
    const { trigger, panel } = await mount(page, '<p>around 06:30–07:30Z.</p><p>09:10–09:20Z.</p>', [approximate, unknown])
    await expect(trigger).toHaveText(['around 06:30', '07:30Z'])
    await trigger.nth(1).click()
    await expect(panel.locator('.time-clock-viewer time')).toHaveText('~01:30')
    await expect(panel.locator('.time-clock-utc time')).toHaveText('~07:30')
    await expect(panel).toContainText('The article states this time approximately.')
    await expect(panel.locator('svg')).toHaveCount(1)
    await expect(page.locator('.article-content p').nth(1)).toHaveText('09:10–09:20Z.')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('the next event keeps its own source even when a flat reference overlaps the list', async ({ page }) => {
    const list: TimeExpression = { kind: 'list', text: '2026-10-14T09:10Z and 2026-10-14T09:20Z', occurrence: 0, members: [member('2026-10-14T09:10Z', '2026-10-14T09:10:00.000Z'), member('2026-10-14T09:20Z', '2026-10-14T09:20:00.000Z')] }
    const flat = { text: '2026-10-14T09:10Z', occurrence: 0, at: '2026-10-14T09:10:00.000Z', precision: 'minute', evidence: { kind: 'explicit-offset', value: '2026-10-14T09:10Z' } }
    const { trigger, panel } = await mount(page, `<p>${list.text}, respectively.</p>`, [flat, list])
    await expect(trigger).toHaveCount(2)
    await trigger.nth(1).click()
    await expect(panel.locator('.time-clock-viewer time')).toHaveText('04:20')
    await expect(panel.locator('.time-clock-utc time')).toHaveText('09:20')
    await expect(panel.locator('time').first()).toHaveAttribute('datetime', '2026-10-14T09:20:00.000Z')
  })

  test('the actual October 17 article serves ordinary maps for all four independently verified clustered PR events', async ({ page }, testInfo) => {
    const origin = new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:4040').origin
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    await page.goto('/articles/2026-10-17')
    const events = [
      { text: '~19:28', local: '~14:28', utc: '~19:28', at: '2026-10-16T19:28:00.000Z' },
      { text: '19:42Z', local: '~14:42', utc: '~19:42', at: '2026-10-16T19:42:31.000Z' },
      { text: '~18:15', local: '~13:15', utc: '~18:15', at: '2026-10-16T18:15:07.000Z' },
      { text: '18:21Z', local: '~13:21', utc: '~18:21', at: '2026-10-16T18:21:35.000Z' },
    ]
    for (const event of events) {
      await page.getByRole('button', { name: `${event.text}; show UTC and your local time`, exact: true }).click()
      const panel = page.locator('.time-popover')
      await expect(panel).toHaveAttribute('role', 'tooltip')
      await expect(panel.locator('.time-popover-heading')).toHaveText('The same moment, two clocks')
      await expect(panel.locator('.time-clock-viewer time')).toHaveText(event.local)
      await expect(panel.locator('.time-clock-viewer time')).toHaveAttribute('datetime', event.at)
      await expect(panel.locator('.time-clock-viewer')).toContainText('2026-10-16')
      await expect(panel.locator('.time-clock-viewer')).toContainText('UTC−05:00')
      await expect(panel.locator('.time-clock-utc time')).toHaveText(event.utc)
      await expect(panel.locator('svg')).toHaveCount(1)
      await expect(panel).not.toContainText('Related event times')
      await page.keyboard.press('Escape')
    }
    await page.getByRole('button', { name: '19:42Z; show UTC and your local time', exact: true }).click()
    await page.screenshot({ path: testInfo.outputPath('actual-oct17-existing-map.png') })
  })

  test('malformed network records cannot produce maps', async ({ page }) => {
    const { trigger } = await mount(page, '<p>06:30–07:30Z.</p>', [{ ...dst, start: { ...dst.start, resolution: { kind: 'supported', at: '2026-02-30T06:30:00.000Z', evidence: { kind: 'explicit-offset', value: '2026-02-30T06:30Z' } } } }])
    await expect(trigger).toHaveCount(0)
  })
})

test.describe('existing popover on clustered times with touch and fractional offsets', () => {
  test.use({ timezoneId: 'Asia/Kathmandu', viewport: { width: 320, height: 568 }, hasTouch: true })

  test('tap on each event retains the existing map, local date rollover and viewport bounds', async ({ page }, testInfo) => {
    const list: TimeExpression = { kind: 'list', text: '23:40 and 23:50Z', occurrence: 0, members: [member('23:40', '2026-10-14T23:40:00.000Z'), member('23:50Z', '2026-10-14T23:50:00.000Z')] }
    const { trigger, panel } = await mount(page, `<p>${list.text}.</p>`, [list])
    await trigger.nth(1).tap()
    await expect(panel).toBeVisible()
    await expect(panel.locator('.time-clock-viewer')).toContainText('2026-10-15')
    await expect(panel.locator('.time-clock-viewer')).toContainText('UTC+05:45')
    await expect(panel.locator('.time-clock-viewer time')).toHaveText('05:35')
    await panel.locator('svg').scrollIntoViewIfNeeded()
    await expect(panel.locator('svg')).toBeInViewport({ ratio: 0.8 })
    const box = await panel.boundingBox()
    if (!box) throw new Error('Missing timestamp popover')
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(568)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('cluster-existing-touch.png') })
    await trigger.nth(1).tap()
    await expect(panel).toHaveCount(0)
  })
})

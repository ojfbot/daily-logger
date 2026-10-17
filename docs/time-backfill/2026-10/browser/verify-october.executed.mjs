import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = Object.fromEntries(process.argv.slice(2).map(value => { const at = value.indexOf('='); assert(at > 2, 'Arguments use --name=value'); return [value.slice(2, at), value.slice(at + 1)] }))
const output = dirname(fileURLToPath(import.meta.url))
const evidence = resolve(args.evidence ?? join(output, '..'))
const repo = resolve(args.repo ?? '/private/tmp/october-time-backfill-p57c7bqe/repo')
const baseURL = args['base-url'] ?? 'http://127.0.0.1:4058'
const origin = new URL(baseURL).origin
assert(['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname), 'Only a local app origin is permitted')
const require = createRequire(join(repo, 'package.json'))
const { chromium, expect } = require('@playwright/test')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const manifestPath = join(repo, 'docs/time-backfill/2026-10/manifest.json')
const manifest = json(manifestPath)
const dates = manifest.articles.filter(row => row.articlePresent).map(row => row.date)
assert.equal(dates.length, 16)
assert.equal(manifest.summary.beforeAdmitted, 22)
assert.equal(manifest.summary.afterAdmitted, 25)
const screenshots = join(output, 'screenshots')
mkdirSync(screenshots, { recursive: true })
const result = { status: 'running', scriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), baseURL, repo, manifestSha256: sha256(readFileSync(manifestPath)), browser: null, conservation: {}, stages: {}, realPopoverCases: [], syntheticControls: [], network: [], pageErrors: [], limitations: ['Actual before/after production API build outputs are served through local browser interception; this does not validate a deployment or authenticated editing.', 'Synthetic DST and UTC controls test display behavior and do not add historical event authority.', 'Provider/account authenticity and publication/readiness/merge are outside this browser verification.'] }
const save = () => writeFileSync(join(output, 'inventory.json'), JSON.stringify(result, null, 2) + '\n')
const readStage = stage => {
  const root = join(evidence, `${stage}-build`)
  assert(existsSync(join(root, 'entries.json')), `Missing actual ${stage} API build`)
  return { root, article: date => json(join(root, 'articles', `${date}.json`)) }
}
const before = readStage('before'), after = readStage('after')
const files = readdirSync(join(before.root, 'articles')).filter(name => name.endsWith('.json')).sort()
assert.deepEqual(files, readdirSync(join(after.root, 'articles')).filter(name => name.endsWith('.json')).sort())
assert.equal(files.length, 135)
result.conservation.articleBlobs = files.map(file => {
  const left = json(join(before.root, 'articles', file)), right = json(join(after.root, 'articles', file))
  assert.equal(left.sourceBlobSha, right.sourceBlobSha, `${file}: API source blob changed`)
  assert.equal(left.bodyHtml, right.bodyHtml, `${file}: displayed article changed`)
  if (!left.date.startsWith('2026-10')) assert.deepEqual(left.timeReferences ?? [], right.timeReferences ?? [], `${file}: outside-month bindings changed`)
  const source = readFileSync(join(repo, '_articles', file.replace(/\.json$/, '.md')))
  const actualBlob = createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex')
  assert.equal(actualBlob, left.sourceBlobSha, `${file}: API blob differs from actual article bytes`)
  return { date: left.date, sourceBlobSha: actualBlob, bodyHtmlSha256: sha256(left.bodyHtml) }
})
result.conservation.articleBlobCount = files.length
result.conservation.outsideMonthBindingsUnchanged = true

async function contextFor(browser, stage, options = {}, overrides = new Map()) {
  const context = await browser.newContext({ timezoneId: 'America/Chicago', viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', ...options })
  const requests = [], blockedExternal = [], fixtureAPI = []
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    requests.push(url.href)
    if (url.origin !== origin) { blockedExternal.push(url.href); await route.abort('blockedbyclient'); return }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
    if (overrides.has(url.pathname)) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify(overrides.get(url.pathname)) }); return }
    const match = /^\/api\/(?:articles\/\d{4}-\d{2}-\d{2}|[a-z-]+)\.json$/.test(url.pathname)
    const path = match ? join(stage.root, url.pathname.slice(5)) : null
    if (path && existsSync(path)) { await route.fulfill({ contentType: 'application/json', body: readFileSync(path) }); return }
    fixtureAPI.push(url.pathname)
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Offline browser fixture: authentication/reviews/unavailable API disabled' }) })
  })
  const page = await context.newPage()
  page.on('pageerror', error => result.pageErrors.push({ stage: stage.root, message: error.message }))
  return { context, page, requests, blockedExternal, fixtureAPI }
}
async function loaded(page, article) {
  await page.goto(`${baseURL}/articles/${article.date}`, { waitUntil: 'networkidle' })
  await expect(page.locator('.article-title')).toHaveText(article.title)
  const firstParagraph = await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').querySelector('p')?.textContent?.trim().slice(0, 90) ?? '', article.bodyHtml)
  assert(firstParagraph, 'Article must have actual prose before counting zero-reference pages')
  await expect(page.locator('.article-content')).toContainText(firstParagraph)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function inventory(page) {
  return page.locator('.article-content').evaluate(root => {
    const tokens = [], counts = new Map()
    const pattern = /\b(?:\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z| UTC|[+-]\d{2}:\d{2})|\d{2}:\d{2}(?::\d{2})?(?:Z| UTC))\b/g
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(node) {
      const parent = node.parentElement
      if (parent?.closest('pre,script,style,[hidden],[aria-hidden="true"],.section-chat-inline-portal')) return NodeFilter.FILTER_REJECT
      if (parent?.closest('button') && !parent.closest('.time-ref')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    } })
    while (walker.nextNode()) {
      const node = walker.currentNode
      for (const match of node.textContent.matchAll(pattern)) {
        const text = match[0], occurrence = counts.get(text) ?? 0
        counts.set(text, occurrence + 1)
        const trigger = node.parentElement?.closest('.time-ref')
        const time = trigger?.querySelector('time')
        tokens.push({ text, occurrence, decorated: Boolean(trigger), at: time?.getAttribute('datetime') ?? null })
      }
    }
    const buttons = [...root.querySelectorAll('.time-ref')].map(button => ({ text: button.textContent, timeCount: button.querySelectorAll('time').length, at: button.querySelector('time')?.getAttribute('datetime') }))
    return { tokens, buttons }
  })
}
const binding = ref => ({ text: ref.text, occurrence: ref.occurrence, at: ref.at })
let browser
try {
  browser = await chromium.launch({ channel: args.channel ?? 'chrome', headless: true })
  result.browser = browser.version()
  for (const [name, stage] of [['before', before], ['after', after]]) {
    const runtime = await contextFor(browser, stage)
    const perDate = []
    for (const date of dates) {
      const article = stage.article(date), row = manifest.articles.find(item => item.date === date)
      const expected = article.timeReferences ?? []
      assert.deepEqual(expected, row[name].admitted, `${name} ${date}: production API differs from manifest`)
      await loaded(runtime.page, article)
      await expect(runtime.page.locator('.article-content .time-ref')).toHaveCount(expected.length)
      const actual = await inventory(runtime.page)
      const actualBindings = actual.tokens.filter(token => token.decorated).map(({ text, occurrence, at }) => ({ text, occurrence, at }))
      assert.deepEqual(actualBindings, expected.map(binding), `${name} ${date}: wrong rendered label/occurrence/datetime`)
      assert.equal(actual.tokens.length, row.supportedTokens, `${name} ${date}: rendered supported token inventory differs`)
      assert(actual.buttons.every(button => button.timeCount === 1), `${name} ${date}: malformed trigger`)
      perDate.push({ date, apiSha256: sha256(readFileSync(join(stage.root, 'articles', `${date}.json`))), supported: actual.tokens.length, decorated: actualBindings.length, plain: actual.tokens.filter(token => !token.decorated).length, bindings: expected, renderedTokens: actual.tokens })
    }
    result.stages[name] = { perDate, totalDecorated: perDate.reduce((n, row) => n + row.decorated, 0), totalPlain: perDate.reduce((n, row) => n + row.plain, 0) }
    result.network.push({ phase: name, requests: runtime.requests, deniedExternal: runtime.blockedExternal, offline503API: runtime.fixtureAPI })
    await runtime.context.close()
  }
  assert.equal(result.stages.before.totalDecorated, 22)
  assert.equal(result.stages.after.totalDecorated, 25)
  assert.equal(result.stages.before.totalPlain, 20)
  assert.equal(result.stages.after.totalPlain, 17)
  for (const oldRow of result.stages.before.perDate) {
    const newRow = result.stages.after.perDate.find(row => row.date === oldRow.date)
    for (const ref of oldRow.bindings) assert(newRow.bindings.some(candidate => JSON.stringify(candidate) === JSON.stringify(ref)), `Prior binding changed: ${oldRow.date} ${ref.text}`)
  }
  result.conservation.priorBindingsPreserved = 22
  result.conservation.newBindings = 3
  const runtime = await contextFor(browser, after)
  await loaded(runtime.page, after.article('2026-10-17'))
  for (const [text, date, clock, at] of [
    ['06:22Z', '2026-10-17', '01:22', '2026-10-17T06:22:23.000Z'],
    ['21:05Z', '2026-10-16', '16:05', '2026-10-16T21:05:02.000Z'],
    ['13:34Z', '2026-10-16', '08:34', '2026-10-16T13:34:59.000Z'],
  ]) {
    const trigger = runtime.page.locator('.time-ref').filter({ hasText: text })
    await expect(trigger).toHaveCount(1)
    await expect(trigger.locator('time')).toHaveAttribute('datetime', at)
    const requestsBeforeOpen = runtime.requests.length
    await trigger.click()
    const popover = runtime.page.locator('.time-popover')
    await expect(popover).toBeVisible()
    await expect(popover.locator('.time-clock').first()).toHaveClass('time-clock time-clock-viewer')
    await expect(popover.locator('.time-clock-viewer')).toContainText(clock)
    await expect(popover.locator('.time-clock-viewer')).toContainText(date)
    await expect(popover.locator('.time-clock-viewer')).toContainText('UTC−05:00')
    await expect(popover.locator('.time-clock-viewer')).toContainText('America/Chicago')
    await expect(popover.locator('.time-clock time')).toHaveCount(2)
    for (const time of await popover.locator('.time-clock time').all()) await expect(time).toHaveAttribute('datetime', at)
    await expect(popover.locator('.time-map-viewer')).toHaveCSS('stroke', 'rgb(109, 189, 255)')
    await expect(popover.locator('.time-map-viewer')).toHaveCSS('stroke-dasharray', 'none')
    await expect(popover.locator('.time-map-utc')).toHaveCSS('stroke-dasharray', '4px, 2px')
    const shadow = await popover.locator('.time-map-night').getAttribute('d')
    assert(shadow && !/NaN|Infinity/.test(shadow), 'Map must have a finite night path')
    const screenshot = `real-2026-10-17-${text.replace(':', '')}.png`
    await popover.screenshot({ path: join(screenshots, screenshot) })
    await runtime.page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).not.toHaveAttribute('aria-describedby')
    assert.equal(runtime.requests.length, requestsBeforeOpen, 'Opening/closing a timestamp must make no requests')
    result.realPopoverCases.push({ article: '2026-10-17', text, sourceInstant: at, localDate: date, localClock: clock, offset: 'UTC−05:00', screenshot, requestsWhileOpen: 0, escapeDismissed: true })
  }
  for (const text of ['19:42Z', '18:21Z', '06:30Z']) {
    assert(result.stages.after.perDate.find(row => row.date === '2026-10-17').renderedTokens.some(token => token.text === text && !token.decorated), `${text} must remain plain`)
    await expect(runtime.page.locator('.time-ref').filter({ hasText: text })).toHaveCount(0)
  }
  await runtime.page.screenshot({ path: join(screenshots, 'real-oct17-escape-dismissed.png') })
  result.network.push({ phase: 'real-popovers', requests: runtime.requests, deniedExternal: runtime.blockedExternal, offline503API: runtime.fixtureAPI })
  await runtime.context.close()

  const syntheticDate = '2026-11-01'
  const synthetic = { ...after.article('2026-10-17'), date: syntheticDate, title: 'SYNTHETIC CONTROL — DST repeated hour', bodyHtml: '<h2>Synthetic display control</h2><p>These are synthetic UI fixtures, not article claims: 06:30Z and 07:30Z.</p>', timeReferences: ['06:30', '07:30'].map(clock => ({ text: `${clock}Z`, occurrence: 0, at: `2026-11-01T${clock}:00.000Z`, precision: 'minute', evidence: { kind: 'explicit-offset', value: `2026-11-01T${clock}:00Z` } })) }
  const overrides = new Map([['/api/articles/2026-11-01.json', synthetic], ['/api/entries.json', [synthetic, ...json(join(after.root, 'entries.json'))]]])
  const dst = await contextFor(browser, after, {}, overrides)
  await loaded(dst.page, synthetic)
  for (const [text, offset, marker] of [['06:30Z', 'UTC−05:00', '105'], ['07:30Z', 'UTC−06:00', '90']]) {
    await dst.page.locator('.time-ref').filter({ hasText: text }).click()
    const popover = dst.page.locator('.time-popover')
    await expect(popover.locator('.time-clock-viewer')).toContainText('01:30')
    await expect(popover.locator('.time-clock-viewer')).toContainText(offset)
    await expect(popover.locator('.time-map-viewer')).toHaveAttribute('x1', marker)
    const screenshot = `synthetic-dst-${text.replace(':', '')}.png`
    await popover.screenshot({ path: join(screenshots, screenshot) })
    const contextScreenshot = `synthetic-dst-${text.replace(':', '')}-context.png`
    await dst.page.screenshot({ path: join(screenshots, contextScreenshot) })
    result.syntheticControls.push({ label: 'SYNTHETIC DST DISPLAY CONTROL', utc: text, local: '2026-11-01 01:30', offset, marker, screenshot, contextScreenshot })
    await dst.page.keyboard.press('Escape')
  }
  result.network.push({ phase: 'synthetic-dst', requests: dst.requests, deniedExternal: dst.blockedExternal, offline503API: dst.fixtureAPI })
  await dst.context.close()
  const utc = await contextFor(browser, after, { timezoneId: 'UTC', viewport: { width: 320, height: 568 }, hasTouch: true }, overrides)
  await loaded(utc.page, synthetic)
  const utcTrigger = utc.page.locator('.time-ref').first()
  await utcTrigger.tap()
  const utcPopover = utc.page.locator('.time-popover')
  await expect(utcPopover).toContainText('Both clocks share Greenwich')
  await expect(utcPopover.locator('.time-map-utc')).toHaveAttribute('x1', '178')
  await expect(utcPopover.locator('.time-map-viewer')).toHaveAttribute('x1', '182')
  await expect(utcPopover.locator('.time-clock').first()).toHaveClass('time-clock time-clock-viewer')
  const box = await utcPopover.boundingBox()
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 568, 'UTC mobile popover must remain in the viewport')
  assert(await utc.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal mobile overflow')
  await expect(utcPopover.locator('.time-clock-viewer')).toContainText('06:30')
  await expect(utcPopover.locator('.time-clock-utc')).toContainText('06:30')
  await utc.page.screenshot({ path: join(screenshots, 'synthetic-utc-mobile.png') })
  await utcPopover.evaluate(element => { element.scrollTop = element.scrollHeight })
  await utc.page.screenshot({ path: join(screenshots, 'synthetic-utc-mobile-captions.png') })
  result.syntheticControls.push({ label: 'SYNTHETIC UTC MOBILE DISPLAY CONTROL', timezone: 'UTC', viewport: { width: 320, height: 568 }, utcMarker: 178, viewerMarker: 182, box, screenshot: 'synthetic-utc-mobile.png', captionScreenshot: 'synthetic-utc-mobile-captions.png' })
  await utc.page.keyboard.press('Escape')
  await expect(utcPopover).toHaveCount(0)
  result.network.push({ phase: 'synthetic-utc', requests: utc.requests, deniedExternal: utc.blockedExternal, offline503API: utc.fixtureAPI })
  await utc.context.close()
  assert.deepEqual(result.pageErrors, [], 'No browser page runtime errors')
  result.status = 'passed'
} catch (error) {
  result.status = 'failed'
  result.failure = { message: error.message, stack: error.stack }
  throw error
} finally {
  await browser?.close()
  save()
}
console.log(JSON.stringify({ status: result.status, browser: result.browser, dates: dates.length, before: result.stages.before?.totalDecorated, after: result.stages.after?.totalDecorated, preserved: result.conservation.priorBindingsPreserved, realPopoverCases: result.realPopoverCases.length, syntheticControls: result.syntheticControls.length, deniedExternalRequests: result.network.reduce((n, item) => n + item.deniedExternal.length, 0), pageErrors: result.pageErrors.length, output }, null, 2))

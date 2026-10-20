import { describe, expect, it } from 'vitest'
import { discoverTimeSources, recordsFromGitHubResponse } from '../backfill-times.js'
import { issueEventsFromContext, resolveIssueTimes } from '../issue-times.js'
import { issueSources, recordsFromContext, selectTimeRecords, TimeRecordSchema } from '../time-references.js'
import type { BlogContext } from '../types.js'

const markdown = [
  '## What shipped',
  'New [#386](https://github.com/ojfbot/daily-logger/issues/386) and ongoing [#357](https://github.com/ojfbot/daily-logger/issues/357).',
].join('\n')
const base: BlogContext = { date: '2026-10-20', repos: ['daily-logger'], commits: [], mergedPRs: [], openPRs: [], recentPRs: [], closedIssues: [], openIssues: [], openActions: [], projectVision: '', previousArticles: [] }

describe('issue source clocks', () => {
  it('uses Created for a new issue and Updated for an ongoing issue from collected facts', () => {
    const ctx: BlogContext = { ...base, openIssues: [
      { repo: 'daily-logger', number: 386, title: 'New', state: 'open', labels: [], url: 'https://github.com/ojfbot/daily-logger/issues/386', createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:05:00Z', createdInWindow: true },
      { repo: 'daily-logger', number: 357, title: 'Ongoing', state: 'open', labels: [], url: 'https://github.com/ojfbot/daily-logger/issues/357', createdAt: '2026-10-13T15:53:55Z', updatedAt: '2026-10-19T15:35:18Z', createdInWindow: false },
    ] }
    const selected = selectTimeRecords(markdown, recordsFromContext(ctx))
    expect(selected).toHaveLength(4)
    const choices = issueEventsFromContext(ctx, markdown)
    expect(choices.map((choice) => choice.event)).toEqual(['created', 'updated'])
    expect(resolveIssueTimes(markdown, selected, choices)).toMatchObject([
      { source: { ref: '386' }, event: 'created', at: '2026-10-20T10:00:00.000Z' },
      { source: { ref: '357' }, event: 'updated', at: '2026-10-19T15:35:18.000Z' },
    ])
  })

  it('uses Created for a newly closed issue and Updated for an older closed issue', () => {
    const text = '[new](https://github.com/ojfbot/daily-logger/issues/999) [old](https://github.com/ojfbot/daily-logger/issues/998)'
    const ctx: BlogContext = { ...base, closedIssues: [
      { repo: 'daily-logger', number: 999, title: 'New', state: 'closed', labels: [], url: 'https://github.com/ojfbot/daily-logger/issues/999', createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:05:00Z', closedAt: '2026-10-20T10:05:00Z', createdInWindow: true },
      { repo: 'daily-logger', number: 998, title: 'Old', state: 'closed', labels: [], url: 'https://github.com/ojfbot/daily-logger/issues/998', createdAt: '2026-10-13T10:00:00Z', updatedAt: '2026-10-20T10:05:00Z', closedAt: '2026-10-20T10:05:00Z', createdInWindow: false },
    ] }
    const choices = issueEventsFromContext(ctx, text)
    expect(choices.map((choice) => choice.event)).toEqual(['created', 'updated'])
    expect(resolveIssueTimes(text, selectTimeRecords(text, recordsFromContext(ctx)), choices)).toMatchObject([
      { source: { ref: '999' }, event: 'created', at: '2026-10-20T10:00:00.000Z' },
      { source: { ref: '998' }, event: 'updated', at: '2026-10-20T10:05:00.000Z' },
    ])
  })

  it('selects a card-only issue from the rendered article without treating card text as an authored clock', () => {
    const prose = '## What shipped\nNo issue link or authored clock in prose.'
    const renderedHtml = '<h2>What shipped</h2><p>No issue link or authored clock in prose.</p><section class="suggested-actions-card"><a href="https://github.com/ojfbot/daily-logger/issues/357">issue #357</a> 09:10Z</section>'
    const ctx: BlogContext = { ...base, openIssues: [{ repo: 'daily-logger', number: 357, title: 'Ongoing', state: 'open', labels: [], url: 'https://github.com/ojfbot/daily-logger/issues/357', createdAt: '2026-10-13T15:53:55Z', updatedAt: '2026-10-19T15:35:18Z', createdInWindow: false }] }
    expect(issueSources(prose)).toEqual([])
    expect(issueSources(prose, renderedHtml)).toMatchObject([{ ref: '357' }])
    const selected = selectTimeRecords(prose, recordsFromContext(ctx), renderedHtml)
    expect(selected).toHaveLength(2)
    const choices = issueEventsFromContext(ctx, prose, renderedHtml)
    expect(choices).toMatchObject([{ source: { ref: '357' }, event: 'updated' }])
    expect(resolveIssueTimes(prose, selected, choices, renderedHtml)).toMatchObject([{ source: { ref: '357' }, event: 'updated' }])
  })

  it('reconstructs only an actual issue resource and leaves competing facts without a control', () => {
    const request = { kind: 'issue' as const, repo: 'ojfbot/daily-logger', ref: '386' }
    const response = { number: 386, html_url: 'https://github.com/ojfbot/daily-logger/issues/386', created_at: '2026-10-18T15:57:36Z', updated_at: '2026-10-19T19:26:59Z' }
    const records = recordsFromGitHubResponse(request, response)
    expect(discoverTimeSources([{ date: '2026-10-20', markdown: '[#386](https://github.com/ojfbot/daily-logger/issues/386) created at 15:57Z.' }])).toContainEqual(request)
    expect(records.map((record) => record.evidence.kind === 'github-issue' && record.evidence.event)).toEqual(['created', 'updated'])
    expect(() => recordsFromGitHubResponse(request, { ...response, pull_request: { url: 'a-pr' } })).toThrow(/identity mismatch/i)
    expect(() => recordsFromGitHubResponse(request, { ...response, html_url: 'https://github.com/ojfbot/daily-logger/pull/386' })).toThrow(/identity mismatch/i)
    expect(resolveIssueTimes(markdown, [...records, { ...records[1], at: '2026-10-20T00:00:00.000Z' }])).toEqual([])
    expect(TimeRecordSchema.safeParse({ ...records[0], acquisition: { observedAt: '2026-10-20T16:19:39.000Z', requestUrl: 'https://api.github.com/repos/ojfbot/daily-logger/issues/386', responseSha256: 'a'.repeat(64) } }).success).toBe(true)
    expect(TimeRecordSchema.safeParse({ ...records[0], acquisition: { observedAt: '2026-10-20T16:19:39.000Z', requestUrl: 'https://api.github.com/repos/ojfbot/daily-logger/issues/357', responseSha256: 'a'.repeat(64) } }).success).toBe(false)
  })
})

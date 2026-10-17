import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canonicalInstant, recordsFromContext, resolveTimeReferences, selectTimeRecords, scanTimeTokens, timeTokenMatchesInstant, TimeRecordSchema, TimeReferenceSchema, unsupportedTimeTokens, type TimeRecord } from '../time-references.js'
import { buildTimeBackfill, discoverTimeSources, mergeTimeBackfills, parseBackfillOptions, recordsFromGitHubResponse } from '../backfill-times.js'
import { buildUserPrompt, toMarkdown } from '../generate-article.js'
import type { BlogContext } from '../types.js'

const sha = 'ce04d6762fa5a8e5dff59388849e3ea164aff940'
function mergeRecord(repo = 'daily-logger', ref = '359', at = '2026-10-14T09:10:41.000Z'): TimeRecord {
  return { at, evidence: { kind: 'github-pull-request', repo: `ojfbot/${repo}`, ref, event: 'merged', url: `https://github.com/ojfbot/${repo}/pull/${ref}` } }
}
const source = 'PR [#359](https://github.com/ojfbot/daily-logger/pull/359)'
const context: BlogContext = { date: '2026-10-15', repos: ['daily-logger'], commits: [], mergedPRs: [], openPRs: [], recentPRs: [], closedIssues: [], openIssues: [], openActions: [], previousArticles: [], projectVision: '' }

describe('strict timestamp boundaries', () => {
  it('preserves offsets and seconds while rejecting calendar rollover and missing timezone', () => {
    expect(canonicalInstant('2026-10-14T04:10:40-05:00')).toBe('2026-10-14T09:10:40.000Z')
    expect(canonicalInstant('2026-04-27 11:09 UTC')).toBe('2026-04-27T11:09:00.000Z')
    expect(canonicalInstant('2026-04-27 11:09:23 UTC')).toBe('2026-04-27T11:09:23.000Z')
    expect(canonicalInstant('2024-02-29T23:59:59.123Z')).toBe('2024-02-29T23:59:59.123Z')
    for (const invalid of ['2026-02-29T09:10:00Z', '2026-02-30T09:10:00Z', '2026-13-01T09:10:00Z', '2026-10-14T24:00:00Z', '2026-10-14T09:10:60Z', '2026-10-14T09:10:00', '2026-10-14T09:10:00+25:00']) expect(canonicalInstant(invalid)).toBeUndefined()
    expect(timeTokenMatchesInstant('09:10Z', '2026-10-14T09:10:41.000Z')).toBe(true)
    expect(timeTokenMatchesInstant('09:10:40 UTC', '2026-10-14T09:10:41.000Z')).toBe(false)
    expect(timeTokenMatchesInstant('24:00Z', '2026-10-14T00:00:00.000Z')).toBe(false)
  })
  it('requires evidence URLs to identify exactly their source', () => {
    expect(TimeReferenceSchema.safeParse({ text: '09:10Z', occurrence: 0, precision: 'minute', ...mergeRecord() }).success).toBe(true)
    const record = mergeRecord()
    expect(TimeReferenceSchema.safeParse({ text: '09:10Z', occurrence: 0, precision: 'minute', ...record, evidence: { ...record.evidence, url: 'https://github.com/ojfbot/daily-logger/pull/35' } }).success).toBe(false)
  })
})

describe('source-specific event reconstruction', () => {
  it('uses merged_at rather than the author or committer clock in the screenshot', () => {
    const records = [mergeRecord(), ...recordsFromGitHubResponse({ kind: 'commit', repo: 'ojfbot/daily-logger', ref: sha.slice(0, 7) }, { sha, commit: { author: { date: '2026-10-14T09:09:04Z' }, committer: { date: '2026-10-14T04:10:40-05:00' } } })]
    const result = resolveTimeReferences(`${source} committed and merged at 09:10Z.`, records)
    expect(result.references).toEqual([{ text: '09:10Z', occurrence: 0, precision: 'minute', ...mergeRecord() }])
    expect(result.unresolved).toEqual([])
    const commit = resolveTimeReferences(`daily-logger commit \`${sha.slice(0, 7)}\` committed at 09:10Z.`, records)
    expect(commit.references[0]).toMatchObject({ at: '2026-10-14T09:10:40.000Z', evidence: { event: 'committed' } })
  })
  it('does not assign dates from the article date, a different PR, or a matching clock', () => {
    expect(resolveTimeReferences('An unknown event happened at 09:10Z.', [mergeRecord()]).references).toEqual([])
    expect(resolveTimeReferences(`${source} merged at 09:11Z.`, [mergeRecord()]).unresolved[0]?.reason).toBe('clock-mismatch')
    const different = mergeRecord('core', '537', '2026-10-13T09:10:41.000Z')
    expect(resolveTimeReferences(`${source} merged at 09:10Z.`, [different]).references).toEqual([])
    expect(resolveTimeReferences('PR [#359](https://github.com/ojfbot/daily-logger/pull/359) merged at 09:10Z.', [mergeRecord('daily-logger', '35')]).references).toEqual([])
  })
  it('chooses source identity before matching a clock and rejects ambiguous same-source instants', () => {
    const body = `${source} merged at 09:10Z, core #537 merged at 09:10Z.`
    const refs = resolveTimeReferences(body, [mergeRecord(), mergeRecord('core', '537', '2026-10-13T09:10:05.000Z')]).references
    expect(refs.map((ref) => ref.at)).toEqual(['2026-10-14T09:10:41.000Z', '2026-10-13T09:10:05.000Z'])
    expect(resolveTimeReferences(`${source} merged at 09:10Z.`, [mergeRecord(), mergeRecord('daily-logger', '359', '2026-10-13T09:10:41.000Z')]).unresolved[0]?.reason).toBe('ambiguous')
  })
  it('never borrows prior event evidence for a recurring schedule, bound, or future proposal', () => {
    for (const suffix of ['a scheduled run is set to 09:10Z.', 'a daily job runs at 09:10Z.', 'tomorrow we will start at 09:10Z.', 'a nightly job runs before 09:10Z.']) {
      const refs = resolveTimeReferences(`${source} merged at 09:10Z; ${suffix}`, [mergeRecord()]).references
      expect(refs).toHaveLength(1)
      expect(refs[0]?.occurrence).toBe(0)
    }
    expect(resolveTimeReferences('PR [#359](https://github.com/ojfbot/daily-logger/pull/359) merged before 09:10Z.', [mergeRecord()]).references).toEqual([])
  })
  it('converts complete stated timestamps without claiming they came from git', () => {
    const refs = resolveTimeReferences('It occurred at 2026-10-14T04:10:40-05:00 and 2026-10-14 09:10Z.', []).references
    expect(refs.map((ref) => ref.at)).toEqual(['2026-10-14T09:10:40.000Z', '2026-10-14T09:10:00.000Z'])
    expect(refs.every((ref) => ref.evidence.kind === 'explicit-offset')).toBe(true)
    const stated = resolveTimeReferences('The run was 2026-04-27 11:09 UTC; another at 2026-04-27 11:09:23 UTC.', []).references
    expect(stated.map((ref) => [ref.text, ref.at, ref.precision])).toEqual([['2026-04-27 11:09 UTC', '2026-04-27T11:09:00.000Z', 'minute'], ['2026-04-27 11:09:23 UTC', '2026-04-27T11:09:23.000Z', 'second']])
  })
})

describe('canonical rendered occurrence inventory', () => {
  it('decodes entities and Markdown escapes, excludes fenced code/destinations, and preserves inline code/link labels', () => {
    const markdown = `09\\:10Z, 09&#58;10Z, [09:10Z](https://example.com/09:10Z), \`09:10Z\`.\n\n\`\`\`text\n09:10Z\n\`\`\`\n\n${source} merged at 09:10Z.`
    const tokens = scanTimeTokens(markdown)
    expect(tokens.map((token) => [token.text, token.occurrence])).toEqual(Array.from({ length: 5 }, (_, i) => ['09:10Z', i]))
    const refs = resolveTimeReferences(markdown, [mergeRecord()]).references
    expect(refs).toHaveLength(1)
    expect(refs[0]?.occurrence).toBe(4)
  })
  it('does not join across DOM text nodes or confuse clock substrings in complete dates', () => {
    expect(scanTimeTokens('09:**10Z**')).toEqual([])
    expect(scanTimeTokens('2026-10-14 09:10Z and 09:10Z').map((token) => [token.text, token.occurrence])).toEqual([['2026-10-14 09:10Z', 0], ['09:10Z', 0]])
    expect(unsupportedTimeTokens('5:01 p.m. America/Chicago, 9am, and 08:00 GMT.')).toHaveLength(3)
  })
})

describe('repeatable backfill and generation integration', () => {
  it('replays all134 actual articles and deterministic shards against the immutable33-reference sidecar', () => {
    const raw: unknown = JSON.parse(readFileSync(new URL('../../api/time-evidence.json', import.meta.url), 'utf-8'))
    const snapshot = raw && typeof raw === 'object' && 'records' in raw ? raw.records : []
    const records = TimeRecordSchema.array().parse(snapshot)
    const markdown = readFileSync(new URL('../../_articles/2026-10-15.md', import.meta.url), 'utf-8')
    const refs = resolveTimeReferences(markdown, records).references
    expect(refs).toHaveLength(6)
    expect(refs.filter((ref) => ref.text === '09:10Z').map((ref) => [ref.occurrence, ref.at])).toEqual([[0, '2026-10-14T09:10:41.000Z'], [1, '2026-10-14T09:10:41.000Z']])
    const directory = new URL('../../_articles/', import.meta.url)
    const articles = readdirSync(directory).filter((name) => name.endsWith('.md') && name <= '2026-10-16.md').sort().map((name) => ({ date: name.slice(0, -3), markdown: readFileSync(new URL(name, directory), 'utf-8') }))
    expect(articles).toHaveLength(134)
    const complete = buildTimeBackfill(articles, records).sidecar
    const frozen = readFileSync(new URL('../../api/time-refs.json', import.meta.url), 'utf-8')
    expect(`${JSON.stringify(complete, null, 2)}\n`).toBe(frozen)
    expect(Object.values(complete.articles).flatMap((article) => article.references)).toHaveLength(33)
    const shards = [0, 1, 2].map((index) => buildTimeBackfill(articles, [...records].reverse(), { index, count: 3 }).sidecar)
    expect(`${JSON.stringify(mergeTimeBackfills(shards.reverse()), null, 2)}\n`).toBe(frozen)
  })
  it('produces identical single-process/sharded results and rejects conflicting shards', () => {
    const articles = [1, 2, 3, 4, 5].map((n) => ({ date: `2026-10-0${n}`, markdown: `---\ndate: 2026-10-0${n}\n---\n\n${source} merged at 09:10Z.\n` }))
    const complete = buildTimeBackfill(articles, [mergeRecord()]).sidecar
    const parts = [0, 1, 2].map((index) => buildTimeBackfill(articles, [mergeRecord()], { index, count: 3 }).sidecar)
    expect(mergeTimeBackfills(parts)).toEqual(complete)
    // CLI writes these final parsed sidecars directly; schema field order is part of replay determinism.
    expect(JSON.stringify(mergeTimeBackfills(parts), null, 2)).toBe(JSON.stringify(complete, null, 2))
    expect(buildTimeBackfill(articles, [mergeRecord()]).sidecar).toEqual(complete)
    expect(() => mergeTimeBackfills([complete, { schemaVersion: 1, articles: { '2026-10-01': { bodySha256: 'a'.repeat(64), references: [] } } }])).toThrow('Conflicting')
  })
  it('rejects unsafe source arguments, identity mismatches, colliding output paths, and unsafe shard defaults', () => {
    expect(() => recordsFromGitHubResponse({ kind: 'commit', repo: 'ojfbot/../../secret', ref: 'abcdef0' }, {})).toThrow()
    expect(() => recordsFromGitHubResponse({ kind: 'commit', repo: 'ojfbot/core', ref: 'abcdef0;touch /tmp/no' }, {})).toThrow()
    expect(() => recordsFromGitHubResponse({ kind: 'pull', repo: 'ojfbot/core', ref: '1' }, { number: 2, created_at: '2026-10-14T09:10:00Z', updated_at: '2026-10-14T09:10:00Z', merged_at: null, closed_at: null })).toThrow('identity mismatch')
    expect(() => parseBackfillOptions(['--shard', '0/3'])).toThrow('dedicated')
    expect(() => parseBackfillOptions(['--output'])).toThrow('Missing')
    expect(() => parseBackfillOptions(['--snapshot', '/tmp/same.json', '--output', '/tmp/same.json'])).toThrow('distinct')
    expect(() => parseBackfillOptions(['--shard', '3/3', '--output', '/tmp/out'])).toThrow('zero-based')
  })
  it('discovers only validated GitHub source identifiers in time-bearing blocks', () => {
    const sources = discoverTimeSources([{ date: '2026-10-15', markdown: `${source} merged at 09:10Z.\n\n[Unrelated](https://github.com/ojfbot/core/pull/999).` }])
    expect(sources).toContainEqual({ kind: 'pull', repo: 'ojfbot/daily-logger', ref: '359' })
    expect(sources.some((item) => item.ref === '999')).toBe(false)
  })
  it('retains actual author/committer facts without adding an unbounded model timestamp catalog', () => {
    const ctx = { ...context, commits: [{ hash: sha.slice(0, 7), fullHash: sha, message: 'article', repo: 'daily-logger', author: 'bot', date: '2026-10-14T09:09:04Z', authoredAt: '2026-10-14T09:09:04Z', committedAt: '2026-10-14T04:10:40-05:00', url: `https://github.com/ojfbot/daily-logger/commit/${sha}` }] }
    expect(recordsFromContext(ctx).map((record) => record.at)).toContain('2026-10-14T09:10:40.000Z')
    expect(buildUserPrompt(ctx)).not.toContain('Authoritative event timestamp records')
    const markdown = toMarkdown({ title: 'Time', date: ctx.date, tags: [], summary: 'Time', body: `${source} merged at 09:10Z.` })
    expect(markdown).not.toContain('time_references:')
    expect(markdown).not.toContain('time_records_sha256:')
  })
})

describe('bounded source capture selection', () => {
  it('does not invent a unique repository from compound prose when another source is missing', () => {
    const core = mergeRecord('core', '1')
    expect(resolveTimeReferences('### core and shell\n\nPR #1 merged at 09:10Z.', [core]).references).toEqual([])
    expect(selectTimeRecords('### core and shell\n\nPR #1 merged at 09:10Z.', [core])).toEqual([])
    const commit: TimeRecord = { at: core.at, evidence: { kind: 'github-commit', repo: 'ojfbot/core', ref: 'abcdef0'.padEnd(40, 'a'), event: 'committed', url: `https://github.com/ojfbot/core/commit/${'abcdef0'.padEnd(40, 'a')}` } }
    expect(resolveTimeReferences('core and shell: commit abcdef0 committed at 09:10Z.', [commit]).references).toEqual([])
    expect(resolveTimeReferences('### core\n\nPR #1 merged at 09:10Z.', [core]).references).toHaveLength(1)
  })
  it('retains complete competing source groups and excludes undisclosed fleet records', () => {
    const first = mergeRecord()
    const conflict = mergeRecord('daily-logger', '359', '2027-10-14T10:20:41.000Z')
    const unrelated = mergeRecord('private-vault', '42')
    const selected = selectTimeRecords(`${source} merged at 09:10Z.`, [unrelated, conflict, first])
    expect(selected).toEqual([first, conflict])
    expect(resolveTimeReferences(`${source} merged at 09:10Z.`, selected).unresolved[0]?.reason).toBe('ambiguous')
  })
  it.each(['updated', 'closed'] as const)('does not borrow a calendar date from a current mutable %s field', (event) => {
    const record = mergeRecord()
    const mutable: TimeRecord = { ...record, evidence: { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '359', event, url: 'https://github.com/ojfbot/daily-logger/pull/359' } }
    expect(resolveTimeReferences(`${source} ${event} at 09:10Z.`, [mutable])).toEqual({ references: [], unresolved: [{ text: '09:10Z', occurrence: 0, reason: 'mutable-event' }] })
    expect(resolveTimeReferences(`${source} ${event} at 2026-10-14T09:10:41Z.`, [mutable]).references[0]?.evidence.kind).toBe('explicit-offset')
  })
})

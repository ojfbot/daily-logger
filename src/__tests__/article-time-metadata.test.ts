import { describe, expect, it } from 'vitest'
import { articleTimeMetadata, parseTimeReferenceSidecar } from '../article-time-metadata.js'
import { articleBodySha256, type TimeRecord, type TimeReference } from '../time-references.js'

const reference: TimeReference = {
  text: '09:10Z', occurrence: 0, at: '2026-10-14T09:10:41.000Z', precision: 'minute',
  evidence: { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '359', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/359' },
}
const records: TimeRecord[] = [{ at: reference.at, evidence: reference.evidence }]
const content = '---\ndate: 2026-10-15\n---\n\nPR [#359](https://github.com/ojfbot/daily-logger/pull/359) merged at 09:10Z.\n'
function sidecar(references = [reference]) { return { bodySha256: articleBodySha256(content), references } }
function declared(references: unknown) {
  return content.replace('date: 2026-10-15', `date: 2026-10-15\ntime_references: ${JSON.stringify(references)}\ntime_references_body_sha256: ${articleBodySha256(content)}`)
}

describe('independent source admission repair controls', () => {
  it('rejects a wrong-source/year claim despite a valid current-body hash', () => {
    const forged = { ...reference, at: '2025-10-14T09:10:41.000Z', evidence: { kind: 'github-pull-request' as const, repo: 'ojfbot/daily-logger', ref: '360', event: 'merged' as const, url: 'https://github.com/ojfbot/daily-logger/pull/360' } }
    expect(articleTimeMetadata({ content, sidecar: sidecar([forged]), records }).references).toEqual([])
    expect(articleTimeMetadata({ content, sidecar: sidecar([{ ...reference, at: '2025-10-14T09:10:41.000Z' }]), records }).references).toEqual([])
  })
  it('admits the matching independently retained event', () => {
    const result = articleTimeMetadata({ content, sidecar: sidecar(), records })
    expect(result).toEqual({ references: [reference], warnings: [], unresolved: [] })
    expect(result.references[0]?.at).toBe('2026-10-14T09:10:41.000Z')
  })
  it('uses binding bytes only for sidecar freshness while independently resolving narrative facts', () => {
    const bindingContent = `${content}\n<!-- managed output -->\n`
    const bound = { ...sidecar(), bodySha256: articleBodySha256(bindingContent) }
    expect(articleTimeMetadata({ content, bindingContent, sidecar: bound, records }).references).toEqual([reference])
    expect(articleTimeMetadata({ content: content.replaceAll('359', '360'), bindingContent, sidecar: bound, records }).references).toEqual([])
    expect(articleTimeMetadata({ content, bindingContent: `${bindingContent}changed`, sidecar: bound, records }).warnings.join(' ')).toContain('Stale')
  })
})

describe('legacy time candidate admission', () => {
  it('does not let candidate metadata itself supply missing source facts', () => {
    const result = articleTimeMetadata({ content, sidecar: sidecar() })
    expect(result.references).toEqual([])
    expect(result.unresolved[0]?.reason).toBe('missing-evidence')
    expect(result.warnings.join(' ')).toContain('independent')
  })
  it('drops a stale backfill after prose changes even when the displayed clock remains', () => {
    const result = articleTimeMetadata({ content: content.replaceAll('359', '360'), sidecar: sidecar(), records })
    expect(result.references).toEqual([])
    expect(result.warnings.join(' ')).toContain('Stale')
  })
  it('validates fingerprinted inline metadata independently against source records', () => {
    expect(articleTimeMetadata({ content: declared([reference]), records }).references).toEqual([reference])
    expect(articleTimeMetadata({ content: declared([reference]), records: [] }).references).toEqual([])
  })
  it('uses a valid historical sidecar even when inline metadata is malformed, stale, or source-forged', () => {
    const variants = [declared({ invalid: true }), declared([reference]).replace(articleBodySha256(content), 'a'.repeat(64)), declared([{ ...reference, at: '2025-10-14T09:10:41.000Z' }])]
    for (const candidate of variants) {
      const result = articleTimeMetadata({ content: candidate, records, sidecar: sidecar() })
      expect(result.references).toEqual([reference])
      expect(result.warnings.length).toBeGreaterThan(0)
    }
  })
  it('rejects wrong events, missing occurrences, duplicate candidates, and contradictory source days', () => {
    const candidates = [reference, reference, { ...reference, occurrence: 1 }, { ...reference, evidence: { kind: 'github-pull-request' as const, repo: 'ojfbot/daily-logger', ref: '359', event: 'opened' as const, url: 'https://github.com/ojfbot/daily-logger/pull/359' } }]
    const result = articleTimeMetadata({ content, sidecar: sidecar(candidates), records })
    expect(result.references).toEqual([reference])
    expect(result.warnings).toHaveLength(3)
    const conflicting = [...records, { ...records[0], at: '2025-10-14T09:10:41.000Z' }]
    expect(articleTimeMetadata({ content, sidecar: sidecar(), records: conflicting }).references).toEqual([])
  })
  it('self-resolves complete stated offsets without source records or cache claims', () => {
    const result = articleTimeMetadata({ content: content.replace('09:10Z', '2026-10-14T04:10:41-05:00') })
    expect(result.references[0]).toMatchObject({ at: reference.at, evidence: { kind: 'explicit-offset' } })
  })
  it('parses the frozen sidecar at its JSON boundary', () => {
    expect(parseTimeReferenceSidecar({ schemaVersion: 1, articles: { '2026-10-15': sidecar() } }).success).toBe(true)
    expect(parseTimeReferenceSidecar({ schemaVersion: 1, articles: { '2026-10-15': { bodySha256: 'bad', references: [reference] } } }).success).toBe(false)
  })
})

import { generationActionCycle } from '../action-review-cycle.js'
import { readActionRegistry, registryRevision, writeActionRegistry } from '../action-registry.js'
import { reviewArticleActions, mockActionAgents } from '../review-actions.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { articleBodySha256, resolveTimeReferences, selectTimeRecords, TimeRecordSchema, TimeReferenceSidecarSchema, type TimeRecord } from '../time-references.js'
import { articleTimeMetadata, prepareGeneratedTime, persistGeneratedTime, readArticleTime } from '../article-time-metadata.js'
import { scanTimeExpressions } from '../time-expression-text.js'
import { TimeExpressionSchema, timeExpressionMembers, type TimeExpression } from '../time-reference-schema.js'
import { buildTimeBackfill } from '../backfill-times.js'
import { buildApi } from '../build-api.js'
import { z } from 'zod'
import { TimeDisplayReferenceSchema } from '../time-reference-schema.js'

const source = (ref: string) => `PR [#${ref}](https://github.com/ojfbot/daily-logger/pull/${ref})`
const record = (ref: string, at: string, event: 'opened' | 'merged' | 'updated' = 'merged'): TimeRecord => ({ at, evidence: { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref, event, url: `https://github.com/ojfbot/daily-logger/pull/${ref}` } })
const facts = [record('359', '2026-10-14T09:10:12.000Z', 'opened'), record('359', '2026-10-14T09:20:41.000Z'), record('360', '2026-10-14T09:30:22.000Z')]
const expression = (body: string, records = facts): TimeExpression => TimeExpressionSchema.parse(resolveTimeReferences(body, records).expressions?.[0])
const article = (body: string) => `---\ndate: 2026-10-14\nstatus: draft\n---\n\n${body}\n`

describe('source-backed grouped time expressions', () => {
  it('does not turn an approximate range endpoint into an exact instant', () => {
    const records: TimeRecord[] = [{
      at: '2026-10-16T19:42:31.000Z',
      evidence: { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '371', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/371' },
    }]
    const markdown = 'PR [#371](https://github.com/ojfbot/daily-logger/pull/371) merged around 19:28–19:42Z.'
    expect(resolveTimeReferences(markdown, records).references).toEqual([])
  })

  it.each(['09:10 America/Chicago', '09:10 cst', '09:10:xx'])('owns the entire approximate interval with unsupported left member %s', (left) => {
    const body = `${source('359')} merged around ${left}–09:20Z.`
    const result = expression(body)
    expect(resolveTimeReferences(body, facts).references).toEqual([])
    expect(result).toMatchObject({
      kind: 'interval',
      start: { text: `around ${left}`, certainty: 'approximate', resolution: { kind: 'unresolved', reason: 'unsupported-format' } },
      end: { text: '09:20Z', certainty: 'approximate', resolution: { kind: 'supported', evidence: { ref: '359' } } },
    })
  })

  it('owns all members of a long connected list without leaking its final exact clock', () => {
    const body = `${source('359')} merged around ${[...Array<string>(16).fill('09:20'), '09:20Z'].join(' and ')}.`
    const result = expression(body)
    expect(result.kind).toBe('list')
    expect(timeExpressionMembers(result)).toHaveLength(17)
    expect(timeExpressionMembers(result).every(member => member.certainty === 'approximate')).toBe(true)
    expect(resolveTimeReferences(body, facts).references).toEqual([])
  })

  it('does not share a zone from a malformed terminal member', () => {
    const body = `${source('359')} merged around 09:20–09:20fooZ.`
    expect(timeExpressionMembers(expression(body)).every(member => member.resolution.kind === 'unresolved' && member.resolution.reason === 'unsupported-format')).toBe(true)
  })

  it('does not admit a member-qualified complete timestamp as an exact flat claim', () => {
    const body = '2026-10-14T09:10Z–~2026-10-14T09:20Z.'
    expect(expression(body, [])).toMatchObject({ kind: 'interval', start: { certainty: 'exact' }, end: { certainty: 'approximate' } })
    expect(resolveTimeReferences(body, []).references.map(reference => reference.text)).toEqual(['2026-10-14T09:10Z'])
  })

  it.each(['Around ', '', '~'])('retains fractional UTC timestamps in a complete interval prefixed %s', (prefix) => {
    const body = `${prefix}2026-10-14T09:10:00.123Z–2026-10-14T09:20:00.456Z.`
    expect(expression(body, [])).toMatchObject({ kind: 'interval', relation: 'elapsed', start: { resolution: { kind: 'supported', at: '2026-10-14T09:10:00.123Z' } }, end: { resolution: { kind: 'supported', at: '2026-10-14T09:20:00.456Z' } } })
    if (prefix) expect(resolveTimeReferences(body, []).references).toEqual([])
    expect(expression('Around 2026-10-14T09:10:00.123Z.', [])).toMatchObject({ kind: 'point', member: { certainty: 'approximate', resolution: { kind: 'supported', at: '2026-10-14T09:10:00.123Z' } } })
  })

  it.each(['09:10 GMT-05:00', '09:10 UTC+05:45', '09:10 (CST)', '09:?', '2026-10-14T09:10+0545'])('owns unsupported member %s without overlapping scans or exact leakage', (left) => {
    const body = `${source('359')} merged around ${left}–09:20Z.`
    const scans = scanTimeExpressions(body)
    expect(scans).toHaveLength(1)
    expect(scans[0].members.map(member => member.text)).toEqual([`around ${left}`, '09:20Z'])
    expect(resolveTimeReferences(body, facts).references).toEqual([])
    expect(expression(body)).toMatchObject({ kind: 'interval', start: { certainty: 'approximate', resolution: { kind: 'unresolved', reason: 'unsupported-format' } }, end: { certainty: 'approximate' } })
  })

  it.each(['–', '—', '-', ' to ', ' and '])('preserves complete dated members across separator %s, offsets, precision and prose punctuation', (separator) => {
    for (const [start, end] of [
      ['2026-10-14T09:10Z', '2026-10-14T09:20Z'],
      ['2026-10-14T09:10 UTC', '2026-10-14T09:20 UTC'],
      ['2026-10-14T09:10', '2026-10-14T09:20Z'],
      ['2026-10-14T09:10:00.123Z', '2026-10-14T09:20:00.456Z'],
      ['2026-10-14T09:10-05:00', '2026-10-14T09:20-05:00'],
      ['2026-10-14T09:10+05:45', '2026-10-14T09:20+05:45'],
    ]) for (const prefix of ['', 'Around ', '~']) for (const punctuation of ['.', '"', '”', "'", '’', '!', '?']) {
      const body = `${prefix}${start}${separator}${end}${punctuation}`
      const result = expression(body, [])
      expect(result.kind, body).toBe(separator === ' and ' ? 'list' : 'interval')
      expect(timeExpressionMembers(result).every(member => member.resolution.kind === 'supported'), body).toBe(true)
      expect(timeExpressionMembers(result).map(member => member.text), body).toEqual([`${prefix}${start}`, end])
      if (prefix) expect(resolveTimeReferences(body, []).references, body).toEqual([])
    }
  })

  it('retains second precision for a supported one-digit-hour clock', () => {
    expect(expression(`${source('359')} merged around 9:20:41Z.`)).toMatchObject({ kind: 'point', member: { precision: 'second', resolution: { kind: 'supported', at: facts[1].at } } })
  })

  it.each([{ open: '"', close: '"' }, { open: '“', close: '”' }, { open: '(', close: ')' }])('preserves approximation outside wrapper $open', ({ open, close }) => {
    for (const qualifier of ['around ', '~']) for (const middle of ['2026-10-14T09:10Z', '2026-10-14T09:10Z–2026-10-14T09:20Z']) {
      const body = `${qualifier}${open}${middle}${close}.`
      const result = expression(body, [])
      expect(result.text).toBe(body.slice(0, -1))
      expect(timeExpressionMembers(result).every(member => member.certainty === 'approximate')).toBe(true)
      expect(resolveTimeReferences(body, []).references).toEqual([])
    }
    const endWrapped = expression(`2026-10-14T09:10Z–~${open}2026-10-14T09:20Z${close}.`, [])
    expect(endWrapped).toMatchObject({ kind: 'interval', start: { certainty: 'exact' }, end: { certainty: 'approximate' } })
    expect(resolveTimeReferences(`2026-10-14T09:10Z–~${open}2026-10-14T09:20Z${close}.`, []).references.map(reference => reference.text)).toEqual(['2026-10-14T09:10Z'])
    const sourceList = expression(`${source('359')} and ${source('360')} merged at 09:20Z and ~${open}09:30Z${close}, respectively.`)
    expect(timeExpressionMembers(sourceList).map(member => member.resolution)).toMatchObject([{ kind: 'supported', evidence: { ref: '359' } }, { kind: 'supported', evidence: { ref: '360' } }])
    expect(timeExpressionMembers(sourceList)[1].text).toBe(`~${open}09:30Z${close}`)
  })

  it('distinguishes supported UTC range separators from an opaque UTC offset suffix', () => {
    expect(expression(`${source('359')} opened and merged around 09:10 UTC-09:20 UTC.`)).toMatchObject({ kind: 'interval', relation: 'elapsed', start: { resolution: { kind: 'supported', evidence: { event: 'opened' } } }, end: { resolution: { kind: 'supported', evidence: { event: 'merged' } } } })
    expect(expression(`${source('359')} merged around 09:10 UTC-05:00–09:20Z.`)).toMatchObject({ kind: 'interval', start: { text: 'around 09:10 UTC-05:00', resolution: { kind: 'unresolved', reason: 'unsupported-format' } } })
  })

  it.each(['about ', 'around ', 'approximately ', 'roughly ', '~'])('shares UTC connector grammar with member qualifier %s and wrappers', (qualifier) => {
    for (const [open, close] of [['', ''], ['"', '"'], ['(', ')']]) for (const prefix of ['', 'Around ']) {
      const body = `${prefix}2026-10-14T09:10 UTC-${qualifier}${open}2026-10-14T09:20 UTC${close}.`
      const scans = scanTimeExpressions(body)
      expect(scans).toHaveLength(1)
      expect(expression(body, [])).toMatchObject({ kind: 'interval', relation: 'elapsed', start: { resolution: { kind: 'supported' } }, end: { certainty: 'approximate', resolution: { kind: 'supported' } } })
    }
  })

  it('preserves ordered source identity across unqualified member and whole-list wrappers', () => {
    const records = [facts[1], record('360', '2026-10-15T09:20:22.000Z')]
    for (const list of ['09:20Z and "09:20Z"', '"09:20Z and 09:20Z"', '(09:20Z and 09:20Z)', '"around 09:20Z and 09:20Z"']) {
      const body = `${source('359')} and ${source('360')} merged at ${list}, respectively.`
      expect(timeExpressionMembers(expression(body, records)).map(member => member.resolution), body).toMatchObject([{ kind: 'supported', at: facts[1].at, evidence: { ref: '359' } }, { kind: 'supported', at: records[1].at, evidence: { ref: '360' } }])
    }
  })

  it('uses the final source mention for a point while retaining the complete source set', () => {
    const body = `${source('359')} and ${source('360')} merged, with ${source('359')} at around 09:20Z.`
    const records = [facts[1], record('360', '2026-10-15T09:20:22.000Z')]
    expect(expression(body, records)).toMatchObject({ kind: 'point', member: { resolution: { kind: 'supported', at: facts[1].at, evidence: { ref: '359' } } } })
    expect(selectTimeRecords(body, records)).toHaveLength(2)
  })

  it.each([{ refs: ['359', '360', '359'] }, { refs: ['359', '359'] }])('does not deduplicate a repeated respectively source list $refs into a valid pairing', ({ refs }) => {
    const body = `${refs.map(source).join(' and ')} merged at 09:20Z and 09:30Z, respectively.`
    expect(timeExpressionMembers(expression(body)).every(member => member.resolution.kind === 'unresolved' && member.resolution.reason === 'ambiguous-source')).toBe(true)
  })

  it('reports expression-only unsupported clocks in the explicit group backfill', () => {
    const markdown = 'Around 2026-10-14T09:10–2026-10-14T09:20.'
    const input = [{ date: '2026-10-14', markdown }]
    expect(buildTimeBackfill(input, []).report).toEqual([])
    const proposed = buildTimeBackfill(input, [], undefined, true)
    expect(proposed.sidecar.articles['2026-10-14'].expressions).toHaveLength(1)
    expect(proposed.report).toMatchObject([{ date: '2026-10-14', resolved: 0, coverage: { expressions: 1, supportedMembers: 0, unresolvedMembers: 2 }, unresolved: [{ reason: 'unsupported-format' }, { reason: 'unsupported-format' }] }])
  })

  it('pairs an equally sized respectively list by prose order regardless of fact order', () => {
    const result = expression(`${source('359')} and ${source('360')} merged at 09:20 and 09:30Z, respectively.`, [...facts].reverse())
    expect(result.kind).toBe('list')
    expect(timeExpressionMembers(result).map(member => member.resolution)).toMatchObject([
      { kind: 'supported', at: '2026-10-14T09:20:41.000Z', evidence: { ref: '359', event: 'merged' } },
      { kind: 'supported', at: '2026-10-14T09:30:22.000Z', evidence: { ref: '360', event: 'merged' } },
    ])
    expect(timeExpressionMembers(result).map(member => member.text)).toEqual(['09:20', '09:30Z'])
  })

  it('keeps mixed bare and linked respectively sources in visible prose order', () => {
    const body = '## daily-logger\n\nPR #359 and PR [#360](https://github.com/ojfbot/daily-logger/pull/360) merged at 09:20Z and 09:20Z, respectively.'
    const result = expression(body, [facts[1], record('360', '2026-10-15T09:20:22.000Z')])
    expect(timeExpressionMembers(result).map(member => member.resolution)).toMatchObject([
      { kind: 'supported', at: '2026-10-14T09:20:41.000Z', evidence: { ref: '359' } },
      { kind: 'supported', at: '2026-10-15T09:20:22.000Z', evidence: { ref: '360' } },
    ])
  })

  it('does not admit a source-backed group when its stated calendar contradicts the records', () => {
    for (const body of [
      `${source('359')} opened and merged October 15 at 09:10–09:20Z.`,
      `${source('359')} and ${source('360')} merged October 15 at 09:20Z and 09:30Z, respectively.`,
    ]) expect(timeExpressionMembers(expression(body)).every(member => member.resolution.kind === 'unresolved')).toBe(true)
  })

  it('preserves sentence-initial qualifiers and a shared-zone truncated-date range', () => {
    for (const body of ['Around 2026-10-14T09:20Z.', 'Approximately 2026-10-14T09:10Z–2026-10-14T09:20Z.']) {
      const result = expression(body, [])
      expect(timeExpressionMembers(result).every(member => member.certainty === 'approximate')).toBe(true)
      expect(resolveTimeReferences(body, []).references).toEqual([])
    }
    const body = `${source('359')} merged about 2026-10-14T09:10–09:20Z.`
    expect(expression(body)).toMatchObject({ kind: 'interval', start: { certainty: 'approximate' }, end: { certainty: 'approximate' } })
    expect(resolveTimeReferences(body, facts).references).toEqual([])
    expect(expression('Between 2026-10-14T09:10Z and 2026-10-14T09:20Z.', [])).toMatchObject({ kind: 'interval', relation: 'elapsed' })
  })

  it('preserves start/end roles for explicitly ordered events without inventing a day', () => {
    const result = expression(`${source('359')} opened and merged at 09:10–09:20Z.`)
    expect(result).toMatchObject({ kind: 'interval', relation: 'elapsed', start: { resolution: { kind: 'supported', evidence: { event: 'opened' } } }, end: { resolution: { kind: 'supported', evidence: { event: 'merged' } } } })
  })

  it('preserves a member-only approximation and the explicit between relation', () => {
    expect(expression(`${source('359')} opened and merged between 09:10Z and 09:20Z.`)).toMatchObject({ kind: 'interval', relation: 'elapsed' })
    expect(expression(`${source('359')} opened and merged at 09:10Z–~09:20Z.`)).toMatchObject({ kind: 'interval', start: { certainty: 'exact' }, end: { text: '~09:20Z', certainty: 'approximate' } })
  })

  it('keeps ambiguous multi-source lists unresolved rather than pairing by convenient clocks', () => {
    const result = expression(`${source('359')} and ${source('360')} merged at 09:20Z and 09:30Z.`)
    expect(timeExpressionMembers(result).map(member => member.resolution)).toEqual([
      { kind: 'unresolved', reason: 'ambiguous-source' }, { kind: 'unresolved', reason: 'ambiguous-source' },
    ])
  })

  it('rejects unequal respectively counts and conflicting same-source calendar dates', () => {
    const body = `${source('359')} and ${source('360')} merged at 09:20Z, 09:30Z and 09:40Z, respectively.`
    expect(timeExpressionMembers(expression(body)).every(member => member.resolution.kind === 'unresolved')).toBe(true)
    const conflict = expression(`${source('359')} and ${source('360')} merged at 09:20Z and 09:30Z respectively.`, [...facts, record('359', '2026-10-13T09:20:41.000Z')])
    expect(timeExpressionMembers(conflict)[0].resolution).toEqual({ kind: 'unresolved', reason: 'ambiguous-source' })
  })

  it('derives a qualified recorded-event envelope from every named source before comparing bounds', () => {
    const body = `PRs [#360](https://github.com/ojfbot/daily-logger/pull/360) and [#359](https://github.com/ojfbot/daily-logger/pull/359) merged ~09:20–09:30Z.`
    const result = expression(body)
    expect(result).toMatchObject({ kind: 'interval', relation: 'event-span', start: { certainty: 'approximate', resolution: { kind: 'supported', evidence: { ref: '359' } } }, end: { certainty: 'approximate', resolution: { kind: 'supported', evidence: { ref: '360' } } } })
    expect(resolveTimeReferences(body, facts).references).toEqual([])
    const missing = expression(body, facts.filter(fact => fact.evidence.kind !== 'github-pull-request' || fact.evidence.ref !== '360'))
    expect(timeExpressionMembers(missing).map(member => member.resolution)).toEqual([{ kind: 'unresolved', reason: 'missing-evidence' }, { kind: 'unresolved', reason: 'missing-evidence' }])
    const mismatch = expression(body.replace('09:20–', '09:21–'))
    expect(timeExpressionMembers(mismatch).every(member => member.resolution.kind === 'unresolved' && member.resolution.reason === 'clock-mismatch')).toBe(true)
    const wrongDate = expression(body.replace('merged ~', 'merged October 15 ~'))
    expect(timeExpressionMembers(wrongDate).every(member => member.resolution.kind === 'unresolved')).toBe(true)
    const threeSources = body.replace('PRs ', `PRs [#361](https://github.com/ojfbot/daily-logger/pull/361), `)
    expect(expression(threeSources, [...facts, record('361', '2026-10-14T09:25:00.000Z')])).toMatchObject({ kind: 'interval', relation: 'event-span', start: { resolution: { kind: 'supported', evidence: { ref: '359' } } }, end: { resolution: { kind: 'supported', evidence: { ref: '360' } } } })
    expect(timeExpressionMembers(expression(threeSources)).every(member => member.resolution.kind === 'unresolved')).toBe(true)
  })

  it('never assigns the article date or next day to a clock-only endpoint', () => {
    const result = expression('2026-10-14T23:50:00Z–00:10Z', [])
    expect(result).toMatchObject({ kind: 'interval', relation: 'unestablished', start: { resolution: { kind: 'supported', at: '2026-10-14T23:50:00.000Z' } }, end: { resolution: { kind: 'unresolved', reason: 'missing-date' } } })
    const dated = expression('2026-10-14T23:50:00Z–2026-10-15T00:10:00Z', [])
    expect(dated).toMatchObject({ kind: 'interval', relation: 'elapsed', end: { resolution: { at: '2026-10-15T00:10:00.000Z', evidence: { kind: 'explicit-offset' } } } })
  })

  it('shares inline text structure but never joins different paragraphs', () => {
    expect(expression(`${source('359')} opened and merged at **09:10**–**09:20Z**.`)).toMatchObject({ text: '09:10–09:20Z', kind: 'interval' })
    expect(scanTimeExpressions('09:10\n\nand 09:20Z')).toEqual([])
    expect(resolveTimeReferences('09:10\n\nand 09:20Z', []).expressions).toBeUndefined()
  })

  it('retains complete conflicting source groups for generation of a qualified list', () => {
    const conflict = record('359', '2026-10-13T09:20:41.000Z')
    const unrelated = record('999', '2026-10-14T09:20:41.000Z')
    const selected = selectTimeRecords(`${source('359')} and ${source('360')} merged at 09:20 and 09:30Z respectively.`, [...facts, conflict, unrelated])
    expect(selected).toHaveLength(4)
    expect(selected).toContainEqual(conflict)
    expect(selected).not.toContainEqual(unrelated)
  })

  it('keeps unsupported zones, mutable events and bounds qualified rather than exact', () => {
    expect(timeExpressionMembers(expression('09:10 CDT–09:20 CDT', [])).map(member => member.resolution)).toEqual([{ kind: 'unresolved', reason: 'unsupported-format' }, { kind: 'unresolved', reason: 'unsupported-format' }])
    expect(timeExpressionMembers(expression(`${source('359')} updated at 09:10–09:20Z.`)).every(member => member.resolution.kind === 'unresolved' && member.resolution.reason === 'mutable-event')).toBe(true)
    expect(timeExpressionMembers(expression(`${source('359')} merged before 09:10–09:20Z.`)).every(member => member.resolution.kind === 'unresolved' && member.resolution.reason === 'ineligible-context')).toBe(true)
  })

  it('does not let approximate duration prose suppress a later exact event clock', () => {
    const body = `${source('359')} merged about six hours later at 09:20Z.`
    expect(resolveTimeReferences(body, facts).references[0]?.at).toBe('2026-10-14T09:20:41.000Z')
  })

  it('requires a matching independent historical group claim without reviving a withheld exact endpoint', () => {
    const content = article(`${source('359')} opened and merged at ~09:10–09:20Z.`)
    const raw = resolveTimeReferences(content, facts)
    const sidecar = { bodySha256: articleBodySha256(content), references: [], expressions: raw.expressions }
    const unregistered = articleTimeMetadata({ content, records: facts, sidecar: { ...sidecar, expressions: undefined } })
    expect(timeExpressionMembers(TimeExpressionSchema.parse(unregistered.expressions?.[0])).every(member => member.resolution.kind === 'unresolved' && member.resolution.reason === 'historical-claim-required')).toBe(true)
    expect(articleTimeMetadata({ content, records: facts, sidecar }).expressions).toEqual(raw.expressions)
    expect(articleTimeMetadata({ content, records: facts, sidecar }).references).toEqual([])
    const bindingContent = `${content}\n<!-- managed action output -->\n`
    const rebound = { ...sidecar, bodySha256: articleBodySha256(bindingContent) }
    expect(articleTimeMetadata({ content, bindingContent, records: facts, sidecar: rebound }).expressions).toEqual(raw.expressions)
    const staleBinding = articleTimeMetadata({ content, bindingContent: `${bindingContent}changed`, records: facts, sidecar: rebound })
    expect(timeExpressionMembers(TimeExpressionSchema.parse(staleBinding.expressions?.[0])).every(member => member.resolution.kind === 'unresolved')).toBe(true)

    const changed = articleTimeMetadata({ content: `${content}\nChanged prose.`, records: facts, sidecar })
    expect(timeExpressionMembers(TimeExpressionSchema.parse(changed.expressions?.[0])).every(member => member.resolution.kind === 'unresolved')).toBe(true)
    const missingFacts = articleTimeMetadata({ content, records: [], sidecar })
    expect(timeExpressionMembers(TimeExpressionSchema.parse(missingFacts.expressions?.[0])).every(member => member.resolution.kind === 'unresolved')).toBe(true)
  })

  it('keeps the actual October 17 merge envelope withheld until its source-checked group claim exists', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url))
    const content = readFileSync(join(root, '_articles/2026-10-17.md'), 'utf8')
    const records = TimeRecordSchema.array().parse(JSON.parse(readFileSync(join(root, 'api/time-evidence.json'), 'utf8')).records)
    const sidecar = TimeReferenceSidecarSchema.parse(JSON.parse(readFileSync(join(root, 'api/time-refs.json'), 'utf8'))).articles['2026-10-17']
    const raw = resolveTimeReferences(content, records)
    const group = TimeExpressionSchema.parse(raw.expressions?.find(item => item.text === '~19:28–19:42Z'))
    expect(group).toMatchObject({ kind: 'interval', relation: 'event-span', start: { certainty: 'approximate', resolution: { kind: 'supported', at: '2026-10-16T19:28:00.000Z', evidence: { ref: '369' } } }, end: { certainty: 'approximate', resolution: { kind: 'supported', at: '2026-10-16T19:42:31.000Z', evidence: { ref: '371' } } } })
    const before = articleTimeMetadata({ content, records, sidecar: { ...sidecar, expressions: undefined } })
    const withheld = TimeExpressionSchema.parse(before.expressions?.find(item => item.text === group.text))
    expect(timeExpressionMembers(withheld).every(member => member.resolution.kind === 'unresolved' && member.resolution.reason === 'historical-claim-required')).toBe(true)
    const admitted = articleTimeMetadata({ content, records, sidecar: { ...sidecar, expressions: [group] } })
    expect(admitted.expressions).toContainEqual(group)
    expect(admitted.references).toEqual(before.references)
    expect(admitted.references.some(reference => reference.text === '19:42Z')).toBe(false)
    const forged = { ...group, occurrence: group.occurrence + 1 }
    expect(articleTimeMetadata({ content, records, sidecar: { ...sidecar, expressions: [forged] } }).warnings).toContain('Dropped grouped time claim without matching independent current-prose/source evidence')
  })

  it('rejects a contradictory group/flat-instant wire object rather than stripping its discriminant', () => {
    const group = expression('2026-10-14T09:10:00Z–2026-10-14T09:20:00Z', [])
    const hybrid = { ...group, at: '2026-10-14T09:10:00.000Z', precision: 'minute', evidence: { kind: 'explicit-offset', value: '2026-10-14T09:10:00Z' } }
    expect(TimeDisplayReferenceSchema.safeParse(hybrid).success).toBe(false)
  })

  it('emits historical group proposals only under the explicit reconstruction option', () => {
    const markdown = article(`${source('359')} opened and merged at ~09:10–09:20Z.`)
    const articles = [{ date: '2026-10-14', markdown }]
    expect(buildTimeBackfill(articles, facts).sidecar.articles['2026-10-14'].expressions).toBeUndefined()
    expect(buildTimeBackfill(articles, facts, undefined, true).sidecar.articles['2026-10-14'].expressions).toEqual(resolveTimeReferences(markdown, facts).expressions)
  })

  it('reports shared-zone grouped conversions without calling their supported members unsupported', () => {
    const markdown = article(`${source('359')} and ${source('360')} merged at 09:20 and 09:30Z respectively.`)
    const result = buildTimeBackfill([{ date: '2026-10-14', markdown }], facts, undefined, true)
    expect(result.report[0]).toMatchObject({ resolved: 2, unresolved: [], coverage: { instantReferences: 0, expressions: 1, supportedMembers: 2, unresolvedMembers: 0 } })
    const dated = buildTimeBackfill([{ date: '2026-10-14', markdown: article('2026-10-14T09:10Z–2026-10-14T09:20Z') }], [], undefined, true)
    expect(dated.report[0].resolved).toBe(2)
  })

  it('derives groups from the immutable new-format artifact while preserving article draft state', () => {
    const directory = mkdtempSync(join(tmpdir(), 'time-expression-lifecycle-'))
    try {
      const markdown = article(`${source('359')} and ${source('360')} merged at 09:20 and 09:30Z respectively.`)
      const prepared = prepareGeneratedTime({ date: '2026-10-14', markdown, records: facts, capture: { observedAt: null, window: null } })
      const written = persistGeneratedTime({ repoRoot: directory, prepared })
      const persisted = readFileSync(written.articlePath, 'utf8')
      const read = readArticleTime({ repoRoot: directory, date: '2026-10-14', markdown: persisted })
      expect(persisted).toContain('status: draft')
      expect(timeExpressionMembers(TimeExpressionSchema.parse(read.expressions?.[0])).map(member => member.resolution)).toMatchObject([{ kind: 'supported', evidence: { ref: '359' } }, { kind: 'supported', evidence: { ref: '360' } }])
      const revised = readArticleTime({ repoRoot: directory, date: '2026-10-14', markdown: persisted.replace(source('360'), source('999')) })
      expect(timeExpressionMembers(TimeExpressionSchema.parse(revised.expressions?.[0]))[1].resolution).toEqual({ kind: 'unresolved', reason: 'missing-evidence' })
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })

  it('publishes grouped values through the actual API builder without changing the existing action queue', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'time-expression-api-'))
    try {
      const sourceRoot = fileURLToPath(new URL('../..', import.meta.url))
      execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--shared', '--quiet', sourceRoot, directory])
      buildApi(directory)
      const beforeActions = readFileSync(join(directory, 'api/actions.json'))
      const beforeDone = readFileSync(join(directory, 'api/done-actions.json'))
      const markdown = article(`${source('359')} and ${source('360')} merged at 09:20 and 09:30Z respectively.`).replace('date: 2026-10-14', 'date: 2026-11-01')
      const prepared = prepareGeneratedTime({ date: '2026-11-01', markdown, records: facts, capture: { observedAt: null, window: null } })
      persistGeneratedTime({ repoRoot: directory, prepared })
      const registry = readActionRegistry(directory)
      const review = await reviewArticleActions({ cycle: generationActionCycle(), registry, articleStatuses: new Map([['2026-11-01', 'draft']]), articleDate: '2026-11-01', markdown: prepared.markdown, feedback: '', sources: [], agents: mockActionAgents })
      writeActionRegistry(directory, review.registry, registryRevision(registry))
      buildApi(directory)
      const api = z.object({ status: z.literal('draft'), timeReferences: z.array(TimeDisplayReferenceSchema) }).parse(JSON.parse(readFileSync(join(directory, 'api/articles/2026-11-01.json'), 'utf8')))
      expect(api.timeReferences).toMatchObject([{ kind: 'list', members: [{ resolution: { kind: 'supported', at: '2026-10-14T09:20:41.000Z' } }, { resolution: { kind: 'supported', at: '2026-10-14T09:30:22.000Z' } }] }])
      expect(readFileSync(join(directory, 'api/actions.json'))).toEqual(beforeActions)
      expect(readFileSync(join(directory, 'api/done-actions.json'))).toEqual(beforeDone)
    } finally { rmSync(directory, { recursive: true, force: true }) }
  }, 30_000)
})

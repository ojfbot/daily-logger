import { createHash } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { persistGeneratedTime, prepareGeneratedTime, readArticleTime } from '../article-time-metadata.js'
import { type TimeRecord } from '../time-references.js'

const roots: string[] = []
function root() { const path = mkdtempSync(join(tmpdir(), 'time-store-')); roots.push(path); return path }
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })
const date = '2026-10-15'
const markdown = `---\ntitle: Time\ndate: ${date}\n---\n\nPR [#359](https://github.com/ojfbot/daily-logger/pull/359) merged at 09:10Z.\n`
const record: TimeRecord = { at: '2026-10-14T09:10:41.000Z', evidence: { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '359', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/359' } }
const capture = { observedAt: '2026-10-15T09:01:00.000Z', window: null }
function prepare(records = [record], text = markdown) { return prepareGeneratedTime({ date, markdown: text, records, capture }) }
function mutateArtifact(repoRoot: string, text: string, mutate: (raw: Record<string, unknown>) => void) {
  const digest = /^time_records_sha256: (.+)$/m.exec(text)![1]
  const original = join(repoRoot, 'api/time-records', date, `${digest}.json`)
  const raw: Record<string, unknown> = JSON.parse(readFileSync(original, 'utf-8'))
  mutate(raw)
  const bytes = `${JSON.stringify(raw)}\n`
  const changed = createHash('sha256').update(bytes).digest('hex')
  writeFileSync(join(dirname(original), `${changed}.json`), bytes)
  return text.replace(digest, changed)
}

describe('immutable article time-record persistence', () => {
  it('prepares without writes, strips model metadata, and freezes the final pointer-bearing article', () => {
    const repoRoot = root()
    const injected = markdown.replace(`date: ${date}`, `date: ${date}\ntime_references: [{"forged":true}]\ntime_references_body_sha256: ${'f'.repeat(64)}\ntime_records_sha256: ${'e'.repeat(64)}`)
    const prepared = prepare([record], injected)
    expect(readdirSync(repoRoot)).toEqual([])
    expect(Object.isFrozen(prepared)).toBe(true)
    expect(prepared.markdown).toContain(`time_records_sha256: ${prepared.digest}`)
    expect(prepared.markdown).not.toContain('time_references:')
    expect(prepared.markdown).not.toContain('time_references_body_sha256:')
    expect(() => prepareGeneratedTime({ date: '../outside', markdown, records: [record], capture })).toThrow('date')
    expect(() => prepareGeneratedTime({ date, markdown, records: [record], capture: { observedAt: 'not-time', window: null } })).toThrow('observedAt')
  })
  it('installs exact immutable canonical bytes before article replacement and safely retries identical preparation', () => {
    const repoRoot = root(), prepared = prepare()
    const written = persistGeneratedTime({ repoRoot, prepared })
    expect(readFileSync(written.articlePath, 'utf-8')).toBe(prepared.markdown)
    const bytes = readFileSync(written.artifactPath, 'utf-8')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(prepared.digest)
    expect(persistGeneratedTime({ repoRoot, prepared })).toEqual(written)
    expect(readdirSync(dirname(written.artifactPath))).toEqual([`${prepared.digest}.json`])
    const result = readArticleTime({ repoRoot, date, markdown: prepared.markdown })
    expect(result.references).toHaveLength(1)
    expect(result.references[0]?.at).toBe(record.at)
    expect(result.capture).toMatchObject({ observedAt: capture.observedAt, window: null, status: 'complete' })
    expect(() => persistGeneratedTime({ repoRoot, prepared: { ...prepared } })).toThrow('prepareGeneratedTime')
  })
  it('retains competing complete source facts and does not manufacture uniqueness by filtering displayed clocks', () => {
    const repoRoot = root()
    const conflicting = { ...record, at: '2025-10-14T09:10:41.000Z' }
    const nonmatching = { ...record, at: '2024-10-14T10:10:41.000Z' }
    const prepared = prepare([record, conflicting, nonmatching])
    const saved = persistGeneratedTime({ repoRoot, prepared })
    expect(JSON.parse(readFileSync(saved.artifactPath, 'utf-8')).records).toHaveLength(3)
    expect(readArticleTime({ repoRoot, date, markdown: prepared.markdown }).references).toEqual([])
    expect(prepare([nonmatching, conflicting, record]).digest).toBe(prepared.digest)
  })
  it('does not retain unrelated fleet sources or let revised prose introduce unretained evidence', () => {
    const unrelated: TimeRecord = { ...record, evidence: { kind: 'github-pull-request', repo: 'ojfbot/private-project', ref: '1', event: 'merged', url: 'https://github.com/ojfbot/private-project/pull/1' } }
    const repoRoot = root(), prepared = prepare([record, unrelated])
    const saved = persistGeneratedTime({ repoRoot, prepared })
    expect(readFileSync(saved.artifactPath, 'utf-8')).not.toContain('private-project')
    expect(readArticleTime({ repoRoot, date, markdown: prepared.markdown.replaceAll('359', '360') }).references).toEqual([])
    const secondRoot = root()
    expect(readArticleTime({ repoRoot: secondRoot, date, markdown: prepared.markdown }).references).toEqual([])
  })
  it('reports missing, malformed, wrong-date, noncanonical, and digest-conflicting artifact data without admitting Git times', () => {
    const repoRoot = root(), prepared = prepare(), saved = persistGeneratedTime({ repoRoot, prepared })
    expect(readArticleTime({ repoRoot, date, markdown: prepared.markdown.replace(prepared.digest, 'a'.repeat(64)) }).references).toEqual([])
    expect(readArticleTime({ repoRoot, date, markdown: prepared.markdown.replace(prepared.digest, '../escape') }).references).toEqual([])
    const wrongDate = mutateArtifact(repoRoot, prepared.markdown, (raw) => { raw.date = '2026-10-14' })
    expect(readArticleTime({ repoRoot, date, markdown: wrongDate }).references).toEqual([])
    const noncanonical = mutateArtifact(repoRoot, prepared.markdown, (raw) => { const captured = raw.capture; delete raw.capture; raw.capture = captured })
    expect(readArticleTime({ repoRoot, date, markdown: noncanonical }).references).toEqual([])
    const invalidSchema = mutateArtifact(repoRoot, prepared.markdown, (raw) => { raw.schemaVersion = 99 })
    expect(readArticleTime({ repoRoot, date, markdown: invalidSchema }).references).toEqual([])
    rmSync(saved.artifactPath)
    writeFileSync(saved.artifactPath, '{}\n')
    const invalid = readArticleTime({ repoRoot, date, markdown: prepared.markdown })
    expect(invalid.references).toEqual([])
    expect(invalid.warnings.join(' ')).toContain('invalid')
    expect(() => persistGeneratedTime({ repoRoot, prepared })).toThrow('conflicts')
    expect(readFileSync(saved.articlePath, 'utf-8')).toBe(prepared.markdown)
  })
  it('rejects symlink/hardlink artifacts and symlinked storage directories or article destinations', () => {
    const repoRoot = root(), prepared = prepare(), saved = persistGeneratedTime({ repoRoot, prepared })
    const copy = join(repoRoot, 'copy.json')
    writeFileSync(copy, readFileSync(saved.artifactPath))
    rmSync(saved.artifactPath)
    symlinkSync(copy, saved.artifactPath)
    expect(readArticleTime({ repoRoot, date, markdown: prepared.markdown }).references).toEqual([])
    rmSync(saved.artifactPath)
    linkSync(copy, saved.artifactPath)
    expect(readArticleTime({ repoRoot, date, markdown: prepared.markdown }).references).toEqual([])
    const otherRoot = root(), outside = root()
    symlinkSync(outside, join(otherRoot, 'api'))
    expect(() => persistGeneratedTime({ repoRoot: otherRoot, prepared })).toThrow('directories')
    expect(existsSync(join(otherRoot, '_articles', `${date}.md`))).toBe(false)
    const articleRoot = root()
    mkdirSync(join(articleRoot, '_articles'))
    symlinkSync(copy, join(articleRoot, '_articles', `${date}.md`))
    expect(() => persistGeneratedTime({ repoRoot: articleRoot, prepared })).toThrow('regular file')
    rmSync(join(articleRoot, '_articles', `${date}.md`))
    symlinkSync(join(articleRoot, 'missing.md'), join(articleRoot, '_articles', `${date}.md`))
    expect(() => persistGeneratedTime({ repoRoot: articleRoot, prepared })).toThrow('regular file')
  })
  it('retains no Git records when complete selection exceeds 256 records or 64KiB and still self-resolves full stated timestamps', () => {
    const bounded = Array.from({ length: 256 }, (_, index) => ({ ...record, at: `${String(1700 + index).padStart(4, '0')}-10-14T09:10:41.000Z` }))
    const atLimit = prepare(bounded)
    const repoRoot = root(), saved = persistGeneratedTime({ repoRoot, prepared: atLimit })
    expect(JSON.parse(readFileSync(saved.artifactPath, 'utf-8')).capture.status).toBe('complete')
    const exhausted = prepare([...bounded, { ...record, at: '2100-10-14T09:10:41.000Z' }], `${markdown}\nExplicit 2026-10-14T09:10:41Z.\n`)
    const exhaustedRoot = root(), exhaustedSaved = persistGeneratedTime({ repoRoot: exhaustedRoot, prepared: exhausted })
    const captured = JSON.parse(readFileSync(exhaustedSaved.artifactPath, 'utf-8'))
    expect(captured.records).toEqual([])
    expect(captured.capture).toMatchObject({ status: 'exhausted', diagnostics: ['record-limit'] })
    const result = readArticleTime({ repoRoot: exhaustedRoot, date, markdown: exhausted.markdown })
    expect(result.references.map((reference) => reference.evidence.kind)).toEqual(['explicit-offset'])
    expect(result.warnings.join(' ')).toContain('exhausted')
    const longName = 'r'.repeat(40000)
    const oversized: TimeRecord = { ...record, evidence: { kind: 'github-pull-request', repo: `ojfbot/${longName}`, ref: '359', event: 'merged', url: `https://github.com/ojfbot/${longName}/pull/359` } }
    const oversizedPrepared = prepare([oversized], markdown.replaceAll('daily-logger', longName))
    const oversizedRoot = root(), oversizedSaved = persistGeneratedTime({ repoRoot: oversizedRoot, prepared: oversizedPrepared })
    expect(JSON.parse(readFileSync(oversizedSaved.artifactPath, 'utf-8')).capture).toMatchObject({ status: 'exhausted', diagnostics: ['byte-limit'] })
  })
})

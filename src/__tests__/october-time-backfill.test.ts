import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { articleTimeMetadata } from '../article-time-metadata.js'
import { TimeRecordSchema, TimeReferenceSidecarSchema } from '../time-references.js'
import { buildApi } from '../build-api.js'
import { vi } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const base = 'faac3c9bb310bc0fc1c1ec445433e310e0498558'
const fixture = 'docs/time-backfill/2026-10'
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const frozen = (path: string) => execFileSync('git', ['show', `${base}:${path}`], { cwd: root, encoding: 'utf8' })

describe('frozen metadata-only October backfill', () => {
  it('publishes all three October 17 merge references without stale binding warnings (F9r)', () => {
    const directory = mkdtempSync(join(tmpdir(), 'october-api-build-'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      for (const path of ['_articles', 'actions', 'action-admissions', 'reviews', 'api']) cpSync(join(root, path), join(directory, path), { recursive: true })
      writeFileSync(join(directory, '.git'), `gitdir: ${execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf8' }).trim()}\n`)
      buildApi(directory)
      expect(warning.mock.calls.flat().join('\n')).not.toContain('Stale time-reference')
      const entries = JSON.parse(readFileSync(join(directory, 'api/entries.json'), 'utf8'))
      const article = entries.find((entry: { date: string }) => entry.date === '2026-10-17')
      expect(article.timeReferences.filter((reference: { text: string }) => ['06:22Z', '21:05Z', '13:34Z'].includes(reference.text)).map((reference: { text: string; evidence: { ref: string } }) => [reference.text, reference.evidence.ref])).toEqual([['06:22Z', '370'], ['21:05Z', '373'], ['13:34Z', '366']])
    } finally { warning.mockRestore(); output.mockRestore(); rmSync(directory, { recursive: true, force: true }) }
  }, 20_000)
  it('replays byte-identically, refuses unrelated edits before any apply, and applies idempotently', () => {
    const directory = mkdtempSync(join(tmpdir(), 'october-time-replay-test-'))
    try {
      const checkout = join(directory, 'repo')
      mkdirSync(checkout)
      const archive = execFileSync('git', ['archive', base, '_articles', 'src', 'api/time-evidence.json', 'api/time-refs.json', 'api/time-refs-report.json', 'package.json'], { cwd: root, maxBuffer: 32 * 1024 * 1024 })
      execFileSync('tar', ['-x', '-C', checkout], { input: archive })
      const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf8' }).trim()
      writeFileSync(join(checkout, '.git'), `gitdir: ${gitDirectory}\n`)
      symlinkSync(join(root, 'node_modules'), join(checkout, 'node_modules'), 'dir')
      cpSync(join(root, fixture), join(checkout, fixture), { recursive: true })
      mkdirSync(join(checkout, 'scripts'))
      cpSync(join(root, 'scripts/backfill-time-month.mjs'), join(checkout, 'scripts/backfill-time-month.mjs'))
      const run = (output: string, apply = false) => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/backfill-time-month.mjs', '--month', '2026-10', '--out', output, ...(apply ? ['--apply'] : [])], { cwd: checkout, encoding: 'utf8', stdio: 'pipe' })
      const first = join(directory, 'first'), second = join(directory, 'second')
      run(first)
      run(second)
      run(first)
      const paths = ['api/time-evidence.json', 'api/time-refs.json', 'api/time-refs-report.json', 'manifest.json']
      for (const path of paths) expect(readFileSync(join(first, path))).toEqual(readFileSync(join(second, path)))
      expect(readFileSync(join(first, 'manifest.json'))).toEqual(readFileSync(join(root, fixture, 'manifest.json')))
      const alias = join(directory, 'output-alias')
      symlinkSync(checkout, alias, 'dir')
      expect(() => run(alias)).toThrow()
      expect(existsSync(join(checkout, 'manifest.json'))).toBe(false)
      const report = join(checkout, 'api/time-refs-report.json')
      writeFileSync(report, 'unrelated edit\n')
      expect(() => run(first, true)).toThrow()
      for (const path of paths.slice(0, 2)) expect(readFileSync(join(checkout, path), 'utf8')).toBe(frozen(path))
      expect(readFileSync(report, 'utf8')).toBe('unrelated edit\n')
      writeFileSync(report, frozen('api/time-refs-report.json'))
      run(first, true)
      run(first, true)
      for (const path of paths.slice(0, 3)) expect(readFileSync(join(checkout, path))).toEqual(readFileSync(join(first, path)))
      const articlePaths = execFileSync('git', ['ls-tree', '-r', '--name-only', base, '_articles'], { cwd: root, encoding: 'utf8' }).trim().split('\n')
      for (const path of articlePaths) expect(digest(readFileSync(join(checkout, path)))).toBe(digest(frozen(path)))
    } finally { rmSync(directory, { recursive: true, force: true }) }
  }, 60_000)

  it('admits three exact merge events, preserves prior bindings, and leaves approximate ranges and non-events plain', () => {
    const records = TimeRecordSchema.array().parse(JSON.parse(readFileSync(join(root, 'api/time-evidence.json'), 'utf8')).records)
    const sidecar = TimeReferenceSidecarSchema.parse(JSON.parse(readFileSync(join(root, 'api/time-refs.json'), 'utf8')))
    const before = TimeReferenceSidecarSchema.parse(JSON.parse(frozen('api/time-refs.json')))
    for (const [date, prior] of Object.entries(before.articles)) {
      for (const reference of prior.references) expect(sidecar.articles[date]?.references).toContainEqual(reference)
    }
    const content = readFileSync(join(root, '_articles/2026-10-17.md'), 'utf8')
    const admitted = articleTimeMetadata({ content, records, sidecar: sidecar.articles['2026-10-17'] })
    expect(admitted.warnings).toEqual([])
    expect(admitted.references.filter(reference => reference.evidence.kind === 'github-pull-request').map(reference => [reference.text, reference.at.slice(0, 10), reference.evidence])).toEqual([
      ['06:22Z', '2026-10-17', { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '370', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/370' }],
      ['21:05Z', '2026-10-16', { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '373', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/373' }],
      ['13:34Z', '2026-10-16', { kind: 'github-pull-request', repo: 'ojfbot/daily-logger', ref: '366', event: 'merged', url: 'https://github.com/ojfbot/daily-logger/pull/366' }],
    ])
    expect(admitted.references.some(reference => ['09:00 UTC', '19:42Z', '18:21Z', '06:30Z'].includes(reference.text))).toBe(false)
    expect(articleTimeMetadata({ content, records: [], sidecar: sidecar.articles['2026-10-17'] }).references.filter(reference => reference.evidence.kind !== 'explicit-offset')).toEqual([])
    const wrongDay = records.map(record => record.evidence.kind === 'github-pull-request' && record.evidence.ref === '370' && record.evidence.event === 'merged' ? { ...record, at: '2025-10-17T06:22:23.000Z' } : record)
    expect(articleTimeMetadata({ content, records: wrongDay, sidecar: sidecar.articles['2026-10-17'] }).references.filter(reference => reference.evidence.kind !== 'explicit-offset').map(reference => reference.text)).toEqual(['21:05Z', '13:34Z'])
  })
})

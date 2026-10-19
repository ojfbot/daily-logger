import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { KNOWN_REPOS } from './fleet.js'
import { articleBody, articleBodySha256, canonicalInstant, resolveTimeReferences, scanTimeTokens, unsupportedTimeTokens, TimeRecordSchema, TimeReferenceSidecarSchema, type TimeRecord, type TimeReferenceSidecar } from './time-references.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const EvidenceSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  records: z.array(TimeRecordSchema),
  failures: z.array(z.object({ request: z.string(), reason: z.string() })),
})
export type EvidenceSnapshot = z.infer<typeof EvidenceSnapshotSchema>
export interface ArticleInput { date: string; markdown: string }
export interface TimeSourceRequest { kind: 'commit' | 'pull'; repo: string; ref: string }

export function parseBackfillOptions(args: string[]): { harvest: boolean; write: boolean; snapshot: string; output: string; report: string; shard?: { index: number; count: number }; merge: string[] } {
  let harvest = false, write = false, snapshot = join(ROOT, 'api/time-evidence.json'), output = join(ROOT, 'api/time-refs.json'), report = join(ROOT, 'api/time-refs-report.json')
  let shard: { index: number; count: number } | undefined
  let explicitOutput = false
  const merge: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--harvest') { harvest = true; continue }
    if (arg === '--write') { write = true; continue }
    if (!['--snapshot', '--output', '--report', '--shard', '--merge'].includes(arg)) throw new Error(`Unknown option: ${arg}`)
    const value = args[++i]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
    if (arg === '--snapshot') snapshot = resolve(value)
    if (arg === '--output') { output = resolve(value); explicitOutput = true }
    if (arg === '--report') report = resolve(value)
    if (arg === '--merge') merge.push(resolve(value))
    if (arg === '--shard') {
      const match = /^(\d+)\/(\d+)$/.exec(value)
      if (!match || Number(match[2]) < 1 || Number(match[1]) >= Number(match[2])) throw new Error('--shard must be a zero-based index/count, for example 0/4')
      shard = { index: Number(match[1]), count: Number(match[2]) }
    }
  }
  if (shard && (!explicitOutput || harvest || merge.length)) throw new Error('Shard replay requires a dedicated --output and cannot harvest or merge shared data')
  if (shard) report = `${output}.report.json`
  if (![snapshot, output, report].every((path) => path.endsWith('.json'))) throw new Error('Snapshot, output, and report must use .json files')
  if (merge.length && harvest) throw new Error('Merge cannot also harvest')
  if (new Set([snapshot, output, report]).size !== 3) throw new Error('Snapshot, output, and report must be distinct paths')
  if (merge.includes(output) || merge.includes(report)) throw new Error('Merge output/report must not overwrite an input shard')
  return { harvest, write, snapshot, output, report, shard, merge }
}

/** Only time-bearing blocks are harvested. No issue bodies, credentials, or general repository content are cached. */
export function discoverTimeSources(articles: ArticleInput[]): TimeSourceRequest[] {
  const requests = new Map<string, TimeSourceRequest>()
  const add = (request: TimeSourceRequest) => requests.set(`${request.kind}:${request.repo}:${request.ref}`, request)
  for (const article of articles) {
    const body = articleBody(article.markdown)
    const repos = new Set(KNOWN_REPOS)
    for (const match of body.matchAll(/https:\/\/github\.com\/ojfbot\/([A-Za-z0-9][A-Za-z0-9_.-]*)\//g)) repos.add(match[1])
    let offset = 0
    for (const paragraph of body.split('\n\n')) {
      const start = offset
      offset += paragraph.length + 2
      if (!scanTimeTokens(paragraph).length && !unsupportedTimeTokens(paragraph).length) continue
      const heading = [...body.slice(0, start).matchAll(/^#{1,6} (.+)$/gm)].at(-1)?.[1] ?? ''
      const block = `${heading}\n${paragraph}`
      for (const match of block.matchAll(/https:\/\/github\.com\/(ojfbot\/[A-Za-z0-9][A-Za-z0-9_.-]*)\/(pull|commit)\/([a-f0-9]+)\b/g)) {
        if (match[2] === 'pull' && /^[1-9]\d*$/.test(match[3])) add({ kind: 'pull', repo: match[1], ref: match[3] })
        if (match[2] === 'commit' && /^[a-f0-9]{7,40}$/.test(match[3])) add({ kind: 'commit', repo: match[1], ref: match[3] })
      }
      for (const repo of repos) {
        const escaped = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (!new RegExp(`\\b${escaped}\\b`, 'i').test(block)) continue
        for (const match of block.matchAll(new RegExp(`\\b${escaped}\\s+(?:PR\\s*)?#([1-9]\\d*)\\b`, 'gi'))) add({ kind: 'pull', repo: `ojfbot/${repo}`, ref: match[1] })
        for (const match of block.matchAll(/\b[a-f0-9]{7,40}\b/gi)) add({ kind: 'commit', repo: `ojfbot/${repo}`, ref: match[0].toLowerCase() })
        if (heading.includes(repo)) for (const match of block.matchAll(/\bPR #([1-9]\d*)\b/g)) add({ kind: 'pull', repo: `ojfbot/${repo}`, ref: match[1] })
      }
    }
  }
  return [...requests.values()].sort((a, b) => `${a.kind}:${a.repo}:${a.ref}`.localeCompare(`${b.kind}:${b.repo}:${b.ref}`))
}

const CommitResponseSchema = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/), commit: z.object({ author: z.object({ date: z.string() }), committer: z.object({ date: z.string() }) }) })
const PullResponseSchema = z.object({
  number: z.number().int().positive(),
  state: z.enum(['open', 'closed']).optional(),
  merged: z.boolean().optional(),
  created_at: z.string(),
  merged_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  updated_at: z.string(),
})

export function recordsFromGitHubResponse(request: TimeSourceRequest, response: unknown): TimeRecord[] {
  if (!/^ojfbot\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(request.repo)) throw new Error('Only explicit ojfbot repository sources are supported')
  const records: TimeRecord[] = []
  if (request.kind === 'commit') {
    if (!/^[a-f0-9]{7,40}$/.test(request.ref)) throw new Error('Invalid commit reference')
    const parsed = CommitResponseSchema.parse(response)
    if (!parsed.sha.startsWith(request.ref)) throw new Error('Commit response identity mismatch')
    for (const [event, value] of [['authored', parsed.commit.author.date], ['committed', parsed.commit.committer.date]] as const) {
      const at = canonicalInstant(value)
      if (at) records.push({ at, evidence: { kind: 'github-commit', repo: request.repo, ref: parsed.sha, event, url: `https://github.com/${request.repo}/commit/${parsed.sha}` } })
    }
  } else {
    if (!/^[1-9]\d*$/.test(request.ref)) throw new Error('Invalid pull request reference')
    const parsed = PullResponseSchema.parse(response)
    if (String(parsed.number) !== request.ref) throw new Error('Pull response identity mismatch')
    for (const [event, value] of [['opened', parsed.created_at], ['closed', parsed.closed_at], ['updated', parsed.updated_at]] as const) {
      const at = value && canonicalInstant(value)
      if (at) records.push({ at, evidence: { kind: 'github-pull-request', repo: request.repo, ref: request.ref, event, url: `https://github.com/${request.repo}/pull/${request.ref}` } })
    }
    const mergedAt = parsed.merged_at && canonicalInstant(parsed.merged_at)
    if (mergedAt && parsed.merged !== false) records.push({ at: mergedAt, evidence: { kind: 'github-pull-request', repo: request.repo, ref: request.ref, event: 'merged', url: `https://github.com/${request.repo}/pull/${request.ref}` } })
    const observedAt = canonicalInstant(parsed.updated_at)
    if (observedAt && parsed.state === 'closed' && parsed.merged === false && parsed.merged_at === null) {
      records.push({ at: observedAt, evidence: { kind: 'github-pull-request', repo: request.repo, ref: request.ref, event: 'closed-unmerged', url: `https://github.com/${request.repo}/pull/${request.ref}` } })
    }
  }
  return records
}

function harvestEvidence(requests: TimeSourceRequest[]): EvidenceSnapshot {
  const records: TimeRecord[] = [], failures: EvidenceSnapshot['failures'] = []
  for (const [index, request] of requests.entries()) {
    const key = `${request.kind}:${request.repo}:${request.ref}`
    process.stderr.write(`\rHarvesting ${index + 1}/${requests.length} ${key.padEnd(85)}`)
    try {
      const raw = execFileSync('gh', ['api', `repos/${request.repo}/${request.kind === 'pull' ? 'pulls' : 'commits'}/${request.ref}`], { encoding: 'utf-8', timeout: 30_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
      const response: unknown = JSON.parse(raw)
      records.push(...recordsFromGitHubResponse(request, response))
    } catch {
      // Missing/deleted objects, permissions, and network failures remain explicit unresolved evidence.
      failures.push({ request: key, reason: 'Source unavailable or invalid; no timestamp inferred' })
    }
  }
  if (requests.length) process.stderr.write('\n')
  const unique = [...new Map(records.map((record) => [JSON.stringify(record), record])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return { schemaVersion: 1, records: unique, failures }
}

export function buildTimeBackfill(articles: ArticleInput[], records: TimeRecord[], shard?: { index: number; count: number }) {
  const sidecar: TimeReferenceSidecar = { schemaVersion: 1, articles: {} }
  const report = []
  const sorted = [...articles].sort((a, b) => a.date.localeCompare(b.date))
  for (const [index, article] of sorted.entries()) {
    if (shard && index % shard.count !== shard.index) continue
    const body = articleBody(article.markdown)
    const unsupported = unsupportedTimeTokens(body)
    if (!scanTimeTokens(body).length && !unsupported.length) continue
    const resolved = resolveTimeReferences(body, records)
    sidecar.articles[article.date] = { bodySha256: articleBodySha256(article.markdown), references: resolved.references }
    report.push({ date: article.date, resolved: resolved.references.length, unresolved: [...resolved.unresolved, ...unsupported] })
  }
  return { sidecar: TimeReferenceSidecarSchema.parse(sidecar), report }
}

export function mergeTimeBackfills(parts: TimeReferenceSidecar[]): TimeReferenceSidecar {
  const articles: TimeReferenceSidecar['articles'] = {}
  for (const part of parts) for (const [date, article] of Object.entries(part.articles)) {
    if (articles[date] && JSON.stringify(articles[date]) !== JSON.stringify(article)) throw new Error(`Conflicting shard output for ${date}`)
    articles[date] = article
  }
  return TimeReferenceSidecarSchema.parse({ schemaVersion: 1, articles: Object.fromEntries(Object.entries(articles).sort(([a], [b]) => a.localeCompare(b))) })
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
  renameSync(temporary, path)
}

export function main(args = process.argv.slice(2)): void {
  const options = parseBackfillOptions(args)
  if (options.merge.length) {
    const merged = mergeTimeBackfills(options.merge.map((path) => TimeReferenceSidecarSchema.parse(JSON.parse(readFileSync(path, 'utf-8')))))
    if (options.write) writeJson(options.output, TimeReferenceSidecarSchema.parse(merged))
    console.log(`${options.write ? 'Wrote' : 'Previewed'} ${Object.keys(merged.articles).length} article records from ${options.merge.length} shards`)
    return
  }
  const articles = readdirSync(join(ROOT, '_articles')).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).map((name) => ({ date: name.slice(0, 10), markdown: readFileSync(join(ROOT, '_articles', name), 'utf-8') }))
  if (options.write && !options.harvest && !existsSync(options.snapshot)) throw new Error('Frozen evidence snapshot is missing; harvest first or pass --snapshot to replay verified evidence')
  const previous = existsSync(options.snapshot) ? EvidenceSnapshotSchema.parse(JSON.parse(readFileSync(options.snapshot, 'utf-8'))) : { schemaVersion: 1 as const, records: [], failures: [] }
  const snapshot = options.harvest ? harvestEvidence(discoverTimeSources(articles)) : previous
  if (options.harvest && snapshot.failures.length) {
    for (const record of previous.records) {
      const evidence = record.evidence
      if (evidence.kind === 'explicit-offset') continue
      const prefix = `${evidence.kind === 'github-commit' ? 'commit' : 'pull'}:${evidence.repo}:`
      if (snapshot.failures.some((failure) => failure.request.startsWith(prefix) && evidence.ref.startsWith(failure.request.slice(prefix.length)))) snapshot.records.push(record)
    }
    snapshot.records = [...new Map(snapshot.records.map((record) => [JSON.stringify(record), record])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }
  if (options.harvest) writeJson(options.snapshot, snapshot)
  const result = buildTimeBackfill(articles, snapshot.records, options.shard)
  console.log(JSON.stringify({ articlesScanned: articles.length, timeBearingArticles: result.report.length, resolved: result.report.reduce((sum, item) => sum + item.resolved, 0), unresolved: result.report.reduce((sum, item) => sum + item.unresolved.length, 0), sourceFailures: snapshot.failures.length, mode: options.write ? 'write' : 'report-only', report: result.report }, null, 2))
  if (options.write) { writeJson(options.output, TimeReferenceSidecarSchema.parse(result.sidecar)); writeJson(options.report, result.report) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

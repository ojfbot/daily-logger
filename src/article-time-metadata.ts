import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, existsSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { detachArticleTime } from './article-time-frontmatter.js'
import { assertShipmentCoverage, resolveShipmentTimes, type ShipmentCoverage } from './shipment-times.js'
import { TimeRecordSchema, TimeReferenceSchema, TimeReferenceSidecarSchema, articleBodySha256, canonicalInstant, resolveTimeReferences, selectTimeRecords, type TimeRecord, type TimeReference, type UnresolvedTime } from './time-references.js'

const MAX_RECORDS = 256
const MAX_ARTIFACT_BYTES = 64 * 1024
const MAX_LEGACY_BYTES = 1024 * 1024
const DIGEST = /^[a-f0-9]{64}$/
const canonicalTime = z.string().refine((value) => canonicalInstant(value) === value)
const WindowSchema = z.object({ start: canonicalTime, end: canonicalTime }).strict().refine((value) => value.start <= value.end)
const CaptureSchema = z.object({
  observedAt: canonicalTime.nullable(),
  window: WindowSchema.nullable(),
  status: z.enum(['complete', 'exhausted']),
  diagnostics: z.array(z.enum(['record-limit', 'byte-limit'])).max(2),
}).strict()
const ArtifactV1Schema = z.object({
  schemaVersion: z.literal(1), date: z.string().refine(validDate), capture: CaptureSchema,
  records: z.array(TimeRecordSchema).max(MAX_RECORDS),
}).strict().refine((value) => value.capture.status === 'exhausted' ? value.records.length === 0 && value.capture.diagnostics.length > 0 : value.capture.diagnostics.length === 0)
const ArtifactV2Schema = z.object({
  schemaVersion: z.literal(2), date: z.string().refine(validDate), capture: CaptureSchema,
  records: z.array(TimeRecordSchema).max(MAX_RECORDS),
}).strict().refine((value) => value.capture.status === 'exhausted' ? value.records.length === 0 && value.capture.diagnostics.length > 0 : value.capture.diagnostics.length === 0)
const ArtifactSchema = z.union([ArtifactV1Schema, ArtifactV2Schema])
type Artifact = z.infer<typeof ArtifactSchema>
type Capture = Artifact['capture']
export type ArticleShipmentCoverage = { status: 'disabled' } | ({ status: 'complete' } & ShipmentCoverage)
export interface TimeCaptureInput { observedAt: string | null; window: { start: string; end: string } | null }
export interface ArticleTimeResult {
  references: TimeReference[]
  warnings: string[]
  unresolved: UnresolvedTime[]
  shipmentCoverage: ArticleShipmentCoverage
  capture?: Capture
}
export interface PreparedGeneratedTime {
  readonly date: string
  readonly markdown: string
  readonly digest: string
  readonly warnings: readonly string[]
  readonly unresolved: ReadonlyArray<Readonly<UnresolvedTime>>
}
const preparedBytes = new WeakMap<PreparedGeneratedTime, string>()

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && canonicalInstant(`${value}T00:00:00Z`)?.slice(0, 10) === value
}
function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonicalValue(item)]))
  return value
}
function canonicalBytes(value: unknown): string { return `${JSON.stringify(canonicalValue(value))}\n` }
function frontmatter(markdown: string): string | undefined { return /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)?.[1] }
function fields(markdown: string, name: string): string[] {
  return [...(frontmatter(markdown) ?? '').matchAll(new RegExp(`^${name}:[ \\t]*(.*)$`, 'gm'))].map((match) => match[1].trim())
}
function articleDate(markdown: string): string | undefined {
  const values = fields(markdown, 'date')
  if (values.length !== 1) return undefined
  const value = values[0].replace(/^(["'])(.*)\1$/, '$2')
  return validDate(value) ? value : undefined
}
function boundedWarnings(warnings: string[]): string[] { return warnings.slice(0, 16).map((warning) => warning.slice(0, 240)) }
function sameReference(a: TimeReference, b: TimeReference): boolean { return canonicalBytes(a) === canonicalBytes(b) }
function tokenKey(reference: TimeReference): string { return JSON.stringify([reference.text, reference.occurrence]) }

export function parseTimeReferenceSidecar(raw: unknown) { return TimeReferenceSidecarSchema.safeParse(raw) }

/** Legacy claims have no authority: current prose must independently resolve to the same source, event, day and instant. */
export function articleTimeMetadata(input: {
  content: string
  bindingContent?: string
  records?: TimeRecord[]
  sidecar?: { bodySha256: string; references: TimeReference[] }
}): Omit<ArticleTimeResult, 'shipmentCoverage' | 'capture'> {
  const resolved = resolveTimeReferences(input.content, input.records ?? [])
  const warnings: string[] = []
  const admissible: TimeReference[] = resolved.references.filter((reference) => reference.evidence.kind === 'explicit-offset')
  const expected = new Map(resolved.references.map((reference) => [tokenKey(reference), reference]))
  const groups: TimeReference[][] = []
  const inline = fields(input.content, 'time_references')
  if (inline.length) {
    const hashes = fields(input.content, 'time_references_body_sha256')
    if (inline.length !== 1 || hashes.length !== 1 || hashes[0] !== articleBodySha256(input.content)) warnings.push('Stale or invalid time_references frontmatter; independently checking historical backfill')
    else {
      try {
        const candidate: unknown = JSON.parse(inline[0])
        const parsed = TimeReferenceSchema.array().max(512).safeParse(candidate)
        if (parsed.success) groups.push(parsed.data)
        else warnings.push('Invalid time-reference frontmatter metadata')
      } catch { warnings.push('Invalid time_references JSON') }
    }
  }
  if (input.sidecar) {
    if (input.sidecar.bodySha256 !== articleBodySha256(input.bindingContent ?? input.content)) warnings.push('Stale time-reference backfill; current prose has changed')
    else {
      const parsed = TimeReferenceSchema.array().max(512).safeParse(input.sidecar.references)
      if (parsed.success) groups.push(parsed.data)
      else warnings.push('Invalid time-reference backfill metadata')
    }
  }
  const admitted = new Map(admissible.map((reference) => [tokenKey(reference), reference]))
  const conflicts = new Set<string>()
  for (const group of groups) {
    const seen = new Set<string>()
    for (const reference of group) {
      const key = tokenKey(reference), fact = expected.get(key)
      if (conflicts.has(key)) continue
      if (seen.has(key)) { warnings.push('Dropped duplicate time-reference candidate'); continue }
      seen.add(key)
      if (!fact || !sameReference(reference, fact)) { warnings.push('Dropped time-reference candidate without matching independent source/event/day evidence'); continue }
      const prior = admitted.get(key)
      if (prior && !sameReference(prior, reference)) { admitted.delete(key); conflicts.add(key); warnings.push('Conflicting admissible time-reference candidates; left unresolved'); continue }
      admitted.set(key, reference)
    }
  }
  return { references: resolved.references.filter((reference) => admitted.has(tokenKey(reference))), warnings: boundedWarnings(warnings), unresolved: resolved.unresolved }
}

/** Pure preparation: observation metadata is supplied by the collector; article date never supplies an event day or window. */
export function prepareGeneratedTime(input: { date: string; markdown: string; records: TimeRecord[]; capture: TimeCaptureInput }): PreparedGeneratedTime {
  if (!validDate(input.date) || articleDate(input.markdown) !== input.date) throw new Error('Article date must be a real calendar date matching the dated article')
  const clean = detachArticleTime(input.markdown).markdown
  const observedAt = input.capture.observedAt === null ? null : canonicalInstant(input.capture.observedAt)
  if (observedAt === undefined) throw new Error('Invalid observedAt; use a collected instant or explicit null')
  const window = input.capture.window === null ? null : { start: canonicalInstant(input.capture.window.start), end: canonicalInstant(input.capture.window.end) }
  const capture = CaptureSchema.parse({ observedAt, window, status: 'complete', diagnostics: [] })
  const selected = selectTimeRecords(clean, input.records)
  let artifact: Artifact = { schemaVersion: 2, date: input.date, capture, records: [] }
  if (selected.length > MAX_RECORDS) artifact.capture = { ...capture, status: 'exhausted', diagnostics: ['record-limit'] }
  else {
    const parsed = TimeRecordSchema.array().parse(selected)
    artifact.records = [...new Map(parsed.map((record) => [canonicalBytes(record), record])).values()].sort((a, b) => canonicalBytes(a) < canonicalBytes(b) ? -1 : canonicalBytes(a) > canonicalBytes(b) ? 1 : 0)
    if (Buffer.byteLength(canonicalBytes(artifact)) > MAX_ARTIFACT_BYTES) artifact = { ...artifact, capture: { ...capture, status: 'exhausted', diagnostics: ['byte-limit'] }, records: [] }
  }
  const bytes = canonicalBytes(ArtifactSchema.parse(artifact))
  const digest = hash(bytes)
  const markdown = clean.replace(/^---\r?\n/, (opening) => `${opening}time_records_sha256: ${digest}\n`)
  const result = resolveTimeReferences(markdown, artifact.records)
  const shipmentCoverage = resolveShipmentTimes(markdown, artifact.records, artifact.capture.status)
  assertShipmentCoverage(markdown, shipmentCoverage)
  const warnings = artifact.capture.status === 'exhausted' ? ['Time-record capture exhausted; no Git source records retained'] : []
  const prepared = Object.freeze({ date: input.date, markdown, digest, warnings: Object.freeze(warnings), unresolved: Object.freeze(result.unresolved.map((item) => Object.freeze(item))) })
  preparedBytes.set(prepared, bytes)
  return prepared
}

function directory(path: string): void {
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Time-record path must contain only regular directories')
}
function safeRoot(repoRoot: string): string { const root = resolve(repoRoot); directory(root); return root }
function directories(root: string, components: string[], create = false): string {
  let current = root
  for (const component of components) {
    current = join(current, component)
    if (create && !existsSync(current)) {
      try { mkdirSync(current) } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error }
    }
    directory(current)
    if (create) syncDirectory(dirname(current))
  }
  return current
}
function regularBytes(path: string, limit: number): string {
  const entry = lstatSync(path)
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || entry.size > limit) throw new Error('Time-record input must be a bounded regular file without links')
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) throw new Error('Time-record input must be a bounded regular file without links')
    const raw = readFileSync(fd)
    const bytes = raw.toString('utf-8')
    if (!Buffer.from(bytes, 'utf-8').equals(raw)) throw new Error('Time-record input must be valid UTF-8')
    if (raw.length > limit) throw new Error('Time-record input exceeds its byte limit')
    return bytes
  } finally { closeSync(fd) }
}
function syncDirectory(path: string): void { const fd = openSync(path, constants.O_RDONLY); try { fsyncSync(fd) } finally { closeSync(fd) } }
function stagedFile(path: string, bytes: string, mode: number): void {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode)
  try { writeFileSync(fd, bytes, 'utf-8'); fsyncSync(fd) } finally { closeSync(fd) }
}
function removeTemporary(path: string): void { try { unlinkSync(path) } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error } }

/** The immutable artifact is installed and synced first. Article rename is the only mutable publication step. */
export function persistGeneratedTime(input: { repoRoot: string; prepared: PreparedGeneratedTime }): { articlePath: string; artifactPath: string; digest: string } {
  const bytes = preparedBytes.get(input.prepared)
  if (!bytes || hash(bytes) !== input.prepared.digest) throw new Error('Use an unchanged preparation from prepareGeneratedTime')
  const root = safeRoot(input.repoRoot)
  const artifactDirectory = directories(root, ['api', 'time-records', input.prepared.date], true)
  const artifactPath = join(artifactDirectory, `${input.prepared.digest}.json`)
  const artifactTemporary = join(artifactDirectory, `.install-${randomUUID()}.tmp`)
  stagedFile(artifactTemporary, bytes, 0o444)
  try {
    try { linkSync(artifactTemporary, artifactPath) } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      if (regularBytes(artifactPath, MAX_ARTIFACT_BYTES) !== bytes) throw new Error('Immutable time-record artifact conflicts with existing bytes')
    }
  } finally { removeTemporary(artifactTemporary) }
  syncDirectory(artifactDirectory)
  const articleDirectory = directories(root, ['_articles'], true)
  const articlePath = join(articleDirectory, `${input.prepared.date}.md`)
  try {
    const stat = lstatSync(articlePath)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Dated article must be a regular file without links')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  const articleTemporary = join(articleDirectory, `.article-${randomUUID()}.tmp`)
  stagedFile(articleTemporary, input.prepared.markdown, 0o644)
  try { renameSync(articleTemporary, articlePath) } finally { removeTemporary(articleTemporary) }
  syncDirectory(articleDirectory)
  return { articlePath, artifactPath, digest: input.prepared.digest }
}

/** Admission uses the caller's root exclusively; neither cache candidates nor model fields supply source facts. */
export function readArticleTime(input: { repoRoot: string; date: string; markdown: string; bindingMarkdown?: string }): ArticleTimeResult {
  const warnings: string[] = []
  const empty = (): ArticleTimeResult => ({ ...resolveTimeReferences(input.markdown, []), warnings: boundedWarnings(warnings), shipmentCoverage: { status: 'disabled' } })
  if (!validDate(input.date) || articleDate(input.markdown) !== input.date) { warnings.push('Invalid or mismatched article date; no Git time evidence admitted'); return empty() }
  let root: string
  try { root = safeRoot(input.repoRoot) } catch { warnings.push('Invalid repository root; no Git time evidence admitted'); return empty() }
  const pointers = fields(input.markdown, 'time_records_sha256')
  if (pointers.length) {
    if (pointers.length !== 1 || !DIGEST.test(pointers[0])) { warnings.push('Invalid time_records_sha256 pointer; no Git time evidence admitted'); return empty() }
    try {
      const artifactDirectory = directories(root, ['api', 'time-records', input.date])
      const bytes = regularBytes(join(artifactDirectory, `${pointers[0]}.json`), MAX_ARTIFACT_BYTES)
      if (hash(bytes) !== pointers[0]) throw new Error('Artifact digest mismatch')
      const raw: unknown = JSON.parse(bytes)
      const artifact = ArtifactSchema.parse(raw)
      if (artifact.date !== input.date || canonicalBytes(artifact) !== bytes) throw new Error('Artifact date or canonical bytes mismatch')
      if (artifact.capture.status === 'exhausted') warnings.push('Time-record capture exhausted; no Git source records retained')
      const shipmentCoverage: ArticleShipmentCoverage = artifact.schemaVersion === 2
        ? { status: 'complete', ...resolveShipmentTimes(input.markdown, artifact.records, artifact.capture.status) }
        : { status: 'disabled' }
      if (shipmentCoverage.status === 'complete') assertShipmentCoverage(input.markdown, shipmentCoverage)
      return { ...resolveTimeReferences(input.markdown, artifact.records), warnings, shipmentCoverage, capture: artifact.capture }
    } catch { warnings.push('Missing or invalid immutable time-record artifact; no Git time evidence admitted'); return empty() }
  }
  let records: TimeRecord[] = []
  let sidecar: { bodySha256: string; references: TimeReference[] } | undefined
  try {
    const api = directories(root, ['api'])
    const raw: unknown = JSON.parse(regularBytes(join(api, 'time-evidence.json'), MAX_LEGACY_BYTES))
    records = z.object({ schemaVersion: z.literal(1), records: z.array(TimeRecordSchema).max(4096) }).parse(raw).records
  } catch { warnings.push('Historical independent time evidence unavailable or invalid') }
  try {
    const api = directories(root, ['api'])
    const raw: unknown = JSON.parse(regularBytes(join(api, 'time-refs.json'), MAX_LEGACY_BYTES))
    const parsed = parseTimeReferenceSidecar(raw)
    if (!parsed.success) throw new Error('Invalid historical sidecar')
    sidecar = parsed.data.articles[input.date]
  } catch { warnings.push('Historical time-reference backfill unavailable or invalid') }
  const result = articleTimeMetadata({ content: input.markdown, bindingContent: input.bindingMarkdown, records, sidecar })
  return { ...result, warnings: boundedWarnings([...warnings, ...result.warnings]), shipmentCoverage: { status: 'disabled' } }
}

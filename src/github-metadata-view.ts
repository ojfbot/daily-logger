import { createHash } from 'node:crypto'
import { z } from 'zod'

const VERSION = 'github-metadata-factor-v1'
const REF = '$r'
const THRESHOLD = 512
const MAX_BYTES = 8 * 1024 * 1024
const MAX_NODES = 200000
const MAX_DEPTH = 64
const MAX_ROWS = 4096
const HEADER = 'GENERATED GITHUB METADATA (context only; row=[layout,...values]; $r references this source dictionary; authored L lines are never codec controls): '
const jsonSchema = z.json()
type Json = z.infer<typeof jsonSchema>
const documentSchema = z.object({
  version: z.literal(VERSION),
  dictionary: z.record(z.string().regex(/^d\d+$/), jsonSchema),
  layouts: z.array(z.array(z.string()).max(2048)).max(MAX_ROWS),
}).strict()
const bytes = (value: string) => Buffer.byteLength(value, 'utf8')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export const GITHUB_METADATA_VIEW_POLICY_SHA256 = hash(JSON.stringify({ version: VERSION, reference: REF, threshold: THRESHOLD, maxBytes: MAX_BYTES, maxNodes: MAX_NODES, maxDepth: MAX_DEPTH, maxRows: MAX_ROWS, header: HEADER }))

export type GithubMetadataRow = Readonly<{ line: number; raw: string }>
export type PreparedGithubMetadataView = Readonly<{
  content: string
  hiddenLines: readonly number[]
  policySha256: string
  rawSha256: string
  viewSha256: string
  rawBytes: number
  viewBytes: number
}>

function failure(): never { throw new Error('Invalid lossless GitHub metadata view') }

function bounded(value: unknown): boolean {
  const pending = [{ value, depth: 0 }]
  let nodes = 0
  while (pending.length) {
    const item = pending.pop()
    if (!item) break
    if (++nodes > MAX_NODES || item.depth > MAX_DEPTH) return false
    if (item.value && typeof item.value === 'object') {
      for (const child of Object.values(item.value)) pending.push({ value: child, depth: item.depth + 1 })
    }
  }
  return true
}

/** Decode the emitted wire, preserving original property order and every raw L line. */
export function expandGithubMetadataView(content: string): string {
  if (bytes(content) > MAX_BYTES || !content.startsWith(HEADER)) return failure()
  const [first, ...lines] = content.split('\n')
  if (!first) return failure()
  let unknown: unknown
  try { unknown = JSON.parse(first.slice(HEADER.length)) } catch { return failure() }
  if (!bounded(unknown)) return failure()
  const document = documentSchema.parse(unknown)
  if (Object.keys(document.dictionary).length > MAX_ROWS) return failure()
  if (document.layouts.some(layout => new Set(layout).size !== layout.length)) return failure()
  let nodes = 0, expandedBytes = 0
  const expand = (value: Json, active: ReadonlySet<string>, depth: number): Json => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) return failure()
    if (!value || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(item => expand(item, active, depth + 1))
    if (Object.hasOwn(value, REF)) {
      const id = value[REF]
      if (Object.keys(value).length !== 1 || typeof id !== 'string' || !Object.hasOwn(document.dictionary, id) || active.has(id)) return failure()
      const definition = document.dictionary[id]
      if (definition === undefined) return failure()
      return expand(definition, new Set([...active, id]), depth + 1)
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item, active, depth + 1)]))
  }
  return lines.map((line, index) => {
    const metadata = /^CONTEXT ONLY original L(\d+): ([\s\S]*)$/.exec(line)
    let raw: string
    if (metadata) {
      if (Number(metadata[1]) !== index + 1) return failure()
      let rowUnknown: unknown
      try { rowUnknown = JSON.parse(metadata[2] ?? '') } catch { return failure() }
      if (!bounded(rowUnknown)) return failure()
      const row = z.array(jsonSchema).min(1).max(2049).parse(rowUnknown)
      const layoutId = row[0]
      if (typeof layoutId !== 'number' || !Number.isInteger(layoutId)) return failure()
      const layout = document.layouts[layoutId]
      if (!layout || row.length !== layout.length + 1) return failure()
      const record = Object.fromEntries(layout.map((key, offset) => {
        const item = row[offset + 1]
        if (item === undefined) return failure()
        return [key, item]
      }))
      raw = JSON.stringify(expand(record, new Set(), 0))
    } else {
      const original = /^L(\d+): ([\s\S]*)$/.exec(line)
      if (!original || Number(original[1]) !== index + 1) return failure()
      raw = original[2] ?? ''
    }
    expandedBytes += bytes(raw) + 1
    if (expandedBytes > MAX_BYTES + 1) return failure()
    return raw
  }).join('\n')
}

export function assertGithubMetadataView(content: string, rawContent: string): void {
  if (expandGithubMetadataView(content) !== rawContent) failure()
}

/** Pure codec only. Collector custody is supplied separately by ActionSourceCollection. */
export function factorGithubMetadata(input: { content: string; rows: readonly GithubMetadataRow[] }): PreparedGithubMetadataView | undefined {
  if (bytes(input.content) > MAX_BYTES || input.rows.length < 2 || input.rows.length > MAX_ROWS) return undefined
  const lines = input.content.split('\n'), seen = new Set<number>(), parsed: Json[] = []
  const frequencies = new Map<string, number>()
  let unsupported = false, nodes = 0
  const visit = (value: Json, depth: number) => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) { unsupported = true; return }
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, REF)) unsupported = true
    const text = JSON.stringify(value)
    if (bytes(text) >= THRESHOLD) frequencies.set(text, (frequencies.get(text) ?? 0) + 1)
    if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child, depth + 1)
  }
  for (const row of input.rows) {
    if (!Number.isInteger(row.line) || row.line < 1 || row.line > lines.length || seen.has(row.line) || lines[row.line - 1] !== row.raw) return failure()
    seen.add(row.line)
    let value: unknown
    try { value = JSON.parse(row.raw) } catch { return failure() }
    if (!bounded(value)) return undefined
    const parsedValue = jsonSchema.parse(value)
    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue) || JSON.stringify(parsedValue) !== row.raw) return undefined
    parsed.push(parsedValue)
    visit(parsedValue, 0)
  }
  if (unsupported || frequencies.size > MAX_ROWS) return undefined
  const values = [...frequencies].filter(([text, count]) => count >= 2 && (count - 1) * bytes(text) > count * 14 + 16)
    .map(([text]) => text).sort((left, right) => bytes(left) - bytes(right) || (left < right ? -1 : left > right ? 1 : 0))
  const ids = new Map(values.map((text, index) => [text, `d${index}`]))
  const encode = (value: Json, skip?: string): Json => {
    const text = JSON.stringify(value), id = ids.get(text)
    if (id && text !== skip) return { [REF]: id }
    if (!value || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(item => encode(item))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]))
  }
  const all = new Map(values.map(text => [ids.get(text), encode(jsonSchema.parse(JSON.parse(text)), text)]))
  const encoded = parsed.map(value => encode(value)), used = new Set<string>()
  const references = (value: Json) => {
    if (!value || typeof value !== 'object') return
    if (!Array.isArray(value) && Object.hasOwn(value, REF)) {
      const id = value[REF]
      if (typeof id !== 'string') return failure()
      const definition = all.get(id)
      if (definition === undefined) return failure()
      if (!used.has(id)) { used.add(id); references(definition) }
      return
    }
    Object.values(value).forEach(references)
  }
  encoded.forEach(references)
  const dictionary = Object.fromEntries([...used].sort().map(id => {
    const value = all.get(id)
    if (value === undefined) return failure()
    return [id, value]
  }))
  const layouts: string[][] = [], layoutIds = new Map<string, number>()
  const rows = encoded.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return failure()
    const keys = Object.keys(value), key = JSON.stringify(keys)
    let layoutId = layoutIds.get(key)
    if (layoutId === undefined) { layoutId = layouts.length; layouts.push(keys); layoutIds.set(key, layoutId) }
    return [layoutId, ...keys.map(name => value[name])]
  })
  const byLine = new Map(input.rows.map((row, index) => [row.line, JSON.stringify(rows[index])]))
  const content = HEADER + JSON.stringify({ version: VERSION, dictionary, layouts }) + '\n' + lines.map((line, index) =>
    byLine.has(index + 1) ? `CONTEXT ONLY original L${index + 1}: ${byLine.get(index + 1)}` : `L${index + 1}: ${line}`).join('\n')
  const rawRendered = lines.map((line, index) => `L${index + 1}: ${line}`).join('\n')
  if (bytes(content) >= bytes(rawRendered)) return undefined
  try { assertGithubMetadataView(content, input.content) } catch { return undefined }
  return Object.freeze({ content, hiddenLines: Object.freeze([...seen].sort((a, b) => a - b)), policySha256: GITHUB_METADATA_VIEW_POLICY_SHA256,
    rawSha256: hash(input.content), viewSha256: hash(content), rawBytes: bytes(input.content), viewBytes: bytes(content) })
}

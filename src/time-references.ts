import { createHash } from 'node:crypto'
import { z } from 'zod'
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import { renderArticle } from './render-article.js'
import { scanVisibleTimeText } from './time-reference-text.js'
import type { BlogContext } from './types.js'

import { canonicalInstant, TimeEvidenceSchema, TimeReferenceSchema, type TimeEvidence, type TimeReference } from './time-reference-schema.js'
export { canonicalInstant, TimeEvidenceSchema, TimeReferenceSchema } from './time-reference-schema.js'
export type { TimeEvidence, TimeReference } from './time-reference-schema.js'
type GitTimeEvidence = Exclude<TimeEvidence, { kind: 'explicit-offset' }>
type GitEvent = GitTimeEvidence['event']

export const TimeReferenceSidecarSchema = z.object({
  schemaVersion: z.literal(1),
  articles: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.object({ bodySha256: z.string().regex(/^[a-f0-9]{64}$/), references: z.array(TimeReferenceSchema) })),
})
export type TimeReferenceSidecar = z.infer<typeof TimeReferenceSidecarSchema>
export function articleBody(markdown: string): string { return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '') }
export function articleBodySha256(markdown: string): string { return createHash('sha256').update(articleBody(markdown)).digest('hex') }
export const TimeRecordSchema = z.object({
  at: z.string().refine((value) => canonicalInstant(value) === value),
  evidence: TimeEvidenceSchema,
  /** A later source read can coexist with an older artifact capture without rewriting its provenance. */
  acquisition: z.object({
    observedAt: z.string().refine((value) => canonicalInstant(value) === value),
    requestUrl: z.string().url(),
    responseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict().optional(),
}).refine((record) => !record.acquisition || (record.evidence.kind === 'github-issue' && record.acquisition.requestUrl === `https://api.github.com/repos/${record.evidence.repo}/issues/${record.evidence.ref}`))
export type TimeRecord = z.infer<typeof TimeRecordSchema>
export interface TimeToken { text: string; occurrence: number; index: number; precision: 'minute' | 'second' }
export interface UnresolvedTime { text: string; occurrence: number; reason: 'missing-evidence' | 'clock-mismatch' | 'ambiguous' | 'mutable-event' }

interface VisibleProjection {
  text: string
  nodes: Array<{ text: string; index: number }>
  links: Array<{ url: string; index: number; end: number }>
  headings: Array<{ text: string; index: number; level: number }>
}

/** Parse the same sanitized HTML served to readers; entity decoding and Markdown escapes follow the renderer. */
function visibleProjection(markdown: string, renderedHtml?: string): VisibleProjection {
  const root = parseFragment(renderedHtml ?? renderArticle(articleBody(markdown)))
  const projection: VisibleProjection = { text: '', nodes: [], links: [], headings: [] }
  function visit(node: DefaultTreeAdapterMap['node']): void {
    if (node.nodeName === '#text' && 'value' in node) {
      projection.nodes.push({ text: node.value, index: projection.text.length })
      projection.text += node.value
      return
    }
    if (!('childNodes' in node)) return
    const tag = 'tagName' in node ? node.tagName : ''
    const attrs = 'attrs' in node ? node.attrs : []
    if (['pre', 'script', 'style', 'button'].includes(tag) || attrs.some((attr) => attr.name === 'hidden' || (attr.name === 'aria-hidden' && attr.value === 'true'))) return
    const start = projection.text.length
    for (const child of node.childNodes) visit(child)
    if (tag === 'a') {
      const href = attrs.find((attr) => attr.name === 'href')?.value
      if (href) projection.links.push({ url: href, index: start, end: projection.text.length })
    }
    if (/^h[1-6]$/.test(tag)) projection.headings.push({ text: projection.text.slice(start), index: start, level: Number(tag.slice(1)) })
    if (['p', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr'].includes(tag)) projection.text += '\n\n'
  }
  visit(root)
  return projection
}

function scanProjection(projection: VisibleProjection): TimeToken[] {
  const counts = new Map<string, number>()
  const tokens: TimeToken[] = []
  for (const node of projection.nodes) {
    for (const match of scanVisibleTimeText(node.text)) {
      const text = match.text, occurrence = counts.get(text) ?? 0
      counts.set(text, occurrence + 1)
      tokens.push({ text, occurrence, index: node.index + match.index, precision: match.precision })
    }
  }
  return tokens
}

/** Exact rendered text-node tokens. Index is in canonical visible text, never raw Markdown. */
export function scanTimeTokens(markdown: string): TimeToken[] { return scanProjection(visibleProjection(markdown)) }

/** Audit recognizable clock spellings which lack a supported explicit UTC/offset representation. */
export function unsupportedTimeTokens(markdown: string): Array<{ text: string; reason: 'unsupported-time-format' }> {
  const projection = visibleProjection(markdown)
  const supported = scanProjection(projection)
  const result: Array<{ text: string; reason: 'unsupported-time-format' }> = []
  for (const node of projection.nodes) for (const match of node.text.matchAll(/\b(?:\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|UTC|GMT|[ECMP][SD]T|[A-Za-z]+\/[A-Za-z_]+))?|\d{1,2}\s*(?:AM|PM))\b/gi)) {
    const index = node.index + match.index
    if (!supported.some((token) => index >= token.index && index < token.index + token.text.length)) result.push({ text: match[0], reason: 'unsupported-time-format' })
  }
  return result
}

export function timeTokenMatchesInstant(text: string, at: string): boolean {
  const instant = canonicalInstant(at)
  if (!instant) return false
  const explicit = canonicalInstant(text)
  if (explicit) return explicit === instant
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?(?:Z| UTC)$/.exec(text)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || (match[3] && Number(match[3]) > 59)) return false
  return instant.slice(11, match[3] ? 19 : 16) === text.slice(0, match[3] ? 8 : 5)
}

function paragraphAt(projection: VisibleProjection, index: number): { before: string; start: number; heading: string } {
  const boundary = projection.text.lastIndexOf('\n\n', index)
  const start = boundary === -1 ? 0 : boundary + 2
  const heading = projection.headings.filter((item) => item.index < start).at(-1)?.text ?? ''
  return { before: projection.text.slice(start, index), start, heading }
}

interface SourceMention {
  kind: 'pull' | 'commit' | 'issues'
  ref: string
  repo?: string
  index: number
}

export interface ShipmentSource {
  repo: string
  ref: string
  url: string
}

export type IssueSource = ShipmentSource

function linkedSource(url: string): SourceMention | undefined {
  let parsed: URL
  try { parsed = new URL(url) } catch { return undefined }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com' || parsed.port || parsed.username || parsed.password) return undefined
  const [owner, name, sourceKind, rawRef] = parsed.pathname.split('/').filter(Boolean)
  if (!owner || !name || !sourceKind || !rawRef || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) return undefined
  const repo = `${owner}/${name}`
  const kind = sourceKind.toLowerCase()
  if (kind !== 'pull' && kind !== 'commit' && kind !== 'issues') return undefined
  const ref = rawRef.toLowerCase()
  if (kind === 'commit' ? !/^[a-f0-9]{7,40}$/i.test(ref) : !/^[1-9]\d*$/.test(ref)) return undefined
  return { kind, repo, ref: ref.toLowerCase(), index: 0 }
}

/** Every linked PR inside every rendered What shipped section, independent of model formatting or clocks. */
export function shipmentSources(markdown: string): ShipmentSource[] {
  const projection = visibleProjection(markdown)
  const sections = projection.headings.filter((heading) => heading.level === 2 && heading.text.trim().toLowerCase() === 'what shipped')
  const ranges = sections.map((section) => ({
    start: section.index,
    end: projection.headings.find((heading) => heading.level === 2 && heading.index > section.index)?.index ?? projection.text.length,
  }))
  const sources = projection.links
    .filter((link) => ranges.some((range) => link.index > range.start && link.index < range.end))
    .flatMap((link) => {
      const source = linkedSource(link.url)
      return source?.kind === 'pull' && source.repo ? [{ repo: source.repo, ref: source.ref, url: `https://github.com/${source.repo}/pull/${source.ref}` }] : []
    })
  return [...new Map(sources.map((source) => [`${source.repo.toLowerCase()}#${source.ref}`, source])).values()]
}

/** Linked issue identities in rendered article prose, independent of authored clocks. */
export function issueSources(markdown: string, renderedHtml?: string): IssueSource[] {
  const sources = visibleProjection(markdown, renderedHtml).links.flatMap((link) => {
    const mention = linkedSource(link.url)
    return mention?.kind === 'issues' && mention.repo
      ? [{ repo: mention.repo, ref: mention.ref, url: `https://github.com/${mention.repo}/issues/${mention.ref}` }]
      : []
  })
  return [...new Map(sources.map((source) => [`${source.repo.toLowerCase()}#${source.ref}`, source])).values()]
}

/** Discover subjects from prose before looking at the possibly incomplete evidence set. */
function sourceMentions(text: string, links: VisibleProjection['links']): SourceMention[] {
  const mentions: SourceMention[] = []
  const linkedRanges: Array<{ index: number; end: number }> = []
  for (const link of links) {
    const source = linkedSource(link.url)
    if (!source) continue
    mentions.push({ ...source, index: link.index })
    linkedRanges.push(link)
  }
  for (const match of text.matchAll(/#[1-9]\d*\b|\b[a-f0-9]{7,40}\b/gi)) {
    if (linkedRanges.some((range) => match.index >= range.index && match.index < range.end)) continue
    const kind = match[0].startsWith('#') ? 'pull' : 'commit'
    const qualifier = /\b([A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)?)\s+(?:(?:PR|commit)\s+)?$/i.exec(text.slice(0, match.index))?.[1]
    const repo = qualifier && !/^(?:PR|commit)$/i.test(qualifier) ? qualifier : undefined
    mentions.push({ kind, repo, ref: match[0].replace(/^#/, '').toLowerCase(), index: match.index })
  }
  return mentions
}

function sourceMatches(mention: SourceMention, evidence: GitTimeEvidence, heading: string): boolean {
  const kind = evidence.kind === 'github-commit' ? 'commit' : evidence.kind === 'github-issue' ? 'issues' : 'pull'
  if (mention.kind !== kind) return false
  if (kind === 'commit' ? !evidence.ref.startsWith(mention.ref) : evidence.ref !== mention.ref) return false
  const declared = mention.repo ?? /^([A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)?)(?:\s+\((?:PR\s+)?#[1-9]\d*\))?$/i.exec(heading.trim())?.[1]
  if (!declared) return false
  const qualified = declared.includes('/') ? declared : `ojfbot/${declared}`
  return qualified.toLowerCase() === evidence.repo.toLowerCase()
}

function eventBefore(text: string): GitEvent | undefined {
  const events = [...text.matchAll(/\b(merged|authored|committed|opened|created|closed|updated)\b/gi)]
  const event = events.at(-1)?.[1].toLowerCase()
  return event === 'merged' || event === 'authored' || event === 'committed' || event === 'opened' || event === 'created' || event === 'closed' || event === 'updated' ? event : undefined
}

function sourceKey(record: TimeRecord): string { return JSON.stringify(record) }

function sourceAtToken(projection: VisibleProjection, token: TimeToken) {
  const paragraph = paragraphAt(projection, token.index)
  const sentenceStart = Math.max(...[...paragraph.before.matchAll(/[.!?;]\s+/g)].map((match) => match.index + match[0].length), 0)
  const clause = paragraph.before.slice(sentenceStart)
  const prior = paragraph.before.slice(0, sentenceStart).trim()
  const listEvent = /^(?:[A-Za-z]+|\d+) PRs merged [A-Za-z]+\.$/.test(prior) ? 'merged' : undefined
  const event = eventBefore(clause) ?? listEvent
  const isScheduleOrBound = /\b(schedule[ds]?|nightly|cron|every|cutoff|window|before|after|until|by|tomorrow|recurring|hypothetical)\b|\bdaily\s+(?:job|run|schedule)\b/i.test(clause)
  const clauseStart = paragraph.start + sentenceStart
  const links = projection.links.filter((link) => link.index >= clauseStart && link.index < token.index).map((link) => ({ ...link, index: link.index - clauseStart, end: link.end - clauseStart }))
  const subject = isScheduleOrBound ? undefined : sourceMentions(clause, links).sort((a, b) => b.index - a.index)[0]
  return { subject, event, heading: paragraph.heading }
}

/** Capture entire mentioned source groups, including conflicting events/instants; never choose facts by clock. */
export function selectTimeRecords(markdown: string, records: TimeRecord[], renderedHtml?: string): TimeRecord[] {
  const projection = visibleProjection(markdown)
  const sources = scanProjection(projection).filter((token) => !canonicalInstant(token.text)).map((token) => sourceAtToken(projection, token))
  const shipments = shipmentSources(markdown)
  const issues = issueSources(markdown, renderedHtml)
  const selected = records.filter((record) => {
    if (record.evidence.kind === 'explicit-offset') return false
    const evidence = record.evidence
    if (sources.some(({ subject, heading }) => subject && sourceMatches(subject, evidence, heading))) return true
    if (evidence.kind === 'github-issue') return issues.some((source) => source.repo.toLowerCase() === evidence.repo.toLowerCase() && source.ref === evidence.ref)
    if (evidence.kind !== 'github-pull-request') return false
    return shipments.some((source) => source.repo.toLowerCase() === evidence.repo.toLowerCase() && source.ref === evidence.ref)
  })
  return [...new Map(selected.map((record) => [sourceKey(record), record])).values()].sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)))
}

/** Source identity + event + displayed clock must agree. Neither article date nor nearest clock is evidence. */
export function resolveTimeReferences(markdown: string, records: TimeRecord[]): { references: TimeReference[]; unresolved: UnresolvedTime[] } {
  const references: TimeReference[] = []
  const unresolved: UnresolvedTime[] = []
  const uniqueRecords = [...new Map(records.map((record) => [sourceKey(record), record])).values()]
  const projection = visibleProjection(markdown)
  for (const token of scanProjection(projection)) {
    const at = canonicalInstant(token.text)
    if (at) {
      references.push({ text: token.text, occurrence: token.occurrence, precision: token.precision, at, evidence: { kind: 'explicit-offset', value: token.text } })
      continue
    }
    const { subject, event, heading } = sourceAtToken(projection, token)
    if (event === 'updated' || event === 'closed') {
      unresolved.push({ text: token.text, occurrence: token.occurrence, reason: 'mutable-event' })
      continue
    }
    const scoped = subject ? uniqueRecords.filter((record) => record.evidence.kind !== 'explicit-offset' && record.evidence.event === event && sourceMatches(subject, record.evidence, heading)) : []
    const matches = scoped.filter((record) => timeTokenMatchesInstant(token.text, record.at))
    const instants = new Set(scoped.map((record) => record.at))
    const identities = new Set(scoped.map((record) => record.evidence.kind === 'explicit-offset' ? record.evidence.value : JSON.stringify([record.evidence.kind, record.evidence.repo, record.evidence.ref, record.evidence.event])))
    if (instants.size === 1 && identities.size === 1 && matches.length) {
      const match = matches.sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)))[0]
      references.push({ text: token.text, occurrence: token.occurrence, precision: token.precision, ...match })
    } else unresolved.push({ text: token.text, occurrence: token.occurrence, reason: instants.size > 1 || identities.size > 1 ? 'ambiguous' : scoped.length ? 'clock-mismatch' : 'missing-evidence' })
  }
  return { references, unresolved }
}

function repoFromUrl(url: string): string | undefined {
  return /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\//.exec(url)?.[1]
}

export function recordsFromContext(ctx: BlogContext): TimeRecord[] {
  const records: TimeRecord[] = []
  const add = (value: string | undefined, evidence: TimeEvidence) => {
    const at = value && canonicalInstant(value)
    if (at && TimeEvidenceSchema.safeParse(evidence).success) records.push({ at, evidence })
  }
  for (const commit of ctx.commits) {
    const repo = repoFromUrl(commit.url)
    const ref = commit.fullHash ?? /\/commit\/([a-f0-9]{40})$/.exec(commit.url)?.[1]
    if (!repo || !ref) continue
    add(commit.authoredAt ?? commit.date, { kind: 'github-commit', repo, ref, event: 'authored', url: `https://github.com/${repo}/commit/${ref}` })
    add(commit.committedAt, { kind: 'github-commit', repo, ref, event: 'committed', url: `https://github.com/${repo}/commit/${ref}` })
  }
  for (const pr of [...ctx.mergedPRs, ...ctx.openPRs, ...ctx.recentPRs]) {
    const repo = repoFromUrl(pr.url)
    if (!repo) continue
    const source = { kind: 'github-pull-request' as const, repo, ref: String(pr.number), url: `https://github.com/${repo}/pull/${pr.number}` }
    if ('createdAt' in pr) add(pr.createdAt, { ...source, event: 'opened' })
    if ('mergedAt' in pr) add(pr.mergedAt, { ...source, event: 'merged' })
    if ('closedAt' in pr && typeof pr.closedAt === 'string') add(pr.closedAt, { ...source, event: 'closed' })
    if ('updatedAt' in pr && typeof pr.updatedAt === 'string') add(pr.updatedAt, { ...source, event: 'updated' })
  }
  for (const pr of ctx.recentPRs) {
    const repo = repoFromUrl(pr.url)
    if (!repo || pr.state !== 'closed' || pr.merged !== false || pr.mergedAt) continue
    add(pr.updatedAt, { kind: 'github-pull-request', repo, ref: String(pr.number), event: 'closed-unmerged', url: `https://github.com/${repo}/pull/${pr.number}` })
  }
  for (const issue of [...ctx.openIssues, ...ctx.closedIssues]) {
    const repo = repoFromUrl(issue.url)
    if (!repo) continue
    const source = { kind: 'github-issue' as const, repo, ref: String(issue.number), url: `https://github.com/${repo}/issues/${issue.number}` }
    add(issue.createdAt, { ...source, event: 'created' })
    add(issue.updatedAt, { ...source, event: 'updated' })
  }
  return [...new Map(records.map((record) => [sourceKey(record), record])).values()].sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)))
}

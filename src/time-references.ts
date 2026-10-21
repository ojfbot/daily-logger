import { createHash } from 'node:crypto'
import { z } from 'zod'
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import { renderArticle } from './render-article.js'
import { scanVisibleTimeText } from './time-reference-text.js'
import type { BlogContext } from './types.js'
import { scanTimeExpressions, type TimeExpressionScan, type TimeExpressionToken } from './time-expression-text.js'

import { canonicalInstant, timeTokenMatchesInstant, TimeEvidenceSchema, TimeReferenceSchema, TimeExpressionSchema, timeExpressionMembers, type TimeEvidence, type TimeReference, type TimeExpression, type TimeExpressionMember } from './time-reference-schema.js'
export { canonicalInstant, timeTokenMatchesInstant, TimeEvidenceSchema, TimeReferenceSchema } from './time-reference-schema.js'
export type { TimeEvidence, TimeReference } from './time-reference-schema.js'
type GitTimeEvidence = Exclude<TimeEvidence, { kind: 'explicit-offset' }>
type GitEvent = GitTimeEvidence['event']

export const TimeReferenceSidecarSchema = z.object({
  schemaVersion: z.literal(1),
  articles: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.object({ bodySha256: z.string().regex(/^[a-f0-9]{64}$/), references: z.array(TimeReferenceSchema), expressions: z.array(TimeExpressionSchema).max(512).optional() })),
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
export function unsupportedTimeTokens(markdown: string, excludeExpressions = false): Array<{ text: string; reason: 'unsupported-time-format' }> {
  const projection = visibleProjection(markdown)
  const supported = scanProjection(projection)
  const result: Array<{ text: string; reason: 'unsupported-time-format' }> = []
  const expressions = excludeExpressions ? scanTimeExpressions(projection.text) : []
  for (const node of projection.nodes) for (const match of node.text.matchAll(/\b(?:\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|UTC|GMT|[ECMP][SD]T|[A-Za-z]+\/[A-Za-z_]+))?|\d{1,2}\s*(?:AM|PM))\b/gi)) {
    const index = node.index + match.index
    if (expressions.some((expression) => index >= expression.index && index < expression.end)) continue
    if (!supported.some((token) => index >= token.index && index < token.index + token.text.length)) result.push({ text: match[0], reason: 'unsupported-time-format' })
  }
  return result
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

type UnresolvedExpressionReason = Extract<TimeExpressionMember['resolution'], { kind: 'unresolved' }>['reason']

function expressionContext(projection: VisibleProjection, expression: TimeExpressionScan) {
  const paragraph = paragraphAt(projection, expression.index)
  const sentenceStart = Math.max(...[...paragraph.before.matchAll(/[.!?;]\s+/g)].map((match) => match.index + match[0].length), 0)
  const clause = paragraph.before.slice(sentenceStart)
  const clauseStart = paragraph.start + sentenceStart
  const links = projection.links.filter((link) => link.index >= clauseStart && link.index < expression.index).map((link) => ({ ...link, index: link.index - clauseStart, end: link.end - clauseStart }))
  const mentioned = sourceMentions(clause, links).sort((a, b) => a.index - b.index)
  const subjects = [...new Map(mentioned.map((subject) => [JSON.stringify([subject.kind, subject.repo, subject.ref]), subject])).values()]
  const events = [...clause.matchAll(/\b(merged|authored|committed|opened|closed|updated)\b/gi)].map((match) => eventBefore(match[0])).filter((event) => event !== undefined)
  const excluded = /\b(schedule[ds]?|nightly|cron|every|cutoff|window|before|after|until|by|tomorrow|recurring|hypothetical)\b|\bdaily\s+(?:job|run|schedule)\b/i.test(clause)
  const respectively = /^\s*,?\s*respectively\b/i.test(projection.text.slice(expression.end))
  return { mentions: mentioned, subjects, events, excluded, respectively, heading: paragraph.heading, clause }
}

function expressionFact(subject: SourceMention | undefined, event: GitEvent | undefined, heading: string, records: TimeRecord[]): { kind: 'supported'; record: TimeRecord } | { kind: 'unresolved'; reason: UnresolvedExpressionReason } {
  if (event === 'closed' || event === 'updated') return { kind: 'unresolved', reason: 'mutable-event' }
  if (!subject || !event) return { kind: 'unresolved', reason: 'missing-evidence' }
  const scoped = records.filter((record) => record.evidence.kind !== 'explicit-offset' && record.evidence.event === event && sourceMatches(subject, record.evidence, heading))
  if (!scoped.length) return { kind: 'unresolved', reason: 'missing-evidence' }
  if (new Set(scoped.map((record) => record.at)).size !== 1) return { kind: 'unresolved', reason: 'ambiguous-source' }
  const record = scoped.sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)))[0]
  return { kind: 'supported', record }
}

function statedCalendarMatches(clause: string, records: TimeRecord[]): boolean {
  const dated = [...clause.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0])
  if (dated.some((date) => !records.every((record) => record.at.slice(0, 10) === date))) return false
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const named = [...clause.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)[ \t]+(\d{1,2})(?:,?[ \t]+(\d{4}))?\b/gi)]
  return named.every((date) => {
    const month = String(months.findIndex((month) => month.toLowerCase() === date[1].toLowerCase()) + 1).padStart(2, '0')
    const day = date[2].padStart(2, '0')
    return records.every((record) => record.at.slice(5, 10) === `${month}-${day}` && (!date[3] || record.at.slice(0, 4) === date[3]))
  })
}

function expressionMember(token: TimeExpressionToken, approximate: boolean, fact: ReturnType<typeof expressionFact>): TimeExpressionMember {
  const member = { text: token.text, precision: token.precision, certainty: approximate || token.approximate ? 'approximate' as const : 'exact' as const }
  if (!token.normalized) return { ...member, resolution: { kind: 'unresolved', reason: 'unsupported-format' } }
  const at = canonicalInstant(token.normalized)
  if (at) return { ...member, resolution: { kind: 'supported', at, evidence: { kind: 'explicit-offset', value: token.normalized } } }
  if (fact.kind === 'unresolved') return { ...member, resolution: fact }
  if (!timeTokenMatchesInstant(token.normalized, fact.record.at)) return { ...member, resolution: { kind: 'unresolved', reason: 'clock-mismatch' } }
  return { ...member, resolution: { kind: 'supported', at: fact.record.at, evidence: fact.record.evidence } }
}

function resolveExpression(projection: VisibleProjection, expression: TimeExpressionScan, records: TimeRecord[]): TimeExpression {
  const context = expressionContext(projection, expression)
  const event = context.events.at(-1)
  const oneEvent = new Set(context.events).size === 1
  let relation: 'elapsed' | 'event-span' | 'unestablished' = 'unestablished'
  let facts: Array<ReturnType<typeof expressionFact>>
  const envelope = expression.kind === 'interval' && context.subjects.length >= 2 && context.subjects.every((subject) => subject.kind === 'pull') && context.events.length === 1 && /\bPRs?\b/i.test(context.clause)
  if (context.excluded) {
    facts = expression.members.map(() => ({ kind: 'unresolved', reason: 'ineligible-context' }))
  } else if (context.respectively) {
    const orderedSources = oneEvent && context.mentions.length === expression.members.length && context.subjects.length === context.mentions.length
    facts = orderedSources
      ? expression.members.map((_, index) => expressionFact(context.mentions[index], event, context.heading, records))
      : expression.members.map(() => ({ kind: 'unresolved', reason: 'ambiguous-source' }))
  } else if (envelope) {
    relation = 'event-span'
    const sourceFacts = context.subjects.map((subject) => expressionFact(subject, event, context.heading, records))
    const failure = sourceFacts.find((fact) => fact.kind === 'unresolved')
    const supported = sourceFacts.flatMap((fact) => fact.kind === 'supported' ? [fact.record] : []).sort((a, b) => a.at.localeCompare(b.at))
    const first = supported[0], last = supported.at(-1)
    if (failure?.kind === 'unresolved') facts = expression.members.map(() => failure)
    else if (first && last && statedCalendarMatches(context.clause, supported) && expression.members[0]?.normalized && expression.members[1]?.normalized && timeTokenMatchesInstant(expression.members[0].normalized, first.at) && timeTokenMatchesInstant(expression.members[1].normalized, last.at)) {
      facts = [{ kind: 'supported', record: first }, { kind: 'supported', record: last }]
    } else facts = expression.members.map(() => ({ kind: 'unresolved', reason: 'clock-mismatch' }))
  } else if (context.subjects.length === 1) {
    const orderedEvents = expression.kind === 'interval' && context.events.length === 2
    if (orderedEvents) relation = 'elapsed'
    facts = expression.members.map((_, index) => expressionFact(context.subjects[0], orderedEvents ? context.events[index] : event, context.heading, records))
  } else if (expression.kind === 'point') {
    facts = [expressionFact(context.mentions.at(-1), event, context.heading, records)]
  } else facts = expression.members.map(() => ({ kind: 'unresolved', reason: context.subjects.length ? 'ambiguous-source' : 'missing-date' }))
  facts = facts.map((fact) => fact.kind === 'supported' && !statedCalendarMatches(context.clause, [fact.record]) ? { kind: 'unresolved', reason: 'clock-mismatch' } : fact)
  const members = expression.members.map((token, index) => expressionMember(token, expression.approximate, facts[index] ?? { kind: 'unresolved', reason: 'missing-evidence' }))
  const identity = { text: expression.text, occurrence: expression.occurrence }
  const first = members[0]
  if (!first) throw new Error('Time expression scanner returned no members')
  if (expression.kind === 'point') return { ...identity, kind: 'point', member: first }
  if (expression.kind === 'list') return { ...identity, kind: 'list', members }
  const last = members[1]
  if (!last) throw new Error('Interval scanner returned fewer than two endpoints')
  if (first.resolution.kind === 'supported' && last.resolution.kind === 'supported' && first.resolution.evidence.kind === 'explicit-offset' && last.resolution.evidence.kind === 'explicit-offset') relation = 'elapsed'
  return { ...identity, kind: 'interval', start: first, end: last, relation }
}

/** Capture entire mentioned source groups, including conflicting events/instants; never choose facts by clock. */
export function selectTimeRecords(markdown: string, records: TimeRecord[], renderedHtml?: string): TimeRecord[] {
  const projection = visibleProjection(markdown)
  const sources = scanProjection(projection).filter((token) => !canonicalInstant(token.text)).map((token) => sourceAtToken(projection, token))
  const groups = scanTimeExpressions(projection.text).map((expression) => expressionContext(projection, expression))
  const shipments = shipmentSources(markdown)
  const issues = issueSources(markdown, renderedHtml)
  const selected = records.filter((record) => {
    if (record.evidence.kind === 'explicit-offset') return false
    const evidence = record.evidence
    if (sources.some(({ subject, heading }) => subject && sourceMatches(subject, evidence, heading))) return true
    if (groups.some(({ subjects, heading }) => subjects.some((subject) => sourceMatches(subject, evidence, heading)))) return true
    if (evidence.kind === 'github-issue') return issues.some((source) => source.repo.toLowerCase() === evidence.repo.toLowerCase() && source.ref === evidence.ref)
    if (evidence.kind !== 'github-pull-request') return false
    return shipments.some((source) => source.repo.toLowerCase() === evidence.repo.toLowerCase() && source.ref === evidence.ref)
  })
  return [...new Map(selected.map((record) => [sourceKey(record), record])).values()].sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)))
}

/** Source identity + event + displayed clock must agree. Neither article date nor nearest clock is evidence. */
export function resolveTimeReferences(markdown: string, records: TimeRecord[]): { references: TimeReference[]; unresolved: UnresolvedTime[]; expressions?: TimeExpression[] } {
  const references: TimeReference[] = []
  const unresolved: UnresolvedTime[] = []
  const uniqueRecords = [...new Map(records.map((record) => [sourceKey(record), record])).values()]
  const projection = visibleProjection(markdown)
  const scans = scanTimeExpressions(projection.text)
  const expressions = scans.map((expression) => resolveExpression(projection, expression, uniqueRecords))
  for (const token of scanProjection(projection)) {
    const group = scans.find((expression) => token.index >= expression.index && token.index < expression.end)
    const approximateMember = group?.members.some((member) => member.approximate && token.index >= member.index && token.index < member.end)
    if (group && (group.approximate || approximateMember || !canonicalInstant(token.text))) continue
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
  return { references, unresolved, ...(expressions.length ? { expressions } : {}) }
}

/** Proposal accounting includes qualified members without double-counting preserved v1 claims. */
export function timeReferenceCoverage(markdown: string, resolved: ReturnType<typeof resolveTimeReferences>) {
  const projection = visibleProjection(markdown)
  const scans = scanTimeExpressions(projection.text)
  const owned = new Set(scanProjection(projection).filter((token) => scans.some((expression) => token.index >= expression.index && token.index < expression.end)).map((token) => JSON.stringify([token.text, token.occurrence])))
  const instantReferences = resolved.references.filter((reference) => !owned.has(JSON.stringify([reference.text, reference.occurrence]))).length
  const expressions = resolved.expressions ?? []
  const members = expressions.flatMap(timeExpressionMembers)
  const supportedMembers = members.filter((member) => member.resolution.kind === 'supported').length
  const groupedUnresolved = expressions.flatMap((expression) => timeExpressionMembers(expression).flatMap((member, index) => member.resolution.kind === 'unresolved' ? [{ text: member.text, expression: expression.text, member: index, reason: member.resolution.reason }] : []))
  return {
    resolved: instantReferences + supportedMembers,
    unresolved: [...resolved.unresolved, ...unsupportedTimeTokens(markdown, true), ...groupedUnresolved],
    coverage: { instantReferences, expressions: expressions.length, supportedMembers, unresolvedMembers: members.length - supportedMembers },
  }
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

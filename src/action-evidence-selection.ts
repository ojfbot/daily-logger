import { acceptedActionState, normalizeWorkKey, sha256, stripManagedActions, type ActionRegistry, type ActionSource } from './action-registry.js'
import { EXCLUDED_REPOS, KNOWN_REPOS } from './fleet.js'

const SOURCE_LIMIT = 128 * 1024
const TOTAL_LIMIT = 384 * 1024
export const ACTION_EVIDENCE_SELECTION_VERSION = 'whole-action-sources-v2'
export const COVERAGE_SOURCE = 'action-evidence-coverage'
export const CONTINUITY_TARGETS_SOURCE = 'accepted-closing-continuity-targets'
const sourceKey = (id: string) => id.replace(/@[a-f0-9]{64}$/, '')

export type ContinuityGithubReference = { id: string; repo: string; kind: string; number: string }

export function acceptedContinuityGithubReferences(targets: readonly string[]): ContinuityGithubReference[] {
  const refs = new Map<string, ContinuityGithubReference>()
  for (const target of targets) {
    const match = /^https:\/\/github\.com\/ojfbot\/([\w-]+)\/(pull|issues)\/(\d+)$/.exec(target)
    if (!match || EXCLUDED_REPOS.has(match[1])) continue
    const id = `${match[1]}#${match[3]}`
    refs.delete(id)
    refs.set(id, { id, repo: match[1], kind: match[2], number: match[3] })
  }
  return [...refs.values()]
}

function continuityRequiredReferences(sources: readonly ActionSource[]): string[] {
  const source = sources.find(candidate => sourceKey(candidate.id) === CONTINUITY_TARGETS_SOURCE)
  if (!source) return []
  try {
    const parsed: unknown = JSON.parse(source.content)
    if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 'accepted-closing-continuity-targets-v1'
      || !('references' in parsed) || !Array.isArray(parsed.references)
      || parsed.references.some(reference => typeof reference !== 'string' || !/^[\w-]+#\d+$/.test(reference))) {
      throw new Error('invalid accepted closing continuity target source')
    }
    return [...new Set(parsed.references)]
  } catch (error) {
    throw new Error(`Accepted closing continuity target source is invalid; review pending: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Canonical input for both cache fingerprints and selection; never pick a conflicting version. */
export function canonicalActionSources(sources: readonly ActionSource[]): ActionSource[] {
  const unique = new Map<string, ActionSource>()
  const identity = (source: ActionSource) => JSON.stringify({ id: source.id, kind: source.kind, locator: source.locator,
    content: source.content, trustedContent: source.trustedContent, fullContentSha256: source.fullContentSha256 })
  for (const source of [...sources].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = sourceKey(source.id)
    if (key === COVERAGE_SOURCE) continue
    const previous = unique.get(key)
    if (previous && identity(previous) !== identity(source)) throw new Error(`Conflicting action evidence identity: ${key}; review pending`)
    if (!previous) unique.set(key, source)
  }
  return [...unique.values()]
}

function references(text: string): Set<string> {
  return new Set([
    ...[...text.matchAll(/https:\/\/github\.com\/ojfbot\/([\w-]+)\/(?:pull|issues)\/(\d+)/g)].map(match => `${match[1]}#${match[2]}`),
    ...[...text.matchAll(/\b([\w-]+)\s+#(\d+)/g)].filter(match => KNOWN_REPOS.has(match[1])).map(match => `${match[1]}#${match[2]}`),
  ])
}

export function actionEvidenceScope(input: { registry: ActionRegistry; articleDate: string; markdown: string; feedback: string }) {
  const snapshot = input.registry.articles.find(article => article.date === input.articleDate)
  const current = snapshot?.actionKeys
    ?? input.registry.records.filter(record => record.introducedBy === input.articleDate).map(record => record.key)
  const nextSection = stripManagedActions(input.markdown).match(/^## (?:What['’]s next|Next actions|Suggested actions)\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/mi)?.[1] ?? ''
  const closing = snapshot?.closing?.kind === 'options' ? JSON.stringify(snapshot.closing.options) : ''
  const requested = [input.feedback, nextSection, closing].join('\n')
  const carried = input.registry.records.filter(record => current.includes(record.key) || requested.includes(record.key))
  const text = [requested, ...carried.map(record => JSON.stringify({ key: record.key, workKey: record.workKey,
    originalDescription: record.original.description, description: record.history.at(-1)?.description ?? record.original.description, goal: record.goal, doneWhen: record.doneWhen, gates: record.gates }))].join('\n')
  const refs = references(text)
  // Citation identities are also dependencies when the prose uses a short #N.
  for (const record of carried) for (const decision of record.history) for (const citation of decision.citations) {
    const ref = sourceKey(citation.sourceId).match(/^github:([\w-]+#\d+)$/)?.[1]
    if (ref) refs.add(ref)
  }
  const expanded = input.registry.records.filter(record => current.includes(record.key)
    || text.includes(record.key)
    || [...references(JSON.stringify(record))].some(ref => refs.has(ref))).map(record => record.key)
  return { current, refs, expanded, text }
}

/** Select complete sources, never first/last-N comments or inferred summaries. */
export function selectActionEvidence(input: { registry: ActionRegistry; articleDate: string; markdown: string; feedback: string; sources: readonly ActionSource[] }) {
  const scope = actionEvidenceScope(input)
  const sources = canonicalActionSources(input.sources)
  const requiredRefs = new Set([...scope.refs, ...continuityRequiredReferences(sources)])
  const available = new Set(sources.map(source => sourceKey(source.id)))
  const required = (source: ActionSource) => ['article', 'operator'].includes(sourceKey(source.id))
    || source.kind === 'repository'
    || source.kind === 'github' && !/^github:[\w-]+#\d+$/.test(sourceKey(source.id))
    || requiredRefs.has(sourceKey(source.id).replace(/^github:/, ''))
  const coverage = sources.map(source => ({ id: source.id, kind: source.kind, locator: source.locator,
    fullContentSha256: source.fullContentSha256 ?? sha256(source.content), collectedContentSha256: sha256(source.content),
    bytes: Buffer.byteLength(source.content), lines: source.content.split('\n').length,
    required: required(source), included: false, reason: 'outside current action/feedback scope' }))
  const missing = [...requiredRefs].filter(ref => !available.has(`github:${ref}`)).sort()
  const selected: ActionSource[] = []
  let bytes = 0
  const dependencies = [scope.text, ...sources.filter(source => source.kind === 'github' && required(source)).map(source => source.content)].join('\n')
  const ordered = [...sources].sort((a, b) => Number(required(b)) - Number(required(a)) || sourceKey(a.id).localeCompare(sourceKey(b.id)))
  for (const source of ordered) {
    const entry = coverage.find(item => item.id === source.id)
    if (!entry) throw new Error('Missing action coverage entry')
    const contentPin = source.id.match(/@([a-f0-9]{64})$/)?.[1]
    const complete = entry.fullContentSha256 === entry.collectedContentSha256 && (!contentPin || contentPin === entry.collectedContentSha256)
    const goalPath = sourceKey(source.id).match(/^goal:[\w-]+:(.+)$/)?.[1]
    const wanted = required(source) || source.kind !== 'github' && (!goalPath
      || goalPath === 'decisions/northstar/l2-ojfbot.md' || dependencies.includes(goalPath))
    if (!wanted) continue
    if (!complete || entry.bytes > SOURCE_LIMIT || bytes + entry.bytes > TOTAL_LIMIT - 16 * 1024) {
      entry.reason = !complete ? 'source bytes do not match their full-content identity (excerpt or corruption)' : entry.bytes > SOURCE_LIMIT ? 'exceeds 128 KiB source limit' : 'whole source does not fit total budget'
      if (entry.required) throw new Error(`Required action evidence ${source.id}: ${entry.reason}; review pending`)
      continue
    }
    entry.included = true
    entry.reason = entry.required ? 'complete current-action/feedback dependency' : 'complete goal or contextual source'
    selected.push(source)
    bytes += entry.bytes
  }
  if (missing.length) throw new Error(`Required action evidence unavailable (collection limit, privacy policy or fetch failure): ${missing.join(', ')}; review pending`)
  const receipt = { version: ACTION_EVIDENCE_SELECTION_VERSION, unit: 'UTF-8 bytes',
    collection: 'Bounded collector output, not an exhaustive repository/discussion census. Missing or omitted content is unknown, never evidence of absence or approval.',
    selection: 'Whole sources only; no chronological comment window or excerpt. Only current carried actions, explicit feedback and the next-actions section require GitHub discussions. Shipment prose does not.',
    authority: 'This coverage index is context only. Hashes, identities, omission reasons and missing evidence cannot justify completion, supersession, dismissal or human approval.',
    requiredReferences: [...requiredRefs].sort(), expandedActionKeys: scope.expanded.sort(), sources: coverage }
  const content = JSON.stringify(receipt)
  if (Buffer.byteLength(content) > SOURCE_LIMIT || bytes + Buffer.byteLength(content) > TOTAL_LIMIT) throw new Error('Action evidence coverage exceeds its source budget; review pending')
  const report: ActionSource = { id: `${COVERAGE_SOURCE}@${sha256(content)}`, kind: 'report', locator: ACTION_EVIDENCE_SELECTION_VERSION, content }
  return { sources: [...selected, report].sort((a, b) => a.id.localeCompare(b.id)), receipt, expandedActionKeys: scope.expanded }
}

/** Global equivalence/rejection memory is retained; only relevant records expand. */
export function actionReviewIndex(input: { registry: ActionRegistry; articleDate: string; articleStatuses: ReadonlyMap<string, string>; expandedActionKeys: readonly string[] }) {
  const actions = input.registry.records.map(record => {
    const state = acceptedActionState(record, input.articleStatuses, input.registry)
    const identity = { key: record.key, workKey: record.workKey, repo: record.original.repo, state, includeInIndex: record.includeInIndex,
      protected: !!record.original.review, inclusionOverride: record.inclusionOverride }
    if (!input.expandedActionKeys.includes(record.key) && !record.history.length && !record.gates.length && !record.original.review) return identity
    const description = record.history.filter(decision => input.articleStatuses.get(decision.articleDate) === 'accepted'
      && input.registry.articles.some(article => article.date === decision.articleDate && article.status === 'accepted' && article.roundId === decision.roundId)).at(-1)?.description ?? record.original.description
    return { ...identity, originalDescription: record.original.description, description, doneWhen: record.doneWhen, gates: record.gates,
      goal: record.goal, history: record.history }
  })
  const held = input.registry.baseline.heldSuggestions.map(item => {
    const match = /^>\s*-\s*`([^`]+)`\s*[—–-]\s*(.*?)\s*\(([^()]*)\)\s*$/.exec(item.suggestion)
    return { date: item.sourceDate, fingerprint: item.suggestionLineSha256,
      ...(match ? { workKey: normalizeWorkKey(match[3], match[1].split(/\s+/)[0], match[2]) } : { suggestion: item.suggestion }) }
  })
  const rejectionMemory = [...new Map(input.registry.articles.flatMap(article => article.rejected).filter(item => item.workKey)
    .map(item => [JSON.stringify([item.workKey, item.evidenceDigest, item.quotaHold]), { workKey: item.workKey, evidenceDigest: item.evidenceDigest, ...(item.quotaHold ? { quotaHold: item.quotaHold } : {}) }])).values()]
  return { actions, held, rejectionMemory }
}

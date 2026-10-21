import { acceptedActionState, normalizeWorkKey, sha256, stripManagedActions, type ActionRegistry, type ActionSource, type DraftRecommendationContext, type RankedClosingOption, type RecommendationMaintenanceDescriptor } from './action-registry.js'
import type { ActionReviewCycle } from './action-review-cycle.js'
import {
  ACTION_EVIDENCE_PER_SOURCE_LIMIT,
  ACTION_EVIDENCE_TOTAL_LIMIT,
  ActionEvidenceRequestError,
  actionEvidenceCaseDigest,
  createActionEvidenceRequest,
  validateActionEvidenceProjection,
} from './action-evidence-retrieval.js'
import { EXCLUDED_REPOS, KNOWN_REPOS } from './fleet.js'
import { extractDraftRecommendationContext } from './recommendation-prose.js'

const SOURCE_LIMIT = ACTION_EVIDENCE_PER_SOURCE_LIMIT
const TOTAL_LIMIT = ACTION_EVIDENCE_TOTAL_LIMIT
export const ACTION_EVIDENCE_SELECTION_VERSION = 'progressive-action-evidence-v4'
export const COVERAGE_SOURCE = 'action-evidence-coverage'
export const CONTINUITY_TARGETS_SOURCE = 'accepted-closing-continuity-targets'
const sourceKey = (id: string) => id.replace(/@[a-f0-9]{64}$/, '')

export type ContinuityGithubReference = { id: string; repo: string; kind: string; number: string }

export function recommendationMaintenanceDescriptor(option: RankedClosingOption): RecommendationMaintenanceDescriptor {
  return option.kind === 'action'
    ? { kind: option.kind, identity: option.identity, actionKey: option.actionKey, title: option.title, outcome: option.outcome }
    : { kind: option.kind, identity: option.identity, target: option.target, title: option.title, outcome: option.outcome }
}

export function recommendationMaintenanceProjection(previous: ActionRegistry['articles'][number] | undefined) {
  if (!previous?.closing || previous.closing.kind === 'options') return null
  const recommendations = previous.closing.kind === 'shortlist' ? previous.closing.options : previous.closing.recommendations
  return {
    authority: 'Maintenance memory only. These descriptors are not current evidence and cannot justify display, disposition, replacement or execution. Revalidate against the supplied current sources; when an unresolved identity lacks a descriptor, request source-bound clarification instead of inferring its meaning.',
    reviewState: previous.review.state,
    recommendations: recommendations.map(option => ({ ...recommendationMaintenanceDescriptor(option), replaces: option.replaces })),
    unresolvedIdentities: previous.closing.kind === 'needs-evidence' ? previous.closing.unresolvedIdentities ?? [] : [],
    unresolvedRecommendations: previous.closing.kind === 'needs-evidence' ? previous.closing.unresolvedRecommendations ?? [] : [],
  }
}

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
    content: source.content, trustedContent: source.trustedContent, fullContentSha256: source.fullContentSha256,
    projection: source.projection, response: source.response })
  for (const source of [...sources].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = source.projection ? source.id : sourceKey(source.id)
    if (key === COVERAGE_SOURCE) continue
    const previous = unique.get(key)
    if (previous && identity(previous) !== identity(source)) throw new Error(`Conflicting action evidence identity: ${key}; review pending`)
    if (!previous) unique.set(key, source)
  }
  return [...unique.values()]
}

export function actionSourceReferences(text: string): Set<string> {
  return new Set([
    ...[...text.matchAll(/https:\/\/github\.com\/ojfbot\/([\w-]+)\/(?:pull|issues)\/(\d+)/g)].map(match => `${match[1]}#${match[2]}`),
    ...[...text.matchAll(/\b([\w-]+)\s+#(\d+)/g)].filter(match => KNOWN_REPOS.has(match[1])).map(match => `${match[1]}#${match[2]}`),
  ])
}

export function actionRecordSourceReferences(record: ActionRegistry['records'][number]): string[] {
  return [...actionSourceReferences(JSON.stringify({
    key: record.key,
    workKey: record.workKey,
    repo: record.original.repo,
    originalDescription: record.original.description,
    goal: record.goal,
    doneWhen: record.doneWhen,
    gates: record.gates,
  }))].sort()
}

export function actionEvidenceScope(input: { registry: ActionRegistry; articleDate: string; markdown: string; feedback: string; draftContext?: DraftRecommendationContext; reassessActionKeys?: readonly string[]; preserveActionKeys?: readonly string[] }) {
  const snapshot = input.registry.articles.find(article => article.date === input.articleDate)
  const current = snapshot?.actionKeys
    ?? input.registry.records.filter(record => record.introducedBy === input.articleDate).map(record => record.key)
  const prepared = extractDraftRecommendationContext(stripManagedActions(input.markdown), input.draftContext ?? snapshot?.draftContext)
  const nextSection = prepared.context.kind === 'retained' ? prepared.context.markdown : ''
  const maintenance = recommendationMaintenanceProjection(snapshot)
  const closing = maintenance ? JSON.stringify(maintenance) : snapshot?.closing?.kind === 'options' ? JSON.stringify(snapshot.closing.options) : ''
  const requested = [input.feedback, nextSection, closing].join('\n')
  const statuses = new Map(input.registry.articles.map(article => [article.date, article.status]))
  const terminal = (record: ActionRegistry['records'][number]) => ['done', 'dismissed', 'superseded'].includes(acceptedActionState(record, statuses, input.registry))
  const reassessActionKeys = [...new Set(input.reassessActionKeys ?? [])].sort()
  const preserveActionKeys = [...new Set(input.preserveActionKeys ?? [])].sort()
  if (reassessActionKeys.some(key => preserveActionKeys.includes(key))) throw new Error('A terminal action cannot be both preserved and reassessed')
  for (const key of [...reassessActionKeys, ...preserveActionKeys]) {
    const record = input.registry.records.find(candidate => candidate.key === key)
    if (!record || !terminal(record)) throw new Error(`Terminal intent requires an existing accepted terminal action identity: ${key}`)
  }
  const requestedRecords = input.registry.records.filter(record => requested.includes(record.key) || requested.includes(record.workKey))
  const ambiguousTerminalActionKeys = requestedRecords
    .filter(record => terminal(record) && !reassessActionKeys.includes(record.key) && !preserveActionKeys.includes(record.key))
    .map(record => record.key)
    .sort()
  const preservedTerminalActionKeys = requestedRecords
    .filter(record => preserveActionKeys.includes(record.key))
    .map(record => record.key)
    .sort()
  const reviewActionKeys = input.registry.records
    .filter(record => (current.includes(record.key) || requestedRecords.includes(record) || reassessActionKeys.includes(record.key))
      && (!terminal(record) || reassessActionKeys.includes(record.key)))
    .map(record => record.key)
    .sort()
  const carried = input.registry.records.filter(record => reviewActionKeys.includes(record.key))
  const text = [requested, ...carried.map(record => JSON.stringify({ key: record.key, workKey: record.workKey,
    originalDescription: record.original.description, description: record.history.at(-1)?.description ?? record.original.description, goal: record.goal, doneWhen: record.doneWhen, gates: record.gates }))].join('\n')
  const refs = actionSourceReferences(text)
  // Citation identities are also dependencies when the prose uses a short #N.
  for (const record of carried) for (const decision of record.history) for (const citation of decision.citations) {
    const ref = sourceKey(citation.sourceId).match(/^github:([\w-]+#\d+)$/)?.[1]
    if (ref) refs.add(ref)
  }
  const expanded = input.registry.records.filter(record => current.includes(record.key)
    || text.includes(record.key)
    || [...actionSourceReferences(JSON.stringify(record))].some(ref => refs.has(ref))).map(record => record.key)
  return { current, refs, expanded, text, reviewActionKeys, preservedTerminalActionKeys, ambiguousTerminalActionKeys }
}

/** Select complete sources, never first/last-N comments or inferred summaries. */
export function selectActionEvidence(input: { registry: ActionRegistry; articleDate: string; cycle?: ActionReviewCycle; markdown: string; feedback: string; sources: readonly ActionSource[]; draftContext?: DraftRecommendationContext; reassessActionKeys?: readonly string[]; preserveActionKeys?: readonly string[] }) {
  const cycle: ActionReviewCycle = input.cycle ?? { phase: 'generation' }
  const scope = actionEvidenceScope(input)
  const sources = canonicalActionSources(input.sources)
  const completeSources = sources.filter(source => !source.projection)
  const projections = sources.filter(source => source.projection)
  const snapshot = input.registry.articles.find(article => article.date === input.articleDate)
  const responseRequestIds = new Set(completeSources.flatMap(source => {
    if (!source.response) return []
    const request = snapshot?.evidenceRequests?.find(candidate => candidate.id === source.response?.requestId)
    if (!request || request.status !== 'open' || request.caseDigest !== source.response.caseDigest
      || source.response.actionKeys.some(key => !request.actionKeys.includes(key))) {
      throw new Error(`Action evidence response is stale, unsolicited, or outside its request scope: ${source.id}`)
    }
    return [request.id]
  }))
  const requiredRefs = new Set([...scope.refs, ...continuityRequiredReferences(sources)])
  const available = new Set(completeSources.map(source => sourceKey(source.id)))
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
  const resolvedRequests: string[] = [...responseRequestIds]
  let bytes = 0
  const dependencies = [scope.text, ...completeSources.filter(source => source.kind === 'github' && required(source)).map(source => source.content)].join('\n')
  const caseActionKeys = scope.reviewActionKeys.length
    ? scope.reviewActionKeys
    : scope.ambiguousTerminalActionKeys.length ? scope.ambiguousTerminalActionKeys : ['article-feedback']
  const caseDigest = actionEvidenceCaseDigest({ ...input, cycle, actionKeys: caseActionKeys })
  const obligation = (actionKey: string | undefined, kind: 'goal' | 'current-disposition' | 'done-when' | 'gate' | 'feedback', text: string) => sha256(JSON.stringify({ actionKey, kind, text }))
  const obligations = input.registry.records.filter(record => scope.reviewActionKeys.includes(record.key)).flatMap(record => [
    ...(record.goal ? [obligation(record.key, 'goal', record.goal)] : []),
    obligation(record.key, 'current-disposition', record.history.at(-1)?.description ?? record.original.description),
    ...(record.doneWhen ? [obligation(record.key, 'done-when', record.doneWhen)] : []),
    ...record.gates.map(gate => obligation(record.key, 'gate', gate)),
  ])
  if (input.feedback.trim()) obligations.push(obligation(undefined, 'feedback', input.feedback.trim().slice(0, 512)))
  if (!obligations.length) obligations.push(obligation(undefined, 'feedback', 'Resolve the explicitly requested article evidence without inventing a disposition.'))
  const requestFor = (kind: 'source-view' | 'missing-source', key: string, source?: ActionSource) => createActionEvidenceRequest({
    kind,
    caseDigest,
    articleDate: input.articleDate,
    cycle,
    actionKeys: caseActionKeys,
    sourceKey: key,
    ...(source ? { source } : {}),
    question: `Which exact ranges in ${key} support or contradict the required action decision while retaining every obligation and owner gate?`.slice(0, 512),
    obligations,
  })
  if (scope.ambiguousTerminalActionKeys.length) {
    const request = createActionEvidenceRequest({
      kind: 'clarification',
      caseDigest,
      articleDate: input.articleDate,
      cycle,
      actionKeys: scope.ambiguousTerminalActionKeys,
      sourceKey: `terminal-intent:${scope.ambiguousTerminalActionKeys.join(',')}`,
      question: 'Specify preserve or reassess for each referenced accepted terminal action; no terminal state was changed.',
      obligations,
      recipient: 'coordinator-owner',
    })
    throw new ActionEvidenceRequestError(request, `Accepted terminal action intent is ambiguous: ${scope.ambiguousTerminalActionKeys.join(', ')}; review pending`)
  }
  const ordered = [...completeSources].sort((a, b) => Number(required(b)) - Number(required(a)) || sourceKey(a.id).localeCompare(sourceKey(b.id)))
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
      if (entry.required && complete) {
        const request = requestFor('source-view', sourceKey(source.id), source)
        const candidates = projections
          .filter(candidate => candidate.projection?.fullSourceId === source.id && candidate.projection.caseDigest === caseDigest)
          .map(projection => validateActionEvidenceProjection({ request, source, projection }))
        const completeCandidates = candidates.filter(candidate => !candidate.projection?.coverage.some(item => item.status === 'unknown'))
        if (completeCandidates.length > 1) throw new Error(`Multiple complete bounded evidence replies for ${source.id}; review pending`)
        if (completeCandidates.length === 1) {
          const projection = completeCandidates[0]
          const projectionEntry = coverage.find(item => item.id === projection.id)
          if (!projectionEntry) throw new Error('Missing bounded evidence coverage entry')
          if (bytes + projectionEntry.bytes > TOTAL_LIMIT - 16 * 1024) throw new ActionEvidenceRequestError(request, `Required action evidence ${source.id}: bounded question view does not fit total budget; review pending`)
          entry.reason = 'complete artifact retained; bounded question view selected'
          projectionEntry.required = true
          projectionEntry.included = true
          projectionEntry.reason = 'exact ranges pinned to immutable complete artifact for one open question'
          selected.push(projection)
          bytes += projectionEntry.bytes
          resolvedRequests.push(request.id)
          continue
        }
        if (candidates.length) {
          const unknown = [...new Set(candidates.flatMap(candidate => candidate.projection?.coverage.filter(item => item.status === 'unknown').map(item => item.obligationId) ?? []))]
          throw new ActionEvidenceRequestError(request, `Bounded evidence reply leaves ${unknown.length} obligation(s) explicitly unknown: ${unknown.join(', ')}; review pending`)
        }
        throw new ActionEvidenceRequestError(request, `Required action evidence ${source.id}: ${entry.reason}; bounded source view requested; review pending`)
      }
      if (entry.required) throw new Error(`Required action evidence ${source.id}: ${entry.reason}; review pending`)
      continue
    }
    entry.included = true
    entry.reason = entry.required ? 'complete current-action/feedback dependency' : 'complete goal or contextual source'
    selected.push(source)
    bytes += entry.bytes
  }
  if (missing.length) {
    const request = requestFor('missing-source', `github:${missing[0]}`)
    throw new ActionEvidenceRequestError(request, `Required action evidence unavailable (collection limit, privacy policy or fetch failure): ${missing.join(', ')}; review pending`)
  }
  const receipt = { version: ACTION_EVIDENCE_SELECTION_VERSION, unit: 'UTF-8 bytes',
    collection: 'Bounded collector output, not an exhaustive repository/discussion census. Missing or omitted content is unknown, never evidence of absence or approval.',
    selection: 'Whole sources only; no chronological comment window or excerpt. Only current carried actions, explicit feedback and retained draft continuation context require GitHub discussions. Shipment prose does not.',
    authority: 'This coverage index is context only. Hashes, identities, omission reasons and missing evidence cannot justify completion, supersession, dismissal or human approval.',
    requiredReferences: [...requiredRefs].sort(), reviewActionKeys: scope.reviewActionKeys, preservedTerminalActionKeys: scope.preservedTerminalActionKeys,
    expandedActionKeys: scope.expanded.sort(), resolvedRequests: resolvedRequests.sort(), sources: coverage }
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

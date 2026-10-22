import { ActionReviewOutputSchema, DraftCandidateEvidenceRequirementsSchema, acceptedActionState, actionStateDigest, assertActionSnapshotStateIntegrity, managedArticleDigest, normalizeWorkKey, sha256, stripManagedActions, type ActionRegistry, type ActionReviewOutput, type ActionSource, type DraftActionCandidate, type DraftCandidateEvidenceRequirements, type DraftRecommendationContext, type RankedClosingOption, type RecommendationMaintenanceDescriptor } from './action-registry.js'
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
export const ACTION_EVIDENCE_SELECTION_VERSION = 'progressive-action-evidence-v5-candidate-requirements'
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

type CandidateEvidenceScopeInput = {
  registry: ActionRegistry
  articleDate: string
  markdown: string
  cycle?: ActionReviewCycle
  articleStatuses?: ReadonlyMap<string, string>
  draftContext?: DraftRecommendationContext
  draftCandidateEvidence?: DraftCandidateEvidenceRequirements
  draftCandidates?: readonly DraftActionCandidate[]
  feedback?: string
}

type DraftCandidateEvidenceRole = 'target' | 'lifecycle' | 'owner' | 'gate' | 'counterevidence' | 'retained-context'

const REVIEWED_CANDIDATE_ALIASES = new Map<string, string>([
  ['wayfinder#543', 'core#543'],
])

function sortedStatuses(statuses: ReadonlyMap<string, string>) {
  return [...statuses].sort(([left], [right]) => left.localeCompare(right))
}

function restoreAcceptedArticleToDraft(markdown: string): string | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)
  if (!frontmatter) return undefined
  const statusLines = [...frontmatter[1].matchAll(/^status:.*$/gm)].map(match => match[0])
  const outcomeLines = [...frontmatter[1].matchAll(/^outcome:.*$/gm)].map(match => match[0])
  if (statusLines.length !== 1 || outcomeLines.length !== 1
    || !/^status:\s*(?:accepted|"accepted"|'accepted')\s*$/.test(statusLines[0]!)
    || !/^outcome:\s*(?:accepted|"accepted"|'accepted')\s*$/.test(outcomeLines[0]!)) return undefined
  const restoredFrontmatter = frontmatter[1].replace(/^status:\s*["']?accepted["']?\s*$/m, 'status: draft')
  return markdown.replace(frontmatter[1], restoredFrontmatter)
}

function canonicalInputIndex(registry: ActionRegistry, statuses: ReadonlyMap<string, string>, output?: ActionReviewOutput) {
  const index = actionReviewIndex({ registry, articleDate: output?.articleDate ?? '', articleStatuses: statuses, expandedActionKeys: registry.records.map(record => record.key) })
  const actions = new Map(index.actions.map(action => [action.key, sha256(JSON.stringify(action))]))
  let rejectionMemorySha256 = sha256(JSON.stringify(index.rejectionMemory))
  if (output) {
    const records = new Map(registry.records.map(record => [record.key, record]))
    for (const created of output.createdRecords) {
      const record = records.get(created.actionKey)
      if (!record || sha256(JSON.stringify(record)) !== created.afterRecordSha256 || actions.get(created.actionKey) !== created.afterInputSha256) throw new Error(`Native review output changed after verification: ${created.actionKey}; review pending`)
      actions.delete(created.actionKey)
    }
    for (const updated of output.updatedRecords) {
      const record = records.get(updated.actionKey)
      if (!record || sha256(JSON.stringify(record)) !== updated.afterRecordSha256 || actions.get(updated.actionKey) !== updated.afterInputSha256) throw new Error(`Native review output changed after verification: ${updated.actionKey}; review pending`)
      actions.set(updated.actionKey, updated.beforeInputSha256)
    }
    if (rejectionMemorySha256 !== output.rejectionMemory.afterSha256) throw new Error('Native review rejection memory changed after verification; review pending')
    rejectionMemorySha256 = output.rejectionMemory.beforeSha256
  }
  const view = { actions: [...actions].sort(([left], [right]) => left.localeCompare(right)), held: index.held, rejectionMemorySha256 }
  return { sha256: sha256(JSON.stringify(view)), actions, rejectionMemorySha256 }
}

export function candidateReviewOutputFrontierGaps(registry: ActionRegistry, snapshot: ActionRegistry['articles'][number] | undefined, requirements: DraftCandidateEvidenceRequirements | undefined) {
  if (!snapshot?.reviewOutput || !requirements) return []
  const output = ActionReviewOutputSchema.parse(snapshot.reviewOutput)
  const inputKeys = new Set(requirements.inputActionKeys)
  const relatedKeys = new Set(requirements.candidates.flatMap(candidate => candidate.actionRelations.map(relation => relation.actionKey)))
  const candidates = snapshot.draftCandidates ?? []
  const gaps: string[] = []
  for (const actionKey of [...output.createdRecords, ...output.updatedRecords].map(record => record.actionKey)) {
    const record = registry.records.find(candidate => candidate.key === actionKey)
    if (!record || !inputKeys.has(actionKey)) {
      gaps.push(actionKey)
      continue
    }
    const matchesCandidate = candidates.some(candidate => record.original.repo === candidate.payload.repo
      && record.original.command === candidate.payload.command
      && record.original.description === candidate.payload.description)
    if (matchesCandidate && !relatedKeys.has(actionKey)) gaps.push(actionKey)
  }
  return [...new Set(gaps)].sort()
}

function applicableReviewOutput(registry: ActionRegistry, snapshot: ActionRegistry['articles'][number] | undefined, requirements: DraftCandidateEvidenceRequirements | undefined, cycle: ActionReviewCycle | undefined) {
  if (!snapshot?.reviewOutput || !requirements || !cycle || JSON.stringify(snapshot.reviewOutput.reviewCycle) !== JSON.stringify(cycle)) return undefined
  const output = ActionReviewOutputSchema.parse(snapshot.reviewOutput)
  if (snapshot.review.state !== 'verified') return undefined
  if (output.articleDate !== snapshot.date || output.roundId !== snapshot.roundId
    || output.proposalSha256 !== snapshot.verification.proposalSha256) {
    throw new Error('Native review output provenance is stale or foreign; review pending')
  }
  if (snapshot.stateDigest !== actionStateDigest(registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, { articleDate: snapshot.date, roundId: snapshot.roundId,
    draftCandidates: snapshot.draftCandidates, candidateReviewHistory: snapshot.candidateReviewHistory, draftCandidateEvidence: snapshot.draftCandidateEvidence, reviewOutput: snapshot.reviewOutput })) throw new Error('Native review output integrity changed after verification; review pending')
  if (output.consumedInputSha256 !== requirements.canonicalIndexSha256) {
    if (!candidateReviewOutputFrontierGaps(registry, snapshot, requirements).length) return undefined
    throw new Error('Native review output provenance is stale or foreign; review pending')
  }
  return output
}

function candidateTargetReferences(candidate: DraftActionCandidate, retainedRefs: ReadonlySet<string>): Set<string> {
  const payload = JSON.stringify(candidate.payload)
  const references = actionSourceReferences(payload)
  for (const match of payload.matchAll(/https:\/\/([^/\s]+)\/([^/\s]+)\/([\w-]+)\/(?:pull|issues)\/(\d+)/g)) {
    if (match[1] !== 'github.com' || match[2] !== 'ojfbot') throw new Error(`Foreign candidate reference ${match[0]} for ${candidate.candidateId}; review pending`)
    if (!KNOWN_REPOS.has(match[3]) || EXCLUDED_REPOS.has(match[3])) throw new Error(`Unsupported qualified candidate reference ${match[3]}#${match[4]} for ${candidate.candidateId}; review pending`)
  }
  for (const match of payload.matchAll(/\b([\w-]+)#(\d+)\b/g)) {
    const qualified = `${match[1]}#${match[2]}`
    if (KNOWN_REPOS.has(match[1])) {
      references.add(qualified)
      continue
    }
    const reviewed = REVIEWED_CANDIDATE_ALIASES.get(qualified)
    if (!reviewed) throw new Error(`Unsupported qualified candidate reference ${qualified} for ${candidate.candidateId}; review pending`)
    const matches = [...retainedRefs].filter(reference => reference.endsWith(`#${match[2]}`))
    if (matches.length !== 1 || matches[0] !== reviewed) throw new Error(`Ambiguous candidate target ${qualified} for ${candidate.candidateId}; explicit qualified evidence association required; review pending`)
    references.add(reviewed)
  }
  for (const match of candidate.payload.command.matchAll(/(?:^|\s)#(\d+)\b/g)) {
    const matches = [...retainedRefs].filter(reference => reference.endsWith(`#${match[1]}`))
    if (matches.length !== 1) throw new Error(`Ambiguous candidate target #${match[1]} for ${candidate.candidateId}; explicit qualified evidence association required; review pending`)
    references.add(matches[0])
  }
  return references
}

function exactImportedCandidateRecords(registry: ActionRegistry, candidate: DraftActionCandidate) {
  const payload = candidate.payload
  const workKey = normalizeWorkKey(payload.repo, payload.command, payload.description)
  return registry.records.filter(record => record.origin === 'imported'
    && record.original.repo === payload.repo
    && record.original.command === payload.command
    && record.original.description === payload.description
    && record.workKey === workKey
    && record.workKey === normalizeWorkKey(record.original.repo, record.original.command, record.original.description))
}

export function draftCandidateEvidenceBinding(input: CandidateEvidenceScopeInput, prepared = extractDraftRecommendationContext(stripManagedActions(input.markdown), input.draftContext ?? input.registry.articles.find(article => article.date === input.articleDate)?.draftContext)) {
  const snapshot = input.registry.articles.find(article => article.date === input.articleDate)
  const candidates = snapshot?.draftCandidates ?? input.draftCandidates ?? []
  if (!candidates.length) throw new Error('Draft candidate evidence binding requires captured candidates')
  const cycle = input.cycle ?? snapshot?.reviewCycle
  if (!cycle) throw new Error('Draft candidate evidence binding requires an action review cycle')
  const requirements = input.draftCandidateEvidence ?? snapshot?.draftCandidateEvidence
  const statuses = new Map(input.articleStatuses ?? input.registry.articles.map(article => [article.date, article.status]))
  statuses.set(input.articleDate, input.markdown.match(/^status:\s*["']?(accepted|rejected)/m)?.[1] ?? 'draft')
  const contextText = prepared.context.kind === 'retained' ? prepared.context.markdown : ''
  const output = applicableReviewOutput(input.registry, snapshot, requirements, cycle)
  const canonical = canonicalInputIndex(input.registry, statuses, output)
  const visibleRecords = input.registry.records.filter(record => canonical.actions.has(record.key))
  const mandatoryKeys = new Set(visibleRecords.filter(record => contextText.includes(record.key) || contextText.includes(record.workKey)).map(record => record.key))
  const relationKeys = new Set([
    ...(requirements?.candidates.flatMap(candidate => candidate.actionRelations.map(relation => relation.actionKey)) ?? []),
    ...candidates.flatMap(candidate => exactImportedCandidateRecords(input.registry, candidate).map(record => record.key)),
  ])
  const inputActionKeys = [...new Set([...mandatoryKeys, ...relationKeys])].sort()
  if (requirements && JSON.stringify([...requirements.inputActionKeys].sort()) !== JSON.stringify(inputActionKeys)) throw new Error('Structured draft candidate evidence input identities are stale or incomplete; review pending')
  const actionState = inputActionKeys.map(key => {
    const digest = canonical.actions.get(key)
    if (!digest) throw new Error(`Draft candidate evidence binding references unknown canonical action: ${key}`)
    return { key, digest }
  })
  return {
    articleDate: input.articleDate,
    articleDigest: managedArticleDigest(prepared.markdown),
    reviewCycle: cycle,
    draftContextSha256: sha256(JSON.stringify(prepared.context)),
    candidatePayloadsSha256: sha256(JSON.stringify(candidates.map(candidate => ({ candidateId: candidate.candidateId, payload: candidate.payload })))),
    feedbackSha256: sha256(input.feedback ?? ''),
    articleStatusesSha256: sha256(JSON.stringify(sortedStatuses(statuses))),
    canonicalIndexSha256: canonical.sha256,
    inputActionKeys,
    actionStateSha256: sha256(JSON.stringify(actionState)),
  }
}

export function draftCandidateEvidenceScope(input: CandidateEvidenceScopeInput, prepared = extractDraftRecommendationContext(stripManagedActions(input.markdown), input.draftContext ?? input.registry.articles.find(article => article.date === input.articleDate)?.draftContext)) {
  const snapshot = input.registry.articles.find(article => article.date === input.articleDate)
  const candidates = snapshot?.draftCandidates ?? input.draftCandidates ?? []
  const rawRequirements = input.draftCandidateEvidence ?? snapshot?.draftCandidateEvidence
  if (!candidates.length) {
    if (rawRequirements) throw new Error('Structured draft candidate evidence exists without captured candidates; review pending')
    if (snapshot && snapshot.draftCandidates === undefined && prepared.context.kind === 'retained' && /\b[a-f0-9]{64}\b/.test(prepared.context.markdown)) {
      throw new Error('Draft candidate custody is unknown for retained candidate identities; review pending')
    }
    return { hasAssociations: false, requiredRefs: new Set<string>(), contextRefs: new Set<string>(), referenceRequirements: [] as Array<{ reference: string; classification: 'required' | 'context'; source: string; reason: string; role?: DraftCandidateEvidenceRole }> }
  }
  if (!rawRequirements) throw new Error('Structured draft candidate evidence requirements are missing; review pending')
  const requirements = DraftCandidateEvidenceRequirementsSchema.parse(rawRequirements)
  const binding = draftCandidateEvidenceBinding(input, prepared)
  const staleFields = [
    requirements.articleDate !== binding.articleDate && 'articleDate',
    requirements.articleDigest !== binding.articleDigest && 'articleDigest',
    snapshot && requirements.articleDigest !== snapshot.articleDigest && 'snapshotArticleDigest',
    JSON.stringify(requirements.reviewCycle) !== JSON.stringify(binding.reviewCycle) && 'reviewCycle',
    requirements.draftContextSha256 !== binding.draftContextSha256 && 'draftContext',
    requirements.candidatePayloadsSha256 !== binding.candidatePayloadsSha256 && 'candidatePayloads',
    requirements.feedbackSha256 !== binding.feedbackSha256 && 'feedback',
    requirements.articleStatusesSha256 !== binding.articleStatusesSha256 && 'articleStatuses',
    requirements.canonicalIndexSha256 !== binding.canonicalIndexSha256 && 'canonicalIndex',
    JSON.stringify(requirements.inputActionKeys) !== JSON.stringify(binding.inputActionKeys) && 'inputActionKeys',
    requirements.actionStateSha256 !== binding.actionStateSha256 && 'actionState',
  ].filter(Boolean)
  if (staleFields.length) throw new Error(`Structured draft candidate evidence binding is stale or foreign (${staleFields.join(', ')}); review pending`)
  const candidatesById = new Map(candidates.map(candidate => [candidate.candidateId, candidate]))
  const requirementIds = requirements.candidates.map(candidate => candidate.candidateId).sort()
  if (JSON.stringify([...candidatesById.keys()].sort()) !== JSON.stringify(requirementIds)) throw new Error('Structured draft candidate evidence must account for every captured candidate; review pending')

  const retainedRefs = prepared.context.kind === 'retained' ? actionSourceReferences(prepared.context.markdown) : new Set<string>()
  const targetRefs = new Map(candidates.map(candidate => [candidate.candidateId, candidateTargetReferences(candidate, retainedRefs)]))
  const knownRefs = new Set([...retainedRefs, ...[...targetRefs.values()].flatMap(references => [...references])])
  const classifications = new Map<string, Set<'required' | 'context'>>()
  const referenceRequirements: Array<{ reference: string; classification: 'required' | 'context'; source: string; reason: string; role?: DraftCandidateEvidenceRole }> = []
  const add = (entry: { reference: string; classification: 'required' | 'context'; reason: string; role?: DraftCandidateEvidenceRole }, source: string) => {
    const values = classifications.get(entry.reference) ?? new Set<'required' | 'context'>()
    values.add(entry.classification)
    classifications.set(entry.reference, values)
    referenceRequirements.push({ reference: entry.reference, classification: entry.classification, source, reason: entry.reason, ...(entry.role ? { role: entry.role } : {}) })
  }
  for (const association of requirements.candidates) {
    const candidate = candidatesById.get(association.candidateId)
    if (!candidate || association.payloadSha256 !== sha256(JSON.stringify(candidate.payload))) throw new Error(`Structured draft candidate evidence payload binding is stale or foreign: ${association.candidateId}; review pending`)
    for (const reference of association.references) add(reference, `candidate:${association.candidateId}`)
    for (const target of targetRefs.get(candidate.candidateId) ?? []) {
      const linked = association.references.find(reference => reference.reference === target)
      if (!linked || linked.classification !== 'required') throw new Error(`Direct candidate target cannot be omitted or classified as background: ${association.candidateId} ${target}; review pending`)
    }
    for (const relation of association.actionRelations) {
      if (!targetRefs.get(candidate.candidateId)?.has(relation.sourceReference)) throw new Error(`Candidate action relation is not attached to a direct target: ${association.candidateId} ${relation.sourceReference}; review pending`)
      if (!association.references.some(reference => reference.reference === relation.sourceReference && reference.classification === 'required')) throw new Error(`Candidate action relation source is not required: ${association.candidateId} ${relation.sourceReference}; review pending`)
      if (!input.registry.records.some(record => record.key === relation.actionKey) || !requirements.inputActionKeys.includes(relation.actionKey)) throw new Error(`Candidate action relation references an unknown input action: ${relation.actionKey}; review pending`)
    }
  }
  for (const reference of requirements.unassignedReferences) add(reference, 'unassigned')
  const relations = requirements.candidates.flatMap(association => {
    const candidate = candidatesById.get(association.candidateId)
    if (!candidate) return association.actionRelations
    const explicit = new Set(association.actionRelations.map(relation => `${relation.actionKey}\u0000${relation.sourceReference}`))
    const inherited = exactImportedCandidateRecords(input.registry, candidate).flatMap(record => [...(targetRefs.get(candidate.candidateId) ?? [])].map(sourceReference => ({
      actionKey: record.key,
      sourceReference,
      relation: 'same-work' as const,
      reason: 'The frozen imported identity exactly matches the immutable candidate repository, command, and description.',
    }))).filter(relation => !explicit.has(`${relation.actionKey}\u0000${relation.sourceReference}`))
    return [...association.actionRelations, ...inherited]
  })
  for (const relation of relations) {
    const record = input.registry.records.find(candidate => candidate.key === relation.actionKey)
    if (!record) throw new Error(`Candidate action relation references an unknown input action: ${relation.actionKey}; review pending`)
    add({ reference: relation.sourceReference, classification: 'required', role: 'lifecycle', reason: relation.reason }, `canonical:${record.key}`)
    const inherited = [
      { text: record.original.description, role: 'lifecycle' as const, reason: 'Canonical work description inherited by the direct candidate target.' },
      { text: record.goal, role: 'owner' as const, reason: 'Canonical goal or owner obligation inherited by the direct candidate target.' },
      { text: record.doneWhen, role: 'lifecycle' as const, reason: 'Canonical completion condition inherited by the direct candidate target.' },
      ...record.gates.map(text => ({ text, role: 'gate' as const, reason: 'Canonical gate inherited by the direct candidate target.' })),
    ]
    for (const obligation of inherited) for (const reference of actionSourceReferences(obligation.text)) {
      knownRefs.add(reference)
      add({ reference, classification: 'required', role: obligation.role, reason: obligation.reason }, `canonical:${record.key}`)
    }
  }
  const unknown = [...classifications.keys()].filter(reference => !knownRefs.has(reference)).sort()
  if (unknown.length) throw new Error(`Structured draft candidate evidence contains unknown or foreign references: ${unknown.join(', ')}; review pending`)
  const unclassified = [...retainedRefs].filter(reference => !classifications.has(reference)).sort()
  if (unclassified.length) throw new Error(`Structured draft candidate evidence census is incomplete: ${unclassified.join(', ')}; review pending`)
  return {
    hasAssociations: true,
    requiredRefs: new Set([...classifications].filter(([, values]) => values.has('required')).map(([reference]) => reference)),
    contextRefs: new Set([...classifications].filter(([, values]) => !values.has('required') && values.has('context')).map(([reference]) => reference)),
    referenceRequirements,
  }
}

/** Initial generation has no trusted classifier yet, so it may only widen the required set. */
export function prepareConservativeDraftCandidateEvidence(input: CandidateEvidenceScopeInput & { cycle: ActionReviewCycle; draftCandidates: readonly DraftActionCandidate[] }): DraftCandidateEvidenceRequirements {
  const prepared = extractDraftRecommendationContext(stripManagedActions(input.markdown), input.draftContext ?? input.registry.articles.find(article => article.date === input.articleDate)?.draftContext)
  const previous = input.registry.articles.find(article => article.date === input.articleDate)?.draftCandidateEvidence
  const binding = draftCandidateEvidenceBinding(input, prepared)
  if (previous) {
    const parsed = DraftCandidateEvidenceRequirementsSchema.parse(previous)
    const priorComparable = { ...parsed, reviewCycle: binding.reviewCycle, provenance: undefined }
    const nextComparable = { ...parsed, ...binding, provenance: undefined }
    if (JSON.stringify(priorComparable) === JSON.stringify(nextComparable)) {
      if (JSON.stringify(parsed.reviewCycle) === JSON.stringify(binding.reviewCycle)) return parsed
      return DraftCandidateEvidenceRequirementsSchema.parse({
        ...parsed,
        ...binding,
        provenance: {
          kind: 'derived-refresh',
          identity: parsed.provenance.identity,
          decision: 'Cycle-only refresh preserves the prior evidence classification; it grants no new review authority.',
          lineage: { kind: 'cycle-only-refresh', priorReviewCycle: parsed.reviewCycle, priorRequirementsSha256: sha256(JSON.stringify(parsed)) },
        },
      })
    }
    const snapshot = input.registry.articles.find(article => article.date === input.articleDate)
    const draftMarkdown = restoreAcceptedArticleToDraft(input.markdown)
    if (snapshot?.status === 'draft' && draftMarkdown && input.articleStatuses?.get(input.articleDate) === 'accepted') {
      assertActionSnapshotStateIntegrity(input.registry, snapshot)
      const exactSnapshotStateDigest = actionStateDigest(input.registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, {
        articleDate: snapshot.date,
        roundId: snapshot.roundId,
        includePriorArticleRounds: snapshot.review.state === 'pending',
        draftCandidates: snapshot.draftCandidates,
        candidateReviewHistory: snapshot.candidateReviewHistory,
        draftCandidateEvidence: snapshot.draftCandidateEvidence,
        reviewOutput: snapshot.reviewOutput,
      })
      if (snapshot.stateDigest !== exactSnapshotStateDigest || snapshot.articleDigest !== parsed.articleDigest) throw new Error(`Action review state is stale for ${snapshot.date}; refresh before retrying`)
      const priorStatuses = new Map(input.articleStatuses).set(input.articleDate, 'draft')
      const priorBinding = draftCandidateEvidenceBinding({
        ...input,
        articleStatuses: priorStatuses,
        cycle: parsed.reviewCycle,
        markdown: draftMarkdown,
        draftCandidateEvidence: parsed,
      })
      const capturedComparable = { ...parsed, provenance: undefined }
      const restoredComparable = { ...parsed, ...priorBinding, provenance: undefined }
      if (JSON.stringify(capturedComparable) === JSON.stringify(restoredComparable)) {
        return DraftCandidateEvidenceRequirementsSchema.parse({
          ...parsed,
          ...binding,
          provenance: {
            kind: 'derived-refresh',
            identity: parsed.provenance.identity,
            decision: 'Acceptance-status refresh preserves the prior evidence classification after proving the exact Draft input view; it grants no new review authority.',
            lineage: {
              kind: 'acceptance-status-refresh',
              priorArticleStatus: 'draft',
              articleStatus: 'accepted',
              priorReviewCycle: parsed.reviewCycle,
              priorRequirementsSha256: sha256(JSON.stringify(parsed)),
            },
          },
        })
      }
    }
    throw new Error('Structured draft candidate evidence changed beyond its review cycle; fresh classification required; review pending')
  }
  const retainedRefs = prepared.context.kind === 'retained' ? actionSourceReferences(prepared.context.markdown) : new Set<string>()
  const assigned = new Set<string>()
  const candidates = input.draftCandidates.map(candidate => {
    const targetReferences = [...candidateTargetReferences(candidate, retainedRefs)].sort()
    const references = targetReferences.map(reference => {
      assigned.add(reference)
      return { classification: 'required' as const, reference, role: 'target' as const, reason: 'Direct immutable candidate target requires current primary evidence.' }
    })
    return { candidateId: candidate.candidateId, payloadSha256: sha256(JSON.stringify(candidate.payload)), references, actionRelations: [] }
  })
  return DraftCandidateEvidenceRequirementsSchema.parse({
    version: 'draft-candidate-evidence-v2',
    provenance: {
      kind: 'deterministic-default',
      identity: ACTION_EVIDENCE_SELECTION_VERSION,
      decision: 'Initial-generation fallback requires every retained reference until trusted review classifies relevance; it cannot suppress dependencies or grant review authority.',
    },
    ...binding,
    candidates,
    unassignedReferences: [...retainedRefs].filter(reference => !assigned.has(reference)).sort().map(reference => ({
      classification: 'required' as const,
      reference,
      role: 'retained-context' as const,
      reason: 'Conservative deterministic default retains this reference as required until trusted classification.',
    })),
  })
}

export function actionEvidenceScope(input: { registry: ActionRegistry; articleDate: string; markdown: string; feedback: string; cycle?: ActionReviewCycle; articleStatuses?: ReadonlyMap<string, string>; draftContext?: DraftRecommendationContext; draftCandidateEvidence?: DraftCandidateEvidenceRequirements; draftCandidates?: readonly DraftActionCandidate[]; reassessActionKeys?: readonly string[]; preserveActionKeys?: readonly string[] }) {
  const snapshot = input.registry.articles.find(article => article.date === input.articleDate)
  const current = snapshot?.actionKeys
    ?? input.registry.records.filter(record => record.introducedBy === input.articleDate).map(record => record.key)
  const prepared = extractDraftRecommendationContext(stripManagedActions(input.markdown), input.draftContext ?? snapshot?.draftContext)
  const candidateEvidence = draftCandidateEvidenceScope(input, prepared)
  const nextSection = prepared.context.kind === 'retained' ? prepared.context.markdown : ''
  const maintenance = recommendationMaintenanceProjection(snapshot)
  const closing = maintenance ? JSON.stringify(maintenance) : snapshot?.closing?.kind === 'options' ? JSON.stringify(snapshot.closing.options) : ''
  const requested = [input.feedback, nextSection, closing].join('\n')
  const statuses = input.articleStatuses ?? new Map(input.registry.articles.map(article => [article.date, article.status]))
  const terminal = (record: ActionRegistry['records'][number]) => ['done', 'dismissed', 'superseded'].includes(acceptedActionState(record, statuses, input.registry))
  const reassessActionKeys = [...new Set(input.reassessActionKeys ?? [])].sort()
  const preserveActionKeys = [...new Set(input.preserveActionKeys ?? [])].sort()
  if (reassessActionKeys.some(key => preserveActionKeys.includes(key))) throw new Error('A terminal action cannot be both preserved and reassessed')
  for (const key of [...reassessActionKeys, ...preserveActionKeys]) {
    const record = input.registry.records.find(candidate => candidate.key === key)
    if (!record || !terminal(record)) throw new Error(`Terminal intent requires an existing accepted terminal action identity: ${key}`)
  }
  const requestedRecords = input.registry.records.filter(record => requested.includes(record.key) || requested.includes(record.workKey))
  const explicitTerminalRecords = input.registry.records.filter(record => input.feedback.includes(record.key) || input.feedback.includes(record.workKey))
  const ambiguousTerminalActionKeys = explicitTerminalRecords
    .filter(record => terminal(record) && !reassessActionKeys.includes(record.key) && !preserveActionKeys.includes(record.key))
    .map(record => record.key)
    .sort()
  const preservedTerminalActionKeys = preserveActionKeys
  const reviewActionKeys = input.registry.records
    .filter(record => (current.includes(record.key) || requestedRecords.includes(record) || reassessActionKeys.includes(record.key))
      && (!terminal(record) || reassessActionKeys.includes(record.key)))
    .map(record => record.key)
    .sort()
  const carried = input.registry.records.filter(record => reviewActionKeys.includes(record.key))
  const text = [input.feedback, closing, ...(candidateEvidence.hasAssociations ? [] : [nextSection]), ...carried.map(record => JSON.stringify({ key: record.key, workKey: record.workKey,
    originalDescription: record.original.description, description: record.history.at(-1)?.description ?? record.original.description, goal: record.goal, doneWhen: record.doneWhen, gates: record.gates }))].join('\n')
  const refs = new Set([...actionSourceReferences(text), ...candidateEvidence.requiredRefs])
  const contextRefs = new Set(candidateEvidence.contextRefs)
  // Citation identities are also dependencies when the prose uses a short #N.
  for (const record of carried) for (const decision of record.history) for (const citation of decision.citations) {
    const ref = sourceKey(citation.sourceId).match(/^github:([\w-]+#\d+)$/)?.[1]
    if (ref) refs.add(ref)
  }
  for (const ref of refs) contextRefs.delete(ref)
  const expanded = input.registry.records.filter(record => current.includes(record.key)
    || text.includes(record.key)
    || [...actionSourceReferences(JSON.stringify(record))].some(ref => refs.has(ref))).map(record => record.key)
  const referenceRequirements = [...candidateEvidence.referenceRequirements]
  for (const reference of refs) if (!referenceRequirements.some(requirement => requirement.reference === reference && requirement.classification === 'required')) {
    referenceRequirements.push({ reference, classification: 'required', source: 'action-or-feedback', reason: 'Explicit feedback, maintained recommendation, or canonical action obligation requires current evidence.' })
  }
  return { current, refs, contextRefs, referenceRequirements, expanded, text, reviewActionKeys, preservedTerminalActionKeys, ambiguousTerminalActionKeys }
}

/** Select complete sources, never first/last-N comments or inferred summaries. */
export function selectActionEvidence(input: { registry: ActionRegistry; articleDate: string; cycle?: ActionReviewCycle; markdown: string; feedback: string; sources: readonly ActionSource[]; articleStatuses?: ReadonlyMap<string, string>; draftContext?: DraftRecommendationContext; draftCandidateEvidence?: DraftCandidateEvidenceRequirements; draftCandidates?: readonly DraftActionCandidate[]; reassessActionKeys?: readonly string[]; preserveActionKeys?: readonly string[]; selectedEvidenceProjectionIds?: readonly string[] }) {
  const cycle: ActionReviewCycle = input.cycle ?? { phase: 'generation' }
  const scope = actionEvidenceScope(input)
  const sources = canonicalActionSources(input.sources)
  const completeSources = sources.filter(source => !source.projection)
  const projections = sources.filter(source => source.projection)
  const snapshot = input.registry.articles.find(article => article.date === input.articleDate)
  const caseActionKeys = scope.reviewActionKeys.length
    ? scope.reviewActionKeys
    : scope.ambiguousTerminalActionKeys.length ? scope.ambiguousTerminalActionKeys : ['article-feedback']
  const caseDigest = actionEvidenceCaseDigest({ ...input, cycle, actionKeys: caseActionKeys })
  const responseRequestIds = new Set(completeSources.flatMap(source => {
    if (!source.response) return []
    const request = snapshot?.evidenceRequests?.find(candidate => candidate.id === source.response?.requestId)
    if (!request || request.status !== 'open' || request.caseDigest !== caseDigest || request.caseDigest !== source.response.caseDigest
      || source.response.actionKeys.some(key => !request.actionKeys.includes(key))) {
      throw new Error(`Action evidence response is stale, unsolicited, or outside its request scope: ${source.id}`)
    }
    return [request.id]
  }))
  const requiredRefs = new Set([...scope.refs, ...continuityRequiredReferences(sources)])
  if (requiredRefs.size > 12) throw new Error(`Required action evidence exceeds the unchanged 12-discussion cap: ${[...requiredRefs].sort().join(', ')}; review pending`)
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
  const obligation = (actionKey: string | undefined, kind: 'goal' | 'current-disposition' | 'done-when' | 'gate' | 'feedback' | 'candidate-evidence', text: string) => sha256(JSON.stringify({ actionKey, kind, text }))
  const actionObligations = input.registry.records.filter(record => scope.reviewActionKeys.includes(record.key)).flatMap(record => [
    ...(record.goal ? [obligation(record.key, 'goal', record.goal)] : []),
    obligation(record.key, 'current-disposition', record.history.at(-1)?.description ?? record.original.description),
    ...(record.doneWhen ? [obligation(record.key, 'done-when', record.doneWhen)] : []),
    ...record.gates.map(gate => obligation(record.key, 'gate', gate)),
  ])
  const feedbackObligations = input.feedback.trim() ? [obligation(undefined, 'feedback', input.feedback.trim().slice(0, 512))] : []
  const obligationsFor = (key: string) => {
    const reference = key.replace(/^github:/, '')
    const requirements = scope.referenceRequirements.filter(requirement => requirement.classification === 'required' && requirement.reference === reference)
    const candidateObligations = requirements.map(requirement => obligation(requirement.source, 'candidate-evidence', `${requirement.reference}:${requirement.role ?? 'unspecified'}:${requirement.reason}`))
    const canonicalKeys = new Set(requirements.flatMap(requirement => requirement.source.startsWith('canonical:') ? [requirement.source.slice('canonical:'.length)] : []))
    const scopedActionObligations = !key.startsWith('github:') ? actionObligations : input.registry.records.filter(record => scope.reviewActionKeys.includes(record.key)
      || canonicalKeys.has(record.key)).flatMap(record => {
      const currentDescription = record.history.at(-1)?.description ?? record.original.description
      if (canonicalKeys.has(record.key)) return [
        ...(record.goal ? [obligation(record.key, 'goal', record.goal)] : []),
        obligation(record.key, 'current-disposition', currentDescription),
        ...(record.doneWhen ? [obligation(record.key, 'done-when', record.doneWhen)] : []),
        ...record.gates.map(gate => obligation(record.key, 'gate', gate)),
      ]
      return [
        ...(record.goal && actionSourceReferences(record.goal).has(reference) ? [obligation(record.key, 'goal', record.goal)] : []),
        ...(actionSourceReferences(currentDescription).has(reference) ? [obligation(record.key, 'current-disposition', currentDescription)] : []),
        ...(record.doneWhen && actionSourceReferences(record.doneWhen).has(reference) ? [obligation(record.key, 'done-when', record.doneWhen)] : []),
        ...record.gates.filter(gate => actionSourceReferences(gate).has(reference)).map(gate => obligation(record.key, 'gate', gate)),
      ]
    })
    const scopedFeedbackObligations = input.feedback.trim() && (!key.startsWith('github:') || !actionSourceReferences(input.feedback).size || actionSourceReferences(input.feedback).has(reference)) ? feedbackObligations : []
    const values = [...scopedActionObligations, ...scopedFeedbackObligations, ...candidateObligations]
    return values.length ? [...new Set(values)] : [obligation(undefined, 'feedback', `Resolve ${key} without inventing a disposition.`)]
  }
  const requestFor = (kind: 'source-view' | 'missing-source', key: string, source?: ActionSource) => {
    const requirements = scope.referenceRequirements.filter(requirement => requirement.classification === 'required' && requirement.reference === key.replace(/^github:/, ''))
    const detail = requirements.map(requirement => `${requirement.source} ${requirement.role ?? 'evidence'}: ${requirement.reason}`).join(' | ')
    return createActionEvidenceRequest({
    kind,
    caseDigest,
    articleDate: input.articleDate,
    cycle,
    actionKeys: caseActionKeys,
    sourceKey: key,
    ...(source ? { source } : {}),
    question: `Which exact ranges in ${key} support or contradict its required decision${detail ? ` (${detail})` : ''} while retaining applicable owner gates?`.slice(0, 512),
    obligations: obligationsFor(key),
  })
  }
  if (scope.ambiguousTerminalActionKeys.length) {
    const request = createActionEvidenceRequest({
      kind: 'clarification',
      caseDigest,
      articleDate: input.articleDate,
      cycle,
      actionKeys: scope.ambiguousTerminalActionKeys,
      sourceKey: `terminal-intent:${scope.ambiguousTerminalActionKeys.join(',')}`,
      question: 'Specify preserve or reassess for each referenced accepted terminal action; no terminal state was changed.',
      obligations: [...new Set([...actionObligations, ...feedbackObligations])].length
        ? [...new Set([...actionObligations, ...feedbackObligations])]
        : [obligation(undefined, 'feedback', 'Clarify explicit terminal intent without inventing a disposition.')],
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
        const explicitlySelected = candidates.filter(candidate => input.selectedEvidenceProjectionIds?.includes(candidate.id))
        if (explicitlySelected.length > 1) {
          throw new Error(`Multiple bounded evidence replies were explicitly selected for ${source.id}; select exactly one reply; review pending`)
        }
        if (explicitlySelected[0]?.projection?.coverage.some(item => item.status === 'unknown')) {
          const unknown = explicitlySelected[0].projection.coverage.filter(item => item.status === 'unknown').map(item => item.obligationId)
          throw new ActionEvidenceRequestError(request, `Explicitly selected bounded evidence reply leaves ${unknown.length} obligation(s) unknown: ${unknown.join(', ')}; review pending`)
        }
        const completeCandidates = candidates.filter(candidate => !candidate.projection?.coverage.some(item => item.status === 'unknown'))
        if (completeCandidates.length > 1 && explicitlySelected.length !== 1) {
          throw new Error(`Multiple complete bounded evidence replies for ${source.id}; select exactly one reply explicitly; review pending`)
        }
        const projection = explicitlySelected[0] ?? completeCandidates[0]
        if (projection) {
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
  const buildReceipt = () => ({ version: ACTION_EVIDENCE_SELECTION_VERSION, unit: 'UTF-8 bytes' as const,
    collection: 'Bounded collector output, not an exhaustive repository/discussion census. Missing or omitted content is unknown, never evidence of absence or approval.',
    selection: 'Whole sources only; no chronological comment window or excerpt. Only current carried actions, explicit feedback and retained draft continuation context require GitHub discussions. Shipment prose does not.',
    authority: 'This coverage index is context only. Hashes, identities, omission reasons and missing evidence cannot justify completion, supersession, dismissal or human approval.',
    requiredReferences: [...requiredRefs].sort(), contextReferences: [...scope.contextRefs].sort(), referenceRequirements: scope.referenceRequirements,
    reviewActionKeys: scope.reviewActionKeys, preservedTerminalActionKeys: scope.preservedTerminalActionKeys,
    expandedActionKeys: scope.expanded.sort(), resolvedRequests: resolvedRequests.sort(), sources: coverage })
  let receipt = buildReceipt()
  let content = JSON.stringify(receipt)
  if (Buffer.byteLength(content) > SOURCE_LIMIT) throw new Error('Action evidence coverage exceeds its per-source budget; review pending')
  while (bytes + Buffer.byteLength(content) > TOTAL_LIMIT) {
    let removableIndex = -1
    for (let index = selected.length - 1; index >= 0; index--) {
      const entry = coverage.find(item => item.id === selected[index]?.id)
      if (entry && !entry.required && !selected[index]?.projection) {
        removableIndex = index
        break
      }
    }
    if (removableIndex === -1) {
      const source = [...selected].reverse().find(candidate => !candidate.projection && Buffer.byteLength(candidate.content) > 0)
      if (!source) throw new Error('Required action evidence and its complete coverage receipt exceed the total source budget; review pending')
      const request = requestFor('source-view', sourceKey(source.id), source)
      throw new ActionEvidenceRequestError(request, `Required action evidence ${source.id}: complete coverage receipt does not fit total budget; bounded source view requested; review pending`)
    }
    const [omitted] = selected.splice(removableIndex, 1)
    const entry = omitted && coverage.find(item => item.id === omitted.id)
    if (!omitted || !entry) throw new Error('Missing optional action coverage entry')
    bytes -= entry.bytes
    entry.included = false
    entry.reason = 'complete optional whole source omitted so selected sources and complete coverage receipt fit total budget'
    receipt = buildReceipt()
    content = JSON.stringify(receipt)
    if (Buffer.byteLength(content) > SOURCE_LIMIT) throw new Error('Action evidence coverage exceeds its per-source budget; review pending')
  }
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

export function deriveActionReviewOutput(input: {
  before: ActionRegistry
  after: ActionRegistry
  articleStatuses: ReadonlyMap<string, string>
  articleDate: string
  reviewCycle: ActionReviewCycle
  roundId: string
  proposalSha256: string
  consumedInputSha256: string
}): ActionReviewOutput {
  const beforeIndex = canonicalInputIndex(input.before, input.articleStatuses)
  const afterIndex = canonicalInputIndex(input.after, input.articleStatuses)
  const beforeRecords = new Map(input.before.records.map(record => [record.key, record]))
  const afterRecords = new Map(input.after.records.map(record => [record.key, record]))
  const createdRecords = [...afterRecords].filter(([key]) => !beforeRecords.has(key)).map(([actionKey, record]) => {
    const afterInputSha256 = afterIndex.actions.get(actionKey)
    if (!afterInputSha256) throw new Error(`Native review output cannot bind created action input: ${actionKey}`)
    return { actionKey, afterRecordSha256: sha256(JSON.stringify(record)), afterInputSha256 }
  }).sort((left, right) => left.actionKey.localeCompare(right.actionKey))
  const updatedRecords = [...beforeRecords].flatMap(([actionKey, before]) => {
    const after = afterRecords.get(actionKey)
    if (!after || JSON.stringify(before) === JSON.stringify(after)) return []
    const beforeInputSha256 = beforeIndex.actions.get(actionKey), afterInputSha256 = afterIndex.actions.get(actionKey)
    if (!beforeInputSha256 || !afterInputSha256) throw new Error(`Native review output cannot bind canonical action input: ${actionKey}`)
    return [{ actionKey, beforeRecordSha256: sha256(JSON.stringify(before)), afterRecordSha256: sha256(JSON.stringify(after)), beforeInputSha256, afterInputSha256 }]
  }).sort((left, right) => left.actionKey.localeCompare(right.actionKey))
  return ActionReviewOutputSchema.parse({
    version: 'action-review-output-v1',
    articleDate: input.articleDate,
    reviewCycle: input.reviewCycle,
    roundId: input.roundId,
    proposalSha256: input.proposalSha256,
    consumedInputSha256: input.consumedInputSha256,
    createdRecords,
    updatedRecords,
    rejectionMemory: { beforeSha256: beforeIndex.rejectionMemorySha256, afterSha256: afterIndex.rejectionMemorySha256 },
  })
}

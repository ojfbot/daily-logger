import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'
import { detachArticleTime } from './article-time-frontmatter.js'
import { isReviewedAction, legacyActionKey, type CanonicalAction } from './action-model.js'
import { renderArticle } from './render-article.js'
import { CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS, RANKED_ACTION_REVIEW_PROMPT_VERSIONS, type ActionReviewCycle } from './action-review-cycle.js'
import { extractDraftRecommendationContext } from './recommendation-prose.js'

export const REGISTRY_PATH = 'actions/registry.json'
export const ACTIONS_START = '<!-- ACTIONS_START -->'
export const ACTIONS_END = '<!-- ACTIONS_END -->'
export * from './action-registry-schema.js'
import { ActionRegistrySchema, ArticleActionFileSchema, splitActionRegistry, hydrateActionRegistry, articleActionFileBytes, actionArticlePath, isArticleOnlyEvidenceRefresh, type ActionRegistry, type ClosingPrompt, type RankedClosingOption, type ArticleOnlyAcceptance, type ProposedAction, type ActionSource, type DraftCandidateEvidenceRequirements, assertExactInvocationAdmissions } from './action-registry-schema.js'

export function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }
export function registryBytes(registry: ActionRegistry): string { assertExactInvocationAdmissions(registry); return JSON.stringify(ActionRegistrySchema.parse(registry), null, 2) + '\n' }
export function registryRevision(registry: ActionRegistry): string { return sha256(registryBytes(registry)) }
export function actionStateDigest(registry: ActionRegistry, keys: readonly string[], closing?: ClosingPrompt, draftContext?: ActionRegistry['articles'][number]['draftContext'], boundary?: { articleDate: string; roundId: string; includePriorArticleRounds?: boolean; draftCandidates?: ActionRegistry['articles'][number]['draftCandidates']; candidateReviewHistory?: ActionRegistry['articles'][number]['candidateReviewHistory']; draftCandidateEvidence?: ActionRegistry['articles'][number]['draftCandidateEvidence']; reviewOutput?: ActionRegistry['articles'][number]['reviewOutput']; articleAcceptance?: ArticleOnlyAcceptance }): string {
  const verification = boundary ? registry.articles.find(article => article.date === boundary.articleDate && article.roundId === boundary.roundId)?.verification : undefined
  const viewBinding = verification?.evidenceView === undefined ? {} : { evidenceView: verification.evidenceView, evidenceViewOutputSha256: verification.evidenceViewOutputSha256 }
  const records = registry.records.filter(record => keys.includes(record.key)).map(record => {
    if (!boundary) return { key: record.key, state: record.state, history: record.history, admission: record.admission }
    const history = record.history.filter(decision => decision.articleDate < boundary.articleDate
      || (decision.articleDate === boundary.articleDate && (boundary.includePriorArticleRounds || decision.roundId === boundary.roundId)))
    const state = history.at(-1)?.state ?? (record.origin === 'imported' ? record.original.status : 'proposed')
    return { key: record.key, state, history, admission: record.admission }
  })
  if (boundary?.draftCandidateEvidence !== undefined || boundary?.reviewOutput !== undefined || boundary?.candidateReviewHistory !== undefined || boundary?.articleAcceptance !== undefined) return sha256(JSON.stringify({ ...viewBinding, records, closing: closing ?? null, draftContext: draftContext ?? null, draftCandidates: boundary?.draftCandidates ?? null, draftCandidateEvidence: boundary?.draftCandidateEvidence ?? null, reviewOutput: boundary?.reviewOutput ?? null, ...(boundary?.candidateReviewHistory === undefined ? {} : { candidateReviewHistory: boundary.candidateReviewHistory }), ...(boundary?.articleAcceptance === undefined ? {} : { articleAcceptance: boundary.articleAcceptance }) }))
  if (boundary?.draftCandidates !== undefined) return sha256(JSON.stringify({ ...viewBinding, records, closing: closing ?? null, draftContext: draftContext ?? null, draftCandidates: boundary.draftCandidates }))
  if (draftContext !== undefined) return sha256(JSON.stringify({ ...viewBinding, records, closing: closing ?? null, draftContext }))
  return sha256(JSON.stringify(closing === undefined ? records : { records, closing }))
}

export function assertActionSnapshotStateIntegrity(registry: ActionRegistry, snapshot: ActionRegistry['articles'][number]): void {
  if (!new Set<string>(CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS).has(snapshot.verification.promptVersion)) return
  const expected = actionStateDigest(registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, {
    articleDate: snapshot.date,
    roundId: snapshot.roundId,
    includePriorArticleRounds: snapshot.review.state === 'pending',
    draftCandidates: snapshot.draftCandidates,
    candidateReviewHistory: snapshot.candidateReviewHistory,
    draftCandidateEvidence: snapshot.draftCandidateEvidence,
    reviewOutput: snapshot.reviewOutput,
    articleAcceptance: snapshot.review.state === 'pending' ? snapshot.review.articleAcceptance : undefined,
  })
  const legacyPending = snapshot.review.state === 'pending' && snapshot.closing === undefined
    ? actionStateDigest(registry, snapshot.actionKeys, undefined, snapshot.draftContext, { articleDate: snapshot.date, roundId: snapshot.roundId })
    : undefined
  if (snapshot.stateDigest !== expected && snapshot.stateDigest !== legacyPending) throw new Error(`Action review state is stale for ${snapshot.date}; refresh before retrying`)
}
export function actionKey(action: CanonicalAction): string { return action.id ?? `legacy-${sha256(legacyActionKey(action))}` }
export function normalizeWorkKey(repo: string, target: string, outcome: string): string { return [repo, target, outcome].map(value => value.toLowerCase().replace(/\s+/g, ' ').trim()).join('|') }

export function readActionRegistry(repoRoot: string): ActionRegistry {
  const path = join(repoRoot, REGISTRY_PATH)
  if (!existsSync(path)) throw new Error('Action registry is missing. Run the explicit migration; markdown is never an admission fallback.')
  const directory = join(repoRoot, 'actions/articles')
  const files = existsSync(directory) ? readdirSync(directory).filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file)).map(file => { const bytes = readFileSync(join(directory, file), 'utf8'); if (Buffer.byteLength(bytes) > 64 * 1024) throw new Error(`Oversized article action file: ${file}`); const parsed = ArticleActionFileSchema.parse(JSON.parse(bytes)); if (file !== `${parsed.date}.json`) throw new Error('Article action filename and date disagree'); return parsed }) : []
  return hydrateActionRegistry(ActionRegistrySchema.parse(JSON.parse(readFileSync(path, 'utf8'))), files)
}

export function writeActionRegistry(repoRoot: string, registry: ActionRegistry, expectedRevision: string, article?: { path: string; expected: string | null; next: string; publish: () => void }): void {
  const path = join(repoRoot, REGISTRY_PATH)
  const lock = `${path}.lock`
  const descriptor = openSync(lock, 'wx')
  const temporary: string[] = []
  const oldFiles = new Map<string, string | null>()
  let published = false
  try {
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }) + '\n')
    const before = readActionRegistry(repoRoot)
    if (registryRevision(before) !== expectedRevision) throw new Error('Action registry changed during review; refresh before retrying')
    for (const prior of before.records.filter(record => record.origin === 'suggested')) {
      const next = registry.records.find(record => record.key === prior.key)
      if (!next || JSON.stringify(next.original) !== JSON.stringify(prior.original) || next.workKey !== prior.workKey || next.introducedBy !== prior.introducedBy || JSON.stringify(next.admission) !== JSON.stringify(prior.admission)) throw new Error('Existing suggested identity, original payload and birth cycle cannot change during review')
    }
    if (article && (existsSync(article.path) ? readFileSync(article.path, 'utf8') : null) !== article.expected) throw new Error('Article changed during action review; refresh before retrying')
    const split = splitActionRegistry(registry)
    if (registryBytes(split.baseline) !== registryBytes(splitActionRegistry(before).baseline)) throw new Error('The imported action baseline cannot change during an article review')
    if (before.articles.some(snapshot => !registry.articles.some(next => next.date === snapshot.date))) throw new Error('An article review cannot delete another article snapshot')
    for (const prior of before.articles) {
      const next = registry.articles.find(snapshot => snapshot.date === prior.date)!
      assertActionSnapshotStateIntegrity(before, prior)
      assertActionSnapshotStateIntegrity(registry, next)
      const priorHistory = prior.candidateReviewHistory ?? []
      const nextHistory = next.candidateReviewHistory ?? []
      if (nextHistory.length < priorHistory.length
        || JSON.stringify(nextHistory.slice(0, priorHistory.length)) !== JSON.stringify(priorHistory)) {
        throw new Error(`Historical candidate review archive is append-only: ${prior.date}`)
      }
      const priorCustody = prior.draftCandidates?.map(candidate => ({ candidateId: candidate.candidateId, payload: candidate.payload }))
      const nextCustody = next.draftCandidates?.map(candidate => ({ candidateId: candidate.candidateId, payload: candidate.payload }))
      if (JSON.stringify(priorCustody) !== JSON.stringify(nextCustody)) throw new Error(`Captured draft candidate custody cannot change after its first durable write: ${prior.date}`)
    }
    mkdirSync(join(repoRoot, 'actions/articles'), { recursive: true })
    for (const file of split.files) {
      const target = join(repoRoot, actionArticlePath(file.date)), bytes = articleActionFileBytes(file)
      const old = existsSync(target) ? readFileSync(target, 'utf8') : null
      if (old === bytes) continue
      if (article && !article.path.endsWith(`/${file.date}.md`)) throw new Error('An article review cannot write another date')
      const temp = `${target}.${randomUUID()}.tmp`
      writeFileSync(temp, bytes, { flag: 'wx' }); temporary.push(temp); oldFiles.set(target, old)
    }
    if (article) { published = true; article.publish(); if (readFileSync(article.path, 'utf8') !== article.next) throw new Error('Article publication did not match its verified content') }
    for (const [index, target] of [...oldFiles.keys()].entries()) renameSync(temporary[index], target)
  } catch (error) {
    for (const [target, old] of oldFiles) { if (old === null) { if (existsSync(target)) unlinkSync(target) } else writeFileSync(target, old) }
    if (article && published) {
      if (article.expected === null) { if (existsSync(article.path)) unlinkSync(article.path) }
      else writeFileSync(article.path, article.expected)
    }
    throw error
  } finally {
    for (const temp of temporary) if (existsSync(temp)) unlinkSync(temp)
    closeSync(descriptor)
    unlinkSync(lock)
  }
}

export function readArticleStatuses(repoRoot: string): Map<string, string> {
  return new Map(readdirSync(join(repoRoot, '_articles')).filter(file => file.endsWith('.md')).map(file => [file.slice(0, -3), readFileSync(join(repoRoot, '_articles', file), 'utf8').match(/^status:\s*"?(\w+)/m)?.[1] ?? 'draft']))
}

export function acceptedActionState(record: ActionRegistry['records'][number], statuses: ReadonlyMap<string, string>, registry: ActionRegistry) {
  return record.history.filter(item => statuses.get(item.articleDate) === 'accepted' && registry.articles.some(article => article.date === item.articleDate && article.status === 'accepted' && article.review.state === 'verified' && article.roundId === item.roundId)).at(-1)?.state ?? (record.origin === 'imported' ? record.original.status : 'proposed')
}

export function stripManagedActions(markdown: string): string {
  const start = markdown.indexOf(ACTIONS_START)
  const end = markdown.indexOf(ACTIONS_END)
  if (start === -1 && end === -1) return markdown
  if (start === -1 || end < start || markdown.indexOf(ACTIONS_START, start + 1) !== -1) throw new Error('Invalid managed action block')
  return markdown.slice(0, start) + markdown.slice(end + ACTIONS_END.length)
}
export function articleActionDigest(markdown: string): string {
  const prose = detachArticleTime(stripManagedActions(markdown)).markdown
  return sha256(prose.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, header => header.replace(/^(?:status|outcome|provenance):.*\n?/gm, '')).trim())
}

export function setActionInclusion(registry: ActionRegistry, key: string, include: boolean, actor: string, instruction: string, articleStatuses: ReadonlyMap<string, string>): ActionRegistry {
  const next = structuredClone(registry)
  const record = next.records.find(item => item.key === key)
  if (!record || record.origin !== 'suggested') throw new Error('Only a new suggestion has an admission checkbox; existing work requires a disposition')
  if (registry.articles.some(article => articleStatuses.get(article.date) === 'accepted' && article.actionKeys.includes(key))) throw new Error('An accepted suggestion requires a disposition; its admission checkbox cannot close existing work')
  if (!actor.trim() || !instruction.trim()) throw new Error('Inclusion changes require an identified operator instruction')
  record.includeInIndex = include
  record.inclusionOverride = { include, actor, instruction }
  return ActionRegistrySchema.parse(next)
}

export function projectRegistry(registry: ActionRegistry, articleStatuses: ReadonlyMap<string, string>) {
  const open: CanonicalAction[] = [], done: CanonicalAction[] = []
  const proposed: ProposedAction[] = []
  const dispositions: Array<{ id: string; description: string; repo: string; sourceDate: string; state: string; reason: string }> = []
  for (const record of registry.records) {
    const original = record.original
    const decision = record.history.filter(item => articleStatuses.get(item.articleDate) === 'accepted' && registry.articles.some(article => article.date === item.articleDate && article.status === 'accepted' && article.review.state === 'verified' && article.roundId === item.roundId)).at(-1)
    const state = decision?.state ?? (record.origin === 'imported' ? original.status : 'proposed')
    if (record.origin === 'suggested' && !record.includeInIndex && decision) continue
    if (state === 'done') {
      if (isReviewedAction(original)) throw new Error('Reviewed actions require an exact-ID settlement receipt')
      done.push(original.status === 'done' ? original : { ...original, status: 'done', closedDate: decision?.articleDate ?? record.introducedBy, resolution: decision?.reason ?? '' })
      continue
    }
    if (state === 'dismissed' || state === 'superseded' || state === 'deferred') {
      dispositions.push({ id: record.key, description: original.description, repo: original.repo, sourceDate: original.sourceDate, state, reason: decision?.reason ?? '' })
      continue
    }
    const description = [decision?.description ?? original.description, record.doneWhen ? `Done when: ${record.doneWhen}` : '', record.gates.length ? `Conditions: ${record.gates.join(' ')}` : ''].filter(Boolean).join(' ')
    const active = description !== original.description ? { ...original, currentDescription: description } : original
    if (record.origin === 'imported') { open.push(active); continue }
    const accepted = registry.articles.some(article => article.status === 'accepted' && article.review.state === 'verified' && articleStatuses.get(article.date) === 'accepted' && article.actionKeys.includes(record.key) && record.history.some(decision => decision.roundId === article.roundId && decision.articleDate === article.date))
    const status = articleStatuses.get(record.introducedBy)
    if (accepted && record.includeInIndex) open.push(active)
    else if (status === 'draft') {
      const own = registry.articles.find(article => article.date === record.introducedBy)
      const ownState = record.history.filter(item => item.articleDate === own?.date && item.roundId === own.roundId).at(-1)?.state
      if (ownState === 'open' || ownState === 'proposed') proposed.push({ id: record.key, command: original.command, description: original.description, repo: original.repo, sourceDate: original.sourceDate, status: 'proposed', includeInIndex: record.includeInIndex })
    }
  }
  for (const article of registry.articles) {
    if (article.status !== 'accepted' || articleStatuses.get(article.date) !== 'accepted' || article.review.state !== 'pending' || !article.review.articleAcceptance) continue
    for (const candidate of article.draftCandidates ?? []) {
      if (candidate.review.state !== 'awaiting-review') continue
      proposed.push({ id: candidate.candidateId, command: candidate.payload.command, description: candidate.payload.description, repo: candidate.payload.repo, sourceDate: article.date, status: 'needs-review', includeInIndex: false, dispatchable: false, reason: articleOnlyReviewReason(article.review.articleAcceptance.failureKind) })
    }
  }
  return { open, done, proposed, dispositions }
}

function articleOnlyReviewReason(kind: ArticleOnlyAcceptance['failureKind']): string {
  return kind === 'invalid-output' ? 'The agent returned an incomplete response; these suggestions still need review.' : 'The available evidence did not confirm these suggestions.'
}

export function assertFirstArticleAcceptance(registry: ActionRegistry, articleDate: string): void {
  const prior = registry.articles.find(article => article.date === articleDate)
  if (!prior || prior.status !== 'draft' || prior.review.state !== 'pending' || prior.reviewOutput || prior.candidateReviewHistory?.length || !prior.draftCandidates?.length || !prior.draftCandidateEvidence || prior.draftCandidates.some(candidate => candidate.review.state !== 'awaiting-review') || registry.records.some(record => record.origin === 'suggested' && record.introducedBy === articleDate)) throw new Error('Article-only acceptance requires an original Draft with unresolved candidates and no prior healthy action output')
  assertActionSnapshotStateIntegrity(registry, prior)
}

export function completeArticleWithPendingActions(input: { registry: ActionRegistry; articleDate: string; markdown: string; articleStatuses: ReadonlyMap<string, string>; cycle: ActionReviewCycle; failureKind: ArticleOnlyAcceptance['failureKind']; sources: readonly ActionSource[]; draftCandidateEvidence: DraftCandidateEvidenceRequirements }) {
  assertFirstArticleAcceptance(input.registry, input.articleDate)
  if (!/^status:\s*"?accepted"?\s*$/m.test(input.markdown)) throw new Error('Article-only completion requires the explicit Accepted article intent')
  const registry = structuredClone(input.registry)
  const prior = registry.articles.find(article => article.date === input.articleDate)
  const file = splitActionRegistry(input.registry).files.find(file => file.date === input.articleDate)
  if (!prior || !file) throw new Error('Original article action custody is missing')
  if (!isArticleOnlyEvidenceRefresh(prior.draftCandidateEvidence, input.draftCandidateEvidence) || JSON.stringify(input.draftCandidateEvidence.reviewCycle) !== JSON.stringify(input.cycle)) throw new Error('Article-only acceptance requires the exact native Accepted-status evidence refresh')
  const articleAcceptance: ArticleOnlyAcceptance = { kind: 'article-only', inputRoundId: prior.roundId, inputRegistrySha256: sha256(articleActionFileBytes(file)), failureKind: input.failureKind,
    sources: input.sources.map(source => ({ id: source.id, locator: source.locator, sha256: sha256(source.content) })), rawContentRetained: false }
  const reason = articleOnlyReviewReason(input.failureKind)
  const roundId = sha256(JSON.stringify({ articleAcceptance, articleDate: input.articleDate, cycle: input.cycle }))
  const snapshot = { ...prior, status: 'accepted' as const, review: { state: 'pending' as const, reason, articleAcceptance }, reviewCycle: input.cycle, roundId, articleDigest: articleActionDigest(input.markdown), draftCandidateEvidence: input.draftCandidateEvidence,
    verification: { proposer: 'not-verified', verifier: 'not-verified', promptVersion: prior.verification.promptVersion, proposalSha256: sha256('pending'), verdicts: [] } }
  snapshot.stateDigest = actionStateDigest(registry, snapshot.actionKeys, snapshot.closing, snapshot.draftContext, { articleDate: snapshot.date, roundId, includePriorArticleRounds: true, draftCandidates: snapshot.draftCandidates, candidateReviewHistory: snapshot.candidateReviewHistory, draftCandidateEvidence: snapshot.draftCandidateEvidence, articleAcceptance })
  registry.articles = [...registry.articles.filter(article => article.date !== input.articleDate), snapshot]
  const parsed = ActionRegistrySchema.parse(registry)
  return { registry: parsed, markdown: renderArticleActions(input.markdown, parsed, input.articleDate, new Map(input.articleStatuses).set(input.articleDate, 'accepted')), cached: false, evidenceResolutions: [] }
}

function escaped(value: string): string { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char)) }
function oneLine(value: string): string { return escaped(value.replace(/\s*[\r\n]+\s*/g, ' ')) }
function sourceLabel(locator: string): string {
  const github = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/.exec(locator)
  if (github) return `${github[2]} #${github[4]}`
  const file = locator.split('/').filter(Boolean).at(-1)
  return file ?? locator
}
function draftContextHtml(context: ActionRegistry['articles'][number]['draftContext'], pending: boolean): string[] {
  if (context?.kind !== 'retained') return []
  const state = pending ? 'No current follow-ups have been ranked yet.' : 'Current follow-ups are ranked above.'
  return [`<details class="suggested-actions-draft-context"><summary>Article draft context</summary><div><p class="suggested-actions-draft-context-note">These notes are retained from this article’s draft and review. They are separate from prior-day maintenance context. ${state}</p>${renderArticle(context.markdown)}</div></details>`]
}
function draftCandidatesHtml(candidates: ActionRegistry['articles'][number]['draftCandidates'], pending: boolean, articleAccepted = false): string[] {
  if (candidates === undefined) return pending ? ['<div class="draft-candidates-unknown"><p>The original draft suggestions were not captured. Their contents are unknown, and none have been reconstructed.</p></div>'] : []
  if (pending && candidates.length === 0) return ['<div class="draft-candidates-awaiting draft-candidates-empty"><p>This draft contains no suggestions. Nothing is awaiting review, and no missing suggestion has been invented.</p><p class="draft-candidate-quality">The initial target is 3–5 suggestions.</p></div>']
  if (pending && candidates.length < 3) {
    const items = candidates.map(candidate => `<li data-draft-candidate-id="${escaped(candidate.candidateId)}"><article><strong>${oneLine(candidate.payload.command)} · ${oneLine(candidate.payload.repo)}</strong><p>${oneLine(candidate.payload.description)}</p><p class="draft-candidate-status">${articleAccepted ? 'Needs review' : 'Awaiting review'}</p></article></li>`).join('')
    return [`<div class="draft-candidates-awaiting draft-candidates-incomplete"><p>These suggestions are awaiting review.</p><p class="draft-candidate-quality">This draft contains ${candidates.length} suggestion${candidates.length === 1 ? '' : 's'}; the initial target is 3–5. Review remains pending, and no missing suggestion has been invented.</p>${items ? `<ol>${items}</ol>` : ''}</div>`]
  }
  const label = (candidate: NonNullable<typeof candidates>[number]) => {
    if (candidate.review.state === 'awaiting-review') return articleAccepted ? 'Needs review' : 'Awaiting review'
    if (candidate.review.state === 'promoted') return 'Promoted to verified action'
    if (candidate.review.state === 'mapped-existing') return 'Mapped to existing action'
    if (candidate.review.state === 'rejected') return 'Rejected during independent review'
    return 'Verified as already closed'
  }
  const items = candidates.map(candidate => `<li data-draft-candidate-id="${escaped(candidate.candidateId)}"><article><strong>${oneLine(candidate.payload.command)} · ${oneLine(candidate.payload.repo)}</strong><p>${oneLine(candidate.payload.description)}</p><p class="draft-candidate-status">${label(candidate)}</p>${candidate.review.state === 'awaiting-review' ? '' : `<p>${oneLine(candidate.review.reason)}</p>`}</article></li>`).join('')
  if (pending) return [`<div class="draft-candidates-awaiting"><p>These suggestions are awaiting review.</p><ol>${items}</ol></div>`]
  const targetNote = candidates.length < 3 ? `<p class="draft-candidate-quality">The draft began with ${candidates.length} suggestion${candidates.length === 1 ? '' : 's'}, below the initial target of 3–5. Review accounted for every retained suggestion; no missing suggestion was invented.</p>` : ''
  return [`<details class="draft-candidates-reviewed"><summary>How draft suggestions were handled <span>${candidates.length}</span></summary>${targetNote}${items ? `<ol>${items}</ol>` : ''}</details>`]
}
export function articleActionRecords(registry: ActionRegistry, articleDate: string, statuses: ReadonlyMap<string, string>) {
  const snapshot = registry.articles.find(article => article.date === articleDate)
  return (snapshot?.actionKeys ?? []).map(key => {
    const record = registry.records.find(item => item.key === key)
    if (!record || !snapshot) throw new Error(`Missing action ${key}`)
    const history = record.history.filter(item => (snapshot.review.state === 'verified' && item.articleDate === articleDate && item.roundId === snapshot.roundId) || (statuses.get(item.articleDate) === 'accepted' && registry.articles.some(article => article.date === item.articleDate && article.status === 'accepted' && article.review.state === 'verified' && article.roundId === item.roundId)))
    return { ...record, history, state: history.at(-1)?.state ?? (record.origin === 'imported' ? record.original.status : 'proposed' as const) }
  })
}
export function articleActionCard(registry: ActionRegistry, articleDate: string, statuses: ReadonlyMap<string, string>) {
  const snapshot = registry.articles.find(article => article.date === articleDate)
  if (!snapshot) return undefined
  const handled = articleActionRecords(registry, articleDate, statuses).flatMap(record => {
    if (!['done', 'dismissed', 'superseded'].includes(record.state)) return []
    const decision = record.history.at(-1)
    return [{ key: record.key, state: record.state, command: record.original.command, originalDescription: record.original.description, description: decision?.description ?? '', reason: decision?.reason ?? '', citations: decision?.citations ?? [] }]
  })
  const recommendations = snapshot.closing?.kind === 'needs-evidence'
    ? snapshot.closing.recommendations
    : snapshot.closing?.options ?? []
  const citedSourceIds = new Set([
    ...handled.flatMap(item => item.citations.map(citation => citation.sourceId)),
    ...(snapshot.draftCandidates ?? []).flatMap(candidate => candidate.review.state === 'awaiting-review' ? [] : candidate.review.citations.map(citation => citation.sourceId)),
    ...recommendations.flatMap(option => [...option.factCitations, ...option.goalCitations].map(citation => citation.sourceId)),
  ])
  const sources = snapshot.sources
    .filter(source => citedSourceIds.has(source.id) && source.kind !== 'report')
    .map(({ id, kind, locator }) => ({ id, kind, locator }))
  const review = snapshot.review.state === 'pending' && snapshot.review.articleAcceptance ? { ...snapshot.review, reason: articleOnlyReviewReason(snapshot.review.articleAcceptance.failureKind) } : snapshot.review
  return { review, closing: snapshot.closing ?? null, draftCandidates: snapshot.draftCandidates ?? null, candidateReviewHistory: snapshot.candidateReviewHistory ?? [], draftContext: snapshot.draftContext ?? null, handled, sources }
}
export function renderArticleActions(markdown: string, registry: ActionRegistry, articleDate: string, statuses: ReadonlyMap<string, string>): string {
  const snapshot = registry.articles.find(article => article.date === articleDate)
  if (!snapshot) {
    if (!Object.hasOwn(registry.baseline.articleActions, articleDate)) throw new Error(`Action review is missing for ${articleDate}; reconcile before publishing`)
    return markdown
  }
  assertActionSnapshotStateIntegrity(registry, snapshot)
  const sourceBoundContext = new Set<string>(CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS).has(snapshot.verification.promptVersion)
  if (sourceBoundContext) {
    const prepared = extractDraftRecommendationContext(stripManagedActions(markdown), snapshot.draftContext)
    if (JSON.stringify(prepared.context) !== JSON.stringify(snapshot.draftContext)) throw new Error(`Action review draft context is stale for ${articleDate}; reconcile before publishing`)
    markdown = prepared.markdown
  }
  if (managedArticleDigest(markdown) !== snapshot.articleDigest) throw new Error(`Action review is stale for ${articleDate}; reconcile before publishing`)
  if (snapshot.status !== statuses.get(articleDate)) throw new Error(`Action review status is stale for ${articleDate}; reconcile before publishing`)
  if (snapshot.review.state === 'pending') {
    const articleAccepted = snapshot.status === 'accepted' && !!snapshot.review.articleAcceptance
    if (snapshot.status !== 'draft' && !articleAccepted) throw new Error(`Action review is pending for ${articleDate}; explicit article-only acceptance is missing`)
    const candidates = draftCandidatesHtml(snapshot.draftCandidates, true, articleAccepted)
    const context = draftContextHtml(snapshot.draftContext, true)
    const publicReason = snapshot.review.articleAcceptance ? articleOnlyReviewReason(snapshot.review.articleAcceptance.failureKind) : snapshot.review.reason
    const reason = `<p class="action-review-pending-reason"><strong>Why review paused:</strong> ${oneLine(publicReason)}</p>`
    const requests = snapshot.evidenceRequests?.filter(request => request.status === 'open').map(request =>
      `<p class="action-evidence-request"><strong>Evidence request pending:</strong> <code>${escaped(request.id)}</code> · Recipient: ${escaped(request.recipient)} · Private artifact: <code>.action-evidence/${escaped(request.id)}/request.json</code>.</p>`) ?? []
    const completion = articleAccepted ? 'Article accepted. These suggestions still need independent review.' : 'Action review pending. Acceptance remains blocked until the review is complete.'
    const retention = articleAccepted ? '<details class="suggested-actions-draft-context"><summary>Review details</summary><div><p>No action was added or closed. Original suggestions and previously saved sources are retained. Only identities and digests of fresh sources were recorded; their raw content was not retained.</p></div></details>' : ''
    return `${unmanagedArticleProse(markdown).trimEnd()}\n\n${ACTIONS_START}\n<section class="suggested-actions-card suggested-actions-card-needs-review" aria-labelledby="suggested-actions-${escaped(articleDate)}">\n<header class="suggested-actions-header"><h3 id="suggested-actions-${escaped(articleDate)}">Suggested actions</h3><p>${completion}</p></header>\n${[reason, retention, ...requests, ...candidates, ...context].filter(Boolean).join('\n')}\n</section>\n${ACTIONS_END}\n`
  }
  if (articleDate >= '2026-10-19' && !snapshot.closing) {
    throw new Error(`Verified action review is missing its required closing for ${articleDate}; reconcile before publishing`)
  }
  if (articleDate >= '2026-10-19' && snapshot.status === 'accepted' && new Set<string>(RANKED_ACTION_REVIEW_PROMPT_VERSIONS).has(snapshot.verification.promptVersion) && snapshot.closing?.kind !== 'shortlist') {
    throw new Error(`Accepted article requires exactly three ranked suggestions for ${articleDate}; reconcile before publishing`)
  }
  const visible = articleActionRecords(registry, articleDate, statuses).map(record => ({ record, decision: record.history.at(-1), state: record.state }))
  const active = visible.filter(item => item.state === 'open' || item.state === 'proposed' || item.state === 'deferred')
  const handled = visible.filter(item => item.state === 'done' || item.state === 'dismissed' || item.state === 'superseded')
  const allSources = registry.articles.flatMap(article => article.sources)
  const evidenceList = (citations: readonly { sourceId: string }[]) => {
    const evidence = citations.map(citation => allSources.find(source => source.id === citation.sourceId)).filter(source => source && source.kind !== 'report')
    return [...new Map(evidence.map(source => [source?.id, source])).values()].map(source => source ? `<li>${/^https:\/\//.test(source.locator) ? `<a href="${escaped(source.locator)}">${escaped(sourceLabel(source.locator))}</a>` : escaped(source.locator)}</li>` : '').join('')
  }
  const handledLines = () => {
    if (!handled.length) return []
    const result = [`<details class="suggestions-handled"><summary>Suggestions handled at draft <span>${handled.length}</span></summary><div class="suggestions-handled-list">`]
    for (const { record, decision, state } of handled) {
      const label = { done: 'Completed', dismissed: 'Dismissed', superseded: 'Superseded', deferred: 'Deferred', open: 'Open', proposed: 'Proposed' }[state]
      const links = evidenceList(decision?.citations ?? [])
      result.push(`<article><strong>${escaped(record.original.command)} · ${label}</strong><p>${escaped(decision?.description ?? '')}</p><details><summary>Original suggestion and evidence</summary><p>${escaped(record.original.description)}</p><p>${escaped((decision?.reason ?? '').replace(/\(s\d+(?:,\s*s\d+)*(?:\s+L\d+(?:-\d+)?)?\)/g, '').replace(/\bs\d+(?:\s+L\d+(?:-\d+)?)?/g, 'the cited source').replace(/ {2,}/g, ' ').trim())}</p><ul>${links}</ul></details></article>`)
    }
    result.push('</div></details>')
    return result
  }
  const lines = [ACTIONS_START]
  const pushCard = (options: readonly RankedClosingOption[], reviewNeeded?: { question: string; missingEvidence: string; nextCheck: string }) => {
    lines.push(`<section class="suggested-actions-card${reviewNeeded ? ' suggested-actions-card-needs-review' : ''}" aria-labelledby="suggested-actions-${escaped(articleDate)}">`, '<header class="suggested-actions-header">', `<h3 id="suggested-actions-${escaped(articleDate)}">Suggested actions</h3>`, ...(reviewNeeded ? ['<p>Supported follow-ups remain visible while the shortlist needs one more review.</p>'] : []), '</header>', '<ol class="suggested-actions-list">')
    for (const option of options) {
      const item = option.kind === 'action' ? visible.find(({ record }) => record.key === option.actionKey) : undefined
      if (option.kind === 'action' && !item) throw new Error(`Missing suggested action: ${option.actionKey}`)
      const conditions = item?.record.gates ?? []
      const sources = evidenceList([...option.factCitations, ...option.goalCitations])
      const start = option.kind === 'checkpoint'
        ? `<a href="${escaped(option.target)}">${escaped(sourceLabel(option.target))}</a> · ${oneLine(option.start)}`
        : oneLine(option.start)
      lines.push(`<li data-recommendation-id="${escaped(option.identity)}"><article class="suggested-action"><span class="suggested-action-rank" aria-label="Rank ${option.rank}">${option.rank}</span><div class="suggested-action-copy"><h4>${oneLine(option.title)}</h4><p class="suggested-action-benefit">${oneLine(option.benefit)}</p><p class="suggested-action-start"><strong>Start:</strong> ${start}</p><details><summary>Agent brief and evidence</summary><dl><dt>Current state and prior work</dt><dd>${oneLine(option.context)}</dd><dt>Agent entry point</dt><dd>${oneLine(option.entryPoint)}</dd><dt>Why this ranks here</dt><dd>${oneLine(option.rationale)}</dd><dt>Intended outcome</dt><dd>${oneLine(option.outcome)}</dd><dt>First checkpoint</dt><dd>${oneLine(option.nextCheck)}</dd>${item && !item.record.includeInIndex ? '<dt>Scope</dt><dd>Article only</dd>' : ''}${conditions.length ? `<dt>Conditions</dt><dd>${conditions.map(oneLine).join(' ')}</dd>` : ''}</dl><h5>Sources</h5><ul>${sources}</ul></details></div></article></li>`)
    }
    lines.push('</ol>')
    if (reviewNeeded) lines.push(`<aside class="suggested-actions-review-note" aria-label="Shortlist review needed"><strong>${oneLine(reviewNeeded.question)}</strong><p>${oneLine(reviewNeeded.missingEvidence)} ${oneLine(reviewNeeded.nextCheck)}</p></aside>`)
    lines.push(...draftCandidatesHtml(snapshot.draftCandidates, false), ...draftContextHtml(snapshot.draftContext, false), ...handledLines(), '</section>')
  }
  if (snapshot.closing?.kind === 'shortlist') {
    pushCard(snapshot.closing.options)
  } else if (snapshot.closing?.kind === 'options') {
    const currentOptions = snapshot.closing.options.filter(option => option.kind === 'checkpoint' || visible.some(item => item.record.key === option.actionKey && ['open', 'proposed', 'deferred'].includes(item.state)))
    if (currentOptions.length) lines.push('', '> **Choose a supported next step**', '> These choices continue verified work or checkpoints; they do not create additional queue identities.')
    for (const option of currentOptions) {
      if (option.kind === 'checkpoint') {
        lines.push(`> - **${oneLine(option.title)}** — ${oneLine(option.context)}`,
          `>   Entry point: <${escaped(option.target)}> — ${oneLine(option.entryPoint)}`,
          `>   Why now: ${oneLine(option.whyNow)}`,
          `>   Advances: ${oneLine(option.outcome)}`,
          `>   Next checkpoint: ${oneLine(option.nextCheck)}`)
        continue
      }
      const item = visible.find(({ record }) => record.key === option.actionKey)
      if (!item) throw new Error(`Missing closing action: ${option.actionKey}`)
      lines.push(`> - **${oneLine(option.title)}** — ${oneLine(option.context)}`,
        `>   Entry point: ${oneLine(option.entryPoint)}`,
        `>   Why now: ${oneLine(option.whyNow)}`,
        `>   Advances: ${oneLine(option.outcome)}`,
        `>   Next checkpoint: ${oneLine(option.nextCheck)}`,
        `>   Action: \`${oneLine(item.record.original.command)}\` (${oneLine(item.record.original.repo)})${item.record.includeInIndex ? '' : ' · Article only'}`,
        ...(item.record.doneWhen ? [`>   Done when: ${oneLine(item.record.doneWhen)}`] : []),
        ...(item.record.gates.length ? [`>   Conditions: ${item.record.gates.map(oneLine).join(' ')}`] : []))
    }
    if (!currentOptions.length) lines.push('', '> **Decision needed before the next action**', '> Which supported continuation should the next session take?', '> Missing evidence: Every previously verified option is now resolved or no longer current.', '> Next check: Reconcile current primary evidence before presenting or admitting more work.')
    lines.push(...draftCandidatesHtml(snapshot.draftCandidates, false), ...handledLines())
  } else if (snapshot.closing?.kind === 'needs-evidence') {
    pushCard(snapshot.closing.recommendations, snapshot.closing)
  } else {
    lines.push('> **Suggested actions**')
    lines.push(...active.flatMap(({ record, decision }) => [`> - \`${oneLine(record.original.command)}\` — ${oneLine(decision?.description ?? record.original.description)} (${oneLine(record.original.repo)})${record.includeInIndex ? '' : ' · Article only'}`, ...(record.doneWhen ? [`>   Done when: ${oneLine(record.doneWhen)}`] : []), ...(record.gates.length ? [`>   Conditions: ${record.gates.map(oneLine).join(' ')}`] : [])]))
    if (active.length === 0) lines.push('> No new verified suggestion. Existing work retains its documented next checkpoints.')
    lines.push(...draftCandidatesHtml(snapshot.draftCandidates, false), ...handledLines())
  }
  lines.push(ACTIONS_END)
  const prose = unmanagedArticleProse(markdown).trimEnd()
  const footer = prose.match(/\n---\n(?=\n?\*Generated by \[daily-logger\])/)?.index
  return footer === undefined ? `${prose}\n\n${lines.join('\n')}\n` : `${prose.slice(0, footer).trimEnd()}\n\n${lines.join('\n')}\n\n${prose.slice(footer).trimStart()}\n`
}

export function normalizeLegacyActionProse(markdown: string): string {
  return stripManagedActions(markdown)
    .replace(/^> \*\*Suggested actions\*\*[^\n]*\n(?:>[^\n]*(?:\n|$))*/gm, '')
    .replace(/^The following block retains the original generator suggestions verbatim[^\n]*(?:\n|$)/gm, '')
    .replace(/^\*\*Disposition of suggested actions:\*\*[^\n]*(?:\n|$)/gm, '')
    .replace(/\n{2,}---\n(?=\n?\*Generated by \[daily-logger\])/g, '\n\n---\n')
}
function unmanagedArticleProse(markdown: string): string { return stripManagedActions(markdown).replace(/\n{2,}---\n(?=\n?\*Generated by \[daily-logger\])/g, '\n\n---\n') }
export function managedArticleDigest(markdown: string): string {
  return articleActionDigest(unmanagedArticleProse(markdown))
}

export function rebindArticleSnapshot(registry: ActionRegistry, input: { date: string; beforeMarkdown: string; afterMarkdown: string; expectedRoundId: string; actor: string; instruction: string }): ActionRegistry {
  const next = structuredClone(registry), snapshot = next.articles.find(article => article.date === input.date)
  if (!snapshot || snapshot.roundId !== input.expectedRoundId || snapshot.articleDigest !== managedArticleDigest(input.beforeMarkdown) || snapshot.review.state !== 'verified') throw new Error('The prior action review binding must be verified before an editorial rebind')
  if (!input.actor.trim() || !input.instruction.trim()) throw new Error('An editorial rebind requires an explicit identified instruction')
  if ((input.beforeMarkdown.match(/^status:.*$/m)?.[0]) !== input.afterMarkdown.match(/^status:.*$/m)?.[0]) throw new Error('An editorial rebind cannot change acceptance status')
  const block = (value: string) => value.slice(value.indexOf(ACTIONS_START), value.indexOf(ACTIONS_END) + ACTIONS_END.length)
  if (!input.beforeMarkdown.includes(ACTIONS_START) || !input.beforeMarkdown.includes(ACTIONS_END)) throw new Error('An editorial rebind requires the canonical managed block')
  if (block(input.beforeMarkdown) !== block(input.afterMarkdown)) throw new Error('An editorial rebind cannot change managed action decisions')
  snapshot.binding = { mode: 'editorial-rebind', fromDigest: snapshot.articleDigest, actor: input.actor, instructionSha256: sha256(input.instruction) }
  snapshot.articleDigest = managedArticleDigest(input.afterMarkdown)
  return ActionRegistrySchema.parse(next)
}

export function renderArticleActionHtml(markdown: string, registry: ActionRegistry, date: string, statuses: ReadonlyMap<string, string>): string {
  const rendered = renderArticleActions(markdown, registry, date, statuses).replace(/^---[\s\S]*?---\n/, '')
  if (!registry.articles.some(article => article.date === date)) return renderArticle(rendered)
  // Only escaped cards freshly constructed from registry records bypass
  // Markdown's raw-HTML escaping. Authored HTML still goes through renderArticle.
  const blockStart = rendered.indexOf(ACTIONS_START)
  const end = rendered.indexOf(ACTIONS_END, blockStart)
  const starts = ['\n<section class="suggested-actions-card', '\n<details class="suggestions-handled"']
    .map(marker => rendered.indexOf(marker, blockStart))
    .filter(index => index !== -1 && index < end)
  const start = starts.length ? Math.min(...starts) : -1
  if (blockStart === -1 || end === -1 || start <= blockStart || start >= end) return renderArticle(rendered)
  const section = rendered.startsWith('\n<section', start)
  const closingTag = section ? '</section>' : '</details>'
  const cardEnd = rendered.lastIndexOf(closingTag, end) + closingTag.length
  if (cardEnd < start + closingTag.length || cardEnd > end) throw new Error('Invalid generated suggested-actions card')
  return renderArticle(rendered.slice(0, start)) + rendered.slice(start, cardEnd) + renderArticle(rendered.slice(cardEnd, end)) + renderArticle(rendered.slice(end + ACTIONS_END.length))
}

export function readRegistryProjection(repoRoot: string) {
  const statuses = readArticleStatuses(repoRoot)
  const registry = readActionRegistry(repoRoot)
  for (const [date] of statuses) renderArticleActions(readFileSync(join(repoRoot, '_articles', `${date}.md`), 'utf8'), registry, date, statuses)
  return projectRegistry(registry, statuses)
}

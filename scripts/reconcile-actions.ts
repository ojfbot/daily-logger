import { ActionSourceCollection } from '../src/action-evidence-view.js'
import { acceptanceActionCycle } from '../src/action-review-cycle.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readActionRegistry, registryRevision, writeActionRegistry, setActionInclusion, renderArticleActions, readArticleStatuses, assertFirstArticleAcceptance, completeArticleWithPendingActions } from '../src/action-registry.js'
import { collectActionSources, createActionAgents, mockActionAgents, reviewProducedDraftActions, classifyActionReviewFailure, isVerifiedActionOutputStorageLimit, actionReviewEvidenceRequest } from '../src/review-actions.js'
import { persistActionEvidenceResolutions, readActionEvidenceReply } from '../src/action-evidence-retrieval.js'

type ReconcileOptions = { repoRoot?: string; articlePath?: string; agents?: Parameters<typeof reviewProducedDraftActions>[0]['agents']; collectSources?: (...args: Parameters<Parameters<typeof reviewProducedDraftActions>[0]['collectSources']>) => ActionSourceCollection }
export async function reconcileActions(options: ReconcileOptions = {}) {
  const repoRoot = options.repoRoot ? resolve(options.repoRoot) : process.env.ACTION_REPO_ROOT ? resolve(process.env.ACTION_REPO_ROOT) : resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const articlePath = options.articlePath ?? process.env.ARTICLE_PATH
  if (!articlePath) throw new Error('ARTICLE_PATH is required')
  const markdown = readFileSync(resolve(repoRoot, articlePath), 'utf8')
  const articleDate = markdown.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})/m)?.[1]
  if (!articleDate) throw new Error('Article date is missing')
  if (resolve(repoRoot, articlePath) !== resolve(repoRoot, `_articles/${articleDate}.md`)) throw new Error('ARTICLE_PATH must identify the dated article in this repository')
  const registry = readActionRegistry(repoRoot)
  const feedback = process.env.EDITORIAL_FEEDBACK ?? ''
  const statuses = readArticleStatuses(repoRoot)
  if (process.env.ACTION_KEY) {
    if (!feedback.trim()) throw new Error('An inclusion change requires the operator instruction in EDITORIAL_FEEDBACK')
    if (!['true', 'false'].includes(process.env.INCLUDE_IN_INDEX ?? '')) throw new Error('INCLUDE_IN_INDEX must be true or false')
    const record = registry.records.find(record => record.key === process.env.ACTION_KEY)
    if (record?.introducedBy !== articleDate || !registry.articles.find(article => article.date === articleDate)?.actionKeys.includes(process.env.ACTION_KEY)) throw new Error('The checkbox must belong to this article')
  }
  const requestIdentity = process.env.ACTION_REVIEW_REQUEST?.trim()
  if (!process.env.ACTION_KEY && !requestIdentity) throw new Error('ACTION_REVIEW_REQUEST must identify this logical action-review request; retries retain it')
  const actionKeys = (name: string) => (process.env[name] ?? '').split(',').map(value => value.trim()).filter(Boolean)
  const reassessActionKeys = actionKeys('ACTION_REASSESS_KEYS')
  const preserveActionKeys = actionKeys('ACTION_PRESERVE_KEYS')
  const evidenceReplies = actionKeys('ACTION_EVIDENCE_REPLY').map(path => readActionEvidenceReply(resolve(path)))
  const reviewCycle = acceptanceActionCycle(requestIdentity ?? '', registry.articles.find(article => article.date === articleDate))
  const prior = registry.articles.find(article => article.date === articleDate)
  const articleOnlyEligible = process.env.ACTION_REVIEW_ARTICLE_COMPLETION === 'article-only' && !process.env.ACTION_KEY && /^status:\s*"?accepted"?\s*$/m.test(markdown) && prior?.status === 'draft' && prior.review.state === 'pending'
  if (articleOnlyEligible) assertFirstArticleAcceptance(registry, articleDate)
  const pristine = structuredClone(registry)
  let collectedSources: ActionSourceCollection | undefined
  let preparedEvidence: Parameters<typeof completeArticleWithPendingActions>[0]['draftCandidateEvidence'] | undefined
  let reviewed: Awaited<ReturnType<typeof reviewProducedDraftActions>>
  try {
  reviewed = process.env.ACTION_KEY
    ? { cached: false, registry: setActionInclusion(registry, process.env.ACTION_KEY, process.env.INCLUDE_IN_INDEX !== 'false', process.env.ACTION_ACTOR ?? '', `Explicit editorial inclusion instruction: ${feedback.trim()}`, statuses), markdown, evidenceResolutions: [] }
    : await reviewProducedDraftActions({ cycle: reviewCycle, registry: structuredClone(registry), articleStatuses: statuses, articleDate, markdown, feedback,
        collectSources: (draftCandidates, draftCandidateEvidence) => {
          preparedEvidence = draftCandidateEvidence
          collectedSources = options.collectSources ? options.collectSources(draftCandidates, draftCandidateEvidence) : (process.env.MOCK_LLM === 'true' ? new ActionSourceCollection([]) : collectActionSources({ cycle: reviewCycle, registry, articleStatuses: statuses, repoRoot, markdown, feedback, reassessActionKeys, preserveActionKeys, draftCandidates, draftCandidateEvidence })).appendRaw(evidenceReplies)
          return collectedSources
        },
        agents: options.agents ?? (process.env.MOCK_LLM === 'true' ? mockActionAgents : createActionAgents()), reassessActionKeys, preserveActionKeys, selectedEvidenceProjectionIds: evidenceReplies.map(reply => reply.id), ...(process.env.DRY_RUN === 'true' ? {} : { repoRoot }) })
  } catch (error) {
    const failure = classifyActionReviewFailure(error)
    const outputStorageLimit = isVerifiedActionOutputStorageLimit(error)
    const failureKind = outputStorageLimit ? 'output-storage-limit' : failure?.kind
    if (!articleOnlyEligible || !failureKind || !collectedSources || !preparedEvidence) throw error
    const evidenceRequest = outputStorageLimit ? undefined : actionReviewEvidenceRequest(error, { registry: pristine, articleDate, markdown, articleStatuses: statuses, cycle: reviewCycle, feedback, sources: collectedSources, draftCandidateEvidence: preparedEvidence, reassessActionKeys, preserveActionKeys })
    reviewed = completeArticleWithPendingActions({ registry: pristine, articleDate, markdown, articleStatuses: statuses, cycle: reviewCycle, failureKind, sources: collectedSources, draftCandidateEvidence: preparedEvidence, ...(evidenceRequest ? { evidenceRequest } : {}) })
  }
  reviewed.markdown = renderArticleActions(reviewed.markdown, reviewed.registry, articleDate, statuses)
  if (process.env.DRY_RUN !== 'true') {
    if (readFileSync(resolve(repoRoot, articlePath), 'utf8') !== markdown) throw new Error('Article changed during action review')
    writeActionRegistry(repoRoot, reviewed.registry, registryRevision(registry), { path: resolve(repoRoot, articlePath), expected: markdown, next: reviewed.markdown, publish: () => writeFileSync(resolve(repoRoot, articlePath), reviewed.markdown) })
    persistActionEvidenceResolutions(repoRoot, reviewed.evidenceResolutions)
  }
  const snapshot = reviewed.registry.articles.find(article => article.date === articleDate)
  const receipt = { articleDate, articleCompletion: snapshot?.status, actionReview: snapshot?.review.state, beforeRevision: registryRevision(registry), afterRevision: registryRevision(reviewed.registry), dryRun: process.env.DRY_RUN === 'true', ...(process.argv.includes('--receipt') ? { registry: reviewed.registry, markdown: reviewed.markdown } : {}) }
  return { ...receipt, ...reviewed }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { registry, markdown, evidenceResolutions: _evidence, cached: _cached, ...receipt } = await reconcileActions()
  console.log(JSON.stringify({ ...receipt, ...(process.argv.includes('--receipt') ? { registry, markdown } : {}) }))
}

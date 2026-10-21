import { acceptanceActionCycle } from '../src/action-review-cycle.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readActionRegistry, registryRevision, writeActionRegistry, setActionInclusion, renderArticleActions, readArticleStatuses } from '../src/action-registry.js'
import { collectActionSources, createActionAgents, mockActionAgents, reviewProducedDraftActions } from '../src/review-actions.js'
import { persistActionEvidenceResolutions, readActionEvidenceReply } from '../src/action-evidence-retrieval.js'

const repoRoot = process.env.ACTION_REPO_ROOT ? resolve(process.env.ACTION_REPO_ROOT) : resolve(dirname(fileURLToPath(import.meta.url)), '..')
const articlePath = process.env.ARTICLE_PATH
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
const reviewed = process.env.ACTION_KEY
  ? { registry: setActionInclusion(registry, process.env.ACTION_KEY, process.env.INCLUDE_IN_INDEX !== 'false', process.env.ACTION_ACTOR ?? '', `Explicit editorial inclusion instruction: ${feedback.trim()}`, statuses), markdown, evidenceResolutions: [] }
  : await reviewProducedDraftActions({ cycle: reviewCycle, registry, articleStatuses: statuses, articleDate, markdown, feedback,
      collectSources: (draftCandidates, draftCandidateEvidence) => [...(process.env.MOCK_LLM === 'true' ? [] : collectActionSources({ cycle: reviewCycle, registry, articleStatuses: statuses, repoRoot, markdown, feedback, reassessActionKeys, preserveActionKeys, draftCandidates, draftCandidateEvidence })), ...evidenceReplies],
      agents: process.env.MOCK_LLM === 'true' ? mockActionAgents : createActionAgents(), reassessActionKeys, preserveActionKeys, selectedEvidenceProjectionIds: evidenceReplies.map(reply => reply.id), ...(process.env.DRY_RUN === 'true' ? {} : { repoRoot }) })
reviewed.markdown = renderArticleActions(reviewed.markdown, reviewed.registry, articleDate, statuses)
if (process.env.DRY_RUN !== 'true') {
  if (readFileSync(resolve(repoRoot, articlePath), 'utf8') !== markdown) throw new Error('Article changed during action review')
  writeActionRegistry(repoRoot, reviewed.registry, registryRevision(registry), { path: resolve(repoRoot, articlePath), expected: markdown, next: reviewed.markdown, publish: () => writeFileSync(resolve(repoRoot, articlePath), reviewed.markdown) })
  persistActionEvidenceResolutions(repoRoot, reviewed.evidenceResolutions)
}
console.log(JSON.stringify({ articleDate, beforeRevision: registryRevision(registry), afterRevision: registryRevision(reviewed.registry), dryRun: process.env.DRY_RUN === 'true', ...(process.argv.includes('--receipt') ? { registry: reviewed.registry, markdown: reviewed.markdown } : {}) }))

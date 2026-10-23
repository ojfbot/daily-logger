import { actionEvidenceRegistryDigest, PreparedActionEvidenceView } from '../action-evidence-view.js'
import { sha256, type ActionSource } from '../action-registry.js'
import * as native from '../review-actions.js'

// Legacy semantic fixtures predate line citations. Upgrade their explicit quotes
// at test setup only; the production entry points have no missing-view fallback.
export function fixtureLineCitations(value: unknown, sources: readonly ActionSource[]): unknown {
  if (Array.isArray(value)) return value.map(item => fixtureLineCitations(item, sources))
  if (!value || typeof value !== 'object') return value
  const item = value as Record<string, unknown>
  if (typeof item.sourceId === 'string' && typeof item.quote === 'string' && item.sourceLineStart === undefined) {
    const source = sources.find(source => source.id === item.sourceId)
    if (source) {
      const offset = source.content.indexOf(item.quote)
      if (offset >= 0) {
        const start = source.content.slice(0, offset).split('\n').length
        const end = start + item.quote.split('\n').length - 1
        return { ...item, sourceLineStart: start, sourceLineEnd: end, quote: source.content.split('\n').slice(start - 1, end).join('\n') }
      }
    }
  }
  return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, fixtureLineCitations(child, sources)]))
}
export function fixtureEvidenceView(sources: readonly ActionSource[]) { return PreparedActionEvidenceView.prepare(sources, sha256('explicit legacy semantic fixture'), sha256('fixture registry')) }
export function resolveActionSourceLines(value: unknown, sources: readonly ActionSource[]) {
  // Some historical resolver fixtures name their source s1 explicitly.
  return native.resolveActionSourceLines(value, fixtureEvidenceView(sources))
}
export function applyVerifiedActionReview(input: Omit<Parameters<typeof native.applyVerifiedActionReview>[0], 'evidenceView'>) {
  const evidenceView = PreparedActionEvidenceView.prepare(input.sources, input.roundId, actionEvidenceRegistryDigest(input.registry, input.articleDate))
  return native.applyVerifiedActionReview({ ...input, evidenceView, roundId: evidenceView.roundId, proposal: fixtureLineCitations(input.proposal, input.sources) as native.ActionProposal })
}
function agents(input: Parameters<typeof native.reviewArticleActions>[0]): native.ActionAgents {
  return { ...input.agents, propose: async (prompt, view, context) => fixtureLineCitations(await input.agents.propose(prompt, view, context), [...view.rawSources(true), ...view.rawSources()]) }
}
export function reviewArticleActions(input: Parameters<typeof native.reviewArticleActions>[0]) { return native.reviewArticleActions({ ...input, agents: agents(input) }) }
export function reviewDraftActions(input: Parameters<typeof native.reviewDraftActions>[0]) { return native.reviewDraftActions({ ...input, agents: agents(input) }) }
export function reviewProducedDraftActions(input: Parameters<typeof native.reviewProducedDraftActions>[0]) { return native.reviewProducedDraftActions({ ...input, agents: agents({ ...input, sources: [] }) }) }

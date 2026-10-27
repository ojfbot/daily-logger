import { expect, it } from 'vitest'
import { ActionRegistrySchema, sha256 } from '../action-registry.js'
import { selectActionEvidence } from '../action-evidence-selection.js'
import { ActionEvidenceRequestError, buildActionEvidenceProjection } from '../action-evidence-retrieval.js'
import { PreparedActionEvidenceView } from '../action-evidence-view.js'

it('holds a projection whose raw bytes fit but labeled model content exceeds the per-source limit', () => {
  const registry = ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
  const input = { registry, articleDate: '2030-01-01', markdown: 'Bounded review.', feedback: 'Review https://github.com/ojfbot/daily-logger/pull/416.', cycle: { phase: 'generation' as const } }
  const fixture = (length: number) => {
    const content = 'x'.repeat(length) + '\n' + 'z'.repeat(150000)
    const source = { id: `github:daily-logger#416@${sha256(content)}`, kind: 'github' as const, locator: 'https://github.com/ojfbot/daily-logger/pull/416', content }
    let request
    try { selectActionEvidence({ ...input, sources: [source] }) } catch (error) {
      if (!(error instanceof ActionEvidenceRequestError)) throw error
      request = error.request
    }
    if (!request) throw new Error('Expected the required source-view request')
    const projection = buildActionEvidenceProjection({ request, source, ranges: [{ startLine: 1, endLine: 1, role: 'counterevidence' }],
      coverage: request.obligations.map(obligationId => ({ obligationId, status: 'counterevidence', rangeIndexes: [0] })) })
    return { source, projection }
  }
  const first = fixture(130000), { source, projection } = fixture(130000 + 131060 - Buffer.byteLength(first.projection.content))
  const model = PreparedActionEvidenceView.prepare([projection], sha256('case'), sha256('state')).promptSources()[0]
  expect(Buffer.byteLength(projection.content)).toBe(131060)
  expect(Buffer.byteLength(model.content)).toBe(131076)
  expect(() => selectActionEvidence({ ...input, sources: [source, projection], selectedEvidenceProjectionIds: [projection.id] })).toThrow(ActionEvidenceRequestError)
})

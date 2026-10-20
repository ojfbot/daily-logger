import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  ACTION_FILE_LIMIT,
  DraftActionCandidatePayloadSchema,
  DraftActionCandidateSchema,
  createActionRegistrySchemas,
  type ActionRecord,
  type ActionRegistry,
  type ArticleActionFile,
  type DraftActionCandidate,
  type DraftActionCandidatePayload,
} from './action-registry-contract.js'

export * from './action-registry-contract.js'

export function draftActionCandidateId(payload: DraftActionCandidatePayload, ordinal: number): string {
  return createHash('sha256').update(JSON.stringify({ ordinal, payload: DraftActionCandidatePayloadSchema.parse(payload) })).digest('hex')
}

export function captureDraftActionCandidates(values: readonly unknown[]): DraftActionCandidate[] {
  return z.array(DraftActionCandidateSchema).max(5).parse(values.map((value, ordinal) => {
    const payload = DraftActionCandidatePayloadSchema.parse(value)
    return { candidateId: draftActionCandidateId(payload, ordinal), payload, review: { state: 'awaiting-review' as const } }
  }))
}

export const { ArticleActionSchema, ActionRegistrySchema, ArticleActionFileSchema } = createActionRegistrySchemas(draftActionCandidateId)

export function articleActionFileBytes(file: ArticleActionFile): string {
  const bytes = JSON.stringify(ArticleActionFileSchema.parse(file), null, 2) + '\n'
  if (new TextEncoder().encode(bytes).length > ACTION_FILE_LIMIT) throw new Error('Article action state exceeds 64 KiB; compact the evidence before publishing')
  return bytes
}

export function splitActionRegistry(registry: ActionRegistry): { baseline: ActionRegistry; files: ArticleActionFile[] } {
  const baseline = { ...registry, records: registry.records.filter(record => record.origin === 'imported').map(record => ({ ...record, state: record.original.status, history: [] })), articles: [] }
  return { baseline: ActionRegistrySchema.parse(baseline), files: registry.articles.map(snapshot => ArticleActionFileSchema.parse({ schemaVersion: 1, date: snapshot.date,
    suggestions: registry.records.filter(record => record.origin === 'suggested' && record.introducedBy === snapshot.date).map(({ history: _history, state: _state, ...record }) => record),
    decisions: registry.records.flatMap(record => record.history.filter(decision => decision.articleDate === snapshot.date).map(decision => ({ key: record.key, decision }))), snapshot })) }
}

export function hydrateActionRegistry(baseline: ActionRegistry, files: ArticleActionFile[]): ActionRegistry {
  if (baseline.articles.length || baseline.records.some(record => record.origin !== 'imported' || record.history.length)) throw new Error('The imported action baseline must be frozen; run the explicit cutover')
  const ordered = [...files].sort((a, b) => a.date.localeCompare(b.date))
  const records = [...structuredClone(baseline.records), ...ordered.flatMap(file => file.suggestions.map(record => ({ ...structuredClone(record), state: 'proposed' as const, history: [] as ActionRecord['history'] })))]
  for (const file of ordered) for (const { key, decision } of file.decisions) {
    const record = records.find(record => record.key === key)
    if (!record) throw new Error(`Unknown action identity in ${file.date}: ${key}`)
    record.history.push(decision); record.state = decision.state
  }
  const workKeys = records.filter(record => record.origin === 'suggested').map(record => record.workKey)
  if (new Set(workKeys).size !== workKeys.length) throw new Error('Concurrent articles proposed the same work; reconcile the duplicate before publishing')
  return ActionRegistrySchema.parse({ ...baseline, records, articles: ordered.map(file => file.snapshot) })
}

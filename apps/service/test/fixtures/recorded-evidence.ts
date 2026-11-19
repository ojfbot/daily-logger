import { createHash } from 'node:crypto'
import type { RecordedBinding } from '../../src/recorded-evidence.js'

// Independent fixture encoder: JSON's replacer orders each object, rather than using the implementation's encoder.
export const encode = (value: unknown) => Buffer.from(JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item), 'utf8')
export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
export const unknownUsage = () => ({ inputTokens: null as number | null, outputTokens: null as number | null, costUsdMicros: null as number | null })
export function artifact(id: string, role: string, text: string) {
  return { id, role, format: 'synthetic-v1', mediaType: 'text/plain', text, bytes: Buffer.byteLength(text), sha256: digest(text),
    origin: { kind: 'synthetic' } }
}
export function bundle() {
  return {
    schemaVersion: 'dailylogger-recorded-evidence-v1', encoding: 'dailylogger-canonical-json-v1', mode: 'recorded-replay',
    capture: { kind: 'synthetic', capturedAt: '2026-11-17T10:00:00.000Z', collectorVersion: null as string | null,
      sourceRevision: null as string | null, captureReceiptRef: null as string | null },
    report: { date: '2026-11-17', policy: 'chicago-0330-v1', startInclusive: '2026-11-16T09:30:00.000Z', endExclusive: '2026-11-17T09:30:00.000Z' },
    evidence: { contextRef: 'context', actionRegistryRef: 'actions', articleStatusesRef: 'statuses', previousArticleRefs: [] as string[], sourceRefs: [] as string[],
      priority: { state: 'missing' } as { state: 'missing' } | { state: 'asserted'; artifactRef: string; sourceGoalRefs: string[]; effectiveFrom: string; expiresAt: string; approval: { actorId: string; decisionRef: string; approvedAt: string } } },
    evidenceSha256: '', artifacts: [artifact('context', 'context', 'opaque context'), artifact('actions', 'action_registry', 'opaque action history'), artifact('statuses', 'article_statuses', 'opaque statuses')],
    requests: [] as { binding: RecordedBinding; requestSha256: string; artifactRef: string }[],
    responses: [] as { requestSha256: string; role: RecordedBinding['role']; provider: string | null; model: string | null; usage: ReturnType<typeof unknownUsage>;
      result: { status: 'returned'; artifactRef: string; finishReason: 'stop' | null } | { status: 'failed'; code: 'provider_failed' | 'invalid_recording' } | { status: 'unknown' } }[],
  }
}
export type FixtureBundle = ReturnType<typeof bundle>
export function evidenceHash(value: FixtureBundle) {
  const ev = value.evidence
  const ids = new Set([ev.contextRef, ev.actionRegistryRef, ev.articleStatusesRef, ...ev.previousArticleRefs, ...ev.sourceRefs,
    ...(ev.priority.state === 'asserted' ? [ev.priority.artifactRef, ...ev.priority.sourceGoalRefs, ev.priority.approval.decisionRef] : [])])
  const artifacts = [...ids].sort().map(id => { const { text: _text, ...metadata } = value.artifacts.find(item => item.id === id)!; return metadata })
  return digest(encode({ report: value.report, evidence: ev, artifacts }))
}
export function addStep(value: FixtureBundle, role: RecordedBinding['role'], previousResponseSha256: string | null = null) {
  const requestArtifact = artifact(`${role}_request`, 'model_request', `exact recorded ${role} request`)
  const responseArtifact = artifact(`${role}_response`, 'model_response', `opaque ${role} result`)
  value.artifacts.push(requestArtifact, responseArtifact)
  const binding: RecordedBinding = { role, evidenceSha256: value.evidenceSha256, provider: 'synthetic-provider', model: 'synthetic-model',
    promptVersion: 'synthetic-prompt-v1', outputSchemaVersion: 'opaque-synthetic-v1', requestArtifactSha256: requestArtifact.sha256, previousResponseSha256 }
  const requestSha256 = digest(encode(binding))
  value.requests.push({ binding, requestSha256, artifactRef: requestArtifact.id })
  value.responses.push({ requestSha256, role, provider: binding.provider, model: binding.model, usage: unknownUsage(),
    result: { status: 'returned', artifactRef: responseArtifact.id, finishReason: 'stop' } })
  return { binding, requestSha256, responseSha256: responseArtifact.sha256 }
}
export function fixture(chain = false) {
  const value = bundle(); value.evidenceSha256 = evidenceHash(value)
  const draft = addStep(value, 'draft')
  if (chain) { const review = addStep(value, 'review', draft.responseSha256); addStep(value, 'revision', review.responseSha256) }
  return value
}

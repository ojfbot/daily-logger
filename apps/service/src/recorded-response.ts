import { readRecordedArtifact, recordedExchange, type RecordedBinding, type RecordedEvidence } from './recorded-evidence.js'

/** Deterministic recorded lookup only: no fallback, consumption counter or provider-idempotency claim. */
export function replayRecordedResponse(handle: RecordedEvidence, binding: RecordedBinding) {
  const exchange = recordedExchange(handle, binding)
  if (exchange.status !== 'matched') return Object.freeze(exchange)
  const response = exchange.response
  const common = { requestSha256: exchange.requestSha256, usage: Object.freeze(response.usage) }
  if (response.result.status === 'returned') return Object.freeze({ ...common, status: 'returned' as const,
    finishReason: response.result.finishReason, bytes: readRecordedArtifact(handle, response.result.artifactRef), payloadValidation: 'opaque-unverified' as const })
  if (response.result.status === 'failed') return Object.freeze({ ...common, status: 'failed' as const, code: response.result.code })
  return Object.freeze({ ...common, status: 'unknown' as const })
}

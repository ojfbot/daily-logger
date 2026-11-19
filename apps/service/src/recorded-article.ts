import { ArticleDataSchema } from '@ojfbot/daily-logger-journal/article-schema'
import { recordedExchange, type RecordedBinding, type RecordedEvidence } from './recorded-evidence.js'
import { replayRecordedResponse } from './recorded-response.js'
import { InvalidRecordedJson, parseRecordedJson } from './recorded-json.js'

/** Identifies the unchanged legacy V2 definitions, not publication or action admission. */
export const RECORDED_ARTICLE_SCHEMA = 'dailylogger-article-v2' as const
type InvalidCode = 'UNSUPPORTED_ROLE' | 'UNSUPPORTED_SCHEMA' | 'JSON_INVALID' | 'LIMIT_EXCEEDED' | 'ARTICLE_INVALID'

/**
 * Validate one original recorded draft. No V1 fallback, salvage, provider call or authority.
 * V2 still strips unknown properties and retains its existing defaults/status/outcome fields.
 * Shape validation does not establish truthful claims, completeness or reporting-date eligibility.
 */
export function validateRecordedDraft(handle: RecordedEvidence, binding: RecordedBinding) {
  const exchange = recordedExchange(handle, binding)
  if (exchange.status !== 'matched') return Object.freeze(exchange)
  // Use the stored snapshot, never reread caller getters after exact binding validation.
  const response = replayRecordedResponse(handle, exchange.binding)
  if (response.status !== 'returned') return response
  const common = { requestSha256: response.requestSha256, usage: response.usage, finishReason: response.finishReason,
    provenance: 'unverified' as const, publicationAuthority: 'none' as const,
    actionAuthority: 'none' as const, executionAuthority: 'none' as const }
  const invalid = (code: InvalidCode) => Object.freeze({ ...common, status: 'invalid' as const, code })
  if (exchange.binding.role !== 'draft') return invalid('UNSUPPORTED_ROLE')
  if (exchange.binding.outputSchemaVersion !== RECORDED_ARTICLE_SCHEMA) return invalid('UNSUPPORTED_SCHEMA')
  try {
    const parsed = parseRecordedJson(response.bytes)
    const result = ArticleDataSchema.safeParse(parsed)
    if (!result.success) return invalid('ARTICLE_INVALID')
    return Object.freeze({ ...common, status: 'validated' as const,
      payloadValidation: 'article-v2-original' as const, article: result.data })
  } catch (error) {
    return invalid(error instanceof InvalidRecordedJson ? error.code : 'JSON_INVALID')
  }
}

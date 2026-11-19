import { matchesServiceDraftRequest, SERVICE_DRAFT_REQUEST, SERVICE_DRAFT_SCHEMA, validateServiceDraftPayload } from './article-output-contract.js'
import { recordedRequestExchange, type RecordedBinding, type RecordedEvidence } from './recorded-evidence.js'
import { InvalidRecordedJson, parseRecordedJson } from './recorded-json.js'
import { replayRecordedResponse } from './recorded-response.js'

/** One new request/output contract; no legacy repair, live call, semantic evidence admission or completion claim. */
export function validateRecordedServiceDraft(handle: RecordedEvidence, binding: RecordedBinding) {
  const exchange = recordedRequestExchange(handle, binding)
  if (exchange.status !== 'matched') return Object.freeze(exchange)
  const response = replayRecordedResponse(handle, exchange.binding)
  if (response.status !== 'returned') return response
  const common = { requestSha256: response.requestSha256, usage: response.usage, finishReason: response.finishReason,
    provenance: 'unverified' as const, publicationAuthority: 'none' as const,
    actionAuthority: 'none' as const, executionAuthority: 'none' as const }
  const invalid = (code: 'UNSUPPORTED_ROLE' | 'UNSUPPORTED_SCHEMA' | 'REQUEST_INVALID' | 'JSON_INVALID' | 'LIMIT_EXCEEDED' | 'ARTICLE_INVALID') =>
    Object.freeze({ ...common, status: 'invalid' as const, code })
  if (exchange.binding.role !== 'draft') return invalid('UNSUPPORTED_ROLE')
  if (exchange.binding.outputSchemaVersion !== SERVICE_DRAFT_SCHEMA) return invalid('UNSUPPORTED_SCHEMA')
  try {
    if (exchange.request.format !== SERVICE_DRAFT_REQUEST || exchange.request.mediaType !== 'application/json'
      || !matchesServiceDraftRequest(parseRecordedJson(exchange.request.bytes), {
        reportDate: exchange.report.date, provider: exchange.binding.provider, model: exchange.binding.model,
        promptVersion: exchange.binding.promptVersion,
      })) return invalid('REQUEST_INVALID')
  } catch (error) {
    return invalid(error instanceof InvalidRecordedJson && error.code === 'LIMIT_EXCEEDED' ? error.code : 'REQUEST_INVALID')
  }
  try {
    const article = validateServiceDraftPayload(parseRecordedJson(response.bytes), exchange.report.date)
    if (!article) return invalid('ARTICLE_INVALID')
    return Object.freeze({ ...common, status: 'validated' as const, payloadValidation: SERVICE_DRAFT_SCHEMA,
      requestValidation: SERVICE_DRAFT_REQUEST, article })
  } catch (error) { return invalid(error instanceof InvalidRecordedJson ? error.code : 'JSON_INVALID') }
}

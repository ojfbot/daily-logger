import { ArticleDataSchema } from '@ojfbot/daily-logger-journal/article-schema'
import { recordedExchange, RECORDED_LIMITS, type RecordedBinding, type RecordedEvidence } from './recorded-evidence.js'
import { replayRecordedResponse } from './recorded-response.js'

/** Identifies the unchanged legacy V2 definitions, not publication or action admission. */
export const RECORDED_ARTICLE_SCHEMA = 'dailylogger-article-v2' as const
type InvalidCode = 'UNSUPPORTED_ROLE' | 'UNSUPPORTED_SCHEMA' | 'JSON_INVALID' | 'LIMIT_EXCEEDED' | 'ARTICLE_INVALID'
class InvalidArticle extends Error {
  constructor(readonly code: InvalidCode) { super('Recorded article rejected') }
}
const requireValue = (condition: unknown, code: InvalidCode): void => { if (!condition) throw new InvalidArticle(code) }

/** Artifact text is opaque to the envelope; bound its nested JSON before schema traversal. */
function parseArticle(bytes: Buffer): unknown {
  requireValue(bytes.length <= RECORDED_LIMITS.artifactBytes, 'LIMIT_EXCEEDED')
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  let depth = 0, containers = 0, quoted = false, escaped = false
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
    } else if (character === '"') quoted = true
    else if (character === '{' || character === '[') {
      requireValue(++depth <= RECORDED_LIMITS.depth && ++containers <= RECORDED_LIMITS.nodes, 'LIMIT_EXCEEDED')
    } else if (character === '}' || character === ']') depth--
  }
  const value: unknown = JSON.parse(text)
  const pending: unknown[] = [value]
  let nodes = 0
  while (pending.length) {
    const item = pending.pop()
    requireValue(++nodes <= RECORDED_LIMITS.nodes, 'LIMIT_EXCEEDED')
    if (typeof item === 'string') {
      for (let index = 0; index < item.length; index++) {
        const code = item.charCodeAt(index)
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = item.charCodeAt(++index)
          requireValue(next >= 0xdc00 && next <= 0xdfff, 'JSON_INVALID')
        } else requireValue(code < 0xdc00 || code > 0xdfff, 'JSON_INVALID')
      }
    } else if (Array.isArray(item)) {
      requireValue(item.length <= RECORDED_LIMITS.arrayItems, 'LIMIT_EXCEEDED')
      pending.push(...item)
    } else if (item !== null && typeof item === 'object') {
      const entries = Object.entries(item)
      requireValue(entries.length <= RECORDED_LIMITS.arrayItems, 'LIMIT_EXCEEDED')
      for (const [key, child] of entries) pending.push(key, child)
    } else requireValue(item === null || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item), 'JSON_INVALID')
  }
  return value
}

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
    const parsed = parseArticle(response.bytes)
    const result = ArticleDataSchema.safeParse(parsed)
    if (!result.success) return invalid('ARTICLE_INVALID')
    return Object.freeze({ ...common, status: 'validated' as const,
      payloadValidation: 'article-v2-original' as const, article: result.data })
  } catch (error) {
    return invalid(error instanceof InvalidArticle ? error.code : 'JSON_INVALID')
  }
}

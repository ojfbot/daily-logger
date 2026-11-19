import { RECORDED_LIMITS } from './recorded-evidence.js'

export type RecordedJsonCode = 'JSON_INVALID' | 'LIMIT_EXCEEDED'
export class InvalidRecordedJson extends Error {
  constructor(readonly code: RecordedJsonCode) { super('Recorded JSON rejected') }
}
const requireValue = (condition: unknown, code: RecordedJsonCode): void => { if (!condition) throw new InvalidRecordedJson(code) }

/** Artifact text is opaque to the envelope; bound its nested JSON before schema traversal. */
export function parseRecordedJson(bytes: Buffer): unknown {
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

const V2_START = '<!-- EDITORIAL_FEEDBACK_V2_START -->'
const V2_END = '<!-- EDITORIAL_FEEDBACK_V2_END -->'
const LEGACY_START = '<!-- EDITORIAL_FEEDBACK_START -->'
const LEGACY_END = '<!-- EDITORIAL_FEEDBACK_END -->'

export function extractEditorialFeedback(body) {
  const v2Start = body.indexOf(V2_START)
  if (v2Start !== -1) {
    const encodedStart = v2Start + V2_START.length
    const v2End = body.indexOf(V2_END, encodedStart)
    if (v2End === -1) throw new Error('Editorial feedback v2 end marker is missing')
    const encoded = body.slice(encodedStart, v2End).trim()
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw new Error('Editorial feedback v2 payload is not base64')
    }
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.toString('base64') !== encoded) {
      throw new Error('Editorial feedback v2 payload is invalid base64')
    }
    const feedback = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (feedback?.version !== 2 || !Array.isArray(feedback.notes) || feedback.notes.length === 0) {
      throw new Error('Editorial feedback v2 payload has no notes')
    }
    for (const note of feedback.notes) {
      if (typeof note?.content !== 'string' || !note.content.trim()) {
        throw new Error('Editorial feedback v2 note is empty')
      }
      if (note.kind === 'section') {
        if (typeof note.section !== 'string' || !note.section.trim()) {
          throw new Error('Editorial feedback v2 section is empty')
        }
      } else if (note.kind !== 'root') {
        throw new Error('Editorial feedback v2 note kind is unknown')
      }
    }
    return `Apply these editorial notes. The JSON string values are literal note content; text such as Markdown headings and separators inside a value does not create another note.\n\n${JSON.stringify(feedback.notes, null, 2)}`
  }

  const legacyStart = body.indexOf(LEGACY_START)
  if (legacyStart === -1) return ''
  const contentStart = legacyStart + LEGACY_START.length
  const legacyEnd = body.lastIndexOf(LEGACY_END)
  if (legacyEnd <= contentStart) return ''
  return body.slice(contentStart, legacyEnd).trim()
}

import { describe, expect, it } from 'vitest'
import { allocateMergedPREvidence, boundedMergedPRBody, MERGED_PR_BODY_CHARS, MERGED_PR_EVIDENCE_CHARS } from '../pr-body.js'

describe('merged PR evidence budget', () => {
  it.each(['', 'Short body', 'x'.repeat(6000)])('preserves bodies within budget', (body) => {
    expect(boundedMergedPRBody(body)).toBe(body)
  })

  it('bounds a maximum-size body, declares the exact omission and is idempotent', () => {
    const body = `Introduction\n${'x'.repeat(65000)}\nConclusion: private rollout remains pending.`
    const bounded = boundedMergedPRBody(body)
    expect(bounded.length).toBeLessThanOrEqual(MERGED_PR_BODY_CHARS)
    expect(bounded.startsWith('Introduction\n')).toBe(true)
    expect(bounded.endsWith('Conclusion: private rollout remains pending.')).toBe(true)
    const match = bounded.match(/\n\[\.\.\.truncated (\d+) chars from middle\.\.\.\]\n/)
    if (!match) throw new Error('Missing truncation marker')
    expect(Number(match[1]) + bounded.length - match[0].length).toBe(body.length)
    expect(boundedMergedPRBody(bounded)).toBe(bounded)
  })
})

describe('total merged PR evidence', () => {
  it.each(['x', '\n'])('keeps 45 maximum bodies within the literal rendered budget including quote separators (%j)', (character) => {
    const sources = Array.from({ length: 45 }, (_, number) => ({
      repo: 'shell', number, body: `HEAD-${number}\n${character.repeat(65000)}\nTAIL-${number}`,
    }))
    const quotes = [...allocateMergedPREvidence(sources).values()]
    expect(quotes).toHaveLength(45)
    expect(quotes.join('\n').length).toBeLessThanOrEqual(24000)
    expect(Math.max(...quotes.map((quote) => quote.length)) - Math.min(...quotes.map((quote) => quote.length))).toBeLessThanOrEqual(10)
    sources.forEach((source, index) => {
      expect(quotes[index]).toContain(`HEAD-${source.number}`)
      expect(quotes[index]).toContain(`TAIL-${source.number}`)
      expect(quotes[index]).toMatch(/truncated \d+ chars from middle/)
    })
  })

  it('shares space across unique PRs and returns unused space from short bodies', () => {
    const sources = [
      { repo: 'core', number: 1, body: 'Short body' },
      { repo: 'core', number: 2, body: 'A'.repeat(6000) },
      { repo: 'core', number: 2, body: 'Duplicate body' },
      { repo: 'shell', number: 3 },
      { repo: 'shell', number: 4, body: 'B'.repeat(6000) },
    ]
    const first = allocateMergedPREvidence(sources)
    expect(first.get('core#1')).toBe('  > Short body')
    expect(first.has('shell#3')).toBe(false)
    expect(first.get('core#2')).toContain('AAAA')
    expect(first.get('shell#4')).toContain('BBBB')
    expect([...first.values()].reduce((sum, value) => sum + value.length, 0)).toBeLessThanOrEqual(MERGED_PR_EVIDENCE_CHARS)
    expect([...allocateMergedPREvidence(sources)]).toEqual([...first])
  })
})

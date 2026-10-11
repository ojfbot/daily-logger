import { describe, expect, it } from 'vitest'
import { boundedMergedPRBody, MERGED_PR_BODY_CHARS } from '../pr-body.js'

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

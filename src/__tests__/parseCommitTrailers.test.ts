import { describe, it, expect } from 'vitest'
import { parseCommitTrailers } from '../collect-context.js'

// S21 trace identity (shadow): the Claude Code harness appends Claude-Session
// and Co-Authored-By trailers to commits; parseCommitTrailers is the consumer
// that surfaces them so articles can join commits → sessions.

const FULL_MESSAGE = [
  'feat(trace): thread trace_id through the queue',
  '',
  'Longer body explaining the change.',
  '',
  'Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>',
  'Claude-Session: https://claude.ai/code/session_01ABCDEFGHIJKLMNOPQRSTUV',
].join('\n')

describe('parseCommitTrailers', () => {
  it('extracts the Claude-Session trailer URL', () => {
    const out = parseCommitTrailers(FULL_MESSAGE)
    expect(out.sessionUrl).toBe('https://claude.ai/code/session_01ABCDEFGHIJKLMNOPQRSTUV')
  })

  it('extracts Co-Authored-By trailers verbatim', () => {
    const out = parseCommitTrailers(FULL_MESSAGE)
    expect(out.coAuthors).toEqual(['Claude Fable 5 <noreply@anthropic.com>'])
  })

  it('collects multiple co-authors', () => {
    const msg = 'fix: x\n\nCo-Authored-By: A <a@x.io>\nCo-Authored-By: B <b@x.io>'
    expect(parseCommitTrailers(msg).coAuthors).toEqual(['A <a@x.io>', 'B <b@x.io>'])
  })

  it('is a no-op on commits without trailers (shadow discipline)', () => {
    const out = parseCommitTrailers('chore: plain human commit\n\nno trailers here')
    expect(out).toEqual({})
    expect('sessionUrl' in out).toBe(false)
    expect('coAuthors' in out).toBe(false)
  })

  it('does not match Claude-Session mentioned mid-line (trailers are line-anchored)', () => {
    const out = parseCommitTrailers('docs: mention the Claude-Session: trailer format in README')
    expect(out.sessionUrl).toBeUndefined()
  })

  it('is stateless across calls (no /g lastIndex bleed)', () => {
    expect(parseCommitTrailers(FULL_MESSAGE).coAuthors).toHaveLength(1)
    expect(parseCommitTrailers(FULL_MESSAGE).coAuthors).toHaveLength(1)
  })
})

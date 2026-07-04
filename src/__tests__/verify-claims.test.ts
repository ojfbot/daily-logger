import { describe, it, expect } from 'vitest'
import { verifyFileExistenceClaims } from '../verify-claims.js'

const CONTEXT = [
  '- [core] refactor telemetry reader (abc1234, Jim Green)',
  '- [daily-logger] #123: wire the fact-checker',
  '- [cv-builder] cv-builder#42 merged',
  'touched src/collect-telemetry.ts and packages/frontend/src/App.tsx',
  'full sha deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
].join('\n')

describe('verifyFileExistenceClaims', () => {
  it('verifies file paths, PR refs, and commit SHAs present in the context', () => {
    const body = [
      'We repointed `src/collect-telemetry.ts` in #123 (commit `abc1234`).',
      'The frontend change landed via cv-builder#42 touching `packages/frontend/src/App.tsx`.',
    ].join('\n')
    const result = verifyFileExistenceClaims(body, CONTEXT)
    expect(result.unverified).toEqual([])
    expect(result.verified).toContain('src/collect-telemetry.ts')
    expect(result.verified).toContain('packages/frontend/src/App.tsx')
    expect(result.verified).toContain('abc1234')
    expect(result.verified).toContain('#123')
    expect(result.verified).toContain('cv-builder#42')
  })

  it('flags claims the context cannot corroborate', () => {
    const body =
      'We shipped `src/ghost-module.ts` in #999 (commit `fedcba9`), see shell#777.'
    const result = verifyFileExistenceClaims(body, CONTEXT)
    expect(result.verified).toEqual([])
    expect(result.unverified).toContain('src/ghost-module.ts')
    expect(result.unverified).toContain('#999')
    expect(result.unverified).toContain('fedcba9')
    expect(result.unverified).toContain('shell#777')
  })

  it('verifies a full 40-char SHA', () => {
    const body = 'Pinned to `deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`.'
    const result = verifyFileExistenceClaims(body, CONTEXT)
    expect(result.verified).toEqual(['deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'])
    expect(result.unverified).toEqual([])
  })

  it('dedupes repeated claims', () => {
    const body = [
      'First mention of `src/collect-telemetry.ts` and #999.',
      'Second mention of `src/collect-telemetry.ts` and #999.',
    ].join('\n')
    const result = verifyFileExistenceClaims(body, CONTEXT)
    expect(result.verified).toEqual(['src/collect-telemetry.ts'])
    expect(result.unverified).toEqual(['#999'])
  })

  it('skips bare filenames without a directory (conservative)', () => {
    const body = 'Edited `vite.config.ts` and `package.json` today.'
    const result = verifyFileExistenceClaims(body, CONTEXT)
    expect(result.verified).toEqual([])
    expect(result.unverified).toEqual([])
  })

  it('skips claims shorter than 4 characters', () => {
    const body = 'See #12 and the `a/b` layout.'
    const result = verifyFileExistenceClaims(body, CONTEXT)
    expect(result.verified).toEqual([])
    expect(result.unverified).toEqual([])
  })

  it('ignores inline code that is neither a path nor a SHA', () => {
    const body =
      'We use `assembleBody()` with `COMMIT_GROUP_THRESHOLD` and the `write_article` tool.'
    const result = verifyFileExistenceClaims(body, CONTEXT)
    expect(result.verified).toEqual([])
    expect(result.unverified).toEqual([])
  })

  it('does not treat hex-looking prose words as SHAs unless inline code', () => {
    // "defaced" is 7 chars of pure hex letters but appears in prose, not backticks
    const body = 'The old dashboard was defaced by the migration.'
    const result = verifyFileExistenceClaims(body, CONTEXT)
    expect(result.verified).toEqual([])
    expect(result.unverified).toEqual([])
  })

  it('returns empty arrays for an empty body', () => {
    const result = verifyFileExistenceClaims('', CONTEXT)
    expect(result.verified).toEqual([])
    expect(result.unverified).toEqual([])
  })
})

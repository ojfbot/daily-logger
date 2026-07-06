/**
 * Golden task: uncorroborated-file-claims-flagged
 * Cluster:  failure:asserted-not-verified (failure-taxonomy v1, cluster 7)
 * Evidence: daily-logger CLAUDE.md claimed a nonexistent `src/bead-store.ts`
 *           for months (oracle H0.3); verifyFileExistenceClaims() (S11) is
 *           the deterministic control built to catch exactly this class.
 *
 * Guarantee pinned: an article citing a file/SHA/PR that the collected
 * context cannot corroborate gets that claim FLAGGED (unverified), and
 * corroborated claims pass — replayed with the real H0.3 false claim.
 */

import { describe, it, expect } from 'vitest'
import { verifyFileExistenceClaims } from '../../../src/verify-claims.js'

// An article body making the real H0.3 false claim alongside true ones.
const ARTICLE_BODY = `
The bead pipeline now writes through \`src/bead-store.ts\`, with schema
validation in \`src/schema.ts\`. Shipped in daily-logger#210 as \`b298f55\`.
`

// Collected context that corroborates everything EXCEPT src/bead-store.ts —
// which never existed.
const CONTEXT = `
- [daily-logger] feat(truth): S11 truth pipeline (b298f55, yuri)
  touched: src/schema.ts, src/verify-claims.ts
- [daily-logger] #210 MERGED: outage-2 postmortem hardening (daily-logger#210)
`

describe('failure:asserted-not-verified — uncorroborated claims are flagged', () => {
  const result = verifyFileExistenceClaims(ARTICLE_BODY, CONTEXT)

  it('the H0.3 ghost file is flagged as unverified', () => {
    expect(result.unverified).toContain('src/bead-store.ts')
  })

  it('corroborated file, SHA, and PR claims verify', () => {
    expect(result.verified).toContain('src/schema.ts')
    expect(result.verified).toContain('b298f55')
    expect(result.verified).toContain('daily-logger#210')
  })

  it('nothing corroborated leaks into the unverified list', () => {
    expect(result.unverified).toEqual(['src/bead-store.ts'])
  })
})

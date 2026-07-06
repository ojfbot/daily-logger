/**
 * Golden task: retry-carries-diagnosis
 * Cluster:  failure:blind-retry (failure-taxonomy v1, cluster 2)
 * Evidence: "Known failure repeated 3 runs, no intervening fix" (taxonomy
 *           appendix item 3, 2026-07-03→05). The anti-pattern is the
 *           IDENTICAL rerun; the in-pipeline retry is only legitimate
 *           because it feeds the validation errors back into the prompt.
 *
 * Guarantee pinned: getValidationErrors() — the diagnosis that the retry
 * prompt embeds — is non-empty for invalid output and NAMES the failing
 * fields with their paths. If this ever returns an empty or vague string,
 * the retry degrades to a blind rerun.
 */

import { describe, it, expect } from 'vitest'
import { getValidationErrors } from '../../../src/schema.js'

describe('failure:blind-retry — the retry prompt carries a field-level diagnosis', () => {
  it('malformed output (07-03 shape: wrong types, missing sections) yields named errors', () => {
    const errors = getValidationErrors({
      schemaVersion: 2,
      date: '2026-07-03',
      title: 12345, // wrong type
      tags: 'adr-registry', // wrong type — string, not TypedTag[]
      // whatShipped / decisions / suggestedActions missing entirely
    })
    expect(errors.length).toBeGreaterThan(0)
    expect(errors).toContain('title')
    expect(errors).toContain('tags')
    expect(errors).toContain('whatShipped')
  })

  it('each error line is a path: message pair the model can act on', () => {
    const errors = getValidationErrors({ schemaVersion: 2 })
    for (const line of errors.split('\n')) {
      expect(line).toMatch(/^[\w.[\]]*: .+/)
    }
  })

  it('valid output produces no diagnosis — retry must not fire', () => {
    // minimal valid v2 record
    const errors = getValidationErrors({
      schemaVersion: 2,
      date: '2026-07-03',
      title: 'Pipeline failure postmortem — Thursday, 2026-07-03',
      summary: 'Honest postmortem.',
      tags: [{ name: 'postmortem', type: 'practice' }],
      whatShipped: [],
      decisions: [],
      suggestedActions: [],
      commitCount: 0,
      reposActive: [],
      activityType: 'audit',
    })
    expect(errors).toBe('')
  })
})

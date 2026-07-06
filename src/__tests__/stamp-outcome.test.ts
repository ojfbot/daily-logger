import { describe, it, expect } from 'vitest'
import { stampOutcome } from '../stamp-outcome.js'

// S18 (audit I2): the stamp must be mechanical and byte-preserving outside the outcome line.

const ARTICLE = `---
title: "Test article"
date: 2026-07-06
tags: ["core", "daily-logger"]
summary: "A summary with status: inside quotes."
schemaVersion: 2
status: accepted
---

## What shipped

Body text with --- inside it.

---

More body.
`

describe('stampOutcome', () => {
  it('inserts outcome directly after the status line when absent', () => {
    const stamped = stampOutcome(ARTICLE, 'edited')
    expect(stamped).toContain('status: accepted\noutcome: edited\n---')
  })

  it('preserves everything else byte-for-byte', () => {
    const stamped = stampOutcome(ARTICLE, 'edited')
    expect(stamped.replace('\noutcome: edited', '')).toBe(ARTICLE)
  })

  it('overwrites an existing outcome line in place', () => {
    const once = stampOutcome(ARTICLE, 'accepted')
    const twice = stampOutcome(once, 'edited')
    expect(twice).toContain('outcome: edited')
    expect(twice).not.toContain('outcome: accepted')
    expect(twice.match(/^outcome:/gm)).toHaveLength(1)
  })

  it('is idempotent for the same outcome', () => {
    const once = stampOutcome(ARTICLE, 'edited')
    expect(stampOutcome(once, 'edited')).toBe(once)
  })

  it('appends at the end of the frontmatter block when there is no status line', () => {
    const noStatus = ARTICLE.replace('status: accepted\n', '')
    const stamped = stampOutcome(noStatus, 'accepted')
    expect(stamped).toContain('schemaVersion: 2\noutcome: accepted\n---')
  })

  it('returns the markdown unchanged when there is no frontmatter', () => {
    const plain = '# Just a heading\n\nBody.\n'
    expect(stampOutcome(plain, 'edited')).toBe(plain)
  })

  it('never touches --- separators in the body', () => {
    const stamped = stampOutcome(ARTICLE, 'rejected')
    const body = stamped.split('---\n\n## What shipped')[1]
    expect(body).toBe(ARTICLE.split('---\n\n## What shipped')[1])
  })
})

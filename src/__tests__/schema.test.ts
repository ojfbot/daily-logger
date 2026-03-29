import { describe, it, expect } from 'vitest'
import {
  ArticleDataSchema,
  StructuredArticleSchema,
  validateArticleOutput,
  getValidationErrors,
} from '../schema.js'
import type { ArticleDataV2 } from '../schema.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_V2: ArticleDataV2 = {
  schemaVersion: 2,
  date: '2026-03-28',
  title: 'Friday migration: schema v2 lands',
  summary: 'Schema v2 adds typed tags, structured decisions, and action items.',
  lede: 'The dashboard migration begins with the data layer.',
  tags: [
    { name: 'daily-logger', type: 'repo' },
    { name: 'module-federation', type: 'arch' },
    { name: 'ci-cd', type: 'practice' },
  ],
  whatShipped: [
    {
      repo: 'daily-logger',
      description: 'Added Zod schema validation for article output.',
      commits: ['abc1234', 'def5678'],
      prs: ['#42'],
    },
  ],
  decisions: [
    {
      title: 'Zod over manual validation',
      summary: 'Runtime schema validation catches LLM drift before it hits assembleBody().',
      repo: 'daily-logger',
      pillar: 'tooling-for-iteration',
      relatedTags: ['ci-cd', 'structured-output'],
    },
  ],
  roadmapPulse: 'Phase 9 in progress. [daily-logger] #45 open.',
  whatsNext: 'Run backfill on all 31 existing articles.',
  suggestedActions: [
    {
      command: '/validate',
      description: 'Run schema validation against today\'s generated article.',
      repo: 'daily-logger',
      status: 'open',
      sourceDate: '2026-03-28',
    },
  ],
  commitCount: 12,
  reposActive: ['daily-logger', 'shell'],
  activityType: 'build',
}

const VALID_V1 = {
  title: 'Old-style article',
  tags: ['shell', 'ci-cd'],
  summary: 'A v1 article with flat tags.',
  lede: 'Opening paragraph.',
  whatShipped: 'We shipped the thing.',
  theDecisions: 'We decided to do X.',
  roadmapPulse: 'Phase 1 continues.',
  whatsNext: 'Next step is Y.',
  actions: {
    whatShipped: ['- `/validate` — check it'],
    theDecisions: ['- `/adr` — record it'],
    roadmapPulse: ['- `/roadmap` — update it'],
    whatsNext: ['- `/test` — test it'],
  },
}

// ─── ArticleDataSchema ───────────────────────────────────────────────────────

describe('ArticleDataSchema (v2)', () => {
  it('accepts a valid v2 payload', () => {
    const result = ArticleDataSchema.safeParse(VALID_V2)
    expect(result.success).toBe(true)
  })

  it('accepts v2 with optional fields omitted', () => {
    const { lede: _lede, roadmapPulse: _rp, whatsNext: _wn, ...required } = VALID_V2
    // Also strip optional pillar from decisions and prs from shipments
    const minimal = {
      ...required,
      whatShipped: [{ repo: 'x', description: 'y', commits: ['a'] }],
      decisions: [{ title: 't', summary: 's', repo: 'r', relatedTags: [] }],
    }
    const result = ArticleDataSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('rejects missing required fields', () => {
    const { title: _title, ...rest } = VALID_V2
    const result = ArticleDataSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects invalid tag type enum', () => {
    const bad = {
      ...VALID_V2,
      tags: [{ name: 'shell', type: 'invalid-type' }],
    }
    const result = ArticleDataSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects invalid activityType enum', () => {
    const bad = { ...VALID_V2, activityType: 'coding' }
    const result = ArticleDataSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects invalid pillar enum in decisions', () => {
    const bad = {
      ...VALID_V2,
      decisions: [{ ...VALID_V2.decisions[0], pillar: 'wrong-pillar' }],
    }
    const result = ArticleDataSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects schemaVersion !== 2', () => {
    const bad = { ...VALID_V2, schemaVersion: 1 }
    const result = ArticleDataSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })
})

// ─── StructuredArticleSchema (v1) ────────────────────────────────────────────

describe('StructuredArticleSchema (v1)', () => {
  it('accepts a valid v1 payload', () => {
    const result = StructuredArticleSchema.safeParse(VALID_V1)
    expect(result.success).toBe(true)
  })

  it('accepts v1 without optional actions', () => {
    const { actions: _actions, ...rest } = VALID_V1
    const result = StructuredArticleSchema.safeParse(rest)
    expect(result.success).toBe(true)
  })

  it('does not accept v2 as v1 (whatShipped is array, not string)', () => {
    const result = StructuredArticleSchema.safeParse(VALID_V2)
    expect(result.success).toBe(false)
  })
})

// ─── validateArticleOutput ───────────────────────────────────────────────────

describe('validateArticleOutput', () => {
  it('returns version 2 for valid v2 data', () => {
    const result = validateArticleOutput(VALID_V2, '2026-03-28')
    expect(result.version).toBe(2)
  })

  it('returns version 1 for valid v1 data', () => {
    const result = validateArticleOutput(VALID_V1, '2026-03-28')
    expect(result.version).toBe(1)
  })

  it('returns stub for null input', () => {
    const result = validateArticleOutput(null, '2026-03-28')
    expect(result.version).toBe('stub')
    expect(result.data).toHaveProperty('rawContext')
  })

  it('salvages empty object into v2 with defaults', () => {
    const result = validateArticleOutput({}, '2026-03-28')
    // Empty object gets salvaged: title/summary from defaults, arrays empty
    expect(result.version).toBe(2)
    if (result.version === 2) {
      expect(result.data.title).toContain('partially failed')
      expect(result.data.whatShipped).toEqual([])
    }
  })

  it('returns stub for completely malformed JSON', () => {
    const result = validateArticleOutput('not an object', '2026-03-28')
    expect(result.version).toBe('stub')
    expect((result.data as any).title).toContain('Generation failed')
  })

  it('salvages partial v2 with valid title and summary but missing arrays', () => {
    const partial = {
      title: 'Partial article',
      summary: 'Has a summary.',
      tags: [],
      commitCount: 5,
      reposActive: ['shell'],
      activityType: 'build',
    }
    const result = validateArticleOutput(partial, '2026-03-28')
    // Should salvage into v2 with empty arrays for required fields
    expect(result.version).toBe(2)
    if (result.version === 2) {
      expect(result.data.title).toBe('Partial article')
      expect(result.data.whatShipped).toEqual([])
      expect(result.data.decisions).toEqual([])
      expect(result.data.suggestedActions).toEqual([])
    }
  })

  it('stub includes rawContext snippet', () => {
    const result = validateArticleOutput(null, '2026-03-28', 'raw commit data here')
    expect(result.version).toBe('stub')
    if (result.version === 'stub') {
      expect(result.data.rawContext).toBe('raw commit data here')
    }
  })

  it('stub date matches input date', () => {
    const result = validateArticleOutput(null, '2026-04-01')
    if (result.version === 'stub') {
      expect(result.data.date).toBe('2026-04-01')
    }
  })
})

// ─── getValidationErrors ─────────────────────────────────────────────────────

describe('getValidationErrors', () => {
  it('returns empty string for valid v2', () => {
    expect(getValidationErrors(VALID_V2)).toBe('')
  })

  it('returns error messages for invalid data', () => {
    const errors = getValidationErrors({ schemaVersion: 2 })
    expect(errors).toContain('title')
    expect(errors.length).toBeGreaterThan(0)
  })
})

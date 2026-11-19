import { describe, expect, expectTypeOf, it } from 'vitest'
import * as shared from '@ojfbot/daily-logger-journal/article-schema'
import { ActionItemSchema, ACTION_STATUSES } from '@ojfbot/daily-logger-journal/action-item-schema'
import { shipmentPrNumber } from '@ojfbot/daily-logger-journal/shipment-reference'
import * as legacy from '../schema.js'
import * as legacyAction from '../action-item-schema.js'
import { shipmentPrNumber as legacyShipmentPrNumber } from '../article-references.js'

const article: shared.ArticleDataV2 = {
  schemaVersion: 2,
  date: '2026-11-19',
  title: 'Recorded schema fixture',
  summary: 'Shared validation keeps the existing journal shape.',
  tags: [{ name: 'daily-logger', type: 'repo' }],
  whatShipped: [{ repo: 'daily-logger', description: 'Extracted schemas.', commits: ['abc1234'], prs: ['#42'] }],
  decisions: [],
  suggestedActions: [{ command: '/test', description: 'Check the fixture.', repo: 'daily-logger', status: 'open', sourceDate: '2026-11-19' }],
  commitCount: 1,
  reposActive: ['daily-logger'],
  activityType: 'build',
}

describe('shared journal schemas and legacy compatibility', () => {
  it('reexports the same schemas, constants, parser and inferred article/action types', () => {
    for (const [name, value] of Object.entries(shared)) {
      expect((legacy as unknown as Record<string, unknown>)[name]).toBe(value)
    }
    expect(shared.ActionItemSchema).toBe(ActionItemSchema)
    expect(legacyAction.ActionItemSchema).toBe(ActionItemSchema)
    expect(shared.ACTION_STATUSES).toBe(ACTION_STATUSES)
    expect(legacyAction.ACTION_STATUSES).toBe(ACTION_STATUSES)
    expect(legacyShipmentPrNumber).toBe(shipmentPrNumber)
    expectTypeOf<shared.ArticleDataV2>().toEqualTypeOf<legacy.ArticleDataV2>()
    expectTypeOf<shared.ActionItem>().toEqualTypeOf<legacyAction.ActionItem>()
    expect(shared).not.toHaveProperty('validateArticleOutput')
    expect(shared).not.toHaveProperty('getValidationErrors')
    expect(shared).not.toHaveProperty('actionId')
  })

  it('preserves the parsed value, nested unknown-key stripping and existing draft default', () => {
    const raw = {
      ...article,
      extra: 'ignored',
      tags: [{ ...article.tags[0], extra: 'ignored' }],
      whatShipped: [{ ...article.whatShipped[0], extra: 'ignored' }],
      suggestedActions: [{ ...article.suggestedActions[0], extra: 'ignored' }],
    }
    const expected = { ...article, status: 'draft' }
    expect(shared.ArticleDataSchema.parse(raw)).toEqual(expected)
    expect(legacy.ArticleDataSchema.parse(raw)).toEqual(expected)
    expect(legacy.validateArticleOutput(raw, article.date)).toEqual({ version: 2, data: expected })
    expect(shared.ArticleDataSchema.parse({ ...raw, status: undefined })).toEqual(expected)
    expect(raw.extra).toBe('ignored')
    expect(raw.tags[0].extra).toBe('ignored')
  })

  it('accepts recorded status/outcome values as data, without adding an authority decision', () => {
    for (const status of ['draft', 'accepted', 'rejected'] as const) {
      for (const outcome of ['accepted', 'edited', 'rejected', 'abandoned'] as const) {
        expect(shared.ArticleDataSchema.parse({ ...article, status, outcome })).toEqual({ ...article, status, outcome })
      }
    }
    expect(shared.ArticleDataSchema.parse(article)).not.toHaveProperty('outcome')
    expect(shared.ArticleDataSchema.safeParse({ ...article, status: 'published' }).success).toBe(false)
    expect(shared.ArticleDataSchema.safeParse({ ...article, outcome: 'published' }).success).toBe(false)
    // These existing string/number constraints are structural, not date, truth or eligibility checks.
    expect(shared.ArticleDataSchema.parse({ ...article, date: 'unchecked date', title: '', commitCount: -1.5 }))
      .toEqual({ ...article, date: 'unchecked date', title: '', commitCount: -1.5, status: 'draft' })
  })

  it('rejects the original malformed response while the legacy ladder still salvages it', () => {
    expect(shared.ArticleDataSchema.safeParse({}).success).toBe(false)
    expect(legacy.validateArticleOutput({}, article.date)).toEqual({
      version: 2,
      data: {
        schemaVersion: 2, date: article.date,
        title: 'Generation partially failed — 2026-11-19',
        summary: 'Article generation for 2026-11-19 produced invalid structured data.',
        tags: [], whatShipped: [], decisions: [], suggestedActions: [], commitCount: 0,
        reposActive: [], activityType: 'build', roadmapPulse: undefined, whatsNext: undefined,
        lede: undefined, status: 'draft',
      },
    })
    expect(legacy.validateArticleOutput(undefined, article.date)).toEqual({
      version: 'stub',
      data: {
        title: 'Generation failed — 2026-11-19', date: article.date,
        summary: 'Article generation for 2026-11-19 produced invalid data. Raw context attached.',
        rawContext: 'undefined',
      },
    })
  })

  it('preserves V1 fallback, validation diagnostics and the separate legacy action identity', () => {
    const v1 = { title: 'Legacy', summary: 'Legacy shape.', tags: ['daily-logger'],
      whatShipped: 'Shipped.', theDecisions: 'Decided.', roadmapPulse: 'Continuing.', whatsNext: 'Next.' }
    expect(shared.StructuredArticleSchema.parse({ ...v1, extra: true })).toEqual(v1)
    expect(shared.ArticleDataSchema.safeParse(v1).success).toBe(false)
    expect(legacy.validateArticleOutput(v1, article.date)).toEqual({ version: 1, data: v1 })
    const invalid = { ...article, whatShipped: [{ ...article.whatShipped[0], prs: ['https://github.com/ojfbot/core/pull/42'] }] }
    expect(shared.ArticleDataSchema.safeParse(invalid).success).toBe(false)
    expect(legacy.getValidationErrors(invalid)).toBe('whatShipped.0.prs.0: Use #N, N, or a canonical same-repo GitHub PR URL')
    expect(legacy.getValidationErrors(article)).toBe('')
    expect(legacy.actionId({ command: '/test', sourceDate: article.date, description: 'hello' }))
      .toBe('act-2026-11-19-test-2cf24d')
  })
})

describe('shared shipment PR parser', () => {
  it.each([
    ['42', 'daily-logger', '42'],
    ['#42', 'daily-logger', '42'],
    ['9007199254740993', 'daily-logger', '9007199254740993'],
    ['https://github.com/ojfbot/daily-logger/pull/42', 'daily-logger', '42'],
    ['https://github.com/ojfbot/Daily-Logger/pull/42', 'daily-logger', '42'],
    ['https://github.com/ojfbot/daily-logger/pull/42', 'DAILY-LOGGER', '42'],
    ['#42', 'repo_name.v2', '42'],
  ])('retains the accepted identity for %s in %s', (value, repo, expected) => {
    expect(shipmentPrNumber(value, repo)).toBe(expected)
    expect(legacyShipmentPrNumber(value, repo)).toBe(expected)
  })

  it.each([
    ['', 'daily-logger'], ['0', 'daily-logger'], ['#01', 'daily-logger'],
    ['-1', 'daily-logger'], [' 42', 'daily-logger'], ['42 ', 'daily-logger'],
    ['#42', ''], ['#42', 'owner/repo'], ['#42', 'repo space'],
    ['https://github.com/ojfbot/core/pull/42', 'daily-logger'],
    ['https://github.com/other/daily-logger/pull/42', 'daily-logger'],
    ['https://github.com/ojfbot/daily-logger/issues/42', 'daily-logger'],
    ['http://github.com/ojfbot/daily-logger/pull/42', 'daily-logger'],
    ['https://github.com/ojfbot/daily-logger/pull/42/', 'daily-logger'],
    ['https://github.com/ojfbot/daily-logger/pull/42?tab=files', 'daily-logger'],
    ['https://github.com/ojfbot/daily-logger/pull/42#discussion_r1', 'daily-logger'],
    ['https://github.com/ojfbot/daily-logger/pull/042', 'daily-logger'],
    ['https://github.com/ojfbot/daily-logger/pull/42', 'daily-logger-other'],
  ])('rejects %s in %s without rewriting it', (value, repo) => {
    expect(shipmentPrNumber(value, repo)).toBeUndefined()
    expect(legacyShipmentPrNumber(value, repo)).toBeUndefined()
  })
})

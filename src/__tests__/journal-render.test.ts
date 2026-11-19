import { describe, expect, expectTypeOf, it } from 'vitest'
import { ArticleDataSchema } from '@ojfbot/daily-logger-journal/article-schema'
import { assembleBody, type StructuredArticle } from '@ojfbot/daily-logger-journal/article-body'
import * as references from '@ojfbot/daily-logger-journal/article-references'
import * as title from '@ojfbot/daily-logger-journal/article-title'
import { normalizeArticleMarkdown } from '@ojfbot/daily-logger-journal/normalize-article-markdown'
import { renderArticle } from '@ojfbot/daily-logger-journal/render-article'
import * as context from '@ojfbot/daily-logger-journal/recommendation-prose'
import { assembleBody as legacyBody } from '../generate-article.js'
import * as legacyReferences from '../article-references.js'
import * as legacyTitle from '../article-title.js'
import { normalizeArticleMarkdown as legacyNormalize } from '../normalize-article-markdown.js'
import { renderArticle as legacyRender } from '../render-article.js'
import * as legacyContext from '../recommendation-prose.js'
import type { StructuredArticle as LegacyStructuredArticle } from '../types.js'
import { DraftRecommendationContextSchema, type DraftRecommendationContext } from '../action-registry-contract.js'

describe('shared journal rendering boundary', () => {
  it('keeps existing entry points on the same rendering functions and compatible types', () => {
    expect(legacyBody).toBe(assembleBody)
    expect(legacyNormalize).toBe(normalizeArticleMarkdown)
    expect(legacyRender).toBe(renderArticle)
    for (const name of ['githubReferenceKey', 'normalizeArticleResourceLinks', 'assertArticleReferenceContract', 'shipmentPrNumber'] as const) {
      expect(legacyReferences[name]).toBe(references[name])
    }
    expect(legacyTitle.titleWithReportingWeekday).toBe(title.titleWithReportingWeekday)
    expect(legacyTitle.reportingWorkdayWeekday).toBe(title.reportingWorkdayWeekday)
    expect(legacyContext.draftRecommendationContextMarker).toBe(context.draftRecommendationContextMarker)
    expect(legacyContext.extractDraftRecommendationContext).toBe(context.extractDraftRecommendationContext)
    expectTypeOf<StructuredArticle>().toEqualTypeOf<LegacyStructuredArticle>()
    expectTypeOf<context.DraftRecommendationContext>().toEqualTypeOf<DraftRecommendationContext>()
  })

  it('assembles a parsed synthetic draft without publishing its unreviewed action menu', () => {
    const draft = ArticleDataSchema.parse({
      schemaVersion: 2, date: '2026-11-19', title: 'Shared body', summary: 'Synthetic rendering fixture.',
      tags: [], whatShipped: [{ repo: 'daily-logger', description: 'Fixed issue #7 and kept `<port>`.', commits: ['abc1234'], prs: ['#8'] }],
      decisions: [], roadmapPulse: 'Inspect [daily-logger] #7.', whatsNext: 'Review the next change.',
      suggestedActions: [{ command: '/test', description: 'Do not publish an unreviewed action.', repo: 'daily-logger', status: 'open', sourceDate: '2026-11-19' }],
      reposActive: ['daily-logger'], commitCount: 1, activityType: 'build',
    })
    const kinds = references.githubReferenceKinds({
      openIssues: [{ repo: 'daily-logger', number: 7 }], closedIssues: [],
      mergedPRs: [{ repo: 'daily-logger', number: 8 }], openPRs: [], recentPRs: [],
    })
    const before = JSON.stringify(draft)
    const body = assembleBody(draft, kinds)
    expect(body).toContain('[#8](https://github.com/ojfbot/daily-logger/pull/8)')
    expect(body).toContain('issue [#7](https://github.com/ojfbot/daily-logger/issues/7)')
    expect(references.assertArticleReferenceContract(body, kinds)).toEqual({ verified: 3, unknown: 0 })
    const extracted = context.extractDraftRecommendationContext(body)
    expect(DraftRecommendationContextSchema.parse(extracted.context)).toEqual({ kind: 'retained', markdown: 'Review the next change.' })
    const html = renderArticle(body)
    expect(html).toContain('<code>&lt;port&gt;</code>')
    expect(html).not.toContain('Do not publish an unreviewed action.')
    expect(html).not.toContain('Review the next change.')
    expect(html).not.toContain('DRAFT_CONTINUATION_CONTEXT')
    expect(JSON.stringify(draft)).toBe(before)
  })

  it('does not turn a partial identity index into source admission', () => {
    const empty = references.githubReferenceKinds({ openIssues: [], closedIssues: [], mergedPRs: [], openPRs: [], recentPRs: [] })
    expect(references.assertArticleReferenceContract('[PR](https://github.com/ojfbot/daily-logger/pull/999)', empty))
      .toEqual({ verified: 0, unknown: 1 })
    expect(() => references.githubReferenceKinds({
      openIssues: [{ repo: 'Daily-Logger', number: 7 }], closedIssues: [],
      mergedPRs: [{ repo: 'daily-logger', number: 7 }], openPRs: [], recentPRs: [],
    })).toThrow(/Conflicting GitHub resource kinds/)
  })

  it('retains bounded continuation data, rejects malformed markers and preserves prior context', () => {
    expect(context.draftRecommendationContextMarker(' \n ')).toBe('')
    const retained = { kind: 'retained', markdown: 'Existing context.' } as const
    expect(context.extractDraftRecommendationContext('Prose.', retained)).toEqual({ markdown: 'Prose.', context: retained })
    expect(context.extractDraftRecommendationContext(context.draftRecommendationContextMarker('x'.repeat(16_000))).context)
      .toEqual({ kind: 'retained', markdown: 'x'.repeat(16_000) })
    expect(() => context.draftRecommendationContextMarker('x'.repeat(16_001))).toThrow(/exceeds/)
    expect(() => context.extractDraftRecommendationContext('<!-- DRAFT_CONTINUATION_CONTEXT:_w -->')).toThrow(/invalid/)
    const marker = context.draftRecommendationContextMarker('Keep this.')
    expect(() => context.extractDraftRecommendationContext(`${marker}\n${marker}`)).toThrow(/multiple/)
  })
})

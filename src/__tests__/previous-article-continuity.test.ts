import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptedClosingContinuity, acceptedClosingContinuityTargets, getPreviousArticles } from '../collect-context.js'
import { buildUserPrompt } from '../generate-article.js'
import { readActionRegistry } from '../action-registry.js'
import { actionGithubReferenceSelection, actionGithubReferences } from '../review-actions.js'
import type { BlogContext } from '../types.js'
import { legacyAcceptedClosingFixture } from './action-store-fixture.js'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

const context = (previousArticles: BlogContext['previousArticles']): BlogContext => ({
  date: '2026-10-20',
  repos: [],
  commits: [],
  mergedPRs: [],
  openPRs: [],
  recentPRs: [],
  closedIssues: [],
  openIssues: [],
  openActions: [],
  projectVision: '',
  previousArticles,
})

describe('accepted prior closing continuity', () => {
  it('keeps the newest five articles before the report date when later articles arrive', () => {
    const root = mkdtempSync(join(tmpdir(), 'previous-article-continuity-'))
    try {
      const articles = join(root, '_articles')
      mkdirSync(articles)
      for (const day of [14, 15, 16, 17, 18, 19]) {
        writeFileSync(join(articles, `2026-10-${day}.md`), `Article for October ${day}.`)
      }
      const previous = getPreviousArticles(root, '2026-10-20')
      expect(previous.map(article => article.date)).toEqual([
        '2026-10-19', '2026-10-18', '2026-10-17', '2026-10-16', '2026-10-15',
      ])

      for (const day of [20, 21, 22, 23, 24]) {
        writeFileSync(join(articles, `2026-10-${day}.md`), `Article for October ${day}.`)
      }
      expect(getPreviousArticles(root, '2026-10-20')).toEqual(previous)
      expect(getPreviousArticles(root).map(article => article.date)).toEqual([
        '2026-10-24', '2026-10-23', '2026-10-22', '2026-10-21', '2026-10-20',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('projects the actual accepted October 19 closing into a synthetic October 20 prompt', () => {
    const previous = getPreviousArticles(repoRoot, '2026-10-20').find(article => article.date === '2026-10-19')
    const snapshot = readActionRegistry(repoRoot).articles.find(article => article.date === '2026-10-19')
    if (snapshot?.closing?.kind !== 'shortlist') throw new Error('Missing current October 19 shortlist')
    expect(previous?.closingContinuity).toMatchObject({ status: 'available', optionCount: 3, omittedOptionCount: 0 })
    if (!previous || previous.closingContinuity?.status !== 'available') throw new Error('October 19 continuity was not available')
    expect(previous.closingContinuity.options.map(option => option.kind === 'checkpoint' ? option.target : option.actionKey)).toEqual(snapshot.closing.options.map(option => option.kind === 'checkpoint' ? option.target : option.actionKey))
    expect(previous.closingContinuity.options.every(option => option.review.verdict === 'pass')).toBe(true)
    const prompt = buildUserPrompt(context([previous]))
    for (const option of snapshot.closing.options) expect(prompt).toContain(option.title)
    expect(prompt).toContain('revalidate current state')
  })

  it('preserves the frozen v7 two-option accepted closing as legacy continuity', () => {
    const { content, registry } = legacyAcceptedClosingFixture()
    const snapshot = registry.articles[0]
    if (snapshot.closing?.kind !== 'options') throw new Error('Missing frozen legacy closing')
    expect(snapshot.verification.promptVersion).toBe('action-review-v7-closing-options')
    const continuity = acceptedClosingContinuity({ date: snapshot.date, content, snapshot })

    expect(continuity).toMatchObject({ status: 'available', optionCount: 2, omittedOptionCount: 0 })
    if (continuity.status !== 'available') throw new Error('Legacy continuity was unavailable')
    expect(continuity.options.map(option => option.kind === 'checkpoint' ? option.target : option.actionKey)).toEqual([
      'https://github.com/ojfbot/daily-logger/issues/386',
      'https://github.com/ojfbot/daily-logger/pull/385',
    ])
    expect(continuity.options.every(option => option.review.verdict === 'pass')).toBe(true)
    const prompt = buildUserPrompt(context([{ date: snapshot.date, excerpt: '', closingContinuity: continuity }]))
    expect(prompt).toContain('Qualify evidence relevance under issue #386')
    expect(prompt).toContain('Review the existing timestamp-popover pilot')
  })

  it('projects ranked shortlist fields and canonicalizes fragment targets for the next evidence cycle', () => {
    const content = readFileSync(`${repoRoot}/_articles/2026-10-19.md`, 'utf8')
    const snapshot = structuredClone(readActionRegistry(repoRoot).articles.find(article => article.date === '2026-10-19'))
    if (!snapshot || snapshot.closing?.kind !== 'shortlist') throw new Error('Missing current October 19 shortlist')
    const continuity = acceptedClosingContinuity({ date: '2026-10-19', content, snapshot })
    expect(continuity).toMatchObject({ status: 'available', optionCount: 3, source: { articleDigest: snapshot.articleDigest, roundId: snapshot.roundId, promptVersion: snapshot.verification.promptVersion }, options: snapshot.closing.options.map((option, index) => {
      const verdict = snapshot.verification.verdicts.find(verdict => verdict.item === `closing:${index}`)
      if (!verdict) throw new Error('Missing current independent closing verdict')
      return { title: option.title, benefit: option.benefit, start: option.start, entryPoint: option.entryPoint, context: option.context, whyNow: option.rationale, outcome: option.outcome, nextCheck: option.nextCheck, review: { verdict: verdict.verdict, reason: verdict.reason } }
    }) })

    const legacy = legacyAcceptedClosingFixture()
    const legacySnapshot = legacy.registry.articles[0]
    if (legacySnapshot.closing?.kind !== 'options' || legacySnapshot.closing.options[0].kind !== 'checkpoint') throw new Error('Missing frozen checkpoint')
    const canonicalTarget = legacySnapshot.closing.options[0].target
    legacySnapshot.closing.options[0].target = `${canonicalTarget}#continuity-fixture`
    const fragmentContinuity = acceptedClosingContinuity({ date: legacySnapshot.date, content: legacy.content, snapshot: legacySnapshot })
    expect(acceptedClosingContinuityTargets([{ date: legacySnapshot.date, excerpt: '', closingContinuity: fragmentContinuity }])).toContain(canonicalTarget)
  })

  it('reaches both next-day request consumers with binding and review context', () => {
    const previousArticles: BlogContext['previousArticles'] = [{
      date: '2026-10-19',
      excerpt: 'The first 600 characters do not mention the timestamp pilot.',
      closingContinuity: {
        status: 'available' as const,
        version: 'accepted-closing-continuity-v1' as const,
        source: { articleBlobSha: 'c'.repeat(40), articleDigest: 'a'.repeat(64), roundId: 'b'.repeat(64), promptVersion: 'action-review-v10-protected-scope-closing-options' },
        optionCount: 1,
        omittedOptionCount: 0,
        options: [{
          kind: 'checkpoint' as const,
          target: 'https://github.com/ojfbot/daily-logger/pull/385',
          title: 'Review the existing timestamp-popover pilot',
          entryPoint: 'Open the immutable preview.',
          context: 'Human visual acceptance remains pending.',
          whyNow: 'The reviewed candidate is ready for the owner decision.',
          outcome: 'Close the remaining UI evidence gap.',
          nextCheck: 'Record the human verdict before any merge decision.',
          evidencePointers: ['github:daily-logger#385'],
          review: { verdict: 'pass' as const, reason: 'The owner gate and current open state were independently checked.' },
        }],
      },
    }]
    const prompt = buildUserPrompt(context(previousArticles))

    expect(prompt).toContain('Accepted closing continuity — active bounded handoff; revalidate current state')
    expect(prompt).toContain('https://github.com/ojfbot/daily-logger/pull/385')
    expect(prompt).toContain('Human visual acceptance remains pending.')
    expect(prompt).toContain('Record the human verdict before any merge decision.')
    expect(prompt).toContain('The owner gate and current open state were independently checked.')
    expect(prompt).toContain('articleDigest')
    expect(actionGithubReferences({ markdown: '## What\'s next\nNo target repeated here.', feedback: '', context: prompt, continuityTargets: acceptedClosingContinuityTargets(previousArticles) })).toContainEqual(['daily-logger#385', { repo: 'daily-logger', kind: 'pull', number: '385' }])
  })

  it('reserves the existing evidence-reference budget for accepted continuity targets', () => {
    const previous = getPreviousArticles(repoRoot, '2026-10-20').find(article => article.date === '2026-10-19')
    if (!previous) throw new Error('October 19 continuity fixture is missing')
    const prompt = buildUserPrompt(context([previous]))
    const crowdedMarkdown = Array.from(
      { length: 13 },
      (_, index) => `https://github.com/ojfbot/daily-logger/issues/${500 + index}`,
    ).join('\n')
    const refs = actionGithubReferences({ markdown: crowdedMarkdown, feedback: '', context: prompt, continuityTargets: acceptedClosingContinuityTargets([previous]) })

    expect(refs).toHaveLength(12)
    const targets = acceptedClosingContinuityTargets([previous])
    expect(refs.map(([id]) => id)).toEqual(expect.arrayContaining(targets.map(target => {
      const url = new URL(target)
      return `${url.pathname.split('/')[2]}#${url.pathname.split('/').at(-1)}`
    })))
  })

  it('selects only the newest accepted closing as the bounded active handoff', () => {
    let target = 600
    const previousArticles: BlogContext['previousArticles'] = [5, 5, 3].map((count, articleIndex) => ({
      date: `2026-10-${19 - articleIndex}`,
      excerpt: `Prior article ${articleIndex + 1}.`,
      closingContinuity: {
        status: 'available' as const,
        version: 'accepted-closing-continuity-v1' as const,
        source: { articleBlobSha: `${articleIndex + 1}`.repeat(40), articleDigest: `${articleIndex + 1}`.repeat(64), roundId: `${articleIndex + 2}`.repeat(64), promptVersion: 'action-review-v10-protected-scope-closing-options' },
        optionCount: count,
        omittedOptionCount: 0,
        options: Array.from({ length: count }, () => {
          const number = target++
          return {
            kind: 'checkpoint' as const,
            target: `https://github.com/ojfbot/daily-logger/issues/${number}`,
            title: `Revalidate #${number}`,
            entryPoint: 'Open current primary evidence.',
            context: 'Historical accepted context.',
            whyNow: 'The target remains a candidate only after a fresh check.',
            outcome: 'Determine the current lifecycle state.',
            nextCheck: 'Record current evidence or retain the hold.',
            evidencePointers: [`github:daily-logger#${number}`],
            review: { verdict: 'pass' as const, reason: 'The historical presentation was independently checked.' },
          }
        }),
      },
    }))
    const prompt = buildUserPrompt(context(previousArticles))
    const targets = acceptedClosingContinuityTargets(previousArticles)
    const selection = actionGithubReferenceSelection({ markdown: 'No current targets.', feedback: '', context: prompt, continuityTargets: targets })

    expect(targets).toEqual(Array.from({ length: 5 }, (_, index) => `https://github.com/ojfbot/daily-logger/issues/${600 + index}`))
    expect(selection.references.map(([id]) => id)).toEqual(Array.from({ length: 5 }, (_, index) => `daily-logger#${600 + index}`))
    expect(selection.omittedContinuityReferences).toEqual([])
    expect(selection.omissionNotice).toBeNull()
    expect(prompt.match(/active bounded handoff/g)).toHaveLength(1)
    expect(prompt.match(/older historical context; not selected for current revalidation/g)).toHaveLength(2)
  })

  it.each(['binding-mismatch', 'oversize', 'missing-accepted-closing'] as const)('reports %s without leaking partial closing fields', (reason) => {
    const prompt = buildUserPrompt(context([{ date: '2026-10-19', excerpt: 'Short prior prose.', closingContinuity: {
      status: 'unavailable', version: 'accepted-closing-continuity-v1', reason, optionCount: 2, omittedOptionCount: 2,
    } }]))

    expect(prompt).toContain(`Accepted closing continuity unavailable: ${reason}`)
    expect(prompt).toContain('omitted 2 of 2 whole options')
    expect(prompt).not.toContain('github.com/ojfbot/')
  })

  it('fails closed for changed article bytes and oversized whole-option projections', () => {
    const content = readFileSync(`${repoRoot}/_articles/2026-10-19.md`, 'utf8')
    const snapshot = readActionRegistry(repoRoot).articles.find(article => article.date === '2026-10-19')
    if (!snapshot || snapshot.closing?.kind !== 'shortlist') throw new Error('Missing current October 19 shortlist')
    expect(acceptedClosingContinuity({ date: '2026-10-19', content, snapshot: null })).toMatchObject({ status: 'unavailable', reason: 'invalid-snapshot', optionCount: 0 })
    expect(acceptedClosingContinuity({ date: '2026-10-19', content: `${content}\nchanged`, snapshot })).toMatchObject({ status: 'unavailable', reason: 'binding-mismatch', omittedOptionCount: 3 })
    const oversized = structuredClone(snapshot)
    if (oversized.closing?.kind !== 'shortlist') throw new Error('Missing cloned shortlist')
    oversized.closing.options[0].context = 'x'.repeat(9_000)
    expect(acceptedClosingContinuity({ date: '2026-10-19', content, snapshot: oversized })).toMatchObject({ status: 'unavailable', reason: 'oversize', optionCount: 3, omittedOptionCount: 3 })
  })
})

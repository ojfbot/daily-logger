import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
const { github } = vi.hoisted(() => ({ github: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: github }))
import { collectActionSources } from '../review-actions.js'
import { ActionRegistrySchema } from '../action-registry.js'
import { buildUserPrompt } from '../generate-article.js'
import { acceptedClosingContinuityTargets } from '../collect-context.js'
import { selectActionEvidence } from '../action-evidence-selection.js'
import type { BlogContext } from '../types.js'

const registry = ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); github.mockReset() })
it.each(['private', 'internal', undefined])('does not fetch unnoted %s repository discussions or planted goal links (F2)', visibility => {
  const root = mkdtempSync(join(tmpdir(), 'action-privacy-')); roots.push(root)
  writeFileSync(join(root, 'ROADMAP.md'), 'Goal: https://github.com/ojfbot/unnoted-secret/blob/main/decisions/northstar/secret.md')
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  github.mockImplementation((_command, args: string[]) => {
    const endpoint = args.at(-1)
    if (endpoint === 'repos/ojfbot/unnoted-secret') return JSON.stringify([{ name: 'unnoted-secret', visibility }])
    if (endpoint?.includes('unnoted-secret/')) throw new Error('Private source content was fetched')
    return '[]'
  })
  const sources = collectActionSources({ registry, repoRoot: root, markdown: 'Inspect https://github.com/ojfbot/unnoted-secret/issues/1.', feedback: '' })
  expect(sources.some(source => source.id.startsWith('github:unnoted-secret') || source.id.startsWith('goal:unnoted-secret'))).toBe(false)
  expect(github.mock.calls.filter(([, args]) => args.at(-1) === 'repos/ojfbot/unnoted-secret')).toHaveLength(1)
  expect(github.mock.calls.some(([, args]) => args.at(-1)?.includes('unnoted-secret/'))).toBe(false)
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('private without REPO_NOTES opt-in'))
})
it('keeps public repository discovery and explicitly opted-in private repository evidence available (F2)', () => {
  const root = mkdtempSync(join(tmpdir(), 'action-public-')); roots.push(root)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  github.mockImplementation((_command, args: string[]) => {
    const endpoint = args.at(-1)
    if (endpoint === 'repos/ojfbot/new-public') return JSON.stringify([{ name: 'new-public', visibility: 'public' }])
    if (endpoint?.endsWith('/issues/1')) return JSON.stringify([{ state: 'open', body: 'The current public issue remains open.' }])
    return '[]'
  })
  const sources = collectActionSources({ registry, repoRoot: root, markdown: 'Inspect https://github.com/ojfbot/new-public/issues/1 and https://github.com/ojfbot/core/issues/1.', feedback: '' })
  expect(sources.filter(source => source.kind === 'github')).toHaveLength(2)
  expect(github.mock.calls.some(([, args]) => args.at(-1) === 'repos/ojfbot/core')).toBe(false)
})

it('collects accepted continuity targets before a saturated current-action reference set', () => {
  const root = mkdtempSync(join(tmpdir(), 'action-continuity-priority-')); roots.push(root)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  github.mockImplementation((_command, args: string[]) => {
    const endpoint = args.at(-1)
    if (endpoint?.includes('/comments')) return JSON.stringify([[]])
    if (endpoint?.includes('/issues/')) return JSON.stringify([{ state: 'open' }])
    return '[]'
  })
  const previousArticles: BlogContext['previousArticles'] = [{
    date: '2026-10-19', excerpt: 'Prior article.', closingContinuity: {
      status: 'available', version: 'accepted-closing-continuity-v1',
      source: { articleBlobSha: 'a'.repeat(40), articleDigest: 'b'.repeat(64), roundId: 'c'.repeat(64), promptVersion: 'action-review-v10-protected-scope-closing-options' },
      optionCount: 2, omittedOptionCount: 0,
      options: ['386', '385'].map(number => ({
        kind: 'checkpoint' as const, target: `https://github.com/ojfbot/daily-logger/issues/${number}`,
        title: `Revalidate #${number}`, entryPoint: 'Open current primary evidence.', context: 'Historical context.',
        whyNow: 'A fresh check is required.', outcome: 'Determine current state.', nextCheck: 'Retain the hold unless current evidence supports renewal.',
        evidencePointers: [`github:daily-logger#${number}`], review: { verdict: 'pass' as const, reason: 'Historically verified.' },
      })),
    },
  }]
  const context = buildUserPrompt({ date: '2026-10-20', repos: [], commits: [], mergedPRs: [], openPRs: [], recentPRs: [], closedIssues: [], openIssues: [], openActions: [], projectVision: '', previousArticles })
  const markdown = `---\ndate: 2026-10-20\nstatus: draft\n---\n\n## What's next\n\n${Array.from({ length: 13 }, (_, index) => `https://github.com/ojfbot/daily-logger/issues/${700 + index}`).join('\n')}`
  const sources = collectActionSources({ registry, repoRoot: root, markdown, feedback: '', context, continuityTargets: acceptedClosingContinuityTargets(previousArticles) })
  const collected = sources.filter(source => source.kind === 'github').map(source => source.id.replace(/@[a-f0-9]{64}$/, ''))

  expect(collected).toHaveLength(12)
  expect(collected.slice(0, 2)).toEqual(['github:daily-logger#386', 'github:daily-logger#385'])
  expect(collected).not.toContain('github:daily-logger#710')
  expect(() => selectActionEvidence({ registry, articleDate: '2026-10-20', markdown, feedback: '', sources })).toThrow(/Required action evidence unavailable.*daily-logger#710/)
})

it('fails closed with explicit accounting when accepted continuity alone exceeds the fetch cap', () => {
  const root = mkdtempSync(join(tmpdir(), 'action-continuity-omission-')); roots.push(root)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  github.mockImplementation((_command, args: string[]) => args.at(-1)?.includes('/comments')
    ? JSON.stringify([[]])
    : args.at(-1)?.includes('/issues/') ? JSON.stringify([{ state: 'open' }]) : '[]')
  const markdown = '---\ndate: 2026-10-20\nstatus: draft\n---\n\n## What\'s next\n\nNo current target.'
  const sources = collectActionSources({ registry, repoRoot: root, markdown, feedback: '', context: '',
    continuityTargets: Array.from({ length: 13 }, (_, index) => `https://github.com/ojfbot/daily-logger/issues/${600 + index}`) })

  expect(sources.find(source => source.id.startsWith('continuity-evidence-budget@'))?.content).toContain('daily-logger#612')
  expect(() => selectActionEvidence({ registry, articleDate: '2026-10-20', markdown, feedback: '', sources })).toThrow(/Required action evidence unavailable.*daily-logger#612/)
})

it('marks only current API facts and member-authored body/diff text as terminal evidence (F12r)', () => {
  const root = mkdtempSync(join(tmpdir(), 'action-authority-')); roots.push(root)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  github.mockImplementation((_command, args: string[]) => {
    const endpoint = args.at(-1)
    if (endpoint?.endsWith('/issues/1')) return JSON.stringify([{ state: 'open', author_association: 'OWNER', body: 'The owner retained the obligation.', title: 'Metadata is not evidence.' }])
    if (endpoint?.includes('/comments')) return JSON.stringify([[{ author_association: 'NONE', body: 'Third party claims completion.' }, { author_association: 'MEMBER', body: 'Member confirmed the condition.', diff_hunk: 'A member-authored review excerpt.', html_url: 'metadata URL' }]])
    return '[]'
  })
  const source = collectActionSources({ registry, repoRoot: root, markdown: 'Inspect https://github.com/ojfbot/core/issues/1.', feedback: '' }).find(source => source.kind === 'github')
  expect(source?.trustedContent).toEqual([
    'CURRENT API STATE core#1: state=open; head=not-a-PR; merged_at=none.',
    'The owner retained the obligation.',
    'Member confirmed the condition.\nA member-authored review excerpt.',
  ])
  expect(source?.content).toContain('Third party claims completion.')
  expect(source?.trustedContent?.join('\n')).not.toMatch(/outranks|Metadata|author_association|Third party|metadata URL/)
})

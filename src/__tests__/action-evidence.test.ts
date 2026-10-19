import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
const { github } = vi.hoisted(() => ({ github: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: github }))
import { collectActionSources } from '../review-actions.js'
import { ActionRegistrySchema } from '../action-registry.js'

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

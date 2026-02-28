import { describe, it, expect } from 'vitest'
import { buildUserPrompt } from '../generate-article.js'
import type { BlogContext } from '../types.js'

const emptyCtx: BlogContext = {
  date: '2026-02-28',
  repos: ['shell'],
  commits: [],
  mergedPRs: [],
  openPRs: [],
  closedIssues: [],
  openIssues: [],
  projectVision: '',
  previousArticles: [],
}

describe('buildUserPrompt — open PRs section', () => {
  it('omits the section when openPRs is empty', () => {
    const prompt = buildUserPrompt(emptyCtx)
    expect(prompt).not.toContain('Open PRs')
  })

  it('includes section header with count when PRs are present', () => {
    const ctx: BlogContext = {
      ...emptyCtx,
      openPRs: [
        { number: 42, title: 'Add feature X', repo: 'shell', url: 'https://github.com/ojfbot/shell/pull/42', createdAt: '2026-02-27T10:00:00Z', draft: false },
      ],
    }
    const prompt = buildUserPrompt(ctx)
    expect(prompt).toContain('## Open PRs — in-flight work (1)')
  })

  it('formats each open PR with repo, number, title, and opened date', () => {
    const ctx: BlogContext = {
      ...emptyCtx,
      openPRs: [
        { number: 7, title: 'Refactor auth', repo: 'BlogEngine', url: 'https://github.com/ojfbot/BlogEngine/pull/7', createdAt: '2026-02-25T08:30:00Z', draft: false },
      ],
    }
    const prompt = buildUserPrompt(ctx)
    expect(prompt).toContain('[BlogEngine] #7: Refactor auth')
    expect(prompt).toContain('opened 2026-02-25')
  })

  it('marks draft PRs with [DRAFT] flag', () => {
    const ctx: BlogContext = {
      ...emptyCtx,
      openPRs: [
        { number: 3, title: 'WIP: new pipeline', repo: 'cv-builder', url: 'https://github.com/ojfbot/cv-builder/pull/3', createdAt: '2026-02-26T00:00:00Z', draft: true },
      ],
    }
    const prompt = buildUserPrompt(ctx)
    expect(prompt).toContain('[DRAFT]')
  })

  it('non-draft PRs do not show [DRAFT]', () => {
    const ctx: BlogContext = {
      ...emptyCtx,
      openPRs: [
        { number: 5, title: 'Ship it', repo: 'shell', url: 'https://github.com/ojfbot/shell/pull/5', createdAt: '2026-02-26T00:00:00Z', draft: false },
      ],
    }
    const prompt = buildUserPrompt(ctx)
    expect(prompt).not.toContain('[DRAFT]')
  })

  it('includes body preview when present', () => {
    const ctx: BlogContext = {
      ...emptyCtx,
      openPRs: [
        { number: 1, title: 'PR with body', repo: 'shell', url: 'https://...', createdAt: '2026-02-27T00:00:00Z', draft: false, body: 'This PR does X and Y' },
      ],
    }
    const prompt = buildUserPrompt(ctx)
    expect(prompt).toContain('This PR does X and Y')
  })
})

describe('buildUserPrompt — open issues createdAt', () => {
  it('shows opened date on open issues', () => {
    const ctx: BlogContext = {
      ...emptyCtx,
      openIssues: [
        { number: 5, title: 'Bug: crash on load', state: 'open', labels: [], repo: 'shell', url: 'https://...', createdAt: '2026-02-20T00:00:00Z' },
      ],
    }
    const prompt = buildUserPrompt(ctx)
    expect(prompt).toContain('opened 2026-02-20')
  })

  it('does not break when createdAt is missing on an open issue', () => {
    const ctx: BlogContext = {
      ...emptyCtx,
      openIssues: [
        { number: 9, title: 'Old issue', state: 'open', labels: [], repo: 'shell', url: 'https://...' },
      ],
    }
    expect(() => buildUserPrompt(ctx)).not.toThrow()
    const prompt = buildUserPrompt(ctx)
    expect(prompt).toContain('[shell] #9: Old issue')
  })

  it('includes label list on issues', () => {
    const ctx: BlogContext = {
      ...emptyCtx,
      openIssues: [
        { number: 2, title: 'Needs work', state: 'open', labels: ['bug', 'priority'], repo: 'cv-builder', url: 'https://...' },
      ],
    }
    const prompt = buildUserPrompt(ctx)
    expect(prompt).toContain('[bug, priority]')
  })
})

describe('buildUserPrompt — date header', () => {
  it('includes the date in the opening line', () => {
    const prompt = buildUserPrompt(emptyCtx)
    expect(prompt).toContain('2026-02-28')
  })
})

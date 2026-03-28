import { describe, it, expect } from 'vitest'
import { assembleBody } from '../generate-article.js'
import type { ArticleDataV2 } from '../schema.js'

const base = {
  title: 'Test',
  tags: ['test'],
  summary: 'A test.',
  lede: 'Opening sentence.',
  whatShipped: 'Something shipped.',
  theDecisions: 'A decision was made.',
  roadmapPulse: 'Phase 1 is progressing.',
  whatsNext: 'Do the next thing.',
  actions: {
    whatShipped: ['- `/techdebt` — scan for drift introduced by the merged PR'],
    theDecisions: ['- `/adr` — write ADR for the decision'],
    roadmapPulse: ['- `/roadmap` — update phase progress'],
    whatsNext: ['- `/scaffold` — stub the next feature'],
  },
}

describe('assembleBody — section headings', () => {
  it('always emits all four ## headings', () => {
    const body = assembleBody(base)
    expect(body).toContain('## What shipped')
    expect(body).toContain('## The decisions')
    expect(body).toContain('## Roadmap pulse')
    expect(body).toContain("## What's next")
  })

  it('section headings appear in the correct order', () => {
    const body = assembleBody(base)
    const shipped = body.indexOf('## What shipped')
    const decisions = body.indexOf('## The decisions')
    const pulse = body.indexOf('## Roadmap pulse')
    const next = body.indexOf("## What's next")
    expect(shipped).toBeLessThan(decisions)
    expect(decisions).toBeLessThan(pulse)
    expect(pulse).toBeLessThan(next)
  })
})

describe('assembleBody — lede', () => {
  it('includes the lede before the first section heading', () => {
    const body = assembleBody(base)
    const ledeIdx = body.indexOf('Opening sentence.')
    const firstHeading = body.indexOf('## What shipped')
    expect(ledeIdx).toBeGreaterThanOrEqual(0)
    expect(ledeIdx).toBeLessThan(firstHeading)
  })

  it('omits the lede when it is empty string', () => {
    const body = assembleBody({ ...base, lede: '' })
    // Body should start with ## What shipped
    expect(body.trimStart()).toMatch(/^## What shipped/)
  })

  it('omits the lede when it is missing', () => {
    const { lede: _lede, ...withoutLede } = base
    const body = assembleBody(withoutLede)
    expect(body.trimStart()).toMatch(/^## What shipped/)
  })
})

describe('assembleBody — suggested actions', () => {
  it('every section ends with a > **Suggested actions** blockquote', () => {
    const body = assembleBody(base)
    // Count occurrences
    const count = (body.match(/> \*\*Suggested actions\*\*/g) ?? []).length
    expect(count).toBe(4)
  })

  it('injects a fallback action when actions are missing', () => {
    const { actions: _a, ...withoutActions } = base
    const body = assembleBody(withoutActions)
    expect(body).toContain('> **Suggested actions**')
    expect(body).toContain('/roadmap')
  })

  it('injects a fallback for a specific missing sub-key', () => {
    const body = assembleBody({
      ...base,
      actions: { ...base.actions, whatShipped: undefined },
    })
    // Still four blockquotes
    const count = (body.match(/> \*\*Suggested actions\*\*/g) ?? []).length
    expect(count).toBe(4)
  })

  it('renders provided action items with > prefix', () => {
    const body = assembleBody(base)
    expect(body).toContain('> - `/techdebt` — scan for drift introduced by the merged PR')
  })

  it('auto-prefixes action items that are missing the "- " dash', () => {
    const body = assembleBody({
      ...base,
      actions: {
        ...base.actions,
        whatShipped: ['`/techdebt` — no dash prefix'],
      },
    })
    expect(body).toContain('> - `/techdebt` — no dash prefix')
  })

  it('suggested actions appear AFTER the section content, not before', () => {
    const body = assembleBody(base)
    const contentIdx = body.indexOf('Something shipped.')
    const actionsIdx = body.indexOf('> **Suggested actions**')
    expect(contentIdx).toBeLessThan(actionsIdx)
  })
})

describe('assembleBody — section content', () => {
  it('includes the prose content for each section', () => {
    const body = assembleBody(base)
    expect(body).toContain('Something shipped.')
    expect(body).toContain('A decision was made.')
    expect(body).toContain('Phase 1 is progressing.')
    expect(body).toContain('Do the next thing.')
  })

  it('trims leading/trailing whitespace from section content', () => {
    const body = assembleBody({
      ...base,
      whatShipped: '  \n  Content with padding.  \n  ',
    })
    expect(body).toContain('Content with padding.')
    // Should not have double blank lines before heading
    expect(body).not.toMatch(/\n{4,}/)
  })
})

// ─── v2 schema tests ────────────────────────────────────────────────────────

const baseV2: ArticleDataV2 = {
  schemaVersion: 2,
  date: '2026-03-28',
  title: 'v2 test article',
  summary: 'Testing v2 assembly.',
  lede: 'Opening paragraph for v2.',
  tags: [
    { name: 'daily-logger', type: 'repo' },
    { name: 'ci-cd', type: 'practice' },
  ],
  whatShipped: [
    {
      repo: 'daily-logger',
      description: 'Added Zod schema validation for article output.',
      commits: ['abc1234', 'def5678'],
      prs: ['#42'],
    },
    {
      repo: 'shell',
      description: 'Fixed header rendering bug.',
      commits: ['ghi9012'],
    },
  ],
  decisions: [
    {
      title: 'Zod over manual validation',
      summary: 'Runtime schema validation catches LLM drift.',
      repo: 'daily-logger',
      pillar: 'tooling-for-iteration',
      relatedTags: ['ci-cd', 'structured-output'],
    },
  ],
  roadmapPulse: 'Phase 9 in progress.',
  whatsNext: 'Run backfill on all 31 articles.',
  suggestedActions: [
    {
      command: '/validate',
      description: 'Run schema validation against today.',
      repo: 'daily-logger',
      status: 'open',
      sourceDate: '2026-03-28',
    },
  ],
  commitCount: 12,
  reposActive: ['daily-logger', 'shell'],
  activityType: 'build',
}

describe('assembleBody — v2 schema', () => {
  it('emits all four ## headings for v2 input', () => {
    const body = assembleBody(baseV2)
    expect(body).toContain('## What shipped')
    expect(body).toContain('## The decisions')
    expect(body).toContain('## Roadmap pulse')
    expect(body).toContain("## What's next")
  })

  it('renders shipment entries grouped by repo', () => {
    const body = assembleBody(baseV2)
    expect(body).toContain('### daily-logger')
    expect(body).toContain('### shell')
    expect(body).toContain('Added Zod schema validation')
    expect(body).toContain('`abc1234`')
    expect(body).toContain('#42')
  })

  it('renders decision entries with pillar badges', () => {
    const body = assembleBody(baseV2)
    expect(body).toContain('### Zod over manual validation')
    expect(body).toContain('*tooling-for-iteration*')
    expect(body).toContain('Runtime schema validation catches LLM drift.')
  })

  it('renders decision related tags', () => {
    const body = assembleBody(baseV2)
    expect(body).toContain('`ci-cd`')
    expect(body).toContain('`structured-output`')
  })

  it('renders suggested actions from suggestedActions array', () => {
    const body = assembleBody(baseV2)
    expect(body).toContain('> **Suggested actions**')
    expect(body).toContain('`/validate`')
    expect(body).toContain('Run schema validation against today.')
  })

  it('includes lede before first heading', () => {
    const body = assembleBody(baseV2)
    const ledeIdx = body.indexOf('Opening paragraph for v2.')
    const firstHeading = body.indexOf('## What shipped')
    expect(ledeIdx).toBeGreaterThanOrEqual(0)
    expect(ledeIdx).toBeLessThan(firstHeading)
  })

  it('handles empty whatShipped array gracefully', () => {
    const body = assembleBody({ ...baseV2, whatShipped: [] })
    expect(body).toContain('## What shipped')
    expect(body).toContain('No code committed today')
  })

  it('handles empty decisions array gracefully', () => {
    const body = assembleBody({ ...baseV2, decisions: [] })
    expect(body).toContain('## The decisions')
    expect(body).toContain('No major architectural decisions today')
  })

  it('handles empty suggestedActions with fallback', () => {
    const body = assembleBody({ ...baseV2, suggestedActions: [] })
    expect(body).toContain('> **Suggested actions**')
    expect(body).toContain('/roadmap')
  })

  it('falls back to v1 rendering for v1 input', () => {
    // v1 input (no schemaVersion) should still work via assembleBody
    const body = assembleBody(base)
    expect(body).toContain('## What shipped')
    expect(body).toContain('Something shipped.')
  })
})

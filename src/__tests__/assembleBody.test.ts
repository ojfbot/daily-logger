import { describe, it, expect } from 'vitest'
import { assembleBody } from '../generate-article.js'

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

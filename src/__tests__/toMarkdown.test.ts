import { describe, it, expect } from 'vitest'
import { toMarkdown } from '../generate-article.js'
import type { GeneratedArticle } from '../types.js'
import { buildArticleProvenance, promptSha256 } from '../run-provenance.js'

const base: GeneratedArticle = {
  title: 'Test article',
  date: '2026-02-28',
  tags: ['foo', 'bar'],
  summary: 'A short summary.',
  body: '## What shipped\n\nSome content.',
}

const withProvenance: GeneratedArticle = {
  ...base,
  provenance: buildArticleProvenance({
    run: {
      kind: 'github-actions',
      capturedAt: '2026-10-10T14:37:00.000Z',
      runId: '123',
      runNumber: 229,
      runAttempt: 1,
      event: 'schedule',
      url: 'https://github.com/ojfbot/daily-logger/actions/runs/123',
      workflowRef: 'ojfbot/daily-logger/.github/workflows/daily-blog.yml@refs/heads/main',
      sourceSha: '1d1b24e000000000000000000000000000000000',
      actor: 'github-actions[bot]',
      scheduleExpression: '30 3 * * *',
      timezone: 'America/Chicago',
      timing: {
        status: 'available',
        expectedAt: '2026-10-10T08:30:00.000Z',
        createdAt: '2026-10-10T14:36:24.000Z',
        startedAt: '2026-10-10T14:36:30.000Z',
        dispatchDelaySeconds: 21_984,
        startDelaySeconds: 6,
      },
    },
    stages: [{
      role: 'draft',
      model: 'claude-sonnet-4-6',
      promptVersion: 'article-v2',
      promptSha256: promptSha256('system prompt'),
    }],
    nodeVersion: 'v24.0.0',
    packageVersion: '0.1.0',
  }),
}

describe('toMarkdown — frontmatter structure', () => {
  it('opens and closes with --- fences', () => {
    const md = toMarkdown(base)
    const lines = md.split('\n')
    expect(lines[0]).toBe('---')
    // second --- ends the frontmatter block
    const closingIdx = lines.indexOf('---', 1)
    expect(closingIdx).toBeGreaterThan(1)
  })

  it('emits title, date, tags, summary fields', () => {
    const md = toMarkdown(base)
    expect(md).toContain('title: "Test article"')
    expect(md).toContain('date: 2026-02-28')
    expect(md).toContain('summary: "A short summary."')
  })

  it('tags are JSON-parseable — matches what build_pr_body.py expects', () => {
    const md = toMarkdown(base)
    const tagsLine = md.split('\n').find((l) => l.startsWith('tags:'))!
    const raw = tagsLine.slice('tags: '.length)
    expect(() => JSON.parse(raw)).not.toThrow()
    expect(JSON.parse(raw)).toEqual(['foo', 'bar'])
  })

  it('date field is never empty (DATE_OVERRIDE="" regression)', () => {
    const md = toMarkdown(base)
    const dateLine = md.split('\n').find((l) => l.startsWith('date:'))!
    expect(dateLine).toBe('date: 2026-02-28')
    expect(dateLine).not.toMatch(/^date:\s*$/)
  })

  it('escapes double quotes in title', () => {
    const md = toMarkdown({ ...base, title: 'Say "hello" world' })
    expect(md).toContain('title: "Say \\"hello\\" world"')
  })

  it('escapes double quotes in summary', () => {
    const md = toMarkdown({ ...base, summary: 'A "quoted" summary' })
    expect(md).toContain('summary: "A \\"quoted\\" summary"')
  })

  it('includes body content after frontmatter', () => {
    const md = toMarkdown(base)
    expect(md).toContain('## What shipped')
    expect(md).toContain('Some content.')
  })

  it('body content comes after the closing frontmatter ---', () => {
    const md = toMarkdown(base)
    const fmEnd = md.indexOf('\n---\n', 4) // skip opening ---
    const bodyStart = md.indexOf('## What shipped')
    expect(bodyStart).toBeGreaterThan(fmEnd)
  })

  it('serializes provenance as JSON frontmatter and links the source Actions run', () => {
    const md = toMarkdown(withProvenance)
    const provenanceLine = md.split('\n').find((line) => line.startsWith('provenance: '))

    expect(provenanceLine).toBeDefined()
    expect(() => JSON.parse(provenanceLine!.slice('provenance: '.length))).not.toThrow()
    expect(md).toContain('[GitHub Actions run #229](https://github.com/ojfbot/daily-logger/actions/runs/123)')
    expect(md).toContain('Authoring model `claude-sonnet-4-6`')
    expect(md).toContain('prompt `article-v2`')
  })
})

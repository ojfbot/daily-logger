import { describe, it, expect } from 'vitest'
import { toMarkdown } from '../generate-article.js'
import type { GeneratedArticle } from '../types.js'

const base: GeneratedArticle = {
  title: 'Test article',
  date: '2026-02-28',
  tags: ['foo', 'bar'],
  summary: 'A short summary.',
  body: '## What shipped\n\nSome content.',
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
})

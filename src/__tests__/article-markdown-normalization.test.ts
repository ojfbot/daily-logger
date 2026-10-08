import { describe, expect, it } from 'vitest'
import { marked } from 'marked'
import { assembleBody, toMarkdown } from '../generate-article.js'
import type { StructuredArticle } from '../types.js'
import type { ArticleDataV2 } from '../schema.js'

const prose = String.raw`Shipped /canvas/<section>/chat.\n\n### Details\n- First\n- Second`
const code = 'Use `String.raw` and ``literal ` \\n <port>``.\n\n```ts\nconst value = "\\n <port>"\n```\n\n~~~~text\n\\n <section>\n~~~\n~~~~'
const action = String.raw`Review <section> and keep \n literal.`
const v1: StructuredArticle = {
  title: 'Normalization regression', tags: ['test'], summary: 'A summary.',
  lede: String.raw`Opening.\nNext paragraph.`, whatShipped: prose,
  theDecisions: code, roadmapPulse: 'Use <port>.', whatsNext: 'Continue.',
  actions: { whatsNext: [`- \`/doc-refactor\` — ${action} (daily-logger)`] },
}
const v2: ArticleDataV2 = {
  schemaVersion: 2, date: '2026-10-08', title: v1.title, summary: v1.summary,
  tags: [], lede: v1.lede, whatShipped: [{ repo: 'daily-logger', commits: [], description: prose }],
  decisions: [{ title: 'Code samples', repo: 'daily-logger', summary: code, relatedTags: [] }],
  roadmapPulse: v1.roadmapPulse, whatsNext: v1.whatsNext,
  suggestedActions: [{ command: '/doc-refactor', description: action, repo: 'daily-logger', status: 'open', sourceDate: '2026-10-08' }],
  commitCount: 0, reposActive: ['daily-logger'], activityType: 'cleanup',
}
function committed(body: string): string {
  return toMarkdown({ title: v1.title, summary: v1.summary, tags: [], date: '2026-10-08', body })
}

describe('article Markdown before commit', () => {
  it.each([['v1', v1], ['v2', v2]] as const)('normalizes structured %s prose and preserves code and action identity', (_version, structured) => {
    const body = assembleBody(structured)
    const md = committed(body)
    expect(body).toContain('Shipped /canvas/`<section>`/chat.\n\n### Details\n- First\n- Second')
    expect(md).toContain('Opening.\nNext paragraph.')
    expect(md).toContain('Use `<port>`.')
    expect(md).toContain(code)
    expect(md).toContain(`> - \`/doc-refactor\` — ${action} (daily-logger)`)
    expect(committed(body)).toBe(md)
    const html = marked.parse(md)
    expect(html).toContain('<h3>Details</h3>')
    expect(html).toContain('<li>First</li>')
    expect(html).toContain('<code>&lt;section&gt;</code>')
  })

  it('also normalizes a directly supplied body at serialization', () => {
    expect(committed(prose)).toContain('### Details\n- First\n- Second')
  })

  it.each([
    ['link destination', '[Section](https://example.com/<section>)', '[Section](https://example.com/<section>)'],
    ['heading boundary', '`unfinished <port>\n# heading `code`', '\\`unfinished `<port>`\n# heading `code`'],
    ['indented backticks', '    ```text\n    \\n <port>\n\nOutside <section>\\nNext', '    ```text\n    \\n <port>\n\nOutside `<section>`\nNext'],
    ['unterminated quote fence', '> ```text\n> sample\\n <port>\n\nOutside\\nNext <section>', '> ```text\n> sample\\n <port>\n\nOutside\nNext `<section>`'],
    ['unterminated list fence', '- ```text\n  sample\\n <port>\n\nOutside\\nNext <section>', '- ```text\n  sample\\n <port>\n\nOutside\nNext `<section>`'],
    ['single prose escape', String.raw`First\nSecond`, 'First\nSecond'],
    ['autolinks', '<https://example.com> <me@example.com>', '<https://example.com> <me@example.com>'],
    ['escaped Markdown', String.raw`\<port> and \\new`, String.raw`\<port> and \\new`],
    ['multiline code span', '`first\n\\n <port>` then <port>', '`first\n\\n <port>` then `<port>`'],
    ['unmatched backtick', '`unfinished <port>\\nNext', '\\`unfinished `<port>`\nNext'],
    ['long fence', '````ts\n```\n\\n <port>\n````\n<port>', '````ts\n```\n\\n <port>\n````\n`<port>`'],
    ['quoted fence', '> ~~~text\n> \\n <port>\n> ~~~\n\n<port>', '> ~~~text\n> \\n <port>\n> ~~~\n\n`<port>`'],
    ['separate paragraphs', '`unfinished <port>\n\n`code`', '\\`unfinished `<port>`\n\n`code`'],
    ['indented code', '    \\n <port>\n\n<port>', '    \\n <port>\n\n`<port>`'],
  ])('preserves Markdown semantics for %s', (_name, input, expected) => {
    const md = committed(input)
    expect(md).toContain(`\n\n${expected}\n\n---`)
    expect(committed(expected)).toBe(md)
  })
})

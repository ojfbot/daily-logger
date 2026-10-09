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

  it('keeps code in a later table cell intact', () => {
    const body = '| A | B |\n| --- | --- |\n| `unfinished <port> | next `code` |'
    expect(marked.parse(committed(body))).toContain('next <code>code</code>')
  })

  it('keeps escaped table breaks in the original row and cell', () => {
    const body = '| A | B |\n| --- | --- |\n| First\\nSecond <port> | `code` |'
    const html = marked.parse(committed(body), { async: false })
    expect(html).toContain('<td>First\\nSecond <code>&lt;port&gt;</code></td>')
    expect(html).toContain('<td><code>code</code></td>')
    expect(html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0].match(/<tr>/g)).toHaveLength(1)
  })

  it.each(['[Use <port>][]', '[Use <port>]'])('preserves implicit reference destinations for %s through both boundaries', (reference) => {
    const prose = `${reference}\n\n[Use <port>]: https://example.com "Reference title"`
    const assembled = assembleBody({ ...v1, whatShipped: prose })
    const md = committed(assembled)
    expect(marked.parse(md)).toContain('<a href="https://example.com" title="Reference title">Use <code>&lt;port&gt;</code></a>')
    expect(md).toContain('[Use `<port>`][Use <port>]')
    expect(md).toContain('[Use <port>]: https://example.com "Reference title"')
    expect(committed(assembled)).toBe(md)
  })

  it.each([
    ['quote', '> [Use <port>][]'],
    ['list', '- [Use <port>]'],
    ['table', '| Link |\n| --- |\n| [Use <port>][] |'],
  ])('preserves references with definitions outside a %s', (_name, source) => {
    const prose = `${source}\n\n[Use <port>]: https://example.com`
    const assembled = assembleBody({ ...v1, whatShipped: prose })
    const md = committed(assembled)
    expect(marked.parse(md)).toContain('<a href="https://example.com">Use <code>&lt;port&gt;</code></a>')
    expect(md).toContain('[Use <port>]: https://example.com')
    expect(md).toContain(assembled)
  })

  it.each(['-     ', '-      ', '10.     ', '-\t\t'])('preserves rendered indented code for list prefix %j through both boundaries', (prefix) => {
    const prose = `${prefix}const value = "\\n <port>"`
    const codeBefore = marked.parse(prose, { async: false }).match(/<code>[\s\S]*?<\/code>/)?.[0]
    expect(codeBefore).toBeDefined()
    const assembled = assembleBody({ ...v1, whatShipped: prose })
    const md = committed(assembled)
    expect(marked.parse(md)).toContain(codeBefore)
    expect(md).toContain(`\n\n${assembled}\n\n---`)
    expect(committed(assembled)).toBe(md)
  })

  it('keeps adjacent code spans and placeholders as separate rendered values', () => {
    const assembled = assembleBody({ ...v1, whatShipped: '`prefix`<port>`suffix` and <port><section>' })
    const md = committed(assembled)
    const html = marked.parse(md, { async: false })
    expect(html).toContain('<code>prefix</code> <code>&lt;port&gt;</code> <code>suffix</code>')
    expect(html).toContain('<code>&lt;port&gt;</code> <code>&lt;section&gt;</code>')
    expect(md).toContain(assembled)
  })

  it('keeps a code span ending in a literal backslash beside a placeholder', () => {
    const source = '`prefix\\`<port>'
    const assembled = assembleBody({ ...v1, whatShipped: source })
    const md = committed(assembled)
    expect(marked.parse(md)).toContain('<code>prefix\\</code> <code>&lt;port&gt;</code>')
    expect(md).toContain(assembled)
  })

  it.each([
    '<div>Documentation</div>',
    '<details>\n<summary>Details</summary>\n\nBody\n\n</details>',
    '<kbd>Enter</kbd> and <br>',
    '<pre>\\n <port></pre>',
  ])('preserves intentional HTML markup %j', (source) => {
    const assembled = assembleBody({ ...v1, whatShipped: source })
    const md = committed(assembled)
    expect(md).toContain(source)
    expect(marked.parse(md)).toContain(marked.parse(source, { async: false }).trim())
    expect(md).toContain(assembled)
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
    ['formatted prose', '**Use <port>\\nNext** and *<section>* and ~~<port>~~', '**Use `<port>`\nNext** and *`<section>`* and ~~`<port>`~~'],
    ['link label', '[Use <section>](https://example.com/<port>)', '[Use `<section>`](https://example.com/<port>)'],
    ['list item boundary', '- `unfinished <port>\n- next `code`', '- \\`unfinished `<port>`\n- next `code`'],
    ['quote paragraph boundary', '> `unfinished <port>\n>\n> next `code`', '> \\`unfinished `<port>`\n> \n> next `code`'],
    ['task list', '- [x] <port>\n- [ ] Next', '- [x] `<port>`\n- [ ] Next'],
    ['list before heading', '- <port>\n## Next <section>', '- `<port>`\n## Next `<section>`'],
    ['reference destination', '[Use <port>][ref]\n\n[ref]: https://example.com/<section>', '[Use `<port>`][ref]\n\n[ref]: https://example.com/<section>'],
    ['quote before heading', '> <port>\n## Next <section>', '> `<port>`\n## Next `<section>`'],
    ['table cell boundary', '| A | B |\n| --- | --- |\n| `unfinished <port> | next `code` |', '| A | B |\n| --- | --- |\n| \\`unfinished `<port>` | next `code` |'],
    ['table escaped pipes', '| A | B |\n| --- | --- |\n| `a\\|b\\n <port>` | <section> |', '| A | B |\n| --- | --- |\n| `a\\|b\\n <port>` | `<section>` |'],
    ['table prose break', '| A | B |\n| --- | --- |\n| First\\nSecond <port> | `code` |', '| A | B |\n| --- | --- |\n| First\\nSecond `<port>` | `code` |'],
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

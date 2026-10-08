import { Lexer } from 'marked'

function normalizeProse(markdown: string): string {
  return Lexer.lexInline(markdown).map((token) => {
    if (token.type !== 'text' && token.type !== 'html') return token.raw
    return token.raw.replace(/\\\\|\\n|`|<[a-zA-Z][\w-]*>/g, (match) => {
      if (match === '\\n') return '\n'
      if (match === '`') return '\\`'
      if (match.startsWith('<')) return `\`${match}\``
      return match
    })
  }).join('')
}

function normalizeBlock(markdown: string): string {
  let result = ''
  let prose = ''
  let fence: { marker: string; length: number } | undefined
  const flushProse = (): void => {
    result += normalizeProse(prose)
    prose = ''
  }

  // Block tokenization bounds container fences and inline spans. Within a list
  // or quote, keep code lines and identity-bearing action lines verbatim.
  for (const line of markdown.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const delimiter = line.replace(/\r?\n$/, '').match(/^[ \t]*(?:> ?)*[ \t]*(?:[-+*] |\d+[.)] )?(`{3,}|~{3,})(.*)$/)
    if (fence) {
      result += line
      if (delimiter && delimiter[1][0] === fence.marker
        && delimiter[1].length >= fence.length && /^\s*$/.test(delimiter[2])) {
        fence = undefined
      }
    } else if (delimiter && (delimiter[1][0] === '~' || !delimiter[2].includes('`'))) {
      flushProse()
      fence = { marker: delimiter[1][0], length: delimiter[1].length }
      result += line
    } else if (/^> - `\/\w[\w-]*` — /.test(line) || /^(?: {4}|\t)/.test(line)) {
      // Action descriptions are hashed by actionId; changing their Markdown
      // would create new queue entries or break existing closure references.
      flushProse()
      result += line
    } else {
      prose += line
    }
  }
  flushProse()
  return result
}

/** Normalize generated prose without changing code examples or queue identities. */
export function normalizeArticleMarkdown(markdown: string): string {
  return Lexer.lex(markdown).map((token) => {
    if (token.type === 'code' || token.type === 'def' || token.type === 'space') return token.raw
    return normalizeBlock(token.raw)
  }).join('')
}

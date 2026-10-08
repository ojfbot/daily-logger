import { Lexer, type Token, type Tokens } from 'marked'

function normalizeText(text: string, inTableCell: boolean): string {
  return text.replace(/\\\\|\\n|`|<[a-zA-Z][\w-]*>/g, (match) => {
    if (match === '\\n') return inTableCell ? match : '\n'
    if (match === '`') return '\\`'
    if (match.startsWith('<')) return `\`${match}\``
    return match
  })
}

function normalizeInline(token: Token, inTableCell = false): string {
  if (token.type === 'codespan' || token.type === 'escape') return token.raw
  if ('tokens' in token && token.tokens) {
    const original = token.tokens.map((child) => child.raw).join('')
    const normalized = token.tokens.map((child) => normalizeInline(child, inTableCell)).join('')
    // Replace only the label/formatting content. Link destinations and
    // formatting delimiters retain their original source spelling.
    return original ? token.raw.replace(original, () => normalized) : token.raw
  }
  if (token.type === 'text' || token.type === 'html') return normalizeText(token.raw, inTableCell)
  return token.raw
}

function normalizeListItem(item: Tokens.ListItem): string {
  const prefix = item.raw.match(/^([ \t]*(?:[-+*]|\d+[.)])[ \t]+)/)?.[1]
  if (!prefix) return item.raw
  const taskPrefix = item.task ? item.raw.slice(prefix.length).match(/^\[[ xX]\][ \t]+/)?.[0] ?? '' : ''
  const content = normalizeArticleMarkdown(item.text).replace(/\n+$/, '')
  const lines = content.split('\n')
  const ending = item.raw.match(/\n*$/)?.[0] ?? ''
  return lines.map((line, index) => index === 0 ? prefix + taskPrefix + line : line ? ' '.repeat(prefix.length) + line : '').join('\n') + ending
}

function normalizeTable(markdown: string): string {
  return markdown.split('\n').map((line) => {
    let result = ''
    let start = 0
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\') i++
      else if (line[i] === '|') {
        result += Lexer.lexInline(line.slice(start, i)).map((token) => normalizeInline(token, true)).join('') + '|'
        start = i + 1
      }
    }
    return result + Lexer.lexInline(line.slice(start)).map((token) => normalizeInline(token, true)).join('')
  }).join('\n')
}

/** Normalize generated prose without changing code examples or queue identities. */
export function normalizeArticleMarkdown(markdown: string): string {
  return Lexer.lex(markdown).map((token) => {
    if (token.type === 'code' || token.type === 'def' || token.type === 'space') return token.raw
    if (token.type === 'table') return normalizeTable(token.raw)
    if (token.type === 'blockquote') {
      // Action descriptions are hashed by actionId. Preserve the source lines
      // consumed by build-api so normalization cannot create new queue entries.
      if (/^> - `\/\w[\w-]*` — /m.test(token.raw)) return token.raw
      const content = normalizeArticleMarkdown(token.text).replace(/\n+$/, '')
      const ending = token.raw.match(/\n*$/)?.[0] ?? ''
      return content.split('\n').map((line) => `> ${line}`).join('\n') + ending
    }
    if (token.type === 'list') {
      const original = token.items.map((item: Tokens.ListItem) => item.raw).join('')
      return token.items.map(normalizeListItem).join('') + token.raw.slice(original.length)
    }
    if ('tokens' in token && token.tokens) {
      const original = token.tokens.map((child) => child.raw).join('')
      return original ? token.raw.replace(original, () => token.tokens?.map((child) => normalizeInline(child)).join('') ?? '') : token.raw
    }
    return Lexer.lexInline(token.raw).map((child) => normalizeInline(child)).join('')
  }).join('')
}

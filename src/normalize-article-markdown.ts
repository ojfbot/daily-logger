import { Lexer, type Token, type Tokens, type TokensList } from 'marked'

const VOID_HTML_TAGS = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '))

function normalizeInlineSequence(tokens: Token[], inTableCell = false, inHtml = false): string {
  let result = ''
  let previousChanged = false
  let previousWasCode = false
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const name = token.type === 'html' ? token.raw.match(/^<([a-z][\w-]*)\b/i)?.[1]?.toLowerCase() : undefined
    let normalized: string
    if (name && !VOID_HTML_TAGS.has(name)) {
      let depth = 1
      let end = i + 1
      for (; end < tokens.length; end++) {
        const next = tokens[end]
        if (next.type !== 'html') continue
        const closing = next.raw.match(/^<\/([a-z][\w-]*)\s*>$/i)?.[1]?.toLowerCase()
        const opening = next.raw.match(/^<([a-z][\w-]*)\b/i)?.[1]?.toLowerCase()
        if (closing === name) depth--
        else if (opening === name && !/\/>$/.test(next.raw)) depth++
        if (depth === 0) break
      }
      if (depth === 0) {
        const inner = tokens.slice(i + 1, end)
        const rawContent = inner.map((child) => child.raw).join('')
        const content = /^(pre|code|script|style)$/.test(name) ? rawContent : normalizeInlineSequence(inner, inTableCell, true)
        normalized = token.raw + content + tokens[end].raw
        i = end
      } else normalized = normalizeInline(token, inTableCell, inHtml)
    } else normalized = normalizeInline(token, inTableCell, inHtml)
    const changed = normalized !== token.raw
    if ((changed || previousChanged) && result.endsWith('`') && (previousWasCode || !result.endsWith('\\`')) && normalized.startsWith('`')) result += ' '
    result += normalized
    previousChanged = changed
    previousWasCode = token.type === 'codespan'
  }
  return result
}

function normalizeText(text: string, inTableCell: boolean): string {
  return text.replace(/\\\\|\\n|`|<[a-zA-Z][\w-]*>/g, (match) => {
    if (match === '\\n') return inTableCell ? match : '\n'
    if (match === '`') return '\\`'
    if (match.startsWith('<')) return `\`${match}\``
    return match
  })
}

function normalizeInline(token: Token, inTableCell = false, inHtml = false): string {
  if (token.type === 'codespan' || token.type === 'escape') return token.raw
  if (token.type === 'html') {
    if (token.raw.startsWith('<!--')) return token.raw
    const name = token.raw.match(/^<([a-z][\w-]*)\b/i)?.[1]?.toLowerCase()
    if (name && VOID_HTML_TAGS.has(name)) return token.raw
    if (inHtml && /^<[a-z][\w-]*>$/i.test(token.raw)) return `<code>&lt;${token.raw.slice(1, -1)}&gt;</code>`
  }
  if ('tokens' in token && token.tokens) {
    const original = token.tokens.map((child) => child.raw).join('')
    const normalized = normalizeInlineSequence(token.tokens, inTableCell, inHtml)
    if ((token.type === 'link' || token.type === 'image') && original !== normalized) {
      const label = `${token.type === 'image' ? '!' : ''}[${original}]`
      if (token.raw === label || token.raw === label + '[]') {
        // Collapsed and shortcut links derive their identifier from the label.
        // Keep that identifier explicit when the displayed label changes.
        return `${token.type === 'image' ? '!' : ''}[${normalized}][${original}]`
      }
    }
    // Replace only the label/formatting content. Link destinations and
    // formatting delimiters retain their original source spelling.
    return original ? token.raw.replace(original, () => normalized) : token.raw
  }
  if (token.type === 'text' || token.type === 'html') return normalizeText(token.raw, inTableCell)
  return token.raw
}

function normalizeListItem(item: Tokens.ListItem, links: TokensList['links']): string {
  const marker = item.raw.match(/^([ \t]*(?:[-+*]|\d+[.)]))[ \t]+/)
  if (!marker) return item.raw
  // Marked retains excess spacing in item.text as code indentation. Only add
  // one separator here so that indentation is not counted a second time.
  const prefix = marker[1] + ' '
  const taskPrefix = item.task ? item.raw.slice(marker[0].length).match(/^\[[ xX]\][ \t]+/)?.[0] ?? '' : ''
  const content = normalizeBlocks(item.text, links).replace(/\n+$/, '')
  const lines = content.split('\n')
  const ending = item.raw.match(/\n*$/)?.[0] ?? ''
  return lines.map((line, index) => index === 0 ? prefix + taskPrefix + line : line ? ' '.repeat(prefix.length) + line : '').join('\n') + ending
}

function normalizeTable(markdown: string, links: TokensList['links']): string {
  const inline = (text: string): Token[] => {
    const lexer = new Lexer()
    lexer.tokens.links = links
    return lexer.inlineTokens(text)
  }
  return markdown.split('\n').map((line) => {
    let result = ''
    let start = 0
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\') i++
      else if (line[i] === '|') {
        result += normalizeInlineSequence(inline(line.slice(start, i)), true) + '|'
        start = i + 1
      }
    }
    return result + normalizeInlineSequence(inline(line.slice(start)), true)
  }).join('\n')
}

/** Normalize generated prose without changing code examples or queue identities. */
export function normalizeArticleMarkdown(markdown: string): string {
  return normalizeBlocks(markdown)
}

function normalizeBlocks(markdown: string, links?: TokensList['links']): string {
  const lexer = new Lexer()
  if (links) lexer.tokens.links = links
  const tokens = lexer.lex(markdown)
  return tokens.map((token) => {
    if (token.type === 'code' || token.type === 'def' || token.type === 'space') return token.raw
    if (token.type === 'html' && 'pre' in token && token.pre) return token.raw
    if (token.type === 'html') {
      if (token.raw.startsWith('<!--')) return token.raw
      const opening = token.raw.match(/^ {0,3}<([a-z][\w-]*)\b[^>]*>/i)
      const source = markdown.replace(/<!--[\s\S]*?-->/g, '')
      if (opening && new RegExp(`</${opening[1]}\\s*>`, 'i').test(source)) {
        const inline = lexer.inlineTokens(token.raw)
        const closesHere = new RegExp(`</${opening[1]}\\s*>`, 'i').test(token.raw)
        return closesHere ? normalizeInlineSequence(inline) : inline[0].raw + normalizeInlineSequence(inline.slice(1), false, true)
      }
    }
    if (token.type === 'table') return normalizeTable(token.raw, tokens.links)
    if (token.type === 'blockquote') {
      // Action descriptions are hashed by actionId. Preserve the source lines
      // consumed by build-api so normalization cannot create new queue entries.
      if (/^> - `\/\w[\w-]*` — /m.test(token.raw)) return token.raw
      const content = normalizeBlocks(token.text, tokens.links).replace(/\n+$/, '')
      const ending = token.raw.match(/\n*$/)?.[0] ?? ''
      return content.split('\n').map((line) => `> ${line}`).join('\n') + ending
    }
    if (token.type === 'list') {
      const original = token.items.map((item: Tokens.ListItem) => item.raw).join('')
      return token.items.map((item: Tokens.ListItem) => normalizeListItem(item, tokens.links)).join('') + token.raw.slice(original.length)
    }
    if ('tokens' in token && token.tokens) {
      const original = token.tokens.map((child) => child.raw).join('')
      return original ? token.raw.replace(original, () => normalizeInlineSequence(token.tokens ?? [])) : token.raw
    }
    return normalizeInlineSequence(lexer.inlineTokens(token.raw))
  }).join('')
}

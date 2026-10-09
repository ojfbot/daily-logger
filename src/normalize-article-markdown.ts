import { Lexer, walkTokens, type Token, type Tokens, type TokensList } from 'marked'

function normalizeInlineSequence(tokens: Token[], htmlTags: ReadonlySet<string>, inTableCell = false): string {
  let result = ''
  let previousChanged = false
  for (const token of tokens) {
    const normalized = normalizeInline(token, htmlTags, inTableCell)
    const changed = normalized !== token.raw
    if ((changed || previousChanged) && result.endsWith('`') && !result.endsWith('\\`') && normalized.startsWith('`')) result += ' '
    result += normalized
    previousChanged = changed
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

function normalizeInline(token: Token, htmlTags: ReadonlySet<string>, inTableCell = false): string {
  if (token.type === 'codespan' || token.type === 'escape') return token.raw
  if (token.type === 'html') {
    const name = token.raw.match(/^<([a-z][\w-]*)\b/i)?.[1]?.toLowerCase()
    if (name && htmlTags.has(name)) return token.raw
  }
  if ('tokens' in token && token.tokens) {
    const original = token.tokens.map((child) => child.raw).join('')
    const normalized = normalizeInlineSequence(token.tokens, htmlTags, inTableCell)
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

function normalizeListItem(item: Tokens.ListItem, links: TokensList['links'], htmlTags: ReadonlySet<string>): string {
  const marker = item.raw.match(/^([ \t]*(?:[-+*]|\d+[.)]))[ \t]+/)
  if (!marker) return item.raw
  // Marked retains excess spacing in item.text as code indentation. Only add
  // one separator here so that indentation is not counted a second time.
  const prefix = marker[1] + ' '
  const taskPrefix = item.task ? item.raw.slice(marker[0].length).match(/^\[[ xX]\][ \t]+/)?.[0] ?? '' : ''
  const content = normalizeBlocks(item.text, links, htmlTags).replace(/\n+$/, '')
  const lines = content.split('\n')
  const ending = item.raw.match(/\n*$/)?.[0] ?? ''
  return lines.map((line, index) => index === 0 ? prefix + taskPrefix + line : line ? ' '.repeat(prefix.length) + line : '').join('\n') + ending
}

function normalizeTable(markdown: string, links: TokensList['links'], htmlTags: ReadonlySet<string>): string {
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
        result += normalizeInlineSequence(inline(line.slice(start, i)), htmlTags, true) + '|'
        start = i + 1
      }
    }
    return result + normalizeInlineSequence(inline(line.slice(start)), htmlTags, true)
  }).join('\n')
}

/** Normalize generated prose without changing code examples or queue identities. */
export function normalizeArticleMarkdown(markdown: string): string {
  return normalizeBlocks(markdown)
}

function normalizeBlocks(markdown: string, links?: TokensList['links'], protectedHtmlTags?: ReadonlySet<string>): string {
  const lexer = new Lexer()
  if (links) lexer.tokens.links = links
  const tokens = lexer.lex(markdown)
  const htmlTags = new Set(protectedHtmlTags ?? 'area base br col embed hr img input link meta param source track wbr'.split(' '))
  if (!protectedHtmlTags) {
    walkTokens(tokens, (token) => {
      if (token.type === 'html') {
        for (const match of token.raw.matchAll(/<\/([a-z][\w-]*)\s*>/gi)) htmlTags.add(match[1].toLowerCase())
      }
    })
  }
  return tokens.map((token) => {
    if (token.type === 'code' || token.type === 'def' || token.type === 'space') return token.raw
    if (token.type === 'html' && token.pre) return token.raw
    if (token.type === 'table') return normalizeTable(token.raw, tokens.links, htmlTags)
    if (token.type === 'blockquote') {
      // Action descriptions are hashed by actionId. Preserve the source lines
      // consumed by build-api so normalization cannot create new queue entries.
      if (/^> - `\/\w[\w-]*` — /m.test(token.raw)) return token.raw
      const content = normalizeBlocks(token.text, tokens.links, htmlTags).replace(/\n+$/, '')
      const ending = token.raw.match(/\n*$/)?.[0] ?? ''
      return content.split('\n').map((line) => `> ${line}`).join('\n') + ending
    }
    if (token.type === 'list') {
      const original = token.items.map((item: Tokens.ListItem) => item.raw).join('')
      return token.items.map((item: Tokens.ListItem) => normalizeListItem(item, tokens.links, htmlTags)).join('') + token.raw.slice(original.length)
    }
    if ('tokens' in token && token.tokens) {
      const original = token.tokens.map((child) => child.raw).join('')
      return original ? token.raw.replace(original, () => normalizeInlineSequence(token.tokens ?? [], htmlTags)) : token.raw
    }
    return normalizeInlineSequence(lexer.inlineTokens(token.raw), htmlTags)
  }).join('')
}

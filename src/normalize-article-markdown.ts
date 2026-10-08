/** Normalize generated prose without changing code examples or queue identities. */
export function normalizeArticleMarkdown(markdown: string): string {
  let result = ''
  let fence: { marker: string; length: number } | undefined
  let lineStart = true

  for (let i = 0; i < markdown.length;) {
    if (lineStart) {
      const end = markdown.indexOf('\n', i)
      const line = markdown.slice(i, end === -1 ? markdown.length : end)
      const delimiter = line.match(/^[ \t]*(?:> ?)*[ \t]*(?:[-+*] |\d+[.)] )?(`{3,}|~{3,})(.*)$/)
      if (fence) {
        if (delimiter && delimiter[1][0] === fence.marker
          && delimiter[1].length >= fence.length && /^\s*$/.test(delimiter[2])) {
          fence = undefined
        }
        result += line
        i += line.length
        lineStart = false
        continue
      }
      if (delimiter && (delimiter[1][0] === '~' || !delimiter[2].includes('`'))) {
        fence = { marker: delimiter[1][0], length: delimiter[1].length }
        result += line
        i += line.length
        lineStart = false
        continue
      }
      // Action descriptions are hashed by actionId; changing their Markdown
      // would create new queue entries or break existing closure references.
      if (/^> - `\/\w[\w-]*` — /.test(line) || /^(?: {4}|\t)/.test(line)) {
        result += line
        i += line.length
        lineStart = false
        continue
      }
    }

    lineStart = false
    if (markdown[i] === '`') {
      const run = markdown.slice(i).match(/^`+/)?.[0] ?? '`'
      const candidates = /`+/g
      candidates.lastIndex = i + run.length
      const boundary = markdown.slice(i).search(/\n[ \t]*\n/)
      const paragraphEnd = boundary === -1 ? markdown.length : i + boundary
      let closing: RegExpExecArray | null
      while ((closing = candidates.exec(markdown)) !== null) {
        if (closing.index >= paragraphEnd) {
          closing = null
          break
        }
        if (closing[0].length === run.length) break
      }
      const end = closing ? closing.index + run.length : i + run.length
      result += closing ? markdown.slice(i, end) : run.replaceAll('`', '\\`')
      i = end
    } else if (markdown[i] === '\\') {
      if (markdown[i + 1] === 'n') {
        result += '\n'
        i += 2
        lineStart = true
      } else {
        // Keep escaped punctuation and doubled backslashes together.
        result += markdown.slice(i, i + 2)
        i += 2
      }
    } else if (markdown[i] === '<') {
      const placeholder = markdown.slice(i).match(/^<[a-zA-Z][\w-]*>/)?.[0]
      if (placeholder) {
        result += `\`${placeholder}\``
        i += placeholder.length
      } else {
        result += markdown[i++]
      }
    } else {
      lineStart = markdown[i] === '\n'
      result += markdown[i++]
    }
  }
  return result
}

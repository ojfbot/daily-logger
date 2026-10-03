import { Marked } from 'marked'

// Some council responses contain literal "\\n" sequences in a whole prose field.
// Recover those line breaks before Markdown parsing, while leaving code spans alone.
function restoreLineBreaks(markdown: string): string {
  let fenceMarker = ''
  let fenceLength = 0

  return markdown.split('\n').map((line) => {
    if (fenceMarker) {
      const closingFence = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/)
      if (closingFence && closingFence[1][0] === fenceMarker && closingFence[1].length >= fenceLength) {
        fenceMarker = ''
        fenceLength = 0
      }
      return line
    }

    const openingFence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (openingFence && (openingFence[1][0] === '~' || !openingFence[2].includes('`'))) {
      fenceMarker = openingFence[1][0]
      fenceLength = openingFence[1].length
      return line
    }

    if ((line.match(/\\n/g)?.length ?? 0) < 2) return line

    let result = ''
    let codeTicks = 0
    for (let i = 0; i < line.length;) {
      if (line[i] === '`') {
        let end = i + 1
        while (line[end] === '`') end++
        const count = end - i
        if (codeTicks === 0) codeTicks = count
        else if (codeTicks === count) codeTicks = 0
        result += line.slice(i, end)
        i = end
      } else if (line[i] === '\\' && line[i + 1] === '\\') {
        result += '\\\\'
        i += 2
      } else if (codeTicks === 0 && line.slice(i, i + 2) === '\\n') {
        result += '\n'
        i += 2
      } else {
        result += line[i]
        i++
      }
    }
    return result
  }).join('\n')
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function safeUrl(href: string): string | null {
  const url = href.replace(/[\u0000-\u0020\u007f]/g, '')
  const scheme = url.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase()
  if (scheme && scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto') return null
  return url
}

const articleMarkdown = new Marked({
  renderer: {
    // Articles may describe paths such as /canvas/<section>/chat. Raw HTML in
    // prose corrupts the article DOM and can inject arbitrary markup.
    html({ text }) {
      if (/^<!--[\s\S]*-->$/.test(text.trim())) return ''
      return escapeHtml(text)
    },
    link({ href, title, tokens }) {
      const content = this.parser.parseInline(tokens)
      const url = safeUrl(href)
      if (url === null) return content
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : ''
      return `<a href="${escapeHtml(url)}"${titleAttribute}>${content}</a>`
    },
    image({ href, title, text, tokens }) {
      const alt = tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : text
      const url = safeUrl(href)
      if (url === null) return escapeHtml(alt)
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : ''
      return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${titleAttribute}>`
    },
  },
})

export function renderArticle(markdown: string): string {
  return articleMarkdown.parse(restoreLineBreaks(markdown), { async: false })
}

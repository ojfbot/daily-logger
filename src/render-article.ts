import { Marked } from 'marked'

// Some council responses contain literal "\\n" sequences in a whole prose field.
// Recover those line breaks before Markdown parsing, while leaving code spans alone.
function restoreLineBreaks(markdown: string): string {
  let inFence = false
  let fenceMarker = ''

  return markdown.split('\n').map((line) => {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (fence) {
      const marker = fence[1][0]
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (marker === fenceMarker) {
        inFence = false
      }
      return line
    }

    if (inFence || (line.match(/\\n/g)?.length ?? 0) < 2) return line

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

const articleMarkdown = new Marked({
  renderer: {
    // Articles may describe paths such as /canvas/<section>/chat. Raw HTML in
    // prose corrupts the article DOM and can inject arbitrary markup.
    html({ text }) {
      if (/^<!--[\s\S]*-->$/.test(text.trim())) return ''
      return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
    },
  },
})

export function renderArticle(markdown: string): string {
  return articleMarkdown.parse(restoreLineBreaks(markdown), { async: false })
}

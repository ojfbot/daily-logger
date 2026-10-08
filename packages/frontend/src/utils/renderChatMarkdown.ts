import { Marked } from 'marked'

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

const chatMarkdown = new Marked({
  renderer: {
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

export function renderChatMarkdown(markdown: string): string {
  return chatMarkdown.parse(markdown, { async: false })
}

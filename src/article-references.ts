import type { BlogContext } from './types.js'
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import { Lexer, type Token } from 'marked'
import { renderArticle } from './render-article.js'

export type GithubResourceKind = 'pull' | 'issues'
export type GithubReferenceKinds = ReadonlyMap<string, GithubResourceKind>

const REPO = /^[A-Za-z0-9_.-]+$/
const LINK = /^\[([^\]\n]+)\]\((https:\/\/github\.com\/[^)\s]+)\)$/

export function githubReferenceKey(repo: string, number: string): string {
  return `${repo.toLowerCase()}#${number}`
}

/** Model shipment references may be a number, #number, or that repo's canonical PR URL. */
export function shipmentPrNumber(value: string, repo: string): string | undefined {
  if (!REPO.test(repo)) return undefined
  const bare = /^#?([1-9]\d*)$/.exec(value)
  if (bare) return bare[1]
  const url = /^https:\/\/github\.com\/ojfbot\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)$/.exec(value)
  return url?.[1].toLowerCase() === repo.toLowerCase() ? url[2] : undefined
}

/** The collected source kind wins over model wording for identities in the sweep. */
export function githubReferenceKinds(ctx: BlogContext): GithubReferenceKinds {
  const kinds = new Map<string, GithubResourceKind>()
  const add = (repo: string, number: number, kind: GithubResourceKind) => {
    const key = githubReferenceKey(repo, String(number))
    const current = kinds.get(key)
    if (current && current !== kind) throw new Error(`Conflicting GitHub resource kinds for ${key}`)
    kinds.set(key, kind)
  }
  for (const issue of [...ctx.openIssues, ...ctx.closedIssues]) add(issue.repo, issue.number, 'issues')
  for (const pr of [...ctx.mergedPRs, ...ctx.openPRs, ...ctx.recentPRs]) add(pr.repo, pr.number, 'pull')
  return kinds
}

function canonicalResource(url: string): { repo: string; kind: GithubResourceKind; number: string; fragment: string } | undefined {
  const match = /^https:\/\/github\.com\/ojfbot\/([A-Za-z0-9_.-]+)\/(pull|issues)\/([1-9]\d*)(#(?:issuecomment-[1-9]\d*|pullrequestreview-[1-9]\d*|discussion_r[1-9]\d*))?$/.exec(url)
  if (!match) return undefined
  if (match[2] === 'issues' && match[4] && !match[4].startsWith('#issuecomment-')) return undefined
  return { repo: match[1], kind: match[2] === 'pull' ? 'pull' : 'issues', number: match[3], fragment: match[4] ?? '' }
}

function mapUnfencedMarkdown(markdown: string, visit: (segment: string) => string): string {
  let fence: { marker: string; length: number } | undefined
  let prose = ''
  let result = ''
  const flush = () => { result += visit(prose); prose = '' }
  const lines = markdown.split('\n')
  for (const [index, line] of lines.entries()) {
    const raw = `${line}${index < lines.length - 1 ? '\n' : ''}`
    const marker = /^ {0,3}(?:>\s*)*(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      if (marker && marker[1][0] === fence.marker && marker[1].length >= fence.length && /^[ \t]*$/.test(marker[2])) fence = undefined
      result += raw
      continue
    }
    if (marker && (marker[1][0] === '~' || !marker[2].includes('`'))) {
      flush()
      fence = { marker: marker[1][0], length: marker[1].length }
      result += raw
      continue
    }
    prose += raw
  }
  flush()
  return result
}

function explicitlyNamesIssue(label: string, precedingText: string): boolean {
  return /\bissue\s*$/i.test(precedingText)
    || /\bissue\s*#?\d+\b/i.test(label)
    || /^(?:open |closed )?issue$/i.test(label.trim())
}

type HtmlNode = DefaultTreeAdapterMap['node']

function renderedAnchorLinks(html: string): { label: string; url: string; precedingText: string }[] {
  const links: { label: string; url: string; precedingText: string }[] = []
  let text = ''
  let paragraphStart = 0
  const visit = (node: HtmlNode): void => {
    if ('value' in node) { text += node.value; return }
    if (!('childNodes' in node)) return
    const start = text.length
    for (const child of node.childNodes) visit(child)
    if ('tagName' in node) {
      if (node.tagName === 'a') {
        const href = node.attrs.find((attr) => attr.name === 'href')?.value
        if (href) links.push({ label: text.slice(start), url: href, precedingText: text.slice(paragraphStart, start) })
      }
      if (['p', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr'].includes(node.tagName)) {
        text += '\n'
        paragraphStart = text.length
      }
    }
  }
  visit(parseFragment(html))
  return links
}

/** Correct only source-known links and links explicitly labeled as issues in generated prose. */
export function normalizeArticleResourceLinks(markdown: string, kinds: GithubReferenceKinds): string {
  const normalizeSegment = (segment: string): string => {
    const normalizeTokens = (source: string, tokens: Token[], sourceOffset: number): string => {
      let cursor = 0
      let result = ''
      for (const token of tokens) {
        const start = source.indexOf(token.raw, cursor)
        if (start === -1) return source
        result += source.slice(cursor, start)
        const absoluteStart = sourceOffset + start
        let replacement = token.raw
        const link = token.type === 'link' ? LINK.exec(token.raw) : null
        if (link) {
          const [, label, url] = link
          const resource = canonicalResource(url)
          if (resource) {
            const fromSource = kinds.get(githubReferenceKey(resource.repo, resource.number))
            const namedIssue = explicitlyNamesIssue(label, segment.slice(segment.lastIndexOf('\n', absoluteStart - 1) + 1, absoluteStart))
            if (fromSource === 'pull' && namedIssue) throw new Error(`Article calls ${resource.repo}#${resource.number} an issue, but collected source says PR`)
            const kind = fromSource ?? (namedIssue ? 'issues' : resource.kind)
            replacement = `[${label}](https://github.com/ojfbot/${resource.repo}/${kind}/${resource.number}${resource.fragment})`
          }
        } else if (token.type !== 'image' && 'tokens' in token && Array.isArray(token.tokens)) {
          replacement = normalizeTokens(token.raw, token.tokens, absoluteStart)
        }
        result += replacement
        cursor = start + token.raw.length
      }
      return result + source.slice(cursor)
    }
    return normalizeTokens(segment, Lexer.lexInline(segment), 0)
  }
  return Lexer.lex(markdown).map((block) =>
    block.type === 'code' || block.type === 'html' ? block.raw : mapUnfencedMarkdown(block.raw, normalizeSegment)
  ).join('')
}

/** Check the actual rendered links; source facts verify identities while other links remain unknown. */
export function assertArticleReferenceContract(markdown: string, kinds: GithubReferenceKinds = new Map(), renderedHtml?: string): { verified: number; unknown: number } {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
  const links = renderedAnchorLinks(renderedHtml ?? renderArticle(body))
  let verified = 0, unknown = 0
  for (const { label, url, precedingText } of links) {
    if (label.startsWith('#https://')) throw new Error(`Nested GitHub reference label: ${label}`)
    if (!/^https:\/\/github\.com\/ojfbot\//.test(url)) continue
    if (!/\/pull\/|\/issues\//.test(url)) continue
    const resource = canonicalResource(url)
    if (!resource) throw new Error(`Non-canonical GitHub resource URL: ${url}`)
    const expected = kinds.get(githubReferenceKey(resource.repo, resource.number))
    if (expected && expected !== resource.kind) throw new Error(`Wrong GitHub resource kind for ${resource.repo}#${resource.number}: expected ${expected}`)
    if (explicitlyNamesIssue(label, precedingText) && resource.kind !== 'issues') {
      throw new Error(`Issue ${resource.repo}#${resource.number} links to a pull request`)
    }
    if (expected) verified++
    else unknown++
  }
  return { verified, unknown }
}

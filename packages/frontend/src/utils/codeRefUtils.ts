import type { CodeReference } from '../store/types.ts'

export type CodeReferenceType = CodeReference['type']

const ORG = 'ojfbot'
const COMMIT_RE = /^[a-f0-9]{7,40}$/

export const TYPE_LABELS: Record<CodeReferenceType, string> = {
  commit: 'COMMIT',
  component: 'COMPONENT',
  file: 'FILE',
  package: 'PACKAGE',
  command: 'COMMAND',
  config: 'CONFIG',
  env: 'ENV VAR',
  endpoint: 'ENDPOINT',
  directory: 'DIRECTORY',
}

export interface ResolvedRef {
  ref: CodeReference
  url: string | null
  label: string
  detail: string
}

export function resolveRef(ref: CodeReference): ResolvedRef {
  const base = `https://github.com/${ORG}`

  switch (ref.type) {
    case 'commit': {
      const url = ref.url ?? (ref.repo ? `${base}/${ref.repo}/commit/${ref.text}` : null)
      return { ref, url, label: ref.text.slice(0, 7), detail: ref.repo ?? 'unknown repo' }
    }
    case 'component':
      return {
        ref,
        url: ref.url ?? (ref.repo && ref.path ? `${base}/${ref.repo}/blob/main/${ref.path}` : null),
        label: ref.text,
        detail: ref.path ? `${ref.repo ?? ''}/${ref.path}` : ref.repo ?? 'component',
      }
    case 'file':
      return {
        ref,
        url: ref.url ?? (ref.repo && ref.path ? `${base}/${ref.repo}/blob/main/${ref.path}` : null),
        label: ref.text,
        detail: ref.repo ?? 'file',
      }
    case 'package': {
      let pkgUrl = ref.url ?? null
      if (!pkgUrl) {
        const ojfMatch = ref.text.match(/^@ojfbot\/(.+)$/)
        if (ojfMatch) {
          pkgUrl = `${base}/${ojfMatch[1]}`
        } else if (ref.repo) {
          pkgUrl = `${base}/${ref.repo}`
        } else if (ref.text.startsWith('@')) {
          pkgUrl = `https://www.npmjs.com/package/${ref.text}`
        }
      }
      return { ref, url: pkgUrl, label: ref.text, detail: ref.repo ? `${ref.repo} package` : 'package' }
    }
    case 'command':
      return { ref, url: null, label: ref.text, detail: 'CLI command' }
    case 'config':
      return { ref, url: null, label: ref.text, detail: ref.repo ? `config in ${ref.repo}` : 'config key' }
    case 'env':
      return { ref, url: null, label: ref.text, detail: 'environment variable' }
    case 'endpoint':
      return { ref, url: null, label: ref.text, detail: ref.repo ? `${ref.repo} API` : 'HTTP endpoint' }
    case 'directory':
      return {
        ref,
        url: ref.url ?? (ref.repo ? `${base}/${ref.repo}/tree/main/${ref.path ?? ref.text}` : null),
        label: ref.text,
        detail: ref.repo ?? 'directory',
      }
  }
}

export function classifyByRegex(text: string): CodeReferenceType {
  if (COMMIT_RE.test(text)) return 'commit'
  if (/^(GET|POST|PUT|DELETE|PATCH)\s+\//.test(text)) return 'endpoint'
  if (/^[A-Z][A-Z0-9_]{1,}$/.test(text)) return 'env'
  if (/^@[\w-]+\/[\w.-]+$/.test(text)) return 'package'
  if (/^\/[\w-]+/.test(text) && !text.includes('.')) return 'command'
  if (/\/$/.test(text)) return 'directory'
  if (/\.\w{1,10}$/.test(text) || (text.includes('/') && !text.startsWith('/'))) return 'file'
  if (/^[A-Z][a-z]+(?:[A-Z][a-z]*)+$/.test(text)) return 'component'
  if (/^[a-z][\w]*-[\w-]+$/.test(text)) return 'package'
  if (/^[a-z][a-zA-Z0-9]+$/.test(text) && /[A-Z]/.test(text)) return 'config'
  return 'config'
}

export function findRepoForElement(el: Element, boundary: Element, reposActive: string[]): string | null {
  const h3 = findNearestH3(el, boundary)
  if (h3) {
    const repo = extractRepoFromH3(h3)
    if (repo && reposActive.includes(repo)) return repo
  }
  return reposActive.length === 1 ? reposActive[0] : null
}

function findNearestH3(el: Element, boundary: Element): HTMLHeadingElement | null {
  let node: Element | null = el
  while (node && node !== boundary) {
    let sibling = node.previousElementSibling
    while (sibling) {
      if (sibling.tagName === 'H3') return sibling as HTMLHeadingElement
      if (sibling.tagName === 'H2') return null
      sibling = sibling.previousElementSibling
    }
    node = node.parentElement
  }
  return null
}

function extractRepoFromH3(h3: HTMLHeadingElement): string | null {
  const text = h3.textContent ?? ''
  const dashIndex = text.indexOf(' — ')
  const candidate = dashIndex !== -1 ? text.slice(0, dashIndex).trim() : text.trim()
  if (candidate.includes(':')) return null
  return candidate.replace(/\s*\(.*\)$/, '').trim()
}

export interface CodeRefElement {
  element: HTMLElement
  ref: CodeReference
}

export function findCodeElements(
  articleContent: Element,
  refsIndex: Map<string, CodeReference>,
  reposActive: string[],
): CodeRefElement[] {
  const results: CodeRefElement[] = []
  const codes = articleContent.querySelectorAll('code')

  for (const code of codes) {
    if (code.closest('pre')) continue
    const text = code.textContent?.trim() ?? ''
    if (text.length < 2) continue

    let ref = refsIndex.get(text)
    if (!ref) {
      const type = classifyByRegex(text)
      const repo = findRepoForElement(code, articleContent, reposActive)
      ref = { text, type, repo: repo ?? undefined }
    }

    results.push({ element: code as HTMLElement, ref })
  }

  return results
}

export const PR_LINK_RE = /^https:\/\/github\.com\/ojfbot\/([^/]+)\/(pull|issues)\/(\d+)\/?$/

// Universal code reference popovers (ADR-0031)
// Hover over any backtick-wrapped code token in an article to see contextual info.
// Click to open the source on GitHub.

import { getEntries } from './data'
import type { EntryData, CodeReference, CodeReferenceType } from './types'

const ORG = 'ojfbot'
const COMMIT_RE = /^[a-f0-9]{7,40}$/
const CACHE_KEY = 'dl-commit-cache'
const SHOW_DELAY = 200

// ─── Commit data (GitHub API) ─────────────────────────────────────────────

interface CommitData {
  sha: string
  message: string
  author: string
  date: string
  url: string
  repo: string
  pr?: { number: number; title: string }
}

type CommitCacheEntry =
  | { status: 'loading' }
  | { status: 'ok'; data: CommitData }
  | { status: 'error'; message: string }

const commitCache = new Map<string, CommitCacheEntry>()

function loadCommitCache(): void {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return
    const entries = JSON.parse(raw) as Record<string, CommitData>
    for (const [key, data] of Object.entries(entries)) {
      commitCache.set(key, { status: 'ok', data })
    }
  } catch { /* ignore corrupt cache */ }
}

function saveCommitCache(): void {
  try {
    const obj: Record<string, CommitData> = {}
    for (const [key, entry] of commitCache) {
      if (entry.status === 'ok') obj[key] = entry.data
    }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(obj))
  } catch { /* storage full */ }
}

async function fetchCommitData(repo: string, hash: string): Promise<CommitData> {
  const res = await fetch(`https://api.github.com/repos/${ORG}/${repo}/commits/${hash}`)

  if (res.status === 404) throw new Error('Commit not found on GitHub')
  if (res.status === 403) throw new Error('Rate limited — try again later')
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)

  const json = await res.json()
  const fullMessage: string = json.commit?.message ?? ''
  const firstLine = fullMessage.split('\n')[0]

  const prMatch = firstLine.match(/\(#(\d+)\)/)
  let pr: CommitData['pr'] = undefined
  if (prMatch) {
    pr = { number: parseInt(prMatch[1], 10), title: '' }
  }

  return {
    sha: json.sha ?? hash,
    message: firstLine,
    author: json.commit?.author?.name ?? '',
    date: json.commit?.author?.date ?? '',
    url: json.html_url ?? `https://github.com/${ORG}/${repo}/commit/${hash}`,
    repo,
    pr,
  }
}

// ─── PR data (GitHub API) ─────────────────────────────────────────────────

interface PRData {
  number: number
  title: string
  state: string
  merged: boolean
  author: string
  date: string
  url: string
  repo: string
  additions: number
  deletions: number
  labels: string[]
}

type PRCacheEntry =
  | { status: 'loading' }
  | { status: 'ok'; data: PRData }
  | { status: 'error'; message: string }

const prCache = new Map<string, PRCacheEntry>()

const PR_LINK_RE = /^https:\/\/github\.com\/ojfbot\/([^/]+)\/(pull|issues)\/(\d+)\/?$/

async function fetchPRData(repo: string, number: number): Promise<PRData> {
  const res = await fetch(`https://api.github.com/repos/${ORG}/${repo}/pulls/${number}`)

  if (res.status === 404) {
    // Try issues endpoint as fallback (issue links use same pattern)
    const issueRes = await fetch(`https://api.github.com/repos/${ORG}/${repo}/issues/${number}`)
    if (issueRes.status === 404) throw new Error('Private repo — preview unavailable')
    if (issueRes.status === 403) throw new Error('Rate limited — try again later')
    if (!issueRes.ok) throw new Error('Private repo — preview unavailable')
    const issue = await issueRes.json()
    return {
      number,
      title: issue.title ?? '',
      state: issue.state ?? 'unknown',
      merged: false,
      author: issue.user?.login ?? '',
      date: issue.created_at ?? '',
      url: issue.html_url ?? `https://github.com/${ORG}/${repo}/issues/${number}`,
      repo,
      additions: 0,
      deletions: 0,
      labels: (issue.labels ?? []).map((l: { name: string }) => l.name),
    }
  }

  if (res.status === 403) throw new Error('Rate limited — try again later')
  if (!res.ok) throw new Error('Private repo — preview unavailable')

  const json = await res.json()
  return {
    number,
    title: json.title ?? '',
    state: json.merged ? 'merged' : json.state ?? 'unknown',
    merged: json.merged ?? false,
    author: json.user?.login ?? '',
    date: json.created_at ?? '',
    url: json.html_url ?? `https://github.com/${ORG}/${repo}/pull/${number}`,
    repo,
    additions: json.additions ?? 0,
    deletions: json.deletions ?? 0,
    labels: (json.labels ?? []).map((l: { name: string }) => l.name),
  }
}

// ─── Reference resolution ─────────────────────────────────────────────────

interface ResolvedRef {
  ref: CodeReference
  url: string | null
  label: string
  detail: string
}

function resolveRef(ref: CodeReference): ResolvedRef {
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
        // @ojfbot/* → GitHub repo
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

// ─── Type display labels ──────────────────────────────────────────────────

const TYPE_LABELS: Record<CodeReferenceType, string> = {
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

// ─── Regex fallback classification ────────────────────────────────────────

function classifyByRegex(text: string): CodeReferenceType {
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

// ─── DOM scanning ─────────────────────────────────────────────────────────

interface CodeRefElement {
  element: HTMLElement
  ref: CodeReference
}

function findCodeElements(
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

    // Look up in structured index first, fall back to regex
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

function findRepoForElement(el: Element, boundary: Element, reposActive: string[]): string | null {
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

// ─── Popover element ──────────────────────────────────────────────────────

let popoverEl: HTMLDivElement | null = null

function getPopover(): HTMLDivElement {
  if (popoverEl) return popoverEl
  popoverEl = document.createElement('div')
  popoverEl.className = 'commit-popover'
  popoverEl.setAttribute('role', 'tooltip')
  popoverEl.innerHTML = `
    <div class="commit-popover-type"></div>
    <div class="commit-popover-sha"></div>
    <div class="commit-popover-message"></div>
    <div class="commit-popover-pr"></div>
    <div class="commit-popover-meta"></div>
  `
  document.body.appendChild(popoverEl)
  return popoverEl
}

function showPopoverForRef(anchor: HTMLElement, resolved: ResolvedRef): void {
  const pop = getPopover()
  const typeEl = pop.querySelector('.commit-popover-type') as HTMLElement
  const sha = pop.querySelector('.commit-popover-sha') as HTMLElement
  const msg = pop.querySelector('.commit-popover-message') as HTMLElement
  const pr = pop.querySelector('.commit-popover-pr') as HTMLElement
  const meta = pop.querySelector('.commit-popover-meta') as HTMLElement

  // Set type badge
  typeEl.textContent = TYPE_LABELS[resolved.ref.type]
  typeEl.className = `commit-popover-type ref-type-${resolved.ref.type}`

  sha.textContent = resolved.label
  msg.textContent = ''
  msg.className = 'commit-popover-message'
  pr.textContent = ''
  meta.textContent = resolved.detail

  // Clickable URL
  pop.dataset.url = resolved.url ?? ''

  positionPopover(pop, anchor)
  pop.classList.add('visible')
}

function showPopoverForCommit(anchor: HTMLElement, content: CommitCacheEntry, ref: CodeReference): void {
  const pop = getPopover()
  const typeEl = pop.querySelector('.commit-popover-type') as HTMLElement
  const sha = pop.querySelector('.commit-popover-sha') as HTMLElement
  const msg = pop.querySelector('.commit-popover-message') as HTMLElement
  const pr = pop.querySelector('.commit-popover-pr') as HTMLElement
  const meta = pop.querySelector('.commit-popover-meta') as HTMLElement

  typeEl.textContent = 'COMMIT'
  typeEl.className = 'commit-popover-type ref-type-commit'

  if (content.status === 'loading') {
    sha.textContent = ref.text
    msg.textContent = 'Loading...'
    msg.className = 'commit-popover-message commit-popover-loading'
    pr.textContent = ''
    meta.textContent = ref.repo ?? ''
    pop.dataset.url = ''
  } else if (content.status === 'error') {
    sha.textContent = ref.text
    msg.textContent = content.message
    msg.className = 'commit-popover-message commit-popover-error'
    pr.textContent = ''
    meta.textContent = ref.repo ?? ''
    pop.dataset.url = ''
  } else {
    const d = content.data
    sha.textContent = d.sha.slice(0, 7)
    msg.textContent = d.message
    msg.className = 'commit-popover-message'
    if (d.pr) {
      pr.textContent = `#${d.pr.number}${d.pr.title ? ` — ${d.pr.title}` : ''}`
    } else {
      pr.textContent = ''
    }
    const dateStr = d.date ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
    meta.textContent = `${ORG}/${d.repo}${dateStr ? ` · ${dateStr}` : ''}`
    pop.dataset.url = d.url
  }

  positionPopover(pop, anchor)
  pop.classList.add('visible')
}

function showPopoverForPR(anchor: HTMLElement, content: PRCacheEntry, repo: string, number: number): void {
  const pop = getPopover()
  const typeEl = pop.querySelector('.commit-popover-type') as HTMLElement
  const sha = pop.querySelector('.commit-popover-sha') as HTMLElement
  const msg = pop.querySelector('.commit-popover-message') as HTMLElement
  const pr = pop.querySelector('.commit-popover-pr') as HTMLElement
  const meta = pop.querySelector('.commit-popover-meta') as HTMLElement

  typeEl.textContent = 'PULL REQUEST'
  typeEl.className = 'commit-popover-type ref-type-pr'

  if (content.status === 'loading') {
    sha.textContent = `#${number}`
    msg.textContent = 'Loading...'
    msg.className = 'commit-popover-message commit-popover-loading'
    pr.textContent = ''
    meta.textContent = `${ORG}/${repo}`
    pop.dataset.url = ''
  } else if (content.status === 'error') {
    sha.textContent = `#${number}`
    msg.textContent = content.message
    msg.className = 'commit-popover-message commit-popover-error'
    pr.textContent = ''
    meta.textContent = `${ORG}/${repo}`
    pop.dataset.url = ''
  } else {
    const d = content.data
    sha.textContent = `#${d.number}`
    msg.textContent = d.title
    msg.className = 'commit-popover-message'

    const stateBadge = d.merged ? 'merged' : d.state
    const diffStr = (d.additions || d.deletions)
      ? ` · +${d.additions} −${d.deletions}`
      : ''
    pr.textContent = `${stateBadge}${diffStr}`

    const dateStr = d.date
      ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : ''
    meta.textContent = `${ORG}/${d.repo}${dateStr ? ` · ${dateStr}` : ''}${d.author ? ` · ${d.author}` : ''}`
    pop.dataset.url = d.url
  }

  positionPopover(pop, anchor)
  pop.classList.add('visible')
}

function hidePopover(): void {
  popoverEl?.classList.remove('visible')
}

function positionPopover(pop: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect()
  const gap = 8

  pop.style.left = '-9999px'
  pop.style.top = '-9999px'
  pop.classList.add('visible')
  const popRect = pop.getBoundingClientRect()
  pop.classList.remove('visible')

  let top = rect.top - popRect.height - gap
  if (top < 12) {
    top = rect.bottom + gap
  }

  let left = rect.left + rect.width / 2 - popRect.width / 2
  left = Math.max(12, Math.min(left, window.innerWidth - popRect.width - 12))

  pop.style.top = `${top}px`
  pop.style.left = `${left}px`
}

// ─── Hover handlers ───────────────────────────────────────────────────────

let showTimer: ReturnType<typeof setTimeout> | null = null
let activeAnchor: HTMLElement | null = null

function attachHoverListeners(element: HTMLElement, ref: CodeReference): void {
  element.addEventListener('mouseenter', () => {
    if (ref.type === 'commit' && ref.repo) {
      handleCommitHover(element, ref)
    } else {
      // Non-commit types: show immediately
      showTimer = setTimeout(() => {
        activeAnchor = element
        showPopoverForRef(element, resolveRef(ref))
      }, SHOW_DELAY)
    }
  })

  element.addEventListener('mouseleave', () => {
    if (showTimer) {
      clearTimeout(showTimer)
      showTimer = null
    }
    activeAnchor = null
    hidePopover()
  })

  // Click: open URL in new tab
  element.addEventListener('click', (e) => {
    const resolved = resolveRef(ref)
    if (resolved.url) {
      e.preventDefault()
      window.open(resolved.url, '_blank', 'noopener')
    } else if (activeAnchor === element) {
      activeAnchor = null
      hidePopover()
    } else {
      e.preventDefault()
      element.dispatchEvent(new MouseEvent('mouseenter'))
    }
  })
}

function attachPRHoverListeners(element: HTMLElement, repo: string, prNumber: number): void {
  element.addEventListener('mouseenter', () => {
    const cacheKey = `pr:${repo}/${prNumber}`
    const cached = prCache.get(cacheKey)

    if (cached?.status === 'ok') {
      activeAnchor = element
      showPopoverForPR(element, cached, repo, prNumber)
      return
    }

    showTimer = setTimeout(() => {
      activeAnchor = element

      if (!prCache.has(cacheKey)) {
        prCache.set(cacheKey, { status: 'loading' })
        showPopoverForPR(element, { status: 'loading' }, repo, prNumber)

        fetchPRData(repo, prNumber)
          .then(data => {
            prCache.set(cacheKey, { status: 'ok', data })
            if (activeAnchor === element) showPopoverForPR(element, prCache.get(cacheKey)!, repo, prNumber)
          })
          .catch(err => {
            const msg = err instanceof Error ? err.message : 'Private repo — preview unavailable'
            prCache.set(cacheKey, { status: 'error', message: msg })
            if (activeAnchor === element) showPopoverForPR(element, prCache.get(cacheKey)!, repo, prNumber)
          })
      } else {
        showPopoverForPR(element, prCache.get(cacheKey)!, repo, prNumber)
      }
    }, SHOW_DELAY)
  })

  element.addEventListener('mouseleave', () => {
    if (showTimer) {
      clearTimeout(showTimer)
      showTimer = null
    }
    activeAnchor = null
    hidePopover()
  })

  // Don't override click — the <a> tag already navigates to GitHub
}

function handleCommitHover(element: HTMLElement, ref: CodeReference): void {
  const repo = ref.repo!
  const hash = ref.text
  const cacheKey = `${repo}/${hash}`
  const cached = commitCache.get(cacheKey)

  if (cached?.status === 'ok') {
    activeAnchor = element
    showPopoverForCommit(element, cached, ref)
    return
  }

  showTimer = setTimeout(() => {
    activeAnchor = element

    if (!commitCache.has(cacheKey)) {
      commitCache.set(cacheKey, { status: 'loading' })
      showPopoverForCommit(element, { status: 'loading' }, ref)

      fetchCommitData(repo, hash)
        .then(data => {
          commitCache.set(cacheKey, { status: 'ok', data })
          saveCommitCache()
          if (activeAnchor === element) showPopoverForCommit(element, commitCache.get(cacheKey)!, ref)
        })
        .catch(err => {
          const msg = err instanceof Error ? err.message : 'Failed to load commit'
          commitCache.set(cacheKey, { status: 'error', message: msg })
          if (activeAnchor === element) showPopoverForCommit(element, commitCache.get(cacheKey)!, ref)
        })
    } else {
      showPopoverForCommit(element, commitCache.get(cacheKey)!, ref)
    }
  }, SHOW_DELAY)
}

// ─── Init ─────────────────────────────────────────────────────────────────

function extractDateFromURL(): string | null {
  const match = window.location.pathname.match(/\/articles\/([\d-]+)/)
  return match?.[1] ?? null
}

export async function initCommitPopovers(): Promise<void> {
  const articleContent = document.querySelector('.article-content')
  if (!articleContent) return

  loadCommitCache()

  // Get article date
  const date = (document.querySelector('.related-articles') as HTMLElement | null)?.dataset.date ?? extractDateFromURL()
  let reposActive: string[] = []
  let codeReferences: CodeReference[] = []

  if (date) {
    const entries: EntryData[] = await getEntries()
    const entry = entries.find(e => e.date === date)
    reposActive = entry?.reposActive ?? []
    codeReferences = entry?.codeReferences ?? []
  }

  // Build lookup index from structured code references
  const refsIndex = new Map<string, CodeReference>()
  for (const ref of codeReferences) {
    refsIndex.set(ref.text, ref)
  }

  const codeRefElements = findCodeElements(articleContent, refsIndex, reposActive)

  for (const { element, ref } of codeRefElements) {
    element.classList.add('code-ref')
    element.classList.add(`ref-type-${ref.type}`)
    element.dataset.refType = ref.type
    if (ref.repo) element.dataset.repo = ref.repo

    // Backward compat: commit-hash class for existing CSS
    if (ref.type === 'commit') element.classList.add('commit-hash')

    attachHoverListeners(element, ref)
  }

  // ─── PR link popovers ─────────────────────────────────────────────────
  const prLinks = articleContent.querySelectorAll('a[href*="github.com/ojfbot"]')
  for (const link of prLinks) {
    const href = (link as HTMLAnchorElement).href
    const match = href.match(PR_LINK_RE)
    if (!match) continue

    const repo = match[1]
    const prNumber = parseInt(match[3], 10)
    const el = link as HTMLElement

    el.classList.add('code-ref', 'ref-type-pr')

    attachPRHoverListeners(el, repo, prNumber)
  }
}

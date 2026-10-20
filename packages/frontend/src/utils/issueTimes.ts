import type { IssueTime } from '../../../../src/issue-times.ts'
import type { TimeReference } from '../../../../src/time-reference-schema.ts'

function canonicalIssueUrl(value: string): string | undefined {
  let parsed: URL
  try { parsed = new URL(value) } catch { return undefined }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com' || parsed.port || parsed.username || parsed.password) return undefined
  const [owner, repo, kind, ref] = parsed.pathname.split('/').filter(Boolean)
  if (!owner || !repo || kind !== 'issues' || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || !/^[1-9]\d*$/.test(ref ?? '')) return undefined
  return `https://github.com/${owner}/${repo}/issues/${ref}`
}

export function issueTimeReference(issue: IssueTime): TimeReference {
  return {
    text: `${issue.at.slice(11, 16)}Z`, occurrence: 0, at: issue.at, precision: 'minute',
    evidence: { kind: 'github-issue', repo: issue.source.repo, ref: issue.source.ref, event: issue.event, url: issue.source.url },
  }
}

/** Attach source-owned Created/Updated controls to the first canonical issue link. */
export function attachIssueTimes(root: HTMLElement, issueTimes: IssueTime[]) {
  const byUrl = new Map(issueTimes.map((issue) => [issue.source.url, issue]))
  const inserted: HTMLElement[] = []
  const seen = new Set<string>()
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const issueUrl = canonicalIssueUrl(link.href)
    const issue = issueUrl ? byUrl.get(issueUrl) : undefined
    if (!issue || seen.has(issue.source.url)) continue
    seen.add(issue.source.url)
    const existing = link.nextElementSibling
    if (existing instanceof HTMLElement && existing.classList.contains('issue-time-state') && existing.dataset.issueUrl === issue.source.url) continue
    const state = document.createElement('span')
    state.className = 'issue-time-state'
    state.dataset.articleDecoration = 'issue-time'
    state.dataset.issueUrl = issue.source.url
    state.append(' · ')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'time-ref issue-time-ref'
    const label = issue.event === 'created' ? 'Created' : 'Updated'
    button.setAttribute('aria-label', `Issue ${label.toLowerCase()} at ${issue.at.slice(11, 16)}Z; show UTC and your local time`)
    button.setAttribute('aria-expanded', 'false')
    button.append(`${label} `)
    const time = document.createElement('time')
    time.dateTime = issue.at
    time.textContent = `${issue.at.slice(11, 16)}Z`
    button.append(time)
    state.append(button)
    link.insertAdjacentElement('afterend', state)
    inserted.push(state)
  }
  return { restore: () => inserted.forEach((element) => element.remove()) }
}

export function decorateIssueTimesHtml(bodyHtml: string, issueTimes: IssueTime[]): string {
  if (!issueTimes.length) return bodyHtml
  const root = document.createElement('div')
  root.innerHTML = bodyHtml
  attachIssueTimes(root, issueTimes)
  return root.innerHTML
}

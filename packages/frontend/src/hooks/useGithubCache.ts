import { useCallback, useRef, useState } from 'react'

const ORG = 'ojfbot'
const COMMIT_CACHE_KEY = 'dl-commit-cache'

export interface CommitData {
  sha: string
  message: string
  author: string
  date: string
  url: string
  repo: string
  pr?: { number: number; title: string }
}

export interface PRData {
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

export type CacheEntry<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'error'; message: string }

async function fetchCommitData(repo: string, hash: string): Promise<CommitData> {
  const res = await fetch(`https://api.github.com/repos/${ORG}/${repo}/commits/${hash}`)
  if (res.status === 404) throw new Error('Commit not found on GitHub')
  if (res.status === 403) throw new Error('Rate limited — try again later')
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)

  const json = await res.json()
  const fullMessage: string = json.commit?.message ?? ''
  const firstLine = fullMessage.split('\n')[0]
  const prMatch = firstLine.match(/\(#(\d+)\)/)

  return {
    sha: json.sha ?? hash,
    message: firstLine,
    author: json.commit?.author?.name ?? '',
    date: json.commit?.author?.date ?? '',
    url: json.html_url ?? `https://github.com/${ORG}/${repo}/commit/${hash}`,
    repo,
    pr: prMatch ? { number: parseInt(prMatch[1], 10), title: '' } : undefined,
  }
}

async function fetchPRData(repo: string, number: number): Promise<PRData> {
  const res = await fetch(`https://api.github.com/repos/${ORG}/${repo}/pulls/${number}`)

  if (res.status === 404) {
    const issueRes = await fetch(`https://api.github.com/repos/${ORG}/${repo}/issues/${number}`)
    if (!issueRes.ok) throw new Error('Private repo — preview unavailable')
    const issue = await issueRes.json()
    return {
      number, title: issue.title ?? '', state: issue.state ?? 'unknown',
      merged: false, author: issue.user?.login ?? '', date: issue.created_at ?? '',
      url: issue.html_url ?? `https://github.com/${ORG}/${repo}/issues/${number}`,
      repo, additions: 0, deletions: 0,
      labels: (issue.labels ?? []).map((l: { name: string }) => l.name),
    }
  }

  if (res.status === 403) throw new Error('Rate limited — try again later')
  if (!res.ok) throw new Error('Private repo — preview unavailable')

  const json = await res.json()
  return {
    number, title: json.title ?? '',
    state: json.merged ? 'merged' : json.state ?? 'unknown',
    merged: json.merged ?? false, author: json.user?.login ?? '',
    date: json.created_at ?? '',
    url: json.html_url ?? `https://github.com/${ORG}/${repo}/pull/${number}`,
    repo, additions: json.additions ?? 0, deletions: json.deletions ?? 0,
    labels: (json.labels ?? []).map((l: { name: string }) => l.name),
  }
}

export function useGithubCache() {
  const commitCache = useRef(new Map<string, CacheEntry<CommitData>>())
  const prCacheRef = useRef(new Map<string, CacheEntry<PRData>>())
  const [, forceUpdate] = useState(0)

  // Load sessionStorage on first call
  const initialized = useRef(false)
  if (!initialized.current) {
    initialized.current = true
    try {
      const raw = sessionStorage.getItem(COMMIT_CACHE_KEY)
      if (raw) {
        const entries = JSON.parse(raw) as Record<string, CommitData>
        for (const [key, data] of Object.entries(entries)) {
          commitCache.current.set(key, { status: 'ok', data })
        }
      }
    } catch { /* ignore */ }
  }

  const saveCommitCache = useCallback(() => {
    try {
      const obj: Record<string, CommitData> = {}
      for (const [key, entry] of commitCache.current) {
        if (entry.status === 'ok') obj[key] = entry.data
      }
      sessionStorage.setItem(COMMIT_CACHE_KEY, JSON.stringify(obj))
    } catch { /* storage full */ }
  }, [])

  const getCommit = useCallback((repo: string, hash: string): CacheEntry<CommitData> => {
    const key = `${repo}/${hash}`
    const cached = commitCache.current.get(key)
    if (cached) return cached

    commitCache.current.set(key, { status: 'loading' })
    fetchCommitData(repo, hash)
      .then(data => {
        commitCache.current.set(key, { status: 'ok', data })
        saveCommitCache()
        forceUpdate(n => n + 1)
      })
      .catch(err => {
        commitCache.current.set(key, { status: 'error', message: err instanceof Error ? err.message : 'Failed' })
        forceUpdate(n => n + 1)
      })

    return { status: 'loading' }
  }, [saveCommitCache])

  const getPR = useCallback((repo: string, number: number): CacheEntry<PRData> => {
    const key = `pr:${repo}/${number}`
    const cached = prCacheRef.current.get(key)
    if (cached) return cached

    prCacheRef.current.set(key, { status: 'loading' })
    fetchPRData(repo, number)
      .then(data => {
        prCacheRef.current.set(key, { status: 'ok', data })
        forceUpdate(n => n + 1)
      })
      .catch(err => {
        prCacheRef.current.set(key, { status: 'error', message: err instanceof Error ? err.message : 'Failed' })
        forceUpdate(n => n + 1)
      })

    return { status: 'loading' }
  }, [])

  return { getCommit, getPR }
}

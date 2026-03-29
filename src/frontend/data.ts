// Data fetching + caching for static JSON API

import type { EntryData, TagCount, RepoStats, ActionItem } from './types'

const BASE = (document.querySelector('meta[name="baseurl"]') as HTMLMetaElement | null)?.content ?? '/daily-logger'
const cache: Record<string, unknown> = {}

async function fetchJSON<T>(path: string): Promise<T> {
  if (cache[path]) return cache[path] as T
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  const data = await res.json()
  cache[path] = data
  return data as T
}

export async function getEntries(): Promise<EntryData[]> {
  return fetchJSON<EntryData[]>('/api/entries.json')
}

export async function getActions(): Promise<ActionItem[]> {
  return fetchJSON<ActionItem[]>('/api/actions.json')
}

export async function getTags(): Promise<TagCount[]> {
  return fetchJSON<TagCount[]>('/api/tags.json')
}

export async function getRepos(): Promise<RepoStats[]> {
  return fetchJSON<RepoStats[]>('/api/repos.json')
}

export async function getDoneActions(): Promise<ActionItem[]> {
  try {
    return await fetchJSON<ActionItem[]>('/api/done-actions.json')
  } catch {
    return []
  }
}

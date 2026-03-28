// Data fetching + caching for static JSON API

const BASE = document.querySelector('meta[name="baseurl"]')?.content ?? '/daily-logger'
const cache = {}

async function fetchJSON(path) {
  if (cache[path]) return cache[path]
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  const data = await res.json()
  cache[path] = data
  return data
}

export async function getEntries() {
  return fetchJSON('/api/entries.json')
}

export async function getActions() {
  return fetchJSON('/api/actions.json')
}

export async function getTags() {
  return fetchJSON('/api/tags.json')
}

export async function getRepos() {
  return fetchJSON('/api/repos.json')
}

export async function getDoneActions() {
  try {
    return await fetchJSON('/api/done-actions.json')
  } catch {
    return []
  }
}

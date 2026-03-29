// Re-export backend types (type-only — stripped by esbuild)
export type { TypedTag, ActionItem, DecisionEntry, CodeReference, CodeReferenceType } from '../schema.js'
import type { TypedTag, ActionItem, DecisionEntry, CodeReference } from '../schema.js'
// ^-- Used by interfaces below; the export-from above doesn't bring names into scope

// Frontend-specific interfaces matching build-api.ts JSON output

export interface EntryData {
  date: string
  title: string
  summary: string
  tags: TypedTag[]
  reposActive: string[]
  commitCount: number
  activityType: string
  schemaVersion: number
  decisions?: DecisionEntry[]
  actions?: ActionItem[]
  codeReferences?: CodeReference[]
}

export interface TagCount {
  name: string
  type: string
  count: number
}

export interface RepoStats {
  name: string
  articleCount: number
  totalCommits: number
  relatedTags: string[]
}

export interface FilterCallbacks {
  toggleFilter: (type: string, name: string) => void
  isFilterActive: (type: string, name: string) => boolean
  clearFilters: () => void
  hasActiveFilters: () => boolean
  getActiveFilters: () => Map<string, Set<string>>
}

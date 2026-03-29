// Shared types for the React frontend — mirrors the static JSON API shape

export interface TypedTag {
  name: string
  type: string
}

export interface CodeReference {
  text: string
  type: 'commit' | 'component' | 'file' | 'package' | 'command' | 'config' | 'env' | 'endpoint' | 'directory'
  repo?: string
  path?: string
  url?: string
  meta?: Record<string, string>
}

export interface DecisionEntry {
  title: string
  summary: string
  repo: string
  pillar?: string
  relatedTags: string[]
}

export interface ActionItem {
  command: string
  description: string
  repo: string
  status: string
  sourceDate: string
}

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

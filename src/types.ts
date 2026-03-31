import type { ActionItem as ActionItemType, ClosedAction as ClosedActionType } from './schema.js'

export interface CommitInfo {
  hash: string
  message: string
  author: string
  date: string
  repo: string
  url: string
}

export interface IssueInfo {
  number: number
  title: string
  state: 'open' | 'closed'
  labels: string[]
  createdAt?: string
  closedAt?: string
  url: string
  repo: string
  body?: string
  /** True when the issue was created in the last 24h (first time the sweep sees it). */
  isNew?: boolean
}

export interface PRInfo {
  number: number
  title: string
  mergedAt: string
  additions: number
  deletions: number
  url: string
  repo: string
  body?: string
}

export interface OpenPRInfo {
  number: number
  title: string
  repo: string
  url: string
  body?: string
  createdAt: string
  draft: boolean
}

export interface RecentPRInfo {
  number: number
  title: string
  repo: string
  url: string
  body?: string
  state: 'open' | 'closed'
  createdAt: string
  updatedAt: string
  mergedAt?: string
  draft: boolean
}

export interface BlogContext {
  date: string
  repos: string[]
  commits: CommitInfo[]
  mergedPRs: PRInfo[]
  openPRs: OpenPRInfo[]
  /** All PRs (open + closed) created or updated in the last 24h */
  recentPRs: RecentPRInfo[]
  closedIssues: IssueInfo[]
  openIssues: IssueInfo[]
  /** Open actions from previous articles, filtered against done-actions.json */
  openActions: ActionItemType[]
  projectVision: string
  previousArticles: Array<{ date: string; excerpt: string }>
}

export interface GeneratedArticle {
  title: string
  date: string
  tags: string[]
  summary: string
  body: string
  closedActions?: ClosedActionType[]
}

export interface Persona {
  slug: string
  role: string
  content: string  // full markdown body after frontmatter
}

export interface CouncilNote {
  personaSlug: string
  personaRole: string
  critique: string  // raw markdown critique from this persona's POV
}

export interface GeneratedReport {
  personaSlug: string
  personaRole: string
  date: string
  body: string
}

// ─── Structured article (what Claude returns from the write_article tool) ──────

export interface StructuredArticle {
  title: string
  tags: string[]
  summary: string
  lede?: string
  whatShipped: string
  theDecisions: string
  roadmapPulse: string
  whatsNext: string
  actions?: {
    whatShipped?: string[]
    theDecisions?: string[]
    roadmapPulse?: string[]
    whatsNext?: string[]
  }
}

// ─── v2 structured article types (re-exported from schema.ts) ────────────────

export type {
  TypedTag,
  ShipmentEntry,
  DecisionEntry,
  ActionItem,
  ClosedAction,
  ArticleDataV2,
  ActivityType,
  StubArticle,
  ValidationResult,
} from './schema.js'

// ─── Daily cleaner types ───────────────────────────────────────────────────────

export interface CleanCandidate {
  repo: string
  filePath: string
  startLine: number
  endLine: number
  original: string    // exact line(s) to examine
  context: string     // surrounding content with line numbers for Claude
  kind: 'todo' | 'fixme' | 'doc-file' | 'inline-comment'
  recentCommits: string  // summary of recent commits in this repo
}

export interface CleanProposal {
  repo: string
  filePath: string
  startLine: number
  endLine: number
  original: string
  replacement: string  // empty string = delete those lines entirely
  rationale: string    // one sentence: what made this stale
  confidence: 'high' | 'medium'
}

// ─── Structured clean context (feeds rich API data into cleaner prompts) ─────

export interface CleanEntryData {
  date: string
  summary: string
  reposActive: string[]
  decisions: Array<{ title: string; summary: string; repo: string; pillar?: string }>
  actions: Array<{ command: string; description: string; repo: string }>
}

export interface CleanDoneAction {
  command: string
  description: string
  repo: string
  sourceDate: string
  closedDate: string
  resolution: string
}

export interface CleanOpenAction {
  command: string
  description: string
  repo: string
  sourceDate: string
}

export interface StructuredCleanContext {
  todaySummary: string
  recentEntries: CleanEntryData[]      // last 3 days from entries.json
  openActions: CleanOpenAction[]
  doneActions: CleanDoneAction[]
  rawArticleFallback: string           // GitHub API fallback if structured data unavailable
}

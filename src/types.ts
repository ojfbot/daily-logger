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

export interface BlogContext {
  date: string
  repos: string[]
  commits: CommitInfo[]
  mergedPRs: PRInfo[]
  openPRs: OpenPRInfo[]
  closedIssues: IssueInfo[]
  openIssues: IssueInfo[]
  projectVision: string
  previousArticles: Array<{ date: string; excerpt: string }>
}

export interface GeneratedArticle {
  title: string
  date: string
  tags: string[]
  summary: string
  body: string
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

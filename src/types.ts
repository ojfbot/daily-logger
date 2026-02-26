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

export interface BlogContext {
  date: string
  repos: string[]
  commits: CommitInfo[]
  mergedPRs: PRInfo[]
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

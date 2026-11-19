import type { ActionItem as ActionItemType } from './action-item-schema.js'
import { formatArticleFooter, type ArticleProvenance } from './article-provenance.js'
import { normalizeArticleMarkdown } from './normalize-article-markdown.js'
import { titleWithReportingWeekday } from './article-title.js'

export interface GeneratedArticle {
  title: string
  date: string
  tags: string[]
  summary: string
  body: string
  suggestedActions?: ActionItemType[]
  commitCount?: number
  reposActive?: string[]
  provenance?: ArticleProvenance
  generationMode?: 'model' | 'mock' | 'stub'
}

export function toMarkdown(article: GeneratedArticle & { schemaVersion?: number }): string {
  const esc = (s: string) => s.replace(/"/g, '\\"')

  const persistedBody = ['', normalizeArticleMarkdown(article.body), '', '---', '', formatArticleFooter(article.provenance), ''].join('\n')
  const lines = [
    '---',
    `title: "${esc(titleWithReportingWeekday(article.date, article.title))}"`,
    `date: ${article.date}`,
    `tags: [${article.tags.map((t) => `"${t}"`).join(', ')}]`,
    `summary: "${esc(article.summary)}"`,
  ]

  lines.push(`status: "draft"`)

  if (article.schemaVersion) {
    lines.push(`schemaVersion: ${article.schemaVersion}`)
  }

  if (article.commitCount !== undefined) {
    lines.push(`commitCount: ${article.commitCount}`)
  }
  if (article.reposActive?.length) {
    lines.push(`reposActive: [${article.reposActive.map((r) => `"${r}"`).join(', ')}]`)
  }
  if (article.provenance) {
    lines.push(`provenance: ${JSON.stringify(article.provenance)}`)
  }

  lines.push('---', persistedBody)

  return lines.join('\n')
}

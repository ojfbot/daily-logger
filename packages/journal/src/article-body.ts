import type { ArticleDataV2 } from './article-schema.js'
import { normalizeArticleMarkdown } from './normalize-article-markdown.js'
import { draftRecommendationContextMarker } from './recommendation-prose.js'
import { assertArticleReferenceContract, githubReferenceKey, normalizeArticleResourceLinks, shipmentPrNumber, type GithubReferenceKinds } from './article-references.js'

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

/**
 * Assembles the article body from structured Claude output.
 * Section headings and suggested-actions blockquotes are injected by code —
 * Claude only supplies the prose content and action items.
 * This guarantees every article has the required three prose sections and blockquotes,
 * regardless of what Claude decided to include or omit.
 *
 * Handles both v1 (StructuredArticle) and v2 (ArticleDataV2) inputs.
 */
export function assembleBody(s: StructuredArticle | ArticleDataV2, kinds: GithubReferenceKinds = new Map()): string {
  if ('schemaVersion' in s && s.schemaVersion === 2) {
    const body = normalizeArticleResourceLinks(normalizeArticleMarkdown(assembleBodyV2(s as ArticleDataV2, kinds)), kinds)
    assertArticleReferenceContract(body, kinds)
    return body
  }
  const body = normalizeArticleResourceLinks(normalizeArticleMarkdown(assembleBodyV1(s as StructuredArticle)), kinds)
  assertArticleReferenceContract(body, kinds)
  return body
}

function assembleBodyV1(s: StructuredArticle): string {
  const sections: Array<[string, string, string[] | undefined]> = [
    ['What shipped', s.whatShipped, s.actions?.whatShipped],
    ['The decisions', s.theDecisions, s.actions?.theDecisions],
    ['Roadmap pulse', s.roadmapPulse, s.actions?.roadmapPulse],
  ]

  const parts: string[] = []

  if (s.lede?.trim()) {
    parts.push(s.lede.trim(), '')
  }

  for (const [heading, content] of sections) {
    parts.push(`## ${heading}`, '', content.trim(), '')
  }

  const context = draftRecommendationContextMarker(s.whatsNext)
  if (context) parts.push(context)

  return parts.join('\n').trimEnd()
}

// ─── PR linkification helpers ─────────────────────────────────────────────────

const GITHUB_ORG = 'ojfbot'

/** Convert "#42" (or "42") to markdown link `[#42](https://github.com/ojfbot/{repo}/pull/42)` */
function linkifyPR(ref: string, repo: string): string {
  const num = shipmentPrNumber(ref, repo)
  if (!num) throw new Error(`Invalid shipment PR reference for ${repo}: ${ref}`)
  return `[#${num}](https://github.com/${GITHUB_ORG}/${repo}/pull/${num})`
}

/** Convert `[repo] #N` patterns in free-text GFM to markdown links. */
function linkifyPRRefs(text: string, knownRepos: string[], kinds: GithubReferenceKinds): string {
  const repoSet = new Set(knownRepos)
  return text.replace(
    /\[(\w[\w-]*)\]\s*#(\d+)/g,
    (match, repo: string, num: string) => {
      if (!repoSet.has(repo)) return match
      const kind = kinds.get(githubReferenceKey(repo, num)) ?? 'pull'
      return `[${repo}] [#${num}](https://github.com/${GITHUB_ORG}/${repo}/${kind}/${num})`
    },
  )
}

/** Convert bare `#N` in text to a markdown link using a known repo. */
function linkifyBarePRs(text: string, repo: string, kinds: GithubReferenceKinds): string {
  return text.replace(
    /(?<!\[)#(\d+)(?!\])/g,
    (_m, num: string) => {
      const kind = kinds.get(githubReferenceKey(repo, num)) ?? 'pull'
      return `[#${num}](https://github.com/${GITHUB_ORG}/${repo}/${kind}/${num})`
    },
  )
}

function assembleBodyV2(s: ArticleDataV2, kinds: GithubReferenceKinds): string {
  const parts: string[] = []

  const knownRepos = [...new Set([
    ...s.whatShipped.map((sh) => sh.repo),
    ...(s.reposActive ?? []),
  ])]

  if (s.lede?.trim()) {
    parts.push(s.lede.trim(), '')
  }

  // ── What shipped ──
  parts.push('## What shipped', '')
  if (s.whatShipped.length === 0) {
    parts.push('No code committed today. What follows is an audit of in-flight work.', '')
  } else {
    for (const ship of s.whatShipped) {
      const prRefs = ship.prs?.length
        ? ` (${ship.prs.map((pr) => linkifyPR(pr, ship.repo)).join(', ')})`
        : ''
      parts.push(`### ${ship.repo}${prRefs}`, '')
      parts.push(linkifyBarePRs(ship.description.trim(), ship.repo, kinds), '')
      if (ship.commits.length > 0) {
        parts.push(ship.commits.map((c) => `- \`${c}\``).join('\n'), '')
      }
    }
  }

  // ── The decisions ──
  parts.push('## The decisions', '')
  if (s.decisions.length === 0) {
    parts.push('No major architectural decisions today.', '')
  } else {
    for (const dec of s.decisions) {
      const pillarBadge = dec.pillar ? ` — *${dec.pillar}*` : ''
      parts.push(`### ${dec.title}${pillarBadge}`, '')
      parts.push(linkifyPRRefs(dec.summary.trim(), knownRepos, kinds), '')
      if (dec.relatedTags.length > 0) {
        parts.push(`Tags: ${dec.relatedTags.map((t) => `\`${t}\``).join(', ')}`, '')
      }
    }
  }

  // ── Roadmap pulse ──
  parts.push('## Roadmap pulse', '')
  parts.push(linkifyPRRefs((s.roadmapPulse ?? 'No roadmap update today.').trim(), knownRepos, kinds), '')

  // ── Skill Telemetry ──
  if (s.skillTelemetry) {
    const st = s.skillTelemetry
    parts.push('## Skill telemetry', '')
    parts.push(st.adoptionSummary, '')
    if (st.prSkillReports && st.prSkillReports.length > 0) {
      for (const report of st.prSkillReports) {
        parts.push(`- **${report.repo}#${report.pr}**: ${report.skills.map((s) => `\`/${s}\``).join(', ')}`)
      }
      parts.push('')
    }
    if (st.suggestionsGiven && st.suggestionsGiven > 0) {
      const conversion = st.suggestionsGiven > 0
        ? Math.round(((st.suggestionsFollowed ?? 0) / st.suggestionsGiven) * 100)
        : 0
      parts.push(`Suggestion funnel: ${st.suggestionsGiven} offered, ${st.suggestionsFollowed ?? 0} followed (${conversion}% conversion).`, '')
    }
    parts.push(`Quality gate coverage: ${st.qualityCoverage}%`, '')
    parts.push(st.narrative.trim(), '')
  }

  const context = draftRecommendationContextMarker(linkifyPRRefs((s.whatsNext ?? '').trim(), knownRepos, kinds))
  if (context) parts.push(context)

  return parts.join('\n').trimEnd()
}

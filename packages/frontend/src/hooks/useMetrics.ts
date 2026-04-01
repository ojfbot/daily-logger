import { useMemo } from 'react'
import type { EntryData, RepoStats, ActionItem } from '../store/types.ts'

export interface PopoverSection {
  heading?: string
  lines: string[]
}

export interface MetricCardData {
  value: number
  label: string
  popover: PopoverSection[]
}

export function useMetrics(
  entries: EntryData[],
  repos: RepoStats[],
  actions: ActionItem[],
  doneActions: ActionItem[],
): MetricCardData[] {
  return useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))

    // ── ENTRIES ──────────────────────────────────────────────────────
    const firstDate = sorted[0]?.date ?? '—'
    const lastDate = sorted[sorted.length - 1]?.date ?? '—'
    const weeks = Math.max(1, Math.ceil(entries.length > 1
      ? (new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (7 * 86400000)
      : 1))
    const perWeek = (entries.length / weeks).toFixed(1)

    const statusCounts: Record<string, number> = {}
    for (const e of entries) {
      const s = e.status ?? 'accepted'
      statusCounts[s] = (statusCounts[s] ?? 0) + 1
    }
    const statusLine = Object.entries(statusCounts)
      .map(([k, v]) => `${v} ${k}`)
      .join(' · ')

    const mostRecent = sorted[sorted.length - 1]
    const recentTitle = mostRecent
      ? `${mostRecent.date} — ${mostRecent.title.slice(0, 50)}${mostRecent.title.length > 50 ? '…' : ''}`
      : '—'

    const entriesCard: MetricCardData = {
      value: entries.length,
      label: 'ENTRIES',

      popover: [{
        lines: [
          `${firstDate} → ${lastDate}`,
          `${perWeek} entries/week avg`,
          statusLine,
          recentTitle,
        ],
      }],
    }

    // ── ACTIVE REPOS ─────────────────────────────────────────────────
    const allRepos = new Set(entries.flatMap((e) => e.reposActive ?? []))

    const topRepos = [...repos]
      .sort((a, b) => b.articleCount - a.articleCount)
      .slice(0, 5)
      .map((r) => `${r.name}  ${r.articleCount} articles  ${r.totalCommits} commits`)

    const reposCard: MetricCardData = {
      value: allRepos.size,
      label: 'ACTIVE REPOS',

      popover: [{ heading: 'Top repos', lines: topRepos }],
    }

    // ── TOTAL COMMITS ────────────────────────────────────────────────
    const totalCommits = entries.reduce((s, e) => s + e.commitCount, 0)

    const avgCommits = entries.length > 0 ? (totalCommits / entries.length).toFixed(0) : '0'
    const peakEntry = sorted.reduce((best, e) => e.commitCount > (best?.commitCount ?? 0) ? e : best, sorted[0])
    const peakLine = peakEntry ? `Peak: ${peakEntry.date} — ${peakEntry.commitCount} commits` : '—'

    const topReposByCommits = [...repos]
      .sort((a, b) => b.totalCommits - a.totalCommits)
      .slice(0, 5)
      .map((r) => `${r.name}  ${r.totalCommits}`)

    const commitsCard: MetricCardData = {
      value: totalCommits,
      label: 'TOTAL COMMITS',

      popover: [{
        lines: [
          `${avgCommits} commits/day avg`,
          peakLine,
        ],
      }, {
        heading: 'By repo',
        lines: topReposByCommits,
      }],
    }

    // ── ACTIONS ──────────────────────────────────────────────────────
    const openCount = actions.length
    const doneCount = doneActions.length
    const totalActions = openCount + doneCount
    const rate = totalActions > 0 ? Math.round((doneCount / totalActions) * 100) : 0

    const openByRepo: Record<string, number> = {}
    for (const a of actions) {
      openByRepo[a.repo] = (openByRepo[a.repo] ?? 0) + 1
    }
    const repoBreakdown = Object.entries(openByRepo)
      .sort((a, b) => b[1] - a[1])
      .map(([repo, count]) => `${repo} (${count})`)
      .join(' · ')

    const actionsCard: MetricCardData = {
      value: totalActions,
      label: 'ACTIONS',

      popover: [{
        lines: [
          `${openCount} open · ${doneCount} closed`,
          `${rate}% completion`,
          ...(repoBreakdown ? [`Open: ${repoBreakdown}`] : []),
        ],
      }],
    }

    // ── DECISIONS ────────────────────────────────────────────────────
    const totalDecisions = entries.reduce((s, e) => s + (e.decisions?.length ?? 0), 0)

    const pillarCounts: Record<string, number> = {}
    for (const e of entries) {
      for (const d of e.decisions ?? []) {
        const p = d.pillar || 'untagged'
        pillarCounts[p] = (pillarCounts[p] ?? 0) + 1
      }
    }
    const pillarLines = Object.entries(pillarCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([pillar, count]) => `${pillar}: ${count}`)

    const decisionsCard: MetricCardData = {
      value: totalDecisions,
      label: 'DECISIONS',

      popover: [
        ...(pillarLines.length > 0 ? [{ heading: 'By pillar', lines: pillarLines }] : []),
        ...(pillarLines.length === 0 ? [{ lines: ['No structured decisions yet'] }] : []),
      ],
    }

    return [entriesCard, reposCard, commitsCard, actionsCard, decisionsCard]
  }, [entries, repos, actions, doneActions])
}

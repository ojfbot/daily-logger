import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface TelemetrySummary {
  totalToolCalls: number
  totalSessions: number
  toolBreakdown: Record<string, number>
  skillsInvoked: Array<{ name: string; count: number }>
  repoBreakdown: Record<string, number>
  lintFixed: number
  lintRegressions: number
  qualityCoverage: number
  suggestionsGiven: number
  suggestionsFollowed: number
  suggestionConversion: number
  prSkillComments: number
}

interface ToolEntry {
  ts: string
  event: string
  tool_name?: string
  skill?: string
  repo?: string
  session_id?: string
  violations_fixed?: number
  new_violations?: number
}

interface SessionEntry {
  ts: string
  session_id: string
  repo?: string
}

interface SkillEntry {
  ts: string
  event: string
  skill?: string
  repo?: string
  session_id?: string
  suggested_at?: string
  pr?: string
}

interface SuggestionEntry {
  ts: string
  event: string
  skill?: string
  prompt_prefix?: string
  repo?: string
  session_id?: string
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return []
  try {
    const content = readFileSync(path, 'utf-8').trim()
    if (!content) return []
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as T
        } catch {
          return null
        }
      })
      .filter((x): x is T => x !== null)
  } catch {
    return []
  }
}

function filterBySince<T extends { ts: string }>(entries: T[], since: string): T[] {
  return entries.filter((e) => e.ts >= since)
}

/**
 * Collect and aggregate Claude Code telemetry from JSONL files.
 *
 * Reads from `telemetryDir` (defaults to ~/.claude or TELEMETRY_DIR env var).
 * Returns null if no telemetry files exist — callers should treat null as
 * "telemetry unavailable" and skip gracefully.
 */
export function collectTelemetry(since: string): TelemetrySummary | null {
  const telemetryDir = process.env.TELEMETRY_DIR || join(homedir(), '.claude')

  const toolPath = join(telemetryDir, 'tool-telemetry.jsonl')
  const sessionPath = join(telemetryDir, 'session-telemetry.jsonl')
  const skillPath = join(telemetryDir, 'skill-telemetry.jsonl')
  const suggestionPath = join(telemetryDir, 'suggestion-telemetry.jsonl')

  const toolEntries = filterBySince(readJsonl<ToolEntry>(toolPath), since)
  const sessionEntries = filterBySince(readJsonl<SessionEntry>(sessionPath), since)
  const skillEntries = filterBySince(readJsonl<SkillEntry>(skillPath), since)
  const suggestionEntries = filterBySince(readJsonl<SuggestionEntry>(suggestionPath), since)

  if (toolEntries.length === 0 && sessionEntries.length === 0 && skillEntries.length === 0) {
    return null
  }

  // Tool breakdown
  const toolBreakdown: Record<string, number> = {}
  for (const e of toolEntries) {
    if (e.event === 'tool:used' && e.tool_name) {
      toolBreakdown[e.tool_name] = (toolBreakdown[e.tool_name] || 0) + 1
    }
  }

  // Skills invoked — prefer skill-telemetry.jsonl (richer data), fall back to tool telemetry
  const skillCounts: Record<string, number> = {}
  const skillInvocations = skillEntries.filter((e) => e.event === 'skill:invoked')
  if (skillInvocations.length > 0) {
    for (const e of skillInvocations) {
      if (e.skill) {
        skillCounts[e.skill] = (skillCounts[e.skill] || 0) + 1
      }
    }
  } else {
    // Fallback: extract skills from tool-telemetry.jsonl
    for (const e of toolEntries) {
      if (e.skill) {
        skillCounts[e.skill] = (skillCounts[e.skill] || 0) + 1
      }
    }
  }
  const skillsInvoked = Object.entries(skillCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  // Repo breakdown
  const repoBreakdown: Record<string, number> = {}
  for (const e of toolEntries) {
    if (e.repo) {
      repoBreakdown[e.repo] = (repoBreakdown[e.repo] || 0) + 1
    }
  }

  // Lint events
  let lintFixed = 0
  let lintRegressions = 0
  for (const e of toolEntries) {
    if (e.event === 'lint:fixed' && e.violations_fixed) {
      lintFixed += e.violations_fixed
    }
    if (e.event === 'lint:regression' && e.new_violations) {
      lintRegressions += e.new_violations
    }
  }

  // Session count
  const uniqueSessions = new Set(sessionEntries.map((e) => e.session_id))

  // Quality coverage: % of sessions with Edit/Write that also invoked quality skills
  const qualitySkills = new Set(['validate', 'hardening', 'lint-audit', 'test-expand'])
  const editSessions = new Set<string>()
  const qualitySessions = new Set<string>()

  for (const e of toolEntries) {
    const sid = e.session_id
    if (!sid) continue
    if (e.tool_name === 'Edit' || e.tool_name === 'Write') {
      editSessions.add(sid)
    }
    if (e.skill && qualitySkills.has(e.skill)) {
      qualitySessions.add(sid)
    }
  }
  // Also check skill-telemetry for quality skill invocations
  for (const e of skillEntries) {
    if (e.event === 'skill:invoked' && e.skill && qualitySkills.has(e.skill) && e.session_id) {
      qualitySessions.add(e.session_id)
    }
  }

  const qualityCoverage = editSessions.size > 0
    ? Math.round((qualitySessions.size / editSessions.size) * 100)
    : 100

  // Suggestion funnel
  const suggestionsGiven = suggestionEntries.filter((e) => e.event === 'skill:suggested').length
  const suggestionsFollowed = skillEntries.filter((e) => e.event === 'skill:suggestion-followed').length
  const suggestionConversion = suggestionsGiven > 0
    ? Math.round((suggestionsFollowed / suggestionsGiven) * 100)
    : 0

  // PR skill comments posted
  const prSkillComments = skillEntries.filter((e) => e.event === 'skill:pr-commented').length

  return {
    totalToolCalls: toolEntries.filter((e) => e.event === 'tool:used').length,
    totalSessions: uniqueSessions.size,
    toolBreakdown,
    skillsInvoked,
    repoBreakdown,
    lintFixed,
    lintRegressions,
    qualityCoverage,
    suggestionsGiven,
    suggestionsFollowed,
    suggestionConversion,
    prSkillComments,
  }
}

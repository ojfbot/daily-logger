import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { z } from 'zod'

const AvailableTimingSchema = z.object({
  status: z.literal('available'),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  expectedAt: z.string().datetime().optional(),
  dispatchDelaySeconds: z.number().int().optional(),
  startDelaySeconds: z.number().int().optional(),
})

const UnavailableTimingSchema = z.object({
  status: z.literal('unavailable'),
  reason: z.string().min(1),
})

export const RunTimingSchema = z.discriminatedUnion('status', [
  AvailableTimingSchema,
  UnavailableTimingSchema,
])

const LocalRunEvidenceSchema = z.object({
  kind: z.literal('local'),
  capturedAt: z.string().datetime(),
})

const GitHubRunEvidenceSchema = z.object({
  kind: z.literal('github-actions'),
  capturedAt: z.string().datetime(),
  runId: z.string().min(1),
  runNumber: z.number().int().nonnegative(),
  runAttempt: z.number().int().positive(),
  event: z.string().min(1),
  url: z.string().url(),
  workflowRef: z.string().min(1),
  sourceSha: z.string().min(7),
  actor: z.string().min(1),
  scheduleExpression: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  timing: RunTimingSchema,
})

export const RunEvidenceSchema = z.discriminatedUnion('kind', [
  LocalRunEvidenceSchema,
  GitHubRunEvidenceSchema,
])

export const AuthoringStageSchema = z.object({
  role: z.enum(['draft', 'synthesis']),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  promptSha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export const ArticleProvenanceSchema = z.object({
  schemaVersion: z.literal(1),
  run: RunEvidenceSchema,
  authoring: z.array(AuthoringStageSchema).min(1),
  runtime: z.object({
    nodeVersion: z.string().min(1),
    packageVersion: z.string().min(1),
    runnerOs: z.string().min(1).optional(),
    runnerArch: z.string().min(1).optional(),
    job: z.string().min(1).optional(),
  }),
})

export type RunTiming = z.infer<typeof RunTimingSchema>
export type RunEvidence = z.infer<typeof RunEvidenceSchema>
export type AuthoringStage = z.infer<typeof AuthoringStageSchema>
export type ArticleProvenance = z.infer<typeof ArticleProvenanceSchema>

interface ScheduleTimingInput {
  articleDate: string
  scheduleExpression: string
  timezone: string
  createdAt: string
  startedAt?: string | null
}

interface CaptureOptions {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  capturedAt?: Date
}

interface BuildProvenanceInput {
  run: RunEvidence
  stages: AuthoringStage[]
  nodeVersion: string
  packageVersion: string
  runnerOs?: string
  runnerArch?: string
  job?: string
}

const WorkflowRunResponseSchema = z.object({
  created_at: z.string().datetime(),
  run_started_at: z.string().datetime().nullable().optional(),
  event: z.string().min(1),
  head_sha: z.string().min(7),
  run_attempt: z.number().int().positive(),
  run_number: z.number().int().nonnegative(),
  html_url: z.string().url(),
  actor: z.object({ login: z.string().min(1) }),
})

function integerEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function zonedDateTimeToUtc(
  date: string,
  hour: number,
  minute: number,
  timezone: string,
): Date | undefined {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return undefined

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const intendedUtc = Date.UTC(year, month - 1, day, hour, minute)
  let candidate = intendedUtc

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })

    for (let pass = 0; pass < 2; pass++) {
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]),
      )
      const displayedAsUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
      )
      candidate += intendedUtc - displayedAsUtc
    }
  } catch {
    return undefined
  }

  return new Date(candidate)
}

export function computeScheduledTiming(input: ScheduleTimingInput): RunTiming {
  const cron = input.scheduleExpression.match(/^\s*(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*\s*$/)
  if (!cron) return { status: 'unavailable', reason: 'unsupported-schedule-expression' }

  const minute = Number(cron[1])
  const hour = Number(cron[2])
  if (minute > 59 || hour > 23) {
    return { status: 'unavailable', reason: 'invalid-schedule-expression' }
  }

  const expected = zonedDateTimeToUtc(input.articleDate, hour, minute, input.timezone)
  const created = new Date(input.createdAt)
  const started = input.startedAt ? new Date(input.startedAt) : undefined
  if (!expected || Number.isNaN(created.getTime()) || (started && Number.isNaN(started.getTime()))) {
    return { status: 'unavailable', reason: 'invalid-run-timestamp' }
  }

  return {
    status: 'available',
    expectedAt: expected.toISOString(),
    createdAt: created.toISOString(),
    ...(started ? { startedAt: started.toISOString() } : {}),
    dispatchDelaySeconds: Math.round((created.getTime() - expected.getTime()) / 1000),
    ...(started
      ? { startDelaySeconds: Math.round((started.getTime() - created.getTime()) / 1000) }
      : {}),
  }
}

function timingWithoutSchedule(createdAt: string, startedAt?: string | null): RunTiming {
  const created = new Date(createdAt)
  const started = startedAt ? new Date(startedAt) : undefined
  if (Number.isNaN(created.getTime()) || (started && Number.isNaN(started.getTime()))) {
    return { status: 'unavailable', reason: 'invalid-run-timestamp' }
  }
  return {
    status: 'available',
    createdAt: created.toISOString(),
    ...(started ? {
      startedAt: started.toISOString(),
      startDelaySeconds: Math.round((started.getTime() - created.getTime()) / 1000),
    } : {}),
  }
}

export async function captureRunEvidence(
  articleDate: string,
  options: CaptureOptions = {},
): Promise<RunEvidence> {
  const env = options.env ?? process.env
  const capturedAt = (options.capturedAt ?? new Date()).toISOString()
  const runId = env.GITHUB_RUN_ID

  if (env.GITHUB_ACTIONS !== 'true' || !runId) {
    return { kind: 'local', capturedAt }
  }

  const serverUrl = env.GITHUB_SERVER_URL ?? 'https://github.com'
  const repository = env.GITHUB_REPOSITORY ?? 'ojfbot/daily-logger'
  const apiUrl = env.GITHUB_API_URL ?? (
    serverUrl === 'https://github.com' ? 'https://api.github.com' : `${serverUrl}/api/v3`
  )
  const url = `${serverUrl}/${repository}/actions/runs/${runId}`
  const base = {
    kind: 'github-actions' as const,
    capturedAt,
    runId,
    runNumber: integerEnv(env.GITHUB_RUN_NUMBER, 0),
    runAttempt: Math.max(1, integerEnv(env.GITHUB_RUN_ATTEMPT, 1)),
    event: env.GITHUB_EVENT_NAME ?? 'unknown',
    url,
    workflowRef: env.GITHUB_WORKFLOW_REF ?? `${repository}/.github/workflows/daily-blog.yml@unknown`,
    sourceSha: env.GITHUB_SHA ?? 'unknown-source-sha',
    actor: env.GITHUB_ACTOR ?? 'unknown',
    ...(env.DAILY_BLOG_SCHEDULE ? { scheduleExpression: env.DAILY_BLOG_SCHEDULE } : {}),
    ...(env.DAILY_BLOG_TIMEZONE ? { timezone: env.DAILY_BLOG_TIMEZONE } : {}),
  }

  const token = env.RUN_EVIDENCE_TOKEN ?? env.GITHUB_TOKEN
  if (!token) {
    return { ...base, timing: { status: 'unavailable', reason: 'run-api-token-unavailable' } }
  }

  try {
    const response = await (options.fetchImpl ?? fetch)(
      `${apiUrl}/repos/${repository}/actions/runs/${runId}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'ojfbot-daily-logger',
        },
        signal: AbortSignal.timeout(5_000),
      },
    )
    if (!response.ok) {
      return { ...base, timing: { status: 'unavailable', reason: `run-api-http-${response.status}` } }
    }

    const payload: unknown = await response.json()
    const parsed = WorkflowRunResponseSchema.safeParse(payload)
    if (!parsed.success) {
      return { ...base, timing: { status: 'unavailable', reason: 'run-api-invalid-response' } }
    }

    const run = parsed.data
    const scheduleExpression = env.DAILY_BLOG_SCHEDULE
    const timezone = env.DAILY_BLOG_TIMEZONE
    const timing = run.event === 'schedule' && scheduleExpression && timezone
      ? computeScheduledTiming({
          articleDate,
          scheduleExpression,
          timezone,
          createdAt: run.created_at,
          startedAt: run.run_started_at,
        })
      : timingWithoutSchedule(run.created_at, run.run_started_at)

    return {
      ...base,
      runNumber: run.run_number,
      runAttempt: run.run_attempt,
      event: run.event,
      url: run.html_url,
      sourceSha: run.head_sha,
      actor: run.actor.login,
      timing,
    }
  } catch {
    return { ...base, timing: { status: 'unavailable', reason: 'run-api-unavailable' } }
  }
}

export function promptSha256(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex')
}

export function buildArticleProvenance(input: BuildProvenanceInput): ArticleProvenance {
  return ArticleProvenanceSchema.parse({
    schemaVersion: 1,
    run: input.run,
    authoring: input.stages,
    runtime: {
      nodeVersion: input.nodeVersion,
      packageVersion: input.packageVersion,
      ...(input.runnerOs ? { runnerOs: input.runnerOs } : {}),
      ...(input.runnerArch ? { runnerArch: input.runnerArch } : {}),
      ...(input.job ? { job: input.job } : {}),
    },
  })
}

export function parseArticleProvenance(raw: string): ArticleProvenance | undefined {
  try {
    const result = ArticleProvenanceSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

export function preserveProvenanceFrontmatter(original: string, revised: string): string {
  const originalLine = original.match(/^provenance:\s*(.+)$/m)?.[0]
  if (!originalLine) return revised
  if (/^provenance:.*$/m.test(revised)) {
    return revised.replace(/^provenance:.*$/m, originalLine)
  }
  return revised.replace(/^(status:.*)$/m, `$1\n${originalLine}`)
}

function formatDelay(seconds: number): string {
  const sign = seconds < 0 ? '-' : ''
  const absolute = Math.abs(seconds)
  const hours = Math.floor(absolute / 3600)
  const minutes = Math.floor((absolute % 3600) / 60)
  const remainder = absolute % 60
  return `${sign}${hours}h ${minutes}m ${remainder}s`
}

export function reportRunEvidence(run: RunEvidence): void {
  if (run.kind === 'local') {
    console.log(`   Run evidence: local capture at ${run.capturedAt}`)
    return
  }

  const timing = run.timing.status === 'available'
    ? [
        run.timing.expectedAt ? `expected=${run.timing.expectedAt}` : undefined,
        `created=${run.timing.createdAt}`,
        run.timing.startedAt ? `started=${run.timing.startedAt}` : undefined,
        run.timing.dispatchDelaySeconds !== undefined
          ? `dispatch_delay=${formatDelay(run.timing.dispatchDelaySeconds)}`
          : undefined,
        run.timing.startDelaySeconds !== undefined
          ? `start_delay=${formatDelay(run.timing.startDelaySeconds)}`
          : undefined,
      ].filter(Boolean).join(' ')
    : `timing=${run.timing.reason}`

  console.log(
    `::notice title=Daily blog run evidence::event=${run.event} run=${run.runNumber}.${run.runAttempt} ` +
    `sha=${run.sourceSha.slice(0, 12)} ${timing} url=${run.url}`,
  )

  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) return
  try {
    const rows = [
      ['Run', `[${run.runNumber}.${run.runAttempt}](${run.url})`],
      ['Event', `\`${run.event}\``],
      ['Source SHA', `\`${run.sourceSha}\``],
      ['Workflow ref', `\`${run.workflowRef}\``],
      ['Actor', `\`${run.actor}\``],
      ['Schedule', run.scheduleExpression && run.timezone
        ? `\`${run.scheduleExpression}\` in \`${run.timezone}\``
        : 'n/a'],
    ]
    if (run.timing.status === 'available') {
      rows.push(
        ['Expected dispatch', run.timing.expectedAt ?? 'n/a'],
        ['Run created', run.timing.createdAt],
        ['Run started', run.timing.startedAt ?? 'n/a'],
        ['Dispatch delay', run.timing.dispatchDelaySeconds !== undefined
          ? formatDelay(run.timing.dispatchDelaySeconds)
          : 'n/a'],
        ['Run start delay', run.timing.startDelaySeconds !== undefined
          ? formatDelay(run.timing.startDelaySeconds)
          : 'n/a'],
      )
    } else {
      rows.push(['Timing capture', `Partial: \`${run.timing.reason}\``])
    }
    appendFileSync(
      summaryPath,
      `## Daily blog run evidence\n\n| Field | Value |\n|---|---|\n${rows.map(([key, value]) => `| ${key} | ${value} |`).join('\n')}\n\n`,
      'utf-8',
    )
  } catch {
    console.warn('   ⚠ Could not append run evidence to the GitHub step summary')
  }
}

export function reportArticleProvenance(provenance: ArticleProvenance): void {
  const responsible = provenance.authoring.at(-1)
  if (!responsible) return

  const runtime = [
    `daily-logger@${provenance.runtime.packageVersion}`,
    provenance.runtime.nodeVersion,
    provenance.runtime.runnerOs,
    provenance.runtime.runnerArch,
    provenance.runtime.job ? `job=${provenance.runtime.job}` : undefined,
  ].filter(Boolean).join(' ')
  console.log(
    `::notice title=Article authoring provenance::stage=${responsible.role} model=${responsible.model} ` +
    `prompt=${responsible.promptVersion} prompt_sha256=${responsible.promptSha256} runtime=${runtime}`,
  )

  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) return
  try {
    appendFileSync(
      summaryPath,
      [
        '### Article authoring',
        '',
        `- Responsible stage: \`${responsible.role}\``,
        `- Model: \`${responsible.model}\``,
        `- Prompt: \`${responsible.promptVersion}\` (SHA-256 \`${responsible.promptSha256}\`)`,
        `- Runtime: \`${runtime}\``,
        '',
      ].join('\n'),
      'utf-8',
    )
  } catch {
    console.warn('   ⚠ Could not append authoring provenance to the GitHub step summary')
  }
}

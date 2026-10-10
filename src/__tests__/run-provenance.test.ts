import { describe, expect, it, vi } from 'vitest'
import {
  buildArticleProvenance,
  captureRunEvidence,
  computeScheduledTiming,
  parseArticleProvenance,
  preserveProvenanceFrontmatter,
  promptSha256,
} from '../run-provenance.js'

describe('run provenance', () => {
  it('computes the scheduled dispatch delay in America/Chicago during daylight time', () => {
    expect(computeScheduledTiming({
      articleDate: '2026-10-10',
      scheduleExpression: '30 3 * * *',
      timezone: 'America/Chicago',
      createdAt: '2026-10-10T14:36:24Z',
      startedAt: '2026-10-10T14:36:30Z',
    })).toEqual({
      status: 'available',
      expectedAt: '2026-10-10T08:30:00.000Z',
      createdAt: '2026-10-10T14:36:24.000Z',
      startedAt: '2026-10-10T14:36:30.000Z',
      dispatchDelaySeconds: 21_984,
      startDelaySeconds: 6,
    })
  })

  it('uses the standard-time offset after daylight saving time ends', () => {
    const timing = computeScheduledTiming({
      articleDate: '2026-11-02',
      scheduleExpression: '30 3 * * *',
      timezone: 'America/Chicago',
      createdAt: '2026-11-02T09:31:00Z',
      startedAt: '2026-11-02T09:31:05Z',
    })

    expect(timing.status).toBe('available')
    if (timing.status === 'available') {
      expect(timing.expectedAt).toBe('2026-11-02T09:30:00.000Z')
      expect(timing.dispatchDelaySeconds).toBe(60)
    }
  })

  it('keeps identifiers and records partial evidence when the run lookup fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 403 }))
    const evidence = await captureRunEvidence('2026-10-10', {
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_RUN_ID: '123',
        GITHUB_RUN_NUMBER: '229',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'ojfbot/daily-logger',
        GITHUB_EVENT_NAME: 'schedule',
        GITHUB_WORKFLOW_REF: 'ojfbot/daily-logger/.github/workflows/daily-blog.yml@refs/heads/main',
        GITHUB_SHA: '1d1b24e000000000000000000000000000000000',
        GITHUB_ACTOR: 'github-actions[bot]',
        DAILY_BLOG_SCHEDULE: '30 3 * * *',
        DAILY_BLOG_TIMEZONE: 'America/Chicago',
        RUN_EVIDENCE_TOKEN: 'secret',
      },
      fetchImpl,
      capturedAt: new Date('2026-10-10T14:37:00Z'),
    })

    expect(evidence).toMatchObject({
      kind: 'github-actions',
      runId: '123',
      runNumber: 229,
      url: 'https://github.com/ojfbot/daily-logger/actions/runs/123',
      sourceSha: '1d1b24e000000000000000000000000000000000',
      timing: { status: 'unavailable', reason: 'run-api-http-403' },
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('uses the Actions API timestamps as canonical scheduled-run evidence', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      created_at: '2026-10-10T14:36:24Z',
      run_started_at: '2026-10-10T14:36:30Z',
      event: 'schedule',
      head_sha: '1d1b24e000000000000000000000000000000000',
      run_attempt: 2,
      run_number: 229,
      html_url: 'https://github.com/ojfbot/daily-logger/actions/runs/123',
      actor: { login: 'github-actions[bot]' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const evidence = await captureRunEvidence('2026-10-10', {
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_RUN_ID: '123',
        GITHUB_RUN_NUMBER: '0',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'ojfbot/daily-logger',
        GITHUB_EVENT_NAME: 'schedule',
        GITHUB_WORKFLOW_REF: 'ojfbot/daily-logger/.github/workflows/daily-blog.yml@refs/heads/main',
        GITHUB_SHA: 'fallback0',
        GITHUB_ACTOR: 'fallback',
        DAILY_BLOG_SCHEDULE: '30 3 * * *',
        DAILY_BLOG_TIMEZONE: 'America/Chicago',
        RUN_EVIDENCE_TOKEN: 'secret',
      },
      fetchImpl,
      capturedAt: new Date('2026-10-10T14:37:00Z'),
    })

    expect(evidence).toMatchObject({
      kind: 'github-actions',
      runNumber: 229,
      runAttempt: 2,
      event: 'schedule',
      sourceSha: '1d1b24e000000000000000000000000000000000',
      timing: {
        status: 'available',
        expectedAt: '2026-10-10T08:30:00.000Z',
        dispatchDelaySeconds: 21_984,
        startDelaySeconds: 6,
      },
    })
  })

  it('round-trips valid provenance and rejects malformed frontmatter data', () => {
    const provenance = buildArticleProvenance({
      run: { kind: 'local', capturedAt: '2026-10-10T14:37:00.000Z' },
      stages: [{
        role: 'draft',
        model: 'claude-sonnet-4-6',
        promptVersion: 'article-v2',
        promptSha256: promptSha256('system prompt'),
      }],
      nodeVersion: 'v24.0.0',
      packageVersion: '0.1.0',
    })

    expect(parseArticleProvenance(JSON.stringify(provenance))).toEqual(provenance)
    expect(parseArticleProvenance('{"schemaVersion":99}')).toBeUndefined()
    expect(parseArticleProvenance('not-json')).toBeUndefined()
  })

  it('mechanically restores provenance after an editorial revision', () => {
    const provenance = '{"schemaVersion":1}'
    const original = `---\nstatus: "draft"\nprovenance: ${provenance}\n---\n\nOriginal`
    const altered = '---\nstatus: "draft"\nprovenance: {"schemaVersion":999}\n---\n\nRevised'
    const omitted = '---\nstatus: "draft"\n---\n\nRevised'

    expect(preserveProvenanceFrontmatter(original, altered)).toContain(`provenance: ${provenance}`)
    expect(preserveProvenanceFrontmatter(original, omitted)).toContain(`status: "draft"\nprovenance: ${provenance}`)
  })
})

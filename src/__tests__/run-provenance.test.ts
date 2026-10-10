import { describe, expect, it, vi } from 'vitest'
import {
  appendAuthoringStage,
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
      },
    })
  })

  it('uses the configured target schedule for fallback workflow dispatches', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      created_at: '2026-10-10T14:36:24Z',
      run_started_at: '2026-10-10T14:36:30Z',
      event: 'workflow_dispatch',
      head_sha: '1d1b24e000000000000000000000000000000000',
      run_attempt: 1,
      run_number: 230,
      html_url: 'https://github.com/ojfbot/daily-logger/actions/runs/124',
      actor: { login: 'github-actions[bot]' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const evidence = await captureRunEvidence('2026-10-10', {
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_RUN_ID: '124',
        GITHUB_REPOSITORY: 'ojfbot/daily-logger',
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        DAILY_BLOG_SCHEDULE: '30 3 * * *',
        DAILY_BLOG_TIMEZONE: 'America/Chicago',
        RUN_EVIDENCE_TOKEN: 'secret',
      },
      fetchImpl,
    })

    expect(evidence).toMatchObject({
      kind: 'github-actions',
      event: 'workflow_dispatch',
      scheduleExpression: '30 3 * * *',
      timing: {
        status: 'available',
        expectedAt: '2026-10-10T08:30:00.000Z',
        dispatchDelaySeconds: 21_984,
        startDelaySeconds: 6,
      },
    })
  })

  it.each([
    ['missing token', {}, 'run-api-token-unavailable'],
    ['network failure', { RUN_EVIDENCE_TOKEN: 'secret' }, 'run-api-unavailable'],
  ])('keeps partial evidence after %s', async (_label, extraEnv, reason) => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    const evidence = await captureRunEvidence('2026-10-10', {
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_RUN_ID: '125',
        GITHUB_REPOSITORY: 'ojfbot/daily-logger',
        ...extraEnv,
      },
      fetchImpl,
    })

    expect(evidence).toMatchObject({
      kind: 'github-actions',
      runId: '125',
      timing: { status: 'unavailable', reason },
    })
  })

  it('keeps partial evidence when the Actions API response is invalid', async () => {
    const evidence = await captureRunEvidence('2026-10-10', {
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_RUN_ID: '126',
        GITHUB_REPOSITORY: 'ojfbot/daily-logger',
        RUN_EVIDENCE_TOKEN: 'secret',
      },
      fetchImpl: vi.fn().mockResolvedValue(new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })),
    })

    expect(evidence).toMatchObject({
      timing: { status: 'unavailable', reason: 'run-api-invalid-response' },
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

    expect(provenance).toBeDefined()
    expect(parseArticleProvenance(JSON.stringify(provenance))).toEqual(provenance)
    expect(parseArticleProvenance('{"schemaVersion":99}')).toBeUndefined()
    expect(parseArticleProvenance('not-json')).toBeUndefined()
  })

  it('drops invalid provenance instead of throwing after article generation', () => {
    expect(buildArticleProvenance({
      run: { kind: 'local', capturedAt: '2026-10-10T14:37:00.000Z' },
      stages: [],
      nodeVersion: 'v24.0.0',
      packageVersion: '',
    })).toBeUndefined()
  })

  it('mechanically restores provenance after an editorial revision', () => {
    const provenance = '{"schemaVersion":1}'
    const original = `---\nstatus: "draft"\nprovenance: ${provenance}\n---\n\nOriginal`
    const altered = '---\nstatus: "draft"\nprovenance: {"schemaVersion":999}\n---\n\nRevised'
    const omitted = '---\nstatus: "draft"\n---\n\nRevised'

    expect(preserveProvenanceFrontmatter(original, altered)).toContain(`provenance: ${provenance}`)
    expect(preserveProvenanceFrontmatter(original, omitted)).toContain(`status: "draft"\nprovenance: ${provenance}`)
  })

  it('restores provenance without requiring a status field or expanding dollar tokens', () => {
    const provenance = '{"schemaVersion":1,"note":"$&"}'
    const original = `---\nprovenance: ${provenance}\n---\n\nOriginal`
    const revised = '---\ntitle: "Revised"\n---\n\nRevised'

    expect(preserveProvenanceFrontmatter(original, revised)).toBe(
      `---\ntitle: "Revised"\nprovenance: ${provenance}\n---\n\nRevised`,
    )
  })

  it('appends editorial revision attribution and refreshes the public footer', () => {
    const provenance = buildArticleProvenance({
      run: { kind: 'local', capturedAt: '2026-10-10T14:37:00.000Z' },
      stages: [{
        role: 'draft',
        model: 'claude-sonnet-4-6',
        promptVersion: 'article-v2',
        promptSha256: promptSha256('draft'),
      }],
      nodeVersion: 'v24.0.0',
      packageVersion: '0.1.0',
    })
    expect(provenance).toBeDefined()
    const markdown = `---\nstatus: "draft"\nprovenance: ${JSON.stringify(provenance)}\n---\n\nBody\n\n---\n\n*Generated by [daily-logger](https://github.com/ojfbot/daily-logger) · Authoring model \`claude-sonnet-4-6\` · prompt \`article-v2\`.*`

    const revised = appendAuthoringStage(markdown, {
      role: 'revision',
      model: 'claude-opus-4-6',
      promptVersion: 'editorial-revision-v1',
      promptSha256: promptSha256('revision'),
    })

    expect(parseArticleProvenance(revised.match(/^provenance:\s*(.+)$/m)![1])?.authoring.at(-1)).toMatchObject({
      role: 'revision',
      model: 'claude-opus-4-6',
    })
    expect(revised).toContain('Authoring model `claude-opus-4-6` · prompt `editorial-revision-v1`')
  })
})

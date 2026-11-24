import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Workflow text checks for issue #604: a run that fails, hangs or skips must
// say so. GitHub's own behaviour (for example, that a job which hits
// timeout-minutes ends "cancelled") cannot be exercised offline; these checks
// pin the workflow text that relies on it.

function workflow(name: string): string {
  return readFileSync(resolve('.github/workflows', name), 'utf-8')
}

/** Top-level jobs, keyed by id. Assumes the repo's two-space YAML style. */
function jobs(text: string): Map<string, string> {
  const body = text.slice(text.indexOf('\njobs:\n') + 7)
  const result = new Map<string, string>()
  const parts = body.split(/^  ([A-Za-z0-9_-]+):[ \t]*$/m)
  for (let i = 1; i < parts.length; i += 2) result.set(parts[i], parts[i + 1])
  return result
}

/** Steps of one job, keyed by step name. */
function steps(job: string): Map<string, string> {
  const result = new Map<string, string>()
  const parts = job.split(/^      - name: (.+)$/m)
  for (let i = 1; i < parts.length; i += 2) result.set(parts[i].trim(), parts[i + 1])
  return result
}

function jobIf(job: string): string {
  return job.match(/^    if: (.+)$/m)?.[1] ?? ''
}

const alertCondition = /^always\(\) && \(contains\(needs\.\*\.result, 'failure'\) \|\| contains\(needs\.\*\.result, 'cancelled'\)\)$/

describe('owner alerts fire on cancelled and timed-out runs', () => {
  it('daily-blog alerts when a needed job fails or is cancelled', () => {
    const alert = jobs(workflow('daily-blog.yml')).get('alert-on-failure')
    expect(alert).toBeDefined()
    expect(jobIf(alert!)).toMatch(alertCondition)
  })

  it('daily-cleaner alerts from a separate job, so a timed-out clean job still alerts', () => {
    const all = jobs(workflow('daily-cleaner.yml'))
    const clean = all.get('clean')!
    expect([...steps(clean).keys()].some((name) => /alert/i.test(name))).toBe(false)
    const alert = all.get('alert-on-failure')
    expect(alert).toBeDefined()
    expect(alert).toMatch(/^    needs: \[admission, clean\]$/m)
    expect(jobIf(alert!)).toMatch(alertCondition)
    expect(alert).toMatch(/^      issues: write$/m)
    expect(alert).toContain('WORKFLOW_FILE: daily-cleaner.yml')
  })
})

describe('cleaner push pre-flight', () => {
  it('proves push rights with the dry-run push check instead of ls-remote', () => {
    const clean = steps(jobs(workflow('daily-cleaner.yml')).get('clean')!)
    const preflight = [...clean.entries()].find(([name]) => /push/i.test(name) && !/^Run /.test(name))
    expect(preflight).toBeDefined()
    const [, body] = preflight!
    expect(body).not.toMatch(/git ls-remote/)
    expect(body).toContain('bash .github/scripts/check-push-access.sh')
  })
})

describe('PR smoke test checks what it claims', () => {
  const smoke = steps(jobs(workflow('pr-check.yml')).get('check')!)

  it('fails the smoke test when the council does not run', () => {
    expect(smoke.get('Pipeline smoke test (mock LLM — no API call)')).toMatch(/pnpm generate 2>&1 \| tee \/tmp\/smoke-generate\.log/)
    const verify = smoke.get('Verify article was written')!
    expect(verify).toContain('/tmp/smoke-generate.log')
    expect(verify).toMatch(/Council review — \[1-9\]/)
  })

  it('gives each draft-context check its own error message', () => {
    const verify = smoke.get('Verify article was written')!
    expect(verify).not.toContain("throw new Error('Draft context is not preserved and bound into action-review state')")
    for (const message of ['draft context was not retained', 'draft context lost the fixture text', 'state digest is not a sha256 hex string']) {
      expect(verify).toContain(message)
    }
  })

  it('says why an accept/ branch name is rejected', () => {
    const acceptance = smoke.get('Verify acceptance registry against trusted policy')!
    expect(acceptance).not.toMatch(/^\s*\[\[ "\$DATE" =~ .*\]\]\s*$/m)
    expect(acceptance).toMatch(/if ! \[\[ "\$DATE" =~ .*\]\]; then\n\s*echo "::error::/)
  })
})

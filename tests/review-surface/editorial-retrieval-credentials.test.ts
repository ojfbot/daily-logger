import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ActionRegistrySchema } from '../../src/action-registry.js'
import { collectActionSources } from '../../src/review-actions.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

function workflowStepEnvironment(stepName: string) {
  const workflow = readFileSync(resolve('.github/workflows/editorial-revise.yml'), 'utf8').split('\n')
  const step = workflow.findIndex(line => line === `      - name: ${stepName}`)
  if (step === -1) throw new Error(`Missing workflow step: ${stepName}`)
  const next = workflow.findIndex((line, index) => index > step && line.startsWith('      - '))
  const lines = workflow.slice(step, next === -1 ? undefined : next)
  const env = lines.findIndex(line => line === '        env:')
  if (env === -1) throw new Error(`Missing environment for workflow step: ${stepName}`)
  return Object.fromEntries(lines.slice(env + 1).flatMap(line => {
    const match = /^          ([A-Z][A-Z0-9_]*):\s*(.+)$/.exec(line)
    return match ? [[match[1], match[2]]] : []
  }))
}

function installFakeGh(root: string) {
  const executable = join(root, 'gh')
  writeFileSync(executable, `#!/usr/bin/env node
if (process.env.GH_TOKEN !== 'private-fleet-pat') {
  process.stderr.write('private repository denied: GH_TOKEN must contain the fleet PAT\\n')
  process.exit(1)
}
const endpoint = process.argv.at(-1) ?? ''
if (endpoint.endsWith('/issues/4')) {
  process.stdout.write(JSON.stringify([{ state: 'open', author_association: 'OWNER', body: 'Private issue evidence.' }]))
} else if (endpoint.includes('/comments')) {
  process.stdout.write(JSON.stringify([[]]))
} else if (endpoint.includes('/contents/')) {
  process.stdout.write(JSON.stringify([{ type: 'file', sha: 'a'.repeat(40), encoding: 'base64', content: Buffer.from('Current fleet goal.').toString('base64') }]))
} else {
  process.stdout.write('[]')
}
`)
  chmodSync(executable, 0o755)
}

it('routes the private-repository PAT from the continuation workflow into the real evidence collector', () => {
  const root = mkdtempSync(join(tmpdir(), 'editorial-retrieval-credentials-'))
  roots.push(root)
  const bin = join(root, 'bin')
  const ghConfig = join(root, 'gh-config')
  mkdirSync(bin)
  mkdirSync(ghConfig)
  installFakeGh(bin)

  vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`)
  vi.stubEnv('GH_CONFIG_DIR', ghConfig)
  vi.stubEnv('GH_TOKEN', '')
  const secrets: Record<string, string> = {
    GITHUB_TOKEN: 'repo-scoped-service-token',
    GH_PAT: 'private-fleet-pat',
    ANTHROPIC_API_KEY: 'unused-provider-token',
  }
  for (const [name, value] of Object.entries(workflowStepEnvironment('Claim request and prepare editorial continuation from trusted code'))) {
    const secret = /^\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}$/.exec(value)?.[1]
    vi.stubEnv(name, secret ? secrets[secret] : value)
  }

  const registry = ActionRegistrySchema.parse({
    schemaVersion: 1,
    baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] },
    records: [],
    articles: [],
  })
  const sources = collectActionSources({
    registry,
    repoRoot: root,
    markdown: '---\ndate: 2030-01-01\nstatus: accepted\n---\n\nNo recommendation.',
    feedback: 'Review required evidence at classic-space-venue #4.',
  })

  expect(process.env.GITHUB_TOKEN).toBe('repo-scoped-service-token')
  expect(sources.some(source => source.id.startsWith('github:classic-space-venue#4@'))).toBe(true)
})

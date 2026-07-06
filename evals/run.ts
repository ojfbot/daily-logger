/**
 * Golden eval suite runner (audit S19 / integration plan I4).
 *
 * 1. Runs every task under evals/tasks/ via vitest (evals/vitest.config.ts).
 * 2. Writes a per-task pass/fail snapshot to evals/results/latest.json
 *    (stable ordering, no timestamps — designed to be committed and diffed).
 * 3. Diffs the fresh run against the previously committed snapshot and
 *    prints the delta.
 *
 * CI-advisory contract: the pr-check workflow runs this with
 * continue-on-error and posts the summary — it NEVER blocks a PR. Promotion
 * to a blocking gate is a later RIDM decision (S16 pattern), not a config
 * flip anyone makes ad hoc.
 *
 * Exit code: 1 when any task fails (useful locally); CI treats it as advisory.
 */

import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import path from 'path'
import { repoRoot } from './harness.js'

interface TaskResult {
  cluster: string
  status: 'pass' | 'fail'
  tests: number
  failedTests: string[]
}

interface Snapshot {
  suite: string
  tasks: Record<string, TaskResult>
  summary: { total: number; pass: number; fail: number }
}

// Vitest JSON reporter output (jest-compatible shape) — the fields we read.
interface VitestJson {
  testResults: Array<{
    name: string
    status: string
    assertionResults: Array<{ status: string; fullName: string }>
  }>
}

const resultsDir = path.join(repoRoot, 'evals', 'results')
const latestPath = path.join(resultsDir, 'latest.json')
const rawPath = path.join(resultsDir, 'raw.json')

function runVitest(): VitestJson {
  mkdirSync(resultsDir, { recursive: true })
  rmSync(rawPath, { force: true })

  const proc = spawnSync(
    'pnpm',
    [
      'exec', 'vitest', 'run',
      '--config', 'evals/vitest.config.ts',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${rawPath}`,
    ],
    { cwd: repoRoot, stdio: 'inherit' },
  )

  if (!existsSync(rawPath)) {
    console.error(`\n✗ vitest produced no JSON output (exit ${proc.status}) — cannot snapshot`)
    process.exit(2)
  }
  return JSON.parse(readFileSync(rawPath, 'utf-8')) as VitestJson
}

function toSnapshot(raw: VitestJson): Snapshot {
  const tasks: Record<string, TaskResult> = {}
  for (const file of raw.testResults) {
    const rel = path.relative(path.join(repoRoot, 'evals', 'tasks'), file.name)
    const id = rel.replace(/\.eval\.ts$/, '')
    const failed = file.assertionResults.filter((a) => a.status === 'failed')
    tasks[id] = {
      cluster: `failure:${id.split(path.sep)[0]}`,
      status: file.status === 'passed' && failed.length === 0 ? 'pass' : 'fail',
      tests: file.assertionResults.length,
      failedTests: failed.map((a) => a.fullName),
    }
  }
  const ordered = Object.fromEntries(Object.entries(tasks).sort(([a], [b]) => a.localeCompare(b)))
  const values = Object.values(ordered)
  return {
    suite: 'daily-logger-golden-v1',
    tasks: ordered,
    summary: {
      total: values.length,
      pass: values.filter((t) => t.status === 'pass').length,
      fail: values.filter((t) => t.status === 'fail').length,
    },
  }
}

function readPrevious(): Snapshot | null {
  if (!existsSync(latestPath)) return null
  try {
    return JSON.parse(readFileSync(latestPath, 'utf-8')) as Snapshot
  } catch {
    return null
  }
}

function printDiff(prev: Snapshot | null, next: Snapshot): void {
  console.log('\n── eval summary ──────────────────────────────────────────────')
  console.log(`suite: ${next.suite}`)
  console.log(`tasks: ${next.summary.total} · pass ${next.summary.pass} · fail ${next.summary.fail}`)
  for (const [id, t] of Object.entries(next.tasks)) {
    console.log(`  ${t.status === 'pass' ? '✓' : '✗'} [${t.cluster}] ${id} (${t.tests} tests)`)
    for (const f of t.failedTests) console.log(`      ↳ FAILED: ${f}`)
  }

  console.log('\n── diff vs committed snapshot (evals/results/latest.json) ───')
  if (!prev) {
    console.log('  (no previous snapshot — this run establishes the baseline)')
    return
  }
  const lines: string[] = []
  for (const id of Object.keys(next.tasks)) {
    if (!(id in prev.tasks)) lines.push(`  + added:   ${id} (${next.tasks[id].status})`)
    else if (prev.tasks[id].status !== next.tasks[id].status)
      lines.push(`  ~ changed: ${id} ${prev.tasks[id].status} → ${next.tasks[id].status}`)
  }
  for (const id of Object.keys(prev.tasks)) {
    if (!(id in next.tasks)) lines.push(`  - removed: ${id}`)
  }
  console.log(lines.length ? lines.join('\n') : '  (no change vs last committed run)')
}

const raw = runVitest()
const next = toSnapshot(raw)
const prev = readPrevious()
printDiff(prev, next)
writeFileSync(latestPath, `${JSON.stringify(next, null, 2)}\n`)
console.log(`\nsnapshot written: ${path.relative(repoRoot, latestPath)}`)
process.exit(next.summary.fail > 0 ? 1 : 0)

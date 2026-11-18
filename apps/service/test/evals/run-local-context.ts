import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../../src/fixture.js'
import { runLocalContextExperiment } from './local-context.js'

const reportIndex = process.argv.indexOf('--report')
const report = reportIndex >= 0 ? process.argv[reportIndex + 1] : undefined
if (reportIndex >= 0 && !report) throw new Error('--report requires a new output file')
if (report && existsSync(resolve(report))) throw new Error('Report already exists; refusing to spend a model run before an overwrite failure')
const gates: { command: string; exitCode: number }[] = []
let result: Awaited<ReturnType<typeof runLocalContextExperiment>> | { pass: false; error: string }
try { result = await runLocalContextExperiment({
  optIn: process.env.DAILYLOGGER_LOCAL_MODEL_EVAL === '1',
  model: process.env.DAILYLOGGER_LOCAL_MODEL ?? '',
  verifyOffline() {
    for (const script of ['type-check', 'test']) {
      const args = ['--filter', '@ojfbot/daily-logger-service', script]
      const gate = spawnSync('pnpm', args, { cwd: REPO_ROOT, stdio: 'inherit', timeout: 120_000 })
      gates.push({ command: `pnpm ${args.join(' ')}`, exitCode: gate.status ?? -1 })
      if (gate.status !== 0) throw new Error(`Offline ${script} gate failed; no model request made`)
    }
  },
}) } catch (error) {
  result = { pass: false, error: error instanceof Error ? error.message : 'Local experiment failed' }
}
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' })
if (head.status !== 0) throw new Error('Could not record harness revision')
const record = { ...result, capturedAt: new Date().toISOString(), harnessCommit: head.stdout.trim(), gates }
const serialized = `${JSON.stringify(record, null, 2)}\n`
if (report) writeFileSync(resolve(report), serialized, { flag: 'wx', mode: 0o600 })
console.log(serialized)
if (!result.pass) process.exitCode = 1

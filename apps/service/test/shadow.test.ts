import assert from 'node:assert/strict'
import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { once } from 'node:events'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { REPO_ROOT, ARTICLE_PATH, ACTIONS_PATH, CANDIDATE_IDS, readFixture } from '../src/fixture.js'

const sandbox = mkdtempSync(join(tmpdir(), 'dailylogger-shadow-test-'))
after(() => rmSync(sandbox, { recursive: true, force: true }))
const fixture = readFixture()
const cli = join(REPO_ROOT, 'apps/service/src/cli.ts')
const environment = {
  ...process.env,
  // Even enabled ambient tracing must not be exported by the offline executable.
  LANGCHAIN_TRACING: 'true', LANGCHAIN_TRACING_V2: 'true', LANGSMITH_TRACING: 'true',
  LANGSMITH_API_KEY: 'fixture-never-valid', LANGSMITH_ENDPOINT: 'http://127.0.0.1:1',
}

function command(runDir: string, command: string, digest?: string, preloads: string[] = []) {
  return spawnSync(process.execPath, ['--import', 'tsx', ...preloads.flatMap(path => ['--import', path]), cli, command, '--run-dir', runDir, ...(digest ? ['--approval-digest', digest] : [])], {
    cwd: REPO_ROOT, env: environment, encoding: 'utf8', timeout: 30_000,
  })
}

function success(result: SpawnSyncReturns<string>) {
  assert.equal(result.status, 0, result.stderr || String(result.error))
  assert.equal(result.stderr, '', 'Offline runner must not attempt ambient trace exports')
  return JSON.parse(result.stdout)
}

function failure(result: SpawnSyncReturns<string>, message: RegExp) {
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, message)
}

function attempts(runDir: string): string[] {
  return readFileSync(join(runDir, 'attempts.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).node)
}

function assertOutput(runDir: string) {
  assert.deepEqual(readFileSync(join(runDir, 'artifacts', ARTICLE_PATH)), fixture.article)
  assert.deepEqual(readFileSync(join(runDir, 'artifacts', ACTIONS_PATH)), fixture.actions)
  const actions = JSON.parse(readFileSync(join(runDir, 'artifacts', ACTIONS_PATH), 'utf8'))
  assert.equal(actions.snapshot.status, 'draft')
  assert.equal(actions.snapshot.review.state, 'pending')
  assert.deepEqual(actions.snapshot.draftCandidates.map((candidate: { candidateId: string }) => candidate.candidateId), CANDIDATE_IDS)
  assert.ok(actions.snapshot.draftCandidates.every((candidate: { review: { state: string } }) => candidate.review.state === 'awaiting-review'))
  assert.deepEqual(actions.snapshot.actionKeys, [])
  assert.deepEqual(actions.suggestions, [])
  assert.deepEqual(actions.decisions, [])
  const receipt = JSON.parse(readFileSync(join(runDir, 'artifacts/receipt.json'), 'utf8'))
  assert.equal(receipt.admissions, 0)
  assert.equal(receipt.publication, 'none')
  assert.equal(receipt.source.commit, fixture.manifest.source.commit)
  assert.deepEqual(receipt.source, fixture.manifest.source)
}

test('durable interrupt resumes in a new process, preserves provenance and pending actions, and repeats idempotently', () => {
  const runDir = join(sandbox, 'restart')
  const start = success(command(runDir, 'start'))
  assert.equal(start.status, 'awaiting-approval')
  assert.deepEqual(start.completedSteps, ['collect_fixture', 'draft_fixture', 'review_fixture'])
  assert.deepEqual(start.next, ['human_gate'])
  assert.equal(existsSync(join(runDir, 'artifacts')), false)
  assert.equal(success(command(runDir, 'status')).checkpointId, start.checkpointId)
  assert.equal(success(command(runDir, 'recover')).status, 'awaiting-approval', 'Recovery cannot approve')
  assert.deepEqual(attempts(runDir), start.completedSteps)
  const resumed = success(command(runDir, 'resume', start.approvalDigest))
  assert.equal(resumed.status, 'complete')
  assertOutput(runDir)
  const before = statSync(join(runDir, 'artifacts/receipt.json')).mtimeMs
  assert.equal(success(command(runDir, 'resume', start.approvalDigest)).checkpointId, resumed.checkpointId)
  assert.equal(success(command(runDir, 'recover')).checkpointId, resumed.checkpointId)
  assert.equal(statSync(join(runDir, 'artifacts/receipt.json')).mtimeMs, before)
  assert.deepEqual(attempts(runDir), ['collect_fixture', 'draft_fixture', 'review_fixture', 'write_shadow_artifacts'])
  failure(command(runDir, 'start'), /already started/)
})

test('stale approval and changed frozen inputs are rejected without advancing the checkpoint', () => {
  const runDir = join(sandbox, 'stale')
  const start = success(command(runDir, 'start'))
  failure(command(runDir, 'resume', '0'.repeat(64)), /Stale or missing approval/)
  failure(command(runDir, 'resume'), /Stale or missing approval/)
  for (const [path, error] of [['inputs/article.md', /Changed frozen article/], ['inputs/actions.json', /Changed frozen actions/], ['manifest.json', /Stale or changed manifest/]] as const) {
    const target = join(runDir, path)
    const original = readFileSync(target)
    appendFileSync(target, 'changed')
    failure(command(runDir, 'resume', start.approvalDigest), error)
    writeFileSync(target, original)
  }
  assert.equal(success(command(runDir, 'status')).checkpointId, start.checkpointId)
  assert.equal(existsSync(join(runDir, 'artifacts')), false)
  assert.equal(success(command(runDir, 'resume', start.approvalDigest)).status, 'complete')
})

test('a failed output step recovers independently without rerunning completed steps or replacing existing files', () => {
  const runDir = join(sandbox, 'conflict')
  const start = success(command(runDir, 'start'))
  mkdirSync(join(runDir, 'artifacts'))
  writeFileSync(join(runDir, 'artifacts/keep.txt'), 'user file')
  failure(command(runDir, 'resume', start.approvalDigest), /refusing overwrite/)
  assert.equal(readFileSync(join(runDir, 'artifacts/keep.txt'), 'utf8'), 'user file')
  const failed = success(command(runDir, 'status'))
  assert.equal(failed.status, 'recoverable')
  assert.deepEqual(failed.next, ['write_shadow_artifacts'])
  failure(command(runDir, 'resume', start.approvalDigest), /use recover/)
  rmSync(join(runDir, 'artifacts'), { recursive: true })
  const recovered = success(command(runDir, 'recover'))
  assert.equal(recovered.status, 'complete')
  assertOutput(runDir)
  assert.deepEqual(attempts(runDir), ['collect_fixture', 'draft_fixture', 'review_fixture', 'write_shadow_artifacts', 'write_shadow_artifacts'])
})

test('process death after output and before the final checkpoint reuses the immutable bundle', () => {
  const runDir = join(sandbox, 'crash-after-output')
  const start = success(command(runDir, 'start'))
  const killed = command(runDir, 'resume', start.approvalDigest, [join(REPO_ROOT, 'apps/service/test/crash-after-output.ts')])
  assert.equal(killed.signal, 'SIGKILL', killed.stderr)
  assertOutput(runDir)
  const before = statSync(join(runDir, 'artifacts/receipt.json')).mtimeMs
  const recovered = success(command(runDir, 'recover'))
  assert.equal(recovered.status, 'complete')
  assertOutput(runDir)
  assert.equal(statSync(join(runDir, 'artifacts/receipt.json')).mtimeMs, before)
  for (const node of ['collect_fixture', 'draft_fixture', 'review_fixture']) assert.equal(attempts(runDir).filter(item => item === node).length, 1)
  assert.equal(success(command(runDir, 'resume', start.approvalDigest)).checkpointId, recovered.checkpointId)
})

test('changed completed artifacts fail closed instead of being overwritten', () => {
  const runDir = join(sandbox, 'tampered-output')
  const start = success(command(runDir, 'start'))
  success(command(runDir, 'resume', start.approvalDigest))
  appendFileSync(join(runDir, 'artifacts', ARTICLE_PATH), 'changed output')
  failure(command(runDir, 'status'), /Existing artifact differs/)
  failure(command(runDir, 'resume', start.approvalDigest), /Existing artifact differs/)
  failure(command(runDir, 'recover'), /Existing artifact differs/)
  assert.ok(readFileSync(join(runDir, 'artifacts', ARTICLE_PATH), 'utf8').endsWith('changed output'))
})

test('repository paths and symlinked inputs/output are rejected', () => {
  const forbidden = join(REPO_ROOT, 'must-not-be-created-by-shadow')
  failure(command(forbidden, 'start'), /inside the source repository/)
  assert.equal(existsSync(forbidden), false)
  const alias = join(sandbox, 'repo-alias')
  symlinkSync(REPO_ROOT, alias)
  failure(command(join(alias, 'must-not-be-created-by-shadow'), 'start'), /inside the source repository/)
  const runDir = join(sandbox, 'symlinks')
  const start = success(command(runDir, 'start'))
  rmSync(join(runDir, 'inputs/article.md'))
  symlinkSync(join(REPO_ROOT, ARTICLE_PATH), join(runDir, 'inputs/article.md'))
  failure(command(runDir, 'resume', start.approvalDigest), /Expected a regular file/)
  rmSync(join(runDir, 'inputs/article.md'))
  writeFileSync(join(runDir, 'inputs/article.md'), fixture.article)
  symlinkSync(join(sandbox, 'must-not-create.sqlite'), join(runDir, 'checkpoints.sqlite-wal'))
  failure(command(runDir, 'resume', start.approvalDigest), /Expected a regular file/)
  assert.equal(existsSync(join(sandbox, 'must-not-create.sqlite')), false)
  rmSync(join(runDir, 'checkpoints.sqlite-wal'))
  symlinkSync(REPO_ROOT, join(runDir, 'artifacts'))
  failure(command(runDir, 'resume', start.approvalDigest), /Expected a plain directory/)
})

test('concurrent commands are rejected and a killed command releases its SQLite mutex', { timeout: 15_000 }, async () => {
  const runDir = join(sandbox, 'lock')
  success(command(runDir, 'start'))
  const storage = join(REPO_ROOT, 'apps/service/src/storage.ts')
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `import { acquireRunLock } from ${JSON.stringify(storage)}; acquireRunLock(${JSON.stringify(runDir)}); console.log('locked'); setInterval(() => {}, 1000)`], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    await once(child.stdout, 'data')
    failure(command(runDir, 'status'), /Run is busy/)
  } finally {
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
  }
  assert.equal(success(command(runDir, 'status')).status, 'awaiting-approval')
  assert.deepEqual(attempts(runDir), ['collect_fixture', 'draft_fixture', 'review_fixture'])
})

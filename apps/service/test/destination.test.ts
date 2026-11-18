import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { digest, REPO_ROOT } from '../src/fixture.js'
import { readPostgresFixture } from '../src/postgres-fixture.js'
import { RESERVATION_FILE, reserveDestination, validateDestination } from '../src/postgres-destination.js'
import { initializeRun } from '../src/storage.js'

const root = mkdtempSync(join(tmpdir(), 'dailylogger-destination-'))
after(() => rmSync(root, { recursive: true, force: true }))
const requestDigest = (directory: string) => digest(directory)

function childReserve(directory: string, key: string) {
  const module = join(REPO_ROOT, 'apps/service/src/postgres-destination.ts')
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { reserveDestination } from ${JSON.stringify(module)};
    import { createHash, randomUUID } from 'node:crypto';
    try { console.log(JSON.stringify(reserveDestination(${JSON.stringify(directory)}, ${JSON.stringify(key)}, randomUUID(), path => createHash('sha256').update(path).digest('hex')))); }
    catch(error) { console.error(error.message); process.exitCode=1; }
  `], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', bytes => { stdout += bytes })
  child.stderr.on('data', bytes => { stderr += bytes })
  return once(child, 'exit').then(([code]) => ({ code, stdout, stderr }))
}

test('physical case behavior is measured; aliases share a single immutable reservation', async t => {
  const probe = join(root, 'CaseProbe')
  mkdirSync(probe)
  const insensitive = existsSync(join(root, 'caseprobe'))
  t.diagnostic(`Actual filesystem case-insensitive: ${insensitive}`)
  if (process.env.DAILYLOGGER_REQUIRE_CASE_INSENSITIVE === '1') assert.equal(insensitive, true, 'This qualification requires a real case-insensitive filesystem')
  const upper = join(root, 'FixtureAlias'), lower = join(root, 'fixturealias')
  const first = reserveDestination(upper, 'owner', randomUUID(), requestDigest)
  if (insensitive) {
    assert.throws(() => reserveDestination(lower, 'other', randomUUID(), requestDigest), /already bound/)
    assert.equal(reserveDestination(lower, 'owner', randomUUID(), requestDigest).runId, first.runId)
  } else assert.notEqual(reserveDestination(lower, 'other', randomUUID(), requestDigest).runId, first.runId)
  const raced = await Promise.all([childReserve(join(root, 'ConcurrentAlias'), 'one'), childReserve(join(root, 'concurrentalias'), 'two')])
  assert.equal(raced.filter(result => result.code === 0).length, insensitive ? 1 : 2)
  if (insensitive) assert.match(raced.find(result => result.code !== 0)!.stderr, /already bound/)
})

test('concurrent identical reservations reuse one UUID and an empty pre-marker crash is recoverable', async () => {
  const directory = join(root, 'same-request')
  const results = await Promise.all([childReserve(directory, 'same'), childReserve(directory, 'same')])
  for (const result of results) assert.equal(result.code, 0, result.stderr)
  assert.equal(JSON.parse(results[0].stdout).runId, JSON.parse(results[1].stdout).runId)
  const empty = join(root, 'crash-before-marker')
  mkdirSync(empty)
  const recovered = reserveDestination(empty, 'recovered', randomUUID(), requestDigest)
  validateDestination(recovered)
})

test('ancestor reservations reject nested destinations before creating directories or markers', () => {
  const reserved = reserveDestination(join(root, 'ReservedParent'), 'ancestor', randomUUID(), requestDigest)
  const nested = join(reserved.runDir, 'nested')
  const markerBytes = readFileSync(join(reserved.runDir, RESERVATION_FILE))
  assert.throws(() => reserveDestination(nested, 'nested', randomUUID(), requestDigest), /overlaps an ancestor reservation/)
  assert.equal(existsSync(nested), false)
  if (existsSync(join(root, 'reservedparent'))) {
    const aliasNested = join(root, 'reservedparent/nested')
    assert.throws(() => reserveDestination(aliasNested, 'alias-nested', randomUUID(), requestDigest), /overlaps an ancestor reservation/)
    assert.equal(existsSync(aliasNested), false)
  }
  // Even a damaged/foreign ancestor marker protects the tree; never repair it
  // or create a descendant while trying to parse the ancestor's ownership.
  writeFileSync(join(reserved.runDir, RESERVATION_FILE), '{')
  assert.throws(() => reserveDestination(nested, 'damaged-nested', randomUUID(), requestDigest), /overlaps an ancestor reservation/)
  assert.equal(existsSync(nested), false)
  writeFileSync(join(reserved.runDir, RESERVATION_FILE), markerBytes)
  validateDestination(reserved)
})

test('foreign contents, partial/lost markers and changed inode fail closed', () => {
  const foreign = join(root, 'foreign')
  mkdirSync(foreign); writeFileSync(join(foreign, 'keep'), 'owned by user')
  assert.throws(() => reserveDestination(foreign, 'foreign', randomUUID(), requestDigest), /not empty/)
  assert.equal(readFileSync(join(foreign, 'keep'), 'utf8'), 'owned by user')
  const partial = join(root, 'partial-marker')
  mkdirSync(partial); writeFileSync(join(partial, RESERVATION_FILE), '{')
  assert.throws(() => reserveDestination(partial, 'partial', randomUUID(), requestDigest), /marker is invalid/)
  assert.equal(readFileSync(join(partial, RESERVATION_FILE), 'utf8'), '{')
  const lost = reserveDestination(join(root, 'lost-marker'), 'lost', randomUUID(), requestDigest)
  rmSync(join(lost.runDir, RESERVATION_FILE))
  assert.throws(() => reserveDestination(lost.runDir, 'lost', lost.runId, requestDigest, { existingBinding: true }), /marker is missing/)
  assert.equal(existsSync(join(lost.runDir, RESERVATION_FILE)), false)
  const moved = reserveDestination(join(root, 'changed-inode'), 'moved', randomUUID(), requestDigest)
  const marker = readFileSync(join(moved.runDir, RESERVATION_FILE))
  renameSync(moved.runDir, join(root, 'original-inode'))
  mkdirSync(moved.runDir); writeFileSync(join(moved.runDir, RESERVATION_FILE), marker)
  assert.throws(() => validateDestination(moved), /physical identity changed/)
})

test('legacy adoption validates frozen inputs and preserves their exact manifest', () => {
  const runId = randomUUID(), directory = join(root, 'legacy')
  const fixture = readPostgresFixture(runId, false)
  initializeRun(directory, fixture)
  const before = readFileSync(join(directory, 'manifest.json'))
  const reserved = reserveDestination(directory, 'legacy', runId, requestDigest, { existingBinding: true, legacyFixture: fixture })
  assert.equal(reserved.runId, runId)
  assert.deepEqual(readFileSync(join(directory, 'manifest.json')), before)
})

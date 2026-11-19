import assert from 'node:assert/strict'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { MARKER, RUN_ROOT, encode, hash, restoreTree, validateArchive, validatePlan } from './archive.mjs'

const MAX_BYTES = 8 * 1024 * 1024
const identity = path => { const info = lstatSync(path, { bigint: true }); return `${info.dev}:${info.ino}` }
const directory = path => ({ path, type: 'directory', mode: 0o700, uid: 1000, gid: 1000, physicalIdentity: '1:1' })
const file = (path, bytes = Buffer.from('synthetic fixture only')) => ({ path, type: 'file', mode: 0o600,
  uid: 1000, gid: 1000, sha256: hash(bytes), data: bytes.toString('base64') })
const archiveOf = entries => ({ schemaVersion: 1, root: RUN_ROOT, entries })
const smallArchive = () => archiveOf([directory('run-a'), file('run-a/payload')])

function temporary(t) {
  const path = mkdtempSync(join(tmpdir(), 'dailylogger-archive-test-'))
  t.after(() => rmSync(path, { recursive: true, force: true }))
  return path
}

function observeBase64Decodes(t) {
  const original = Buffer.from
  const decoded = []
  t.mock.method(Buffer, 'from', function (value, ...options) {
    if (options[0] === 'base64') decoded.push(value)
    return Reflect.apply(original, Buffer, [value, ...options])
  })
  return decoded
}

// Synthetic manifest metadata stays UID/GID1000. These local fixtures deliberately
// exercise rejection before host-owned tree comparison; they do not simulate a
// successful UID1000 reconciliation. That proof belongs to the container suite.
function planFixture(t) {
  const root = join(temporary(t), 'tree'), run = join(root, 'run-a')
  mkdirSync(root, { mode: 0o700 }); mkdirSync(run, { mode: 0o700 })
  const row = { run_id: '11111111-2222-4333-8444-555555555555', request_key: 'fixture-start',
    request_digest: 'a'.repeat(64), run_dir: `${RUN_ROOT}/run-a` }
  const marker = { schemaVersion: 1, runId: row.run_id, requestKey: row.request_key,
    requestDigest: row.request_digest, runDir: row.run_dir, physicalIdentity: '1:1' }
  const markerBytes = encode(marker)
  writeFileSync(join(run, MARKER), markerBytes, { flag: 'wx', mode: 0o600 })
  const archive = archiveOf([directory('run-a'), file(`run-a/${MARKER}`, markerBytes)])
  const plan = { schemaVersion: 1, backupId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    archiveSha256: hash(encode(archive)), rootIdentity: identity(root),
    directories: [{ path: 'run-a', identity: identity(run) }],
    changes: [{ path: `run-a/${MARKER}`, old: markerBytes.toString('base64'),
      next: encode({ ...marker, physicalIdentity: identity(run) }).toString('base64') }] }
  return { root, run, row, marker, archive, plan }
}

test('closed archive accepts the exact total byte budget with strict ownership', () => {
  const archive = archiveOf([directory('run-a'), file('run-a/payload', Buffer.alloc(MAX_BYTES, 97))])
  const validated = validateArchive(archive)
  assert.equal(validated.size, 2)
  assert.deepEqual(validated.get('run-a/payload'), archive.entries[1])
})

test('oversized base64 is rejected before decoding, including the padding boundary', t => {
  const encodedLimit = Math.ceil(MAX_BYTES / 3) * 4
  const decoded = observeBase64Decodes(t)
  for (const length of [encodedLimit + 4, encodedLimit]) {
    // No padding: encodedLimit characters decode to MAX_BYTES+1, although
    // their encoded length equals a valid MAX_BYTES payload's encoded length.
    const entry = { ...file('run-a/payload'), data: 'A'.repeat(length) }
    assert.throws(() => validateArchive(archiveOf([directory('run-a'), entry])), /budget|bound/i)
    assert.equal(decoded.length, 0, 'An over-budget entry reached Buffer.from(base64)')
  }
})

test('aggregate remaining budget is checked before decoding the next file', t => {
  const first = file('run-a/first', Buffer.alloc(MAX_BYTES - 1, 97))
  const second = file('run-a/second', Buffer.from('ab'))
  const decoded = observeBase64Decodes(t)
  assert.throws(() => validateArchive(archiveOf([directory('run-a'), first, second])), /budget|bound/i)
  assert.deepEqual(decoded, [first.data], 'The second file exceeded the remaining byte before admission')
})

test('duplicate, traversal, absolute, partial and unparented paths reject', () => {
  for (const path of ['/absolute', '../escape', 'run-a/../escape', 'run-a//payload',
    'run-a/./payload', 'run-a/.staging-interrupted/payload', 'missing/payload']) {
    const archive = smallArchive(); archive.entries[1].path = path
    assert.throws(() => validateArchive(archive), { code: 'ERR_ASSERTION' }, path)
  }
  const duplicate = smallArchive(); duplicate.entries.push(structuredClone(duplicate.entries[1]))
  assert.throws(() => validateArchive(duplicate), { code: 'ERR_ASSERTION' })
  assert.throws(() => validateArchive(archiveOf([file('parent'), file('parent/child')])), /Parent must precede/)
  assert.throws(() => validateArchive(archiveOf([file('run-a/payload'), directory('run-a')])), /Parent must precede/)
})

test('ownership, modes, closed fields, canonical base64 and content hashes remain mandatory', () => {
  for (const mutate of [
    entry => { entry.uid = 501 }, entry => { entry.gid = 10 },
    entry => { entry.mode = 0o644 }, entry => { entry.extra = true },
    entry => { entry.sha256 = '0'.repeat(64) },
    entry => { entry.data += '\n' }, entry => { entry.type = 'symlink' },
  ]) {
    const archive = smallArchive(); mutate(archive.entries[1])
    assert.throws(() => validateArchive(archive), { code: 'ERR_ASSERTION' })
  }
})

test('a corrupt later entry cannot cause a partially extracted destination', t => {
  const root = temporary(t)
  const archive = smallArchive()
  archive.entries.push({ ...file('run-a/later'), sha256: '0'.repeat(64) })
  assert.throws(() => restoreTree(root, archive), { code: 'ERR_ASSERTION' })
  assert.deepEqual(readdirSync(root), [])
})

test('marker authority must match the database row and source directory identity', t => {
  const fixture = planFixture(t)
  const fields = { schemaVersion: 2, runId: '00000000-0000-4000-8000-000000000000',
    requestKey: 'foreign-request', requestDigest: 'b'.repeat(64), runDir: `${RUN_ROOT}/foreign`, physicalIdentity: '2:2' }
  for (const [field, value] of Object.entries(fields)) {
    const archive = structuredClone(fixture.archive)
    archive.entries[1] = file(`run-a/${MARKER}`, encode({ ...fixture.marker, [field]: value }))
    const plan = { ...fixture.plan, archiveSha256: hash(encode(archive)) }
    assert.throws(() => validatePlan(fixture.root, archive, [fixture.row], plan), error =>
      error.code === 'ERR_ASSERTION' && error.actual?.[field] === value && error.expected?.[field] === fixture.marker[field], field)
  }
  assert.deepEqual(JSON.parse(readFileSync(join(fixture.run, MARKER))), fixture.marker)
})

test('an interrupted retry cannot alter marker authority or substitute its archive seal', t => {
  const { root, run, row, marker, archive, plan } = planFixture(t)
  for (const changed of ['old', 'next']) {
    const altered = structuredClone(plan)
    const value = JSON.parse(Buffer.from(altered.changes[0][changed], 'base64'))
    altered.changes[0][changed] = encode({ ...value, requestKey: 'foreign-retry' }).toString('base64')
    assert.throws(() => validatePlan(root, archive, [row], altered), /Plan may change only the measured physicalIdentity/)
  }
  const mismatched = { ...plan, archiveSha256: '0'.repeat(64) }
  assert.throws(() => validatePlan(root, archive, [row], mismatched), error =>
    error.code === 'ERR_ASSERTION' && error.actual === mismatched.archiveSha256 && error.expected === hash(encode(archive)))
  assert.deepEqual(JSON.parse(readFileSync(join(run, MARKER))), marker)
})

test('a retained plan rejects replacement root and run directory identities', t => {
  for (const target of ['root', 'run']) {
    const fixture = planFixture(t)
    const path = fixture[target]
    renameSync(path, `${path}-retained`); mkdirSync(path, { mode: 0o700 })
    if (target === 'root') {
      assert.throws(() => validatePlan(fixture.root, fixture.archive, [fixture.row], fixture.plan), error =>
        error.code === 'ERR_ASSERTION' && error.actual === fixture.plan.rootIdentity && error.expected === identity(fixture.root))
    } else {
      assert.throws(() => validatePlan(fixture.root, fixture.archive, [fixture.row], fixture.plan), /Plan may change only the measured physicalIdentity/)
    }
    assert.deepEqual(readdirSync(path), [], 'Rejected plans must leave the replacement untouched')
  }
})

test('a retained plan rejects a symlink substituted for its run directory', t => {
  const fixture = planFixture(t)
  renameSync(fixture.run, `${fixture.run}-retained`)
  symlinkSync(`${fixture.run}-retained`, fixture.run, 'dir')
  assert.throws(() => validatePlan(fixture.root, fixture.archive, [fixture.row], fixture.plan), error =>
    error.code === 'ERR_ASSERTION' && error.actual === false)
  assert.deepEqual(JSON.parse(readFileSync(join(`${fixture.run}-retained`, MARKER))), fixture.marker)
})

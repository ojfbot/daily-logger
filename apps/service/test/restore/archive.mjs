import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync, fsyncSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const RUN_ROOT = '/var/lib/dailylogger/fixtures/runs'
export const MARKER = '.dailylogger-reservation.json'
export const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const MAX_BYTES = 8 * 1024 * 1024
const physical = path => { const s = lstatSync(path, { bigint: true }); assert.ok(s.isDirectory() && !s.isSymbolicLink()); return `${s.dev}:${s.ino}` }
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort())
const safe = path => typeof path === 'string' && /^[A-Za-z0-9._/-]+$/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..')

function readPlain(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try { const s = fstatSync(fd); assert.ok(s.isFile() && s.size <= MAX_BYTES); return readFileSync(fd) }
  finally { closeSync(fd) }
}

/** Fixture-only bounded file bundle; no links, special files, or implicit extraction paths. */
export function captureTree(root) {
  assert.ok(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink())
  const entries = []
  let bytes = 0
  function walk(path, prefix = '') {
    for (const name of readdirSync(path).sort()) {
      const relative = prefix ? `${prefix}/${name}` : name
      assert.ok(safe(relative) && !name.startsWith('.staging-'), 'Partial/unsafe tree is outside this first restore proof')
      const location = join(path, name), stat = lstatSync(location)
      assert.ok(!stat.isSymbolicLink() && (stat.isDirectory() || stat.isFile()))
      const entry = { path: relative, type: stat.isDirectory() ? 'directory' : 'file', mode: stat.mode & 0o777, uid: stat.uid, gid: stat.gid }
      if (stat.isDirectory()) entry.physicalIdentity = physical(location)
      else { const data = readPlain(location); bytes += data.length; entry.sha256 = hash(data); entry.data = data.toString('base64') }
      entries.push(entry)
      assert.ok(entries.length <= 256 && bytes <= MAX_BYTES, 'Fixture archive exceeded its bound')
      if (stat.isDirectory()) walk(location, relative)
    }
  }
  walk(root)
  return { schemaVersion: 1, root: RUN_ROOT, entries }
}

export function validateArchive(archive) {
  keys(archive, ['schemaVersion', 'root', 'entries'])
  assert.equal(archive.schemaVersion, 1); assert.equal(archive.root, RUN_ROOT)
  assert.ok(Array.isArray(archive.entries) && archive.entries.length > 0 && archive.entries.length <= 256)
  const seen = new Map(); let bytes = 0
  for (const entry of archive.entries) {
    assert.ok(safe(entry.path) && !entry.path.split('/').some(name => name.startsWith('.staging-')) && !seen.has(entry.path))
    keys(entry, ['path', 'type', 'mode', 'uid', 'gid', ...(entry.type === 'directory' ? ['physicalIdentity'] : ['sha256', 'data'])])
    assert.ok(['directory', 'file'].includes(entry.type))
    assert.equal(entry.uid, 1000); assert.equal(entry.gid, 1000)
    assert.equal(entry.mode, entry.type === 'directory' ? 0o700 : 0o600)
    const parent = dirname(entry.path)
    assert.ok(parent === '.' || seen.get(parent)?.type === 'directory', 'Parent must precede its children')
    if (entry.type === 'directory') assert.match(entry.physicalIdentity, /^\d+:\d+$/)
    else {
      assert.equal(typeof entry.data, 'string')
      assert.ok(entry.data.length <= Math.ceil((MAX_BYTES - bytes) / 3) * 4, 'Encoded file exceeds remaining archive budget')
      assert.ok(entry.data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(entry.data), 'Noncanonical base64 shape')
      const padding = entry.data.endsWith('==') ? 2 : entry.data.endsWith('=') ? 1 : 0
      const decodedLength = entry.data.length / 4 * 3 - padding
      assert.ok(decodedLength >= 0 && decodedLength <= MAX_BYTES - bytes, 'Decoded file exceeds remaining archive budget before allocation')
      if (padding) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        assert.equal(alphabet.indexOf(entry.data.at(-padding - 1)) & (padding === 2 ? 15 : 3), 0, 'Noncanonical base64 padding bits')
      }
      const data = Buffer.from(entry.data, 'base64'); bytes += data.length
      assert.ok(bytes <= MAX_BYTES, 'Fixture archive exceeded its bound')
      assert.equal(data.toString('base64'), entry.data); assert.equal(hash(data), entry.sha256)
    }
    seen.set(entry.path, entry)
  }
  assert.ok(bytes <= MAX_BYTES)
  return seen
}

export function restoreTree(root, archive) {
  validateArchive(archive) // Validate the entire bundle before writing anything.
  assert.ok(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink())
  assert.deepEqual(readdirSync(root), [], 'Restoration requires a fresh empty owned destination')
  for (const entry of archive.entries) {
    const path = join(root, entry.path)
    if (entry.type === 'directory') mkdirSync(path, { mode: entry.mode })
    else writeFileSync(path, Buffer.from(entry.data, 'base64'), { flag: 'wx', mode: entry.mode })
  }
}

const comparable = archive => archive.entries.map(({ physicalIdentity, ...entry }) => entry)
export function assertCopiedTree(root, archive) {
  validateArchive(archive)
  assert.deepEqual(comparable(captureTree(root)), comparable(archive), 'Copied tree differs from matched backup')
}

function markerFor(archive, row) {
  const relative = row.run_dir.slice(RUN_ROOT.length + 1)
  assert.equal(row.run_dir, `${RUN_ROOT}/${relative}`); assert.ok(safe(relative) && !relative.includes('/'))
  const directory = archive.entries.find(entry => entry.path === relative)
  const entry = archive.entries.find(entry => entry.path === `${relative}/${MARKER}`)
  assert.equal(directory?.type, 'directory'); assert.equal(entry?.type, 'file')
  const marker = JSON.parse(Buffer.from(entry.data, 'base64'))
  keys(marker, ['schemaVersion', 'runId', 'requestKey', 'requestDigest', 'runDir', 'physicalIdentity'])
  assert.deepEqual(marker, { schemaVersion: 1, runId: row.run_id, requestKey: row.request_key,
    requestDigest: row.request_digest, runDir: row.run_dir, physicalIdentity: directory.physicalIdentity })
  return { relative, marker, entry }
}

/** Test-only ownership bridge. Never imported by runtime source or an operator CLI. */
export function createPlan(root, archive, rows, backupId) {
  assert.match(backupId, /^[0-9a-f-]{36}$/)
  assertCopiedTree(root, archive)
  assert.deepEqual(archive.entries.filter(entry => !entry.path.includes('/')).map(entry => entry.path).sort(), rows.map(row => row.run_dir.slice(RUN_ROOT.length + 1)).sort())
  const changes = rows.map(row => {
    const { relative, marker, entry } = markerFor(archive, row)
    const next = physical(join(root, relative))
    assert.notEqual(next, marker.physicalIdentity, 'The proof must copy into a different physical destination')
    return { path: `${relative}/${MARKER}`, old: entry.data,
      next: encode({ ...marker, physicalIdentity: next }).toString('base64') }
  })
  return { schemaVersion: 1, backupId, archiveSha256: hash(encode(archive)), rootIdentity: physical(root),
    directories: captureTree(root).entries.filter(entry => entry.type === 'directory').map(entry => ({ path: entry.path, identity: entry.physicalIdentity })), changes }
}

export function validatePlan(root, archive, rows, plan) {
  keys(plan, ['schemaVersion', 'backupId', 'archiveSha256', 'rootIdentity', 'directories', 'changes'])
  assert.equal(plan.schemaVersion, 1); assert.match(plan.backupId, /^[0-9a-f-]{36}$/)
  assert.equal(plan.archiveSha256, hash(encode(archive))); assert.equal(plan.rootIdentity, physical(root))
  const source = validateArchive(archive)
  assert.equal(plan.changes.length, rows.length)
  const expectedChanges = rows.map(row => {
    const { relative, marker, entry } = markerFor(archive, row)
    return { path: `${relative}/${MARKER}`, old: entry.data,
      next: encode({ ...marker, physicalIdentity: physical(join(root, relative)) }).toString('base64') }
  })
  assert.deepEqual(plan.changes, expectedChanges, 'Plan may change only the measured physicalIdentity')
  const actual = captureTree(root)
  assert.deepEqual(actual.entries.filter(entry => entry.type === 'directory').map(entry => ({ path: entry.path, identity: entry.physicalIdentity })), plan.directories)
  assert.deepEqual(actual.entries.map(entry => entry.path), archive.entries.map(entry => entry.path))
  for (const entry of actual.entries) {
    const before = source.get(entry.path), change = plan.changes.find(candidate => candidate.path === entry.path)
    if (change) {
      assert.ok(entry.data === change.old || entry.data === change.next, 'Unexpected or partial marker; remain quarantined')
      assert.deepEqual({ ...entry, data: before.data, sha256: before.sha256 }, before)
    } else {
      const { physicalIdentity: _actual, ...a } = entry, { physicalIdentity: _source, ...b } = before
      assert.deepEqual(a, b, 'Unplanned filesystem change')
    }
  }
}

export function applyPlan(root, archive, rows, plan, control, stopAfter = Infinity) {
  validatePlan(root, archive, rows, plan) // All bindings/content checked before the first edit.
  assert.ok(lstatSync(control).isDirectory() && !lstatSync(control).isSymbolicLink())
  assert.equal(lstatSync(control).dev, lstatSync(root).dev, 'Atomic marker replacement requires the same filesystem')
  let changed = 0
  for (const change of plan.changes) {
    const path = join(root, change.path)
    if (readPlain(path).toString('base64') === change.next) continue
    const temporary = join(control, `${plan.backupId}-${randomUUID()}.tmp`)
    const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    try { writeFileSync(fd, Buffer.from(change.next, 'base64')); fsyncSync(fd) } finally { closeSync(fd) }
    renameSync(temporary, path) // Same volume; an interrupted temporary stays outside the run tree.
    changed++
    if (changed === stopAfter) return { complete: false, changed }
  }
  validatePlan(root, archive, rows, plan)
  assert.ok(plan.changes.every(change => readPlain(join(root, change.path)).toString('base64') === change.next))
  return { complete: true, changed }
}

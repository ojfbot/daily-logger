import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { deflateSync } from 'node:zlib'
import { ARTICLE_BLOB, ARTICLE_PATH, ACTIONS_BLOB, REPO_ROOT, SOURCE_COMMIT, readFixture, reviewFixture } from '../src/fixture.js'
import { offlineGit, offlineGitEnvironment } from '../src/offline-git.js'
import { checkedRunDir } from '../src/storage.js'

const sandbox = mkdtempSync(join(tmpdir(), 'dailylogger-boundary-test-'))
after(() => rmSync(sandbox, { recursive: true, force: true }))
const fixture = readFixture()

function localGit(cwd: string, args: string[], input?: Buffer, environment: NodeJS.ProcessEnv = {}) {
  return execFileSync('git', args, {
    cwd, input, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...offlineGitEnvironment(), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', ...environment },
  })
}

// Copy only the exact commit, ancestor trees and two blobs into a disposable
// object store. No clone, network, working checkout, or production Git mutation.
function fixtureRepository(name: string): string {
  const repository = join(sandbox, name)
  mkdirSync(repository)
  localGit(repository, ['init', '-q'])
  for (const object of [SOURCE_COMMIT, `${SOURCE_COMMIT}^{tree}`, `${SOURCE_COMMIT}:_articles`, `${SOURCE_COMMIT}:actions`, `${SOURCE_COMMIT}:actions/articles`, ARTICLE_BLOB, ACTIONS_BLOB]) {
    const type = offlineGit(['cat-file', '-t', object], REPO_ROOT).toString('utf8').trim()
    localGit(repository, ['hash-object', '-w', '-t', type, '--stdin'], offlineGit(['cat-file', type, object], REPO_ROOT))
  }
  return repository
}

function readInChild(repository: string, environment: NodeJS.ProcessEnv = {}) {
  const script = `import { readFixture } from ${JSON.stringify(join(REPO_ROOT, 'apps/service/src/fixture.ts'))}; try { console.log(JSON.stringify(readFixture(process.argv[1]).manifest)); } catch (error) { console.error(error.message); process.exitCode = 1; }`
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, repository], {
    cwd: REPO_ROOT, env: { ...process.env, ...environment }, encoding: 'utf8', timeout: 15_000,
  })
}

test('missing promisor blobs fail before any fetch; every Git transport remains disabled', () => {
  const repository = fixtureRepository('promisor')
  unlinkSync(join(repository, '.git/objects', ARTICLE_BLOB.slice(0, 2), ARTICLE_BLOB.slice(2)))
  localGit(repository, ['config', 'core.repositoryformatversion', '1'])
  localGit(repository, ['config', 'extensions.partialClone', 'origin'])
  localGit(repository, ['config', 'remote.origin.promisor', 'true'])
  localGit(repository, ['config', 'remote.origin.url', 'shadow-proof::missing'])
  localGit(repository, ['config', 'protocol.shadow-proof.allow', 'always'])
  const bin = join(sandbox, 'bin')
  mkdirSync(bin)
  const helper = join(bin, 'git-remote-shadow-proof')
  const marker = join(sandbox, 'transport-invoked')
  // The positive control can only invoke this local marker helper; it never
  // opens a socket or contacts a real remote, even if the guard regresses.
  writeFileSync(helper, '#!/bin/sh\nprintf invoked >> "$SHADOW_HELPER_MARKER"\nexit 1\n')
  chmodSync(helper, 0o700)
  const trace = join(sandbox, 'guarded-trace.jsonl')
  const attemptedOverrides = {
    PATH: `${bin}:${process.env.PATH}`,
    SHADOW_HELPER_MARKER: marker,
    GIT_TRACE2_EVENT: trace,
    GIT_NO_LAZY_FETCH: '0',
    GIT_ALLOW_PROTOCOL: 'shadow-proof',
  }
  const result = readInChild(repository, attemptedOverrides)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Fixture source unavailable offline/)
  assert.equal(existsSync(marker), false, 'No transport helper may be invoked')
  assert.doesNotMatch(readFileSync(trace, 'utf8'), /"fetch"/, 'No lazy fetch subprocess may even start')

  // Test the independent transport backstop despite a repo-local allow rule.
  assert.throws(() => offlineGit(['fetch', 'origin'], repository), /transport 'shadow-proof' not allowed/)
  assert.equal(existsSync(marker), false)

  // Prove this is a real missing-object/promisor reproduction: an unguarded
  // object read starts fetch and reaches the harmless helper.
  const controlTrace = join(sandbox, 'control-trace.jsonl')
  assert.throws(() => localGit(repository, ['cat-file', 'blob', ARTICLE_BLOB], undefined, { ...attemptedOverrides, GIT_TRACE2_EVENT: controlTrace }))
  assert.match(readFileSync(marker, 'utf8'), /^(invoked)+$/)
  assert.match(readFileSync(controlTrace, 'utf8'), /"fetch"/)
})

test('Git replace refs cannot change fixture bytes or their recorded identity', () => {
  const repository = fixtureRepository('replacement')
  const replacement = localGit(repository, ['hash-object', '-w', '--stdin'], Buffer.from('replaced article')).toString('utf8').trim()
  localGit(repository, ['update-ref', `refs/replace/${ARTICLE_BLOB}`, replacement])
  assert.equal(localGit(repository, ['cat-file', 'blob', `${SOURCE_COMMIT}:${ARTICLE_PATH}`], undefined, { GIT_NO_REPLACE_OBJECTS: undefined }).toString('utf8'), 'replaced article')
  const result = readInChild(repository, { GIT_NO_REPLACE_OBJECTS: undefined })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), fixture.manifest)
  assert.deepEqual(readFixture(repository).article, fixture.article)
})

test('returned blob bytes are checked against the pinned object hash', () => {
  const repository = fixtureRepository('corrupt-object')
  const bytes = Buffer.from('a different blob stored under the expected name')
  // cat-file can read validly encoded loose-object bytes without hashing them.
  // The application must check identity independently before recording provenance.
  const objectPath = join(repository, '.git/objects', ARTICLE_BLOB.slice(0, 2), ARTICLE_BLOB.slice(2))
  unlinkSync(objectPath)
  writeFileSync(objectPath, deflateSync(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])))
  const result = readInChild(repository)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Fixture blob bytes do not match pinned identity/)
})

test('other checkouts, bare repositories, and ordinary/separate/linked Git metadata are rejected', () => {
  const repository = fixtureRepository('other-repository')
  const linked = join(sandbox, 'linked-worktree')
  localGit(repository, ['worktree', 'add', '--detach', '--no-checkout', linked, SOURCE_COMMIT])
  const linkedMetadata = localGit(linked, ['rev-parse', '--absolute-git-dir']).toString('utf8').trim()
  const bare = join(sandbox, 'bare-repository')
  localGit(sandbox, ['init', '--bare', '-q', bare])
  const separate = join(sandbox, 'separate-metadata')
  localGit(sandbox, ['init', '-q', `--separate-git-dir=${separate}`, join(sandbox, 'separate-worktree')])
  for (const parent of [repository, join(repository, '.git'), join(repository, '.git/objects'), bare, join(bare, 'objects'), linked, linkedMetadata, separate]) {
    const output = join(parent, 'shadow-must-not-exist')
    assert.throws(() => checkedRunDir(output), /outside every Git checkout and Git metadata/)
    assert.equal(existsSync(output), false)
  }
  const output = join(repository, '.git/shadow-must-not-exist')
  const script = `import { checkedRunDir } from ${JSON.stringify(join(REPO_ROOT, 'apps/service/src/storage.ts'))}; try { checkedRunDir(process.argv[1]); process.exitCode = 2; } catch (error) { console.error(error.message); process.exitCode = 1; }`
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, output], {
    cwd: REPO_ROOT, env: { ...process.env, GIT_DIR: join(sandbox, 'nonexistent'), GIT_CEILING_DIRECTORIES: repository }, encoding: 'utf8', timeout: 15_000,
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /outside every Git checkout and Git metadata/)
  assert.equal(existsSync(output), false)
})

test('malformed action JSON and nested shapes produce fixture diagnostics', () => {
  for (const value of [null, [], 'string', 3]) {
    assert.throws(() => reviewFixture({ ...fixture, actions: Buffer.from(JSON.stringify(value)) }), /Malformed action fixture: root must be an object/)
  }
  assert.throws(() => reviewFixture({ ...fixture, actions: Buffer.from('{') }), /Malformed action fixture: invalid JSON/)
  const original = JSON.parse(fixture.actions.toString('utf8'))
  for (const value of [null, [], 'string', 3]) {
    assert.throws(() => reviewFixture({ ...fixture, actions: Buffer.from(JSON.stringify({ ...original, snapshot: value })) }), /Malformed action fixture: snapshot must be an object/)
    assert.throws(() => reviewFixture({ ...fixture, actions: Buffer.from(JSON.stringify({ ...original, snapshot: { ...original.snapshot, review: value } })) }), /Malformed action fixture: snapshot.review must be an object/)
    assert.throws(() => reviewFixture({ ...fixture, actions: Buffer.from(JSON.stringify({ ...original, snapshot: { ...original.snapshot, draftCandidates: [value, ...original.snapshot.draftCandidates.slice(1)] } })) }), /Malformed action fixture: draftCandidates\[0\] must be an object/)
    const candidate = { ...original.snapshot.draftCandidates[0], review: value }
    assert.throws(() => reviewFixture({ ...fixture, actions: Buffer.from(JSON.stringify({ ...original, snapshot: { ...original.snapshot, draftCandidates: [candidate, ...original.snapshot.draftCandidates.slice(1)] } })) }), /Malformed action fixture: draftCandidates\[0\].review must be an object/)
  }
  assert.equal(reviewFixture(fixture).outcome, 'pass')
})

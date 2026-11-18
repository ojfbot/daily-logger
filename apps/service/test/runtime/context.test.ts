import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { prepareRuntimeContext } from '../../runtime/prepare-context.js'
import { REPO_ROOT, SOURCE_COMMIT } from '../../src/fixture.js'

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'dailylogger-runtime-context-'))
  const source = join(root, 'source')
  try {
    execFileSync('git', ['clone', '--quiet', '--no-local', '--depth=1', REPO_ROOT, source])
    execFileSync('git', ['-C', source, 'fetch', '--quiet', '--depth=1', '--no-tags', REPO_ROOT, SOURCE_COMMIT])
  } catch (error) { rmSync(root, { recursive: true, force: true }); throw error }
  return { root, source }
}

test('committed runtime context excludes ambient credentials and includes a self-contained fixture store', () => {
  const { root, source } = sandbox()
  try {
    const canary = `private-context-canary-${randomUUID()}`
    writeFileSync(join(source, '.env'), canary)
    execFileSync('git', ['-C', source, 'config', 'runtime.privateCanary', canary])
    const destination = join(root, 'context')
    const receipt = prepareRuntimeContext(destination, source)
    assert.equal(receipt.configuredRemotes, 0)
    assert.equal(existsSync(join(destination, '.git')), false)
    assert.equal(existsSync(join(destination, 'apps/service/test')), false)
    assert.equal(existsSync(join(destination, 'fixture-git/objects/info/alternates')), false)
    assert.ok(existsSync(join(destination, 'Dockerfile')))
    assert.ok(existsSync(join(destination, 'docs/agent-service/editorial-api-responses.schema.json')))
    const files = readdirSync(destination, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
    for (const entry of files) assert.equal(readFileSync(join(entry.parentPath, entry.name)).includes(Buffer.from(canary)), false)
    execFileSync('git', ['--git-dir', join(destination, 'fixture-git'), 'fsck', '--full', '--no-reflogs'])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('context assembly rejects changed runtime inputs and preserves an existing destination', () => {
  const { root, source } = sandbox()
  try {
    const existing = join(root, 'existing')
    writeFileSync(existing, 'preserve')
    assert.throws(() => prepareRuntimeContext(existing, source), /new absolute/)
    assert.equal(readFileSync(existing, 'utf8'), 'preserve')
    const input = join(source, 'apps/service/src/http-cli.ts')
    writeFileSync(input, `${readFileSync(input, 'utf8')}\n`)
    const destination = join(root, 'rejected')
    assert.throws(() => prepareRuntimeContext(destination, source), /Commit runtime inputs/)
    assert.equal(existsSync(destination), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

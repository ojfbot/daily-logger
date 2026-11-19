import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { prepareRuntimeContext } from '../../runtime/prepare-context.js'
import { REPO_ROOT, SOURCE_COMMIT } from '../../src/fixture.js'

const journalSources = ['action-item-schema.ts', 'activity-window.ts', 'article-body.ts', 'article-markdown.ts', 'article-prompts.ts', 'article-provenance.ts', 'article-references.ts', 'article-schema.ts', 'article-title.ts', 'eligibility.ts', 'normalize-article-markdown.ts', 'recommendation-prose.ts', 'render-article.ts', 'shipment-reference.ts']

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
    mkdirSync(join(source, 'apps/service/dist'), { recursive: true })
    writeFileSync(join(source, 'apps/service/dist/prebuilt-canary.mjs'), canary)
    writeFileSync(join(source, 'apps/service/scripts/unrelated-canary.mjs'), canary)
    mkdirSync(join(source, 'packages/journal/dist'), { recursive: true })
    mkdirSync(join(source, 'packages/journal/test'), { recursive: true })
    const journalCanaries = ['packages/journal/dist/prebuilt-canary.ts', 'packages/journal/test/canary.ts',
      'packages/journal/src/unrelated-canary.ts', 'packages/journal/.env']
    for (const path of journalCanaries) writeFileSync(join(source, path), canary)
    execFileSync('git', ['-C', source, 'add', '-f', 'apps/service/dist/prebuilt-canary.mjs', ...journalCanaries])
    execFileSync('git', ['-C', source, '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Runtime Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Synthetic prebuilt negative control'])
    const destination = join(root, 'context')
    const receipt = prepareRuntimeContext(destination, source)
    assert.equal(receipt.configuredRemotes, 0)
    assert.equal(existsSync(join(destination, '.git')), false)
    assert.equal(existsSync(join(destination, 'apps/service/test')), false)
    assert.equal(existsSync(join(destination, 'apps/service/dist')), false)
    assert.deepEqual(readdirSync(join(destination, 'packages/journal')).sort(), ['package.json', 'src'])
    assert.deepEqual(readdirSync(join(destination, 'packages/journal/src')).sort(), journalSources)
    for (const path of ['package.json', ...journalSources.map(path => `src/${path}`)]) {
      assert.deepEqual(readFileSync(join(destination, 'packages/journal', path)), readFileSync(join(source, 'packages/journal', path)))
    }
    assert.deepEqual(readdirSync(join(destination, 'apps/service/scripts')), ['build-telemetry.mjs'])
    assert.equal(readFileSync(join(destination, 'apps/service/scripts/build-telemetry.mjs'), 'utf8'), readFileSync(join(source, 'apps/service/scripts/build-telemetry.mjs'), 'utf8'))
    assert.equal(existsSync(join(destination, 'fixture-git/objects/info/alternates')), false)
    assert.equal(existsSync(join(destination, 'fixture-git/logs')), false)
    assert.ok(existsSync(join(destination, 'Dockerfile')))
    assert.ok(existsSync(join(destination, 'docs/agent-service/editorial-api-responses.schema.json')))
    const files = readdirSync(destination, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
    for (const entry of files) assert.equal(readFileSync(join(entry.parentPath, entry.name)).includes(Buffer.from(canary)), false)
    execFileSync('git', ['--git-dir', join(destination, 'fixture-git'), 'fsck', '--full', '--no-reflogs'])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('context rejects dirty or missing exporter build input and unrelated committed modules', () => {
  const { root, source } = sandbox()
  const buildScript = join(source, 'apps/service/scripts/build-telemetry.mjs')
  try {
    const original = readFileSync(buildScript, 'utf8')
    writeFileSync(buildScript, original + '\n')
    assert.throws(() => prepareRuntimeContext(join(root, 'dirty'), source), /Commit runtime inputs/)
    writeFileSync(buildScript, original)
    rmSync(buildScript)
    execFileSync('git', ['-C', source, 'add', '-u'])
    execFileSync('git', ['-C', source, '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Runtime Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Synthetic missing build input'])
    assert.throws(() => prepareRuntimeContext(join(root, 'missing'), source), /Required runtime build asset/)
    writeFileSync(buildScript, original)
    writeFileSync(join(source, 'apps/service/src/unrelated.mjs'), '// synthetic invalid context module\n')
    execFileSync('git', ['-C', source, 'add', 'apps/service/scripts/build-telemetry.mjs', 'apps/service/src/unrelated.mjs'])
    execFileSync('git', ['-C', source, '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Runtime Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Synthetic unsupported source module'])
    assert.throws(() => prepareRuntimeContext(join(root, 'unsupported'), source), /Unsupported runtime input path/)
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

test('journal manifest and every exact source input must be clean and committed', () => {
  for (const path of ['packages/journal/package.json', ...journalSources.map(path => `packages/journal/src/${path}`)]) {
    const { root, source } = sandbox()
    try {
      const input = join(source, path), original = readFileSync(input, 'utf8')
      writeFileSync(input, `${original}\n`)
      assert.throws(() => prepareRuntimeContext(join(root, 'dirty'), source), /Commit runtime inputs/)
      assert.equal(existsSync(join(root, 'dirty')), false)
      rmSync(input)
      execFileSync('git', ['-C', source, 'add', '-u'])
      execFileSync('git', ['-C', source, '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Runtime Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Synthetic missing journal input'])
      assert.throws(() => prepareRuntimeContext(join(root, 'missing'), source), /Required runtime build asset/)
      assert.equal(existsSync(join(root, 'missing')), false)
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
})

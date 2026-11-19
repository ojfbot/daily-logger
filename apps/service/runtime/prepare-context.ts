import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { REPO_ROOT, SOURCE_COMMIT, readFixture, reviewFixture } from '../src/fixture.js'
import { offlineGitEnvironment } from '../src/offline-git.js'

const exporterBuild = 'apps/service/scripts/build-telemetry.mjs'
const journalSources = ['packages/journal/src/activity-window.ts', 'packages/journal/src/eligibility.ts',
  'packages/journal/src/article-schema.ts', 'packages/journal/src/action-item-schema.ts', 'packages/journal/src/shipment-reference.ts',
  'packages/journal/src/article-body.ts', 'packages/journal/src/article-references.ts',
  'packages/journal/src/article-title.ts', 'packages/journal/src/normalize-article-markdown.ts',
  'packages/journal/src/render-article.ts', 'packages/journal/src/recommendation-prose.ts',
  'packages/journal/src/article-provenance.ts', 'packages/journal/src/article-markdown.ts']
const metadata = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'packages/frontend/package.json',
  'packages/journal/package.json', 'apps/service/package.json', exporterBuild, 'apps/service/runtime/Dockerfile', 'docs/agent-service/editorial-api-responses.schema.json']
const environment = { ...offlineGitEnvironment(), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
const git = (root: string, args: string[], localFetch = false) => execFileSync('git', ['-C', root, ...args], {
  env: { ...environment, GIT_ALLOW_PROTOCOL: localFetch ? 'file' : '' }, maxBuffer: 32 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
})

/** Only committed allowlisted inputs and a newly constructed public fixture store cross this boundary. */
export function prepareRuntimeContext(destination: string, sourceRoot = REPO_ROOT) {
  if (!isAbsolute(destination) || existsSync(destination)) throw new Error('Runtime context needs a new absolute destination')
  const source = realpathSync.native(sourceRoot)
  const parent = realpathSync.native(dirname(destination))
  const target = join(parent, basename(destination))
  if (target === source || target.startsWith(`${source}/`)) throw new Error('Runtime context must be outside the source checkout')
  const revision = z.string().regex(/^[0-9a-f]{40}$/).parse(git(source, ['rev-parse', '--verify', 'HEAD']).toString('utf8').trim())
  const service = z.object({ files: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).min(1) }).parse(
    JSON.parse(git(source, ['show', `${revision}:apps/service/package.json`]).toString('utf8')))
  // dist is a production-deploy asset generated inside the image build. Never
  // import host output, even if someone force-committed it past .gitignore.
  const allowed = [...metadata, ...journalSources, ...service.files.filter(path => path !== 'dist').map(path => `apps/service/${path}`)]
  if (git(source, ['status', '--porcelain', '--untracked-files=no', '--', ...allowed, 'apps/service/runtime']).length) {
    throw new Error('Commit runtime inputs before preparing their context')
  }
  const entries = git(source, ['ls-tree', '-r', '-z', revision, '--', ...allowed]).toString('utf8').split('\0').filter(Boolean)
    .map(entry => {
      const match = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(entry)
      if (!match) throw new Error('Runtime input must be an ordinary versioned file')
      const [, mode, object, path] = match
      if (path.split('/').some(part => part.startsWith('.') || part === 'node_modules') || !/\.(?:json|yaml|ts|sql)$/.test(path) && !path.endsWith('/Dockerfile') && path !== exporterBuild) {
        throw new Error('Unsupported runtime input path')
      }
      return { mode, object, path }
    })
  if ([...metadata, ...journalSources].some(path => !entries.some(entry => entry.path === path))) throw new Error('Required runtime build asset is missing')
  mkdirSync(target, { mode: 0o700 })
  try {
    for (const entry of entries) {
      const path = entry.path === 'apps/service/runtime/Dockerfile' ? 'Dockerfile' : entry.path
      const output = join(target, path)
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, git(source, ['cat-file', 'blob', entry.object]), { mode: entry.mode === '100755' ? 0o755 : 0o644 })
    }
    const staging = join(target, 'fixture-source')
    mkdirSync(staging)
    git(staging, ['-c', 'init.templateDir=', 'init', '--quiet'])
    git(staging, ['config', '--local', 'core.logAllRefUpdates', 'false'])
    git(staging, ['fetch', '--quiet', '--no-tags', '--depth=1', source, SOURCE_COMMIT], true)
    git(staging, ['update-ref', 'refs/heads/fixture-source', SOURCE_COMMIT])
    git(staging, ['symbolic-ref', 'HEAD', 'refs/heads/fixture-source'])
    rmSync(join(staging, '.git/FETCH_HEAD'), { force: true })
    if (git(staging, ['remote']).length || existsSync(join(staging, '.git/objects/info/alternates'))
      || existsSync(join(staging, '.git/logs'))) throw new Error('Fixture store must have no remotes, alternates or local reflogs')
    const configKeys = git(staging, ['config', '--local', '--name-only', '--list']).toString('utf8').trim().split('\n')
    if (configKeys.some(key => !key.startsWith('core.'))) throw new Error('Unexpected fixture Git configuration')
    git(staging, ['fsck', '--full', '--no-reflogs'])
    const fixture = readFixture(staging)
    const review = reviewFixture(fixture)
    renameSync(join(staging, '.git'), join(target, 'fixture-git'))
    rmSync(staging, { recursive: true })
    const receipt = { schemaVersion: 1, sourceRevision: revision, fixtureCommit: SOURCE_COMMIT,
      articleSha256: review.articleSha256, actionsSha256: review.actionsSha256, configuredRemotes: 0, alternateObjectStores: 0 }
    writeFileSync(join(target, 'runtime-context.json'), `${JSON.stringify(receipt, null, 2)}\n`)
    return receipt
  } catch (error) { rmSync(target, { recursive: true, force: true }); throw error }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [destination, ...extra] = process.argv.slice(2)
  try {
    if (!destination || extra.length) throw new Error('Usage: pnpm service:runtime:context /absolute/new/context')
    console.log(JSON.stringify(prepareRuntimeContext(destination), null, 2))
  } catch { process.stderr.write('Runtime context preparation failed; require clean committed inputs and local fixture objects\n'); process.exitCode = 1 }
}

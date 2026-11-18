import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { ACTIONS_PATH, ARTICLE_PATH, DATE, REPO_ROOT, digest, json, requireCondition, type Fixture, type Review } from './fixture.js'
import { offlineGit } from './offline-git.js'

function entryExists(path: string): boolean {
  try { lstatSync(path); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export function checkedRunDir(input: string): string {
  requireCondition(isAbsolute(input), '--run-dir must be an absolute path outside every Git checkout')
  const path = resolve(input)
  requireCondition(existsSync(dirname(path)), 'The run directory parent must already exist')
  const parent = realpathSync(dirname(path))
  const canonical = join(parent, path.split('/').at(-1)!)
  if (entryExists(canonical)) requireCondition(lstatSync(canonical).isDirectory() && !lstatSync(canonical).isSymbolicLink(), 'Run directory cannot be a symlink or file')
  const repo = realpathSync(REPO_ROOT)
  requireCondition(canonical !== repo && !canonical.startsWith(`${repo}/`), 'Run directory cannot be inside the source repository')
  // --show-toplevel fails inside .git and bare repositories. Git-directory
  // discovery also recognizes their metadata and linked-worktree Git dirs.
  let gitDirectory: string | undefined
  try { gitDirectory = offlineGit(['rev-parse', '--absolute-git-dir'], existsSync(canonical) ? canonical : parent).toString('utf8').trim() } catch (error) {
    const stderr = typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : ''
    requireCondition(/^fatal: not a git repository \(or any of the parent directories\): \.git$/m.test(stderr), 'Cannot establish that run directory is outside Git metadata')
  }
  requireCondition(!gitDirectory, 'Run directory must be outside every Git checkout and Git metadata directory')
  return canonical
}

function regularFile(path: string): Buffer {
  requireCondition(existsSync(path) && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), `Expected a regular file: ${path}`)
  return readFileSync(path)
}

function plainDirectory(path: string): void {
  requireCondition(existsSync(path) && lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink(), `Expected a plain directory: ${path}`)
}

export function initializeRun(runDir: string, fixture: Fixture): void {
  requireCondition(!existsSync(runDir), 'Run already exists; use status, resume, or recover')
  mkdirSync(runDir, { mode: 0o700 })
  mkdirSync(join(runDir, 'inputs'), { mode: 0o700 })
  writeFileSync(join(runDir, 'inputs/article.md'), fixture.article, { flag: 'wx', mode: 0o600 })
  writeFileSync(join(runDir, 'inputs/actions.json'), fixture.actions, { flag: 'wx', mode: 0o600 })
  writeFileSync(join(runDir, 'manifest.json'), fixture.manifestBytes, { flag: 'wx', mode: 0o600 })
}

export function validateInputs(runDir: string, fixture: Fixture): void {
  plainDirectory(runDir)
  plainDirectory(join(runDir, 'inputs'))
  requireCondition(regularFile(join(runDir, 'manifest.json')).equals(Buffer.from(fixture.manifestBytes)), 'Stale or changed manifest; start a new run')
  requireCondition(regularFile(join(runDir, 'inputs/article.md')).equals(fixture.article), 'Changed frozen article; resume rejected')
  requireCondition(regularFile(join(runDir, 'inputs/actions.json')).equals(fixture.actions), 'Changed frozen actions; resume rejected')
  const sqliteFiles = ['mutex.sqlite', 'checkpoints.sqlite'].flatMap(name => [name, `${name}-wal`, `${name}-shm`, `${name}-journal`])
  for (const name of [...sqliteFiles, 'attempts.jsonl']) {
    if (entryExists(join(runDir, name))) regularFile(join(runDir, name))
  }
}

/** A separate SQLite write transaction serializes CLI commands and releases on process death. */
export function acquireRunLock(runDir: string): () => void {
  const mutex = SqliteSaver.fromConnString(join(runDir, 'mutex.sqlite'))
  try {
    mutex.db.pragma('busy_timeout=0')
    mutex.db.exec('BEGIN IMMEDIATE')
  } catch (error) {
    mutex.db.close()
    throw new Error('Run is busy; retry after the other command exits', { cause: error })
  }
  return () => { mutex.db.exec('ROLLBACK'); mutex.db.close() }
}

export function recordAttempt(runDir: string, node: string): void {
  appendFileSync(join(runDir, 'attempts.jsonl'), `${JSON.stringify({ node })}\n`, { mode: 0o600 })
}

export function receipt(fixture: Fixture, review: Review, approval: string) {
  return {
    schemaVersion: 1,
    milestone: 'M1A offline fixture checkpoint',
    workflowVersion: fixture.manifest.workflowVersion,
    manifestDigest: fixture.manifestDigest,
    source: fixture.manifest.source,
    mode: fixture.manifest.mode,
    persistence: fixture.manifest.persistence,
    review,
    approval: { digest: approval, scope: 'write-isolated-shadow-artifacts-only' },
    artifacts: [
      { path: ARTICLE_PATH, sha256: digest(fixture.article) },
      { path: ACTIONS_PATH, sha256: digest(fixture.actions) },
    ],
    articleDate: DATE,
    articleStatus: 'draft',
    candidateIds: fixture.manifest.candidateIds,
    admissions: 0,
    publication: 'none',
    provenanceNote: 'Artifact bytes retain the original recorded GitHub Actions provenance. This receipt identifies the separate offline replay; it is not a new generation receipt.',
  }
}

export function artifactFiles(fixture: Fixture, review: Review, approval: string): Record<string, Buffer> {
  return {
    [ARTICLE_PATH]: fixture.article,
    [ACTIONS_PATH]: fixture.actions,
    'receipt.json': Buffer.from(json(receipt(fixture, review, approval))),
  }
}

export function validateArtifacts(runDir: string, files: Record<string, Buffer>): void {
  const root = join(runDir, 'artifacts')
  plainDirectory(root)
  const observed: string[] = []
  function walk(directory: string, prefix = '') {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      const relativePath = prefix ? `${prefix}/${name}` : name
      requireCondition(!lstatSync(path).isSymbolicLink(), 'Artifact symlinks are forbidden')
      if (lstatSync(path).isDirectory()) walk(path, relativePath)
      else { regularFile(path); observed.push(relativePath) }
    }
  }
  walk(root)
  requireCondition(JSON.stringify(observed.sort()) === JSON.stringify(Object.keys(files).sort()), 'Existing artifact bundle conflicts with this run; refusing overwrite')
  for (const [path, expected] of Object.entries(files)) requireCondition(regularFile(join(root, path)).equals(expected), `Existing artifact differs: ${path}; refusing overwrite`)
}

/** Publish the entire local bundle with one rename; a retry verifies rather than replaces it. */
export function writeArtifacts(runDir: string, files: Record<string, Buffer>): void {
  if (entryExists(join(runDir, 'artifacts'))) { validateArtifacts(runDir, files); return }
  const staging = join(runDir, `.staging-${randomUUID()}`)
  mkdirSync(staging, { mode: 0o700 })
  try {
    for (const [path, bytes] of Object.entries(files)) {
      mkdirSync(dirname(join(staging, path)), { recursive: true, mode: 0o700 })
      writeFileSync(join(staging, path), bytes, { flag: 'wx', mode: 0o600 })
    }
    renameSync(staging, join(runDir, 'artifacts'))
  } finally { rmSync(staging, { recursive: true, force: true }) }
}

import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { offlineGit } from './offline-git.js'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const SOURCE_COMMIT = '8b6263ad9a798eae20b3573546cf0ae762bff661'
export const DATE = '2026-11-17'
export const ARTICLE_PATH = `_articles/${DATE}.md`
export const ACTIONS_PATH = `actions/articles/${DATE}.json`
export const ARTICLE_BLOB = 'b9449c3db22b40fcc4970778504a1763ad2ffb08'
export const ACTIONS_BLOB = '1cc773a7a7b88081dbca299fab89e89bc185be91'
export const WORKFLOW_VERSION = 'm1a-recorded-artifact-replay-v1'
export const CANDIDATE_IDS = [
  'c893794efd4be442ad24057afa1f692c8242359c53d6c80569347e3d3bff284b',
  'bdaae4a42375c63d3ea0a4cf6f7008d8378592cd87c8f8d44b4117cf9e06f931',
  '1af9b191d27adb54f034bf9d316f0afbba354340b7d275772d7414d5fc53cc99',
]

export function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

export function json(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n` }
export function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function readFixture(repoRoot = REPO_ROOT) {
  const read = (path: string, expectedBlob: string): Buffer => {
    let blob: string
    let bytes: Buffer
    try {
      blob = offlineGit(['rev-parse', `${SOURCE_COMMIT}:${path}`], repoRoot).toString('utf8').trim()
      bytes = offlineGit(['cat-file', 'blob', `${SOURCE_COMMIT}:${path}`], repoRoot)
    } catch (cause) {
      throw new Error(`Fixture source unavailable offline: ${path} at ${SOURCE_COMMIT}. The pinned objects must already exist locally and Git must support --no-lazy-fetch.`, { cause })
    }
    requireCondition(blob === expectedBlob, `Fixture source identity mismatch: ${path}`)
    const actualBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    requireCondition(actualBlob === expectedBlob, `Fixture blob bytes do not match pinned identity: ${path}`)
    return bytes
  }
  const article = read(ARTICLE_PATH, ARTICLE_BLOB)
  const actions = read(ACTIONS_PATH, ACTIONS_BLOB)
  const manifest = {
    schemaVersion: 1,
    workflowVersion: WORKFLOW_VERSION,
    mode: 'offline-recorded-artifact-replay',
    date: DATE,
    source: {
      repository: 'ojfbot/daily-logger',
      commit: SOURCE_COMMIT,
      article: { path: ARTICLE_PATH, blob: ARTICLE_BLOB, sha256: digest(article) },
      actions: { path: ACTIONS_PATH, blob: ACTIONS_BLOB, sha256: digest(actions) },
    },
    candidateIds: CANDIDATE_IDS,
    admissions: 0,
    persistence: 'local-sqlite-development-proof',
  }
  return { article, actions, manifest, manifestBytes: json(manifest), manifestDigest: digest(json(manifest)) }
}

export type Fixture = ReturnType<typeof readFixture>

function fixtureRecord(value: unknown, path: string): Record<string, unknown> {
  requireCondition(typeof value === 'object' && value !== null && !Array.isArray(value), `Malformed action fixture: ${path} must be an object`)
  return value as Record<string, unknown>
}

/** This is an invariant reviewer for one recorded fixture, not an editorial/action reviewer. */
export function reviewFixture(fixture: Fixture) {
  const article = fixture.article.toString('utf8')
  requireCondition(/^---\r?\n[\s\S]*?\nstatus: ["']?draft["']?\r?\n[\s\S]*?\n---/.test(article), 'Fixture must remain a Draft article')
  requireCondition(article.includes(`date: ${DATE}`), 'Fixture article date differs')
  let parsed: unknown
  try { parsed = JSON.parse(fixture.actions.toString('utf8')) } catch (cause) {
    throw new Error('Malformed action fixture: invalid JSON', { cause })
  }
  const actions = fixtureRecord(parsed, 'root')
  requireCondition(actions.schemaVersion === 1 && actions.date === DATE, 'Unsupported dated action fixture')
  const snapshot = fixtureRecord(actions.snapshot, 'snapshot')
  requireCondition(snapshot.date === DATE && snapshot.status === 'draft', 'Action snapshot must remain Draft')
  requireCondition(fixtureRecord(snapshot.review, 'snapshot.review').state === 'pending', 'Action review must remain pending')
  requireCondition(Array.isArray(actions.suggestions) && actions.suggestions.length === 0, 'Fixture must have zero admitted suggestions')
  requireCondition(Array.isArray(actions.decisions) && actions.decisions.length === 0, 'Fixture must have zero action decisions')
  requireCondition(Array.isArray(snapshot.actionKeys) && snapshot.actionKeys.length === 0, 'Fixture must have zero action keys')
  const candidates: unknown = snapshot.draftCandidates
  requireCondition(Array.isArray(candidates) && candidates.length === 3, 'Malformed action fixture: draftCandidates must contain three candidates')
  const candidateRecords = candidates.map((candidate: unknown, index: number) => fixtureRecord(candidate, `draftCandidates[${index}]`))
  requireCondition(JSON.stringify(candidateRecords.map(candidate => candidate.candidateId)) === JSON.stringify(CANDIDATE_IDS), 'Fixture candidate identities changed')
  requireCondition(candidateRecords.every((candidate, index) => fixtureRecord(candidate.review, `draftCandidates[${index}].review`).state === 'awaiting-review'), 'Candidates must remain awaiting review')
  return {
    reviewer: 'deterministic-recorded-fixture-invariants-v1',
    outcome: 'pass' as const,
    articleStatus: 'draft' as const,
    candidateCount: 3,
    admissions: 0,
    actionReview: 'pending' as const,
    articleSha256: digest(fixture.article),
    actionsSha256: digest(fixture.actions),
    limitations: ['No live collection or model generation', 'No editorial-quality assessment', 'No action admission or publication authorization'],
  }
}

export type Review = ReturnType<typeof reviewFixture>
export function approvalDigest(fixture: Fixture, review: Review): string {
  return digest(json({ manifestDigest: fixture.manifestDigest, review, scope: 'write-isolated-shadow-artifacts-only' }))
}

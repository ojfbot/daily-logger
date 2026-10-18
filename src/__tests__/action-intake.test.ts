import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it, vi } from 'vitest'
import { projectActionIntake } from '../action-intake.js'
import { buildApi } from '../build-api.js'

// Real Git evidence checks perform several subprocesses per case.
vi.setConfig({ testTimeout: 20_000 })

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const suggestions = [
  '> - `/investigate morning-cockpit#57 identity boundary` — Define the source identity boundary. (morning-cockpit)',
  '> - `/validate core#1 exact bytes` — Confirm the source bytes. (core)',
  '> - `/orient morning-cockpit inspector` — Locate the inspector entry point. (morning-cockpit)',
]
const heldSuggestion = '> - `/orient core#2 held history` — Keep this outside admission. (core)'
const requiredIds = [
  'act-2026-10-15-investigate-66e04675dca0',
  'act-2026-10-15-validate-bf0fbc1d6c71',
  'act-2026-10-15-orient-a778b3b2c5af',
]

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function fixture(options: { externalOnly?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'action-intake-test-'))
  mkdirSync(join(root, '_articles'))
  mkdirSync(join(root, 'action-admissions'))
  mkdirSync(join(root, 'evidence'))
  mkdirSync(join(root, 'api'))
  const articlePath = '_articles/2026-10-15.md'
  const content = `${suggestions.join('\n')}\n${heldSuggestion}\n`
  const evidence = 'portable evidence\n'
  writeFileSync(join(root, articlePath), content)
  writeFileSync(join(root, 'evidence/proof.md'), evidence)
  const emptyLedger = '[]\n'
  writeFileSync(join(root, 'api/actions.json'), emptyLedger)
  writeFileSync(join(root, 'api/done-actions.json'), emptyLedger)
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'fixture'])
  const commitSha = git(root, ['rev-parse', 'HEAD'])
  const blobSha = git(root, ['rev-parse', `HEAD:${articlePath}`])
  const evidenceBlobSha = git(root, ['rev-parse', 'HEAD:evidence/proof.md'])
  const completedDisposition = options.externalOnly
    ? {
        kind: 'completed-existing-evidence',
        evidence: [{
          kind: 'external-local-receipt',
          locator: '/missing/local/receipt.json',
          sha256: 'f'.repeat(64),
          qualification: 'Not portable and not verified here.',
          verification: 'external-not-verified',
        }],
        qualification: 'Qualified, not settled.',
        nextSafeRetry: 'Only after source changes.',
      }
    : {
        kind: 'completed-existing-evidence',
        evidence: [{
          kind: 'repository-file',
          path: 'evidence/proof.md',
          commitSha,
          blobSha: evidenceBlobSha,
          sha256: sha256(evidence),
          qualification: 'Portable checked-in proof.',
        }],
        qualification: 'Qualified, not settled.',
        nextSafeRetry: 'Only after source changes.',
      }
  const dispositions = [
    {
      kind: 'deferred',
      owner: { threadId: 'fixture-deferred', title: 'Deferred fixture' },
      reason: 'No authority in the fixture.',
      nextSafeRetry: 'Wait for explicit reactivation.',
    },
    completedDisposition,
    {
      kind: 'pending-receipt',
      owner: { threadId: 'fixture-pending', title: 'Pending fixture' },
      acceptanceCriteria: ['Record accepted evidence.'],
      acceptedReceipt: null,
      nextSafeRetry: 'Wait for an accepted receipt.',
    },
  ]
  const record = {
    schemaVersion: 1,
    kind: 'reviewed-action-admission',
    admissionId: 'reviewed-actions-2026-10-15',
    recordedAt: '2026-10-16T00:00:00Z',
    baseline: {
      commitSha,
      openActionCount: 0,
      openActionsSha256: sha256(emptyLedger),
      doneActionCount: 0,
      doneActionsSha256: sha256(emptyLedger),
    },
    source: {
      repository: 'ojfbot/daily-logger',
      articlePath,
      articleDate: '2026-10-15',
      commitSha,
      blobSha,
      articleSha256: sha256(content),
    },
    historicalHold: {
      parserVersion: 'argument-bearing-v1',
      throughDate: '2026-10-15',
      expectedCount: 1,
      reason: 'No broad historical admission.',
    },
    authority: {
      admissionApproved: true,
      executionAuthorityGranted: false,
      settlementAuthorityGranted: false,
      broadHistoricalBackfillApproved: false,
    },
    items: suggestions.map((line, index) => ({
      id: requiredIds[index],
      allocatedAt: '2026-10-16T00:00:00Z',
      previousProductionActionId: null,
      sourceLine: index + 1,
      suggestionLineSha256: sha256(line),
      command: ['/investigate', '/validate', '/orient'][index],
      invocation: [
        '/investigate morning-cockpit#57 identity boundary',
        '/validate core#1 exact bytes',
        '/orient morning-cockpit inspector',
      ][index],
      description: [
        'Define the source identity boundary.',
        'Confirm the source bytes.',
        'Locate the inspector entry point.',
      ][index],
      repo: ['morning-cockpit', 'core', 'morning-cockpit'][index],
      disposition: dispositions[index],
    })),
  }
  const recordPath = join(root, 'action-admissions/2026-10-15.json')
  writeFileSync(recordPath, JSON.stringify(record, null, 2))
  return { root, articlePath, content, record, recordPath }
}

function project(f: ReturnType<typeof fixture>) {
  return projectActionIntake({
    repoRoot: f.root,
    articles: [{ path: f.articlePath, date: '2026-10-15', content: readFileSync(join(f.root, f.articlePath), 'utf8') }],
  })
}

describe('reviewed action intake', () => {
  it('admits the exact reviewed source, holds unapproved history, and ignores a missing external-only receipt', () => {
    const f = fixture({ externalOnly: true })
    const result = project(f)
    expect(result.reviewedActions.map((action) => action.id)).toEqual(requiredIds)
    expect(result.heldSuggestions.map((item) => item.invocation)).toEqual(['/orient core#2 held history'])
    expect(result.historicalHeldCount).toBe(1)
  })

  it('allows unrelated current prose edits but rejects an admitted invocation variant', () => {
    const f = fixture()
    writeFileSync(join(f.root, f.articlePath), `${f.content}\nUnrelated note.\n`)
    expect(() => project(f)).not.toThrow()
    writeFileSync(join(f.root, f.articlePath), f.content.replace('exact bytes', 'different bytes'))
    expect(() => project(f)).toThrow(/source drifted/)
  })

  it('rejects unavailable Git commits and missing or tampered portable evidence', () => {
    const missing = fixture()
    missing.record.source.commitSha = 'f'.repeat(40)
    writeFileSync(missing.recordPath, JSON.stringify(missing.record, null, 2))
    expect(() => project(missing)).toThrow(/Git proof failed/)

    const missingEvidence = fixture()
    rmSync(join(missingEvidence.root, 'evidence/proof.md'))
    expect(() => project(missingEvidence)).toThrow(/Required action evidence is missing/)

    const tampered = fixture()
    writeFileSync(join(tampered.root, 'evidence/proof.md'), 'tampered\n')
    expect(() => project(tampered)).toThrow(/evidence digest mismatch/)
  })

  it('rejects duplicate admissions rather than silently choosing one', () => {
    const f = fixture()
    f.record.items[1] = {
      ...f.record.items[0],
      id: requiredIds[1],
      disposition: f.record.items[1].disposition,
    }
    writeFileSync(f.recordPath, JSON.stringify(f.record, null, 2))
    expect(() => project(f)).toThrow(/Duplicate action admission source/)
  })

  it('fails closed before writing API output when the required admission is missing', () => {
    const f = fixture()
    const before = readFileSync(join(f.root, 'api/actions.json'), 'utf8')
    rmSync(f.recordPath)
    expect(() => buildApi(f.root)).toThrow(/Action registry is missing/)
    expect(readFileSync(join(f.root, 'api/actions.json'), 'utf8')).toBe(before)
  })

  it('rejects empty, invalid, and partial required admission records', () => {
    const empty = fixture()
    writeFileSync(empty.recordPath, '')
    expect(() => project(empty)).toThrow(/Required action admission is empty/)

    const invalid = fixture()
    writeFileSync(invalid.recordPath, '{')
    expect(() => project(invalid)).toThrow(/Invalid action admission/)

    const partial = fixture()
    partial.record.items.pop()
    writeFileSync(partial.recordPath, JSON.stringify(partial.record, null, 2))
    expect(() => project(partial)).toThrow(/Required action admission IDs changed/)
  })

  it('projects exactly the three reviewed October 15 sources in the real repository', () => {
    const articles = readdirSync(join(projectRoot, '_articles'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => ({
        path: `_articles/${name}`,
        date: name.replace('.md', ''),
        content: readFileSync(join(projectRoot, '_articles', name), 'utf8'),
      }))
    const result = projectActionIntake({
      repoRoot: projectRoot,
      articles,
    })
    expect(result.reviewedActions.map((action) => action.id)).toEqual([
      'act-2026-10-15-investigate-66e04675dca0',
      'act-2026-10-15-validate-bf0fbc1d6c71',
      'act-2026-10-15-orient-a778b3b2c5af',
    ])
    expect(result.historicalHeldCount).toBe(138)
  })
})

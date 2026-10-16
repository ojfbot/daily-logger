import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { buildApi } from '../src/build-api.js'
import {
  CanonicalActionArraySchema,
  assertCanonicalActionHistoryConserved,
  isReviewedAction,
} from '../src/action-model.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const baselineCommit = '061324ad4738c2594978bc059aa9578cc876a62d'
const expectedIds = [
  'act-2026-10-15-investigate-66e04675dca0',
  'act-2026-10-15-validate-bf0fbc1d6c71',
  'act-2026-10-15-orient-a778b3b2c5af',
]
const expectedInvocations = [
  '/investigate morning-cockpit#57 — multi-account GitHub identity boundary for source-record contracts',
  '/validate core#537 vendor byte-comparison gate — clean re-checkout then single-byte SDL mutation',
  '/orient morning-cockpit inspector — locate SDL path, vendored copy path, and inspector entry point',
]

function fail(message: string): never {
  throw new Error(`Action-intake check failed: ${message}`)
}

function gitShow(path: string): string {
  try {
    return execFileSync('git', ['show', `${baselineCommit}:${path}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
  } catch (error) {
    throw new Error(`Baseline ${baselineCommit}:${path} is unavailable; CI must fetch full history`, { cause: error })
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

const baselineOpenBytes = gitShow('api/actions.json')
const baselineDoneBytes = gitShow('api/done-actions.json')
const baselineOpen = CanonicalActionArraySchema.parse(JSON.parse(baselineOpenBytes))
const baselineDone = CanonicalActionArraySchema.parse(JSON.parse(baselineDoneBytes))
if (baselineOpen.length !== 85) fail(`expected 85 baseline actions, observed ${baselineOpen.length}`)
if (baselineDone.length !== 122) fail(`expected 122 baseline completions, observed ${baselineDone.length}`)
if (digest(baselineOpenBytes) !== '0d8170282fd66e5e8a0b70b1b8a4455d16f82d48e5b8e4f55aca20824743dae1') {
  fail('baseline actions digest changed')
}
if (digest(baselineDoneBytes) !== '8eb5c1db6ca27a2616748582d5a95dec979bf149f9720af29217dc87d286c00f') {
  fail('baseline completion-ledger digest changed')
}

const first = buildApi(repoRoot)
const currentOpenBytes = readFileSync(join(repoRoot, 'api/actions.json'), 'utf8')
const currentDoneBytes = readFileSync(join(repoRoot, 'api/done-actions.json'), 'utf8')
const ordinary = first.openActions.filter((action) => !isReviewedAction(action))
const reviewed = first.openActions.filter(isReviewedAction)
const currentDone = CanonicalActionArraySchema.parse(JSON.parse(currentDoneBytes))

const conservation = assertCanonicalActionHistoryConserved({
  baselineOpen,
  baselineDone,
  currentOpen: ordinary,
  currentDone,
})
if (JSON.stringify(reviewed.map((action) => action.id)) !== JSON.stringify(expectedIds)) {
  fail('reviewed action IDs are not the independently frozen set')
}
if (JSON.stringify(reviewed.map((action) => action.invocation)) !== JSON.stringify(expectedInvocations)) {
  fail('reviewed action invocations changed')
}
if (first.intake.historicalHeldCount !== 138) fail(`expected 138 historical holds, observed ${first.intake.historicalHeldCount}`)

const trackedOutputs = [
  'api/actions.json',
  'api/entries.json',
  'api/articles/2026-10-15.json',
  'api/done-actions.json',
]
const firstBytes = new Map(trackedOutputs.map((path) => [path, readFileSync(join(repoRoot, path), 'utf8')]))
const second = buildApi(repoRoot)
for (const path of trackedOutputs) {
  if (readFileSync(join(repoRoot, path), 'utf8') !== firstBytes.get(path)) {
    fail(`retry changed ${path}`)
  }
}
if (second.intake.reviewedActions.length !== 3 || second.intake.historicalHeldCount !== 138) {
  fail('retry changed admission or hold counts')
}

console.log(
  `Action intake verified: 85 baseline open actions conserved (${conservation.baselineOpenStillOpen} open, ${conservation.baselineOpenSettled} settled); `
  + `${ordinary.length} ordinary open + 3 reviewed; 122 baseline completions preserved; 138 historical held; retry byte-identical.`,
)

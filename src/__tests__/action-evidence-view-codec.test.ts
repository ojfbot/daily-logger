import { expect, it } from 'vitest'
import { ActionEvidenceViewReceiptSchema, decodeActionEvidenceViewSources, encodeActionEvidenceViewSourceReceipt, type ActionEvidenceViewReceipt, type ActionEvidenceViewSourceReceipt } from '../action-registry-contract.js'
import { sha256 } from '../action-registry.js'

const a = sha256('raw source A'), b = sha256('raw source B')
const source = (sourceId: string, rawSha256 = a): ActionEvidenceViewSourceReceipt => ({ sourceId, rawSha256, viewSha256: sha256('exact shown source including authority'), hiddenLines: [2, 9], omittedPathsSha256: sha256('exact omitted paths') })
const receipt = (sources: ActionEvidenceViewReceipt['sources']): ActionEvidenceViewReceipt => ({ version: 'action-evidence-view-v1', sourceEncoding: 'source-tuples-v1', policySha256: sha256('policy'), rawCaseDigest: sha256('case'), inputStateSha256: sha256('state'), sources })

it('losslessly encodes every source value/order and deduplicates only exact raw ID suffixes', () => {
  const terminators = ['\n', '\r', '\r\n', '\u2028', '\u2029']
  const original = [source(`github:core#1@${a}`), source('repository:AGENTS.md'), source(`upstream-full-pin@${b}`), source(`noncanonical-uppercase@${a.toUpperCase()}`), ...terminators.map(ending => source(`trailing-terminator@${a}${ending}`))]
  const encoded = receipt(original.map(encodeActionEvidenceViewSourceReceipt))
  expect(encoded.sources.map(row => row[1])).toEqual([null, a, a, a, ...terminators.map(() => a)])
  const serialized = JSON.stringify(encoded)
  const restored = ActionEvidenceViewReceiptSchema.parse(JSON.parse(serialized))
  expect(restored).toEqual(encoded)
  expect(Array.isArray(restored.sources[0])).toBe(true)
  expect(decodeActionEvidenceViewSources(restored)).toEqual(original)
  expect(decodeActionEvidenceViewSources(restored).map(encodeActionEvidenceViewSourceReceipt)).toEqual(encoded.sources)
  expect(serialized.length).toBeLessThan(JSON.stringify({ ...encoded, sources: original }).length)
  const decoded = decodeActionEvidenceViewSources(restored); decoded[0].hiddenLines.push(99)
  expect(restored.sources[0][3]).toEqual([2, 9])
})

it('rejects malformed, noncanonical and unknown tuple encodings without expanding wire JSON', () => {
  const row = encodeActionEvidenceViewSourceReceipt(source(`github:core#1@${a}`))
  const invalid: unknown[] = [
    ['missing-suffix', null, row[2], row[3], row[4]],
    [`uppercase@${a.toUpperCase()}`, null, row[2], row[3], row[4]],
    ...['\n', '\r', '\r\n', '\u2028', '\u2029'].map(ending => [`terminator@${a}${ending}`, null, row[2], row[3], row[4]]),
    [row[0], a, row[2], row[3], row[4]],
    [row[0], false, row[2], row[3], row[4]],
    [row[0], null, row[2], row[3]],
    [...row, 'extra'],
    [row[0], null, row[2], [0], row[4]],
    [row[0], null, 'not-a-digest', row[3], row[4]],
    source(row[0]),
  ]
  for (const invalidRow of invalid) expect(ActionEvidenceViewReceiptSchema.safeParse({ ...receipt([]), sources: [invalidRow] }).success).toBe(false)
  expect(ActionEvidenceViewReceiptSchema.safeParse({ ...receipt([row]), sourceEncoding: 'future-encoding' }).success).toBe(false)
  expect(ActionEvidenceViewReceiptSchema.safeParse({ ...receipt([row]), sourceEncoding: undefined }).success).toBe(false)
})

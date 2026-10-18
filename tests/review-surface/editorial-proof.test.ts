import { expect, it } from 'vitest'
import { editorialProofName, verifyEditorialProof } from '../../shared/editorial-action-proof.js'
const receipt = { repository: 'ojfbot/daily-logger', date: '2026-10-17', pullRequest: 42, runId: 101, runAttempt: 1, policySha: 'a'.repeat(40), inputHead: 'b'.repeat(40), outputCommit: 'c'.repeat(40), outputRegistryBlob: 'd'.repeat(40), outcome: 'changed', artifactId: 99 }
const artifact = { id: 99, name: editorialProofName(receipt), expired: false, workflow_run: { id: 101, head_sha: receipt.inputHead } }
it('requires an immutable artifact with the exact receipt hash and run identity (F13)', async () => {
  expect(await verifyEditorialProof(async () => Response.json(artifact), receipt)).toBe(true)
  for (const change of [{ outputCommit: 'e'.repeat(40) }, { outputRegistryBlob: 'e'.repeat(40) }, { date: '2026-10-18' }, { pullRequest: 43 }, { runAttempt: 2 }, { requestDigest: 'f'.repeat(64) }]) expect(await verifyEditorialProof(async () => Response.json(artifact), { ...receipt, ...change })).toBe(false)
  for (const change of [{ expired: true }, { workflow_run: { id: 102, head_sha: receipt.inputHead } }, { workflow_run: { id: 101, head_sha: receipt.policySha } }]) expect(await verifyEditorialProof(async () => Response.json({ ...artifact, ...change }), receipt)).toBe(false)
  await expect(verifyEditorialProof(async () => Response.json({}, { status: 503 }), receipt)).rejects.toThrow('unavailable')
})
it('skips bogus artifact claims without treating a provider outage as proof (F13 residual)', async () => {
  for (const response of [Response.json({}, { status: 404 }), Response.json({}, { status: 410 }), Response.json({}), new Response('invalid JSON')]) {
    expect(await verifyEditorialProof(async () => response, receipt)).toBe(false)
  }
  expect(await verifyEditorialProof(async () => Response.json(artifact), receipt)).toBe(true)
})

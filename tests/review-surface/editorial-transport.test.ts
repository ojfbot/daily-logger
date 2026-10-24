import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { z } from 'zod'

const resultSchema = z.object({ mode: z.enum(['sync', 'async']), node: z.string(), adapterSha256: z.string(),
  child: z.object({ peerClosed: z.literal(true), parentAcknowledged: z.boolean() }), heartbeats: z.number(),
  attempts: z.literal(1), delivered: z.boolean(), errorCode: z.string().nullable(), receiptReadback: z.boolean(), storedReceipts: z.number().int().min(0).max(1),
  events: z.array(z.object({ event: z.string(), method: z.string().optional(), path: z.string().optional(), socket: z.number().optional() })),
  peerStderr: z.literal(''), externalCalls: z.literal(0), providerCalls: z.literal(0) })

it('lets the parent retire a closed idle connection before its sole receipt POST', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'editorial-idle-socket-'))
  const results: z.infer<typeof resultSchema>[] = []
  try {
    for (const mode of ['sync', 'async']) {
      const state = mkdtempSync(resolve(root, `${mode}-`))
      const result = await promisify(execFile)(process.execPath, ['--import', 'tsx',
        resolve('tests/review-surface/fixtures/editorial-idle-socket.mjs'), mode, state, process.cwd()],
      { env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 8000, maxBuffer: 16384 })
      results.push(resultSchema.parse(JSON.parse(result.stdout)))
    }
    const [sync, async] = results
    expect(sync).toMatchObject({ mode: 'sync', child: { parentAcknowledged: false }, heartbeats: 0 })
    // Delivery depends on the runtime's socket handling; blocking the parent does not prove non-delivery.
    expect(sync?.errorCode === null).toBe(sync?.delivered)
    for (const result of results) {
      expect(result.events.filter(event => event.method === 'POST')).toHaveLength(result.storedReceipts)
      expect(result.receiptReadback).toBe(result.storedReceipts === 1)
      if (result.delivered) expect(result.receiptReadback).toBe(true)
    }
    expect(async).toMatchObject({ mode: 'async', child: { parentAcknowledged: true }, delivered: true, errorCode: null, receiptReadback: true, storedReceipts: 1 })
    expect(async?.heartbeats).toBeGreaterThan(0)
    expect(async?.events.filter(event => event.method === 'POST')).toHaveLength(1)
    expect(async?.events.find(event => event.method === 'POST')?.socket).not.toBe(async?.events.find(event => event.path === '/user')?.socket)
    expect(async?.adapterSha256).toBe(sync?.adapterSha256)
  } finally { rmSync(root, { recursive: true, force: true }) }
}, 20000)

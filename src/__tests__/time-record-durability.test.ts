import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

const io = vi.hoisted(() => ({ descriptors: new Map<number, string>(), events: new Array<string>() }))
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>()
  return { ...original,
    openSync(...args: Parameters<typeof original.openSync>) { const descriptor = original.openSync(...args); io.descriptors.set(descriptor, String(args[0])); return descriptor },
    closeSync(descriptor: number) { io.descriptors.delete(descriptor); original.closeSync(descriptor) },
    fsyncSync(descriptor: number) { io.events.push(`sync:${io.descriptors.get(descriptor)}`); original.fsyncSync(descriptor) },
    renameSync(from: Parameters<typeof original.renameSync>[0], to: Parameters<typeof original.renameSync>[1]) { io.events.push(`rename:${String(to)}`); original.renameSync(from, to) },
  }
})
import { prepareGeneratedTime, persistGeneratedTime } from '../article-time-metadata.js'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); io.events.length = 0; io.descriptors.clear() })

describe('source artifact durability before article publication', () => {
  it('syncs every ancestor entry and the artifact directory before article rename, including retries', () => {
    const root = mkdtempSync(join(tmpdir(), 'time-record-durability-')); roots.push(root)
    const date = '2026-10-18'
    const prepared = prepareGeneratedTime({ date, markdown: `---\ndate: ${date}\n---\nNo event clocks.\n`, records: [], capture: { observedAt: null, window: null } })
    for (const _attempt of [0, 1]) {
      io.events.length = 0
      const published = persistGeneratedTime({ repoRoot: root, prepared })
      const publication = io.events.indexOf(`rename:${published.articlePath}`)
      expect(publication).toBeGreaterThan(0)
      for (const parent of [root, join(root, 'api'), join(root, 'api/time-records'), join(root, 'api/time-records', date)]) {
        const flush = io.events.indexOf(`sync:${parent}`)
        expect(flush).toBeGreaterThanOrEqual(0)
        expect(flush).toBeLessThan(publication)
      }
      expect(io.events.lastIndexOf(`sync:${join(root, '_articles')}`)).toBeGreaterThan(publication)
    }
  })
})

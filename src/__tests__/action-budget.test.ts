import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { ActionRegistrySchema } from '../action-registry.js'

it('runs the receipt-free CI probe and fails when fixed action context grows beyond its budget (F3r)', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  const directory = mkdtempSync(join(tmpdir(), 'action-budget-'))
  try {
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', packageManager: 'pnpm@9.15.4' }))
    cpSync(join(root, 'actions'), join(directory, 'actions'), { recursive: true })
    mkdirSync(join(directory, '_articles'))
    cpSync(join(root, '_articles/2026-10-17.md'), join(directory, '_articles/2026-10-17.md'))
    symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir')
    const run = () => execFileSync('pnpm', ['exec', 'node', '--import', 'tsx', join(root, 'scripts/check-action-size.ts')], { cwd: directory, encoding: 'utf8', stdio: 'pipe' })
    const before = readFileSync(join(directory, 'actions/registry.json'), 'utf8')
    const result = JSON.parse(run())
    expect(result.proposerPromptBytes).toBeLessThan(result.limits.fixedContext)
    expect(result.verifierPromptBytes).toBeLessThan(result.limits.fixedContext)
    expect(readFileSync(join(directory, 'actions/registry.json'), 'utf8')).toBe(before)
    const inflated = ActionRegistrySchema.parse(JSON.parse(before))
    inflated.records[0].doneWhen += 'x'.repeat(100 * 1024)
    writeFileSync(join(directory, 'actions/registry.json'), JSON.stringify(inflated))
    expect(run).toThrow(/Fixed action context exceeds 320 KiB/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 20_000)

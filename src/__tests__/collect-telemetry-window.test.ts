import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { activityWindow } from '../activity-window.js'
import { collectTelemetry } from '../collect-telemetry.js'

let folder: string | undefined
afterEach(() => {
  vi.unstubAllEnvs()
  if (folder) rmSync(folder, { recursive: true, force: true })
})

describe('telemetry shares the half-open reporting interval', () => {
  it('reads skill dispositions from the host state directory by default', () => {
    folder = mkdtempSync(join(tmpdir(), 'daily-telemetry-default-'))
    vi.stubEnv('HOME', folder)
    vi.stubEnv('SKILL_DISPOSITIONS_PATH', '')
    vi.stubEnv('TELEMETRY_DIR', join(folder, 'telemetry'))
    const window = activityWindow('2026-11-01')
    const ts = new Date(window.start).toISOString()
    const ledger = join(folder, '.local', 'state', 'ojfbot', 'tracking', 'skill-dispositions.jsonl')
    mkdirSync(dirname(ledger), { recursive: true })
    writeFileSync(ledger, JSON.stringify({ ts, event: 'skill:disposition', skill: 'validate', engaged: true }))

    expect(collectTelemetry(window)).toMatchObject({
      skillsInvoked: [{ name: 'validate', count: 1 }],
      skillSource: 'dispositions',
    })
  })

  it('bounds every count while keeping source freshness explicitly unwindowed', () => {
    folder = mkdtempSync(join(tmpdir(), 'daily-telemetry-window-'))
    vi.stubEnv('TELEMETRY_DIR', folder)
    vi.stubEnv('SKILL_DISPOSITIONS_PATH', join(folder, 'skill-dispositions.jsonl'))
    const window = activityWindow('2026-11-01')
    const stamps = [window.start - 1, window.start, window.end - 1, window.end, window.end + 1]
      .map((time) => new Date(time).toISOString())
    const rows = (event: string) => stamps.map((ts, index) => ({
      ts, event, session_id: `session-${index}`, tool_name: 'Read', skill: 'validate', engaged: true,
    }))
    for (const [name, event] of [
      ['tool-telemetry', 'tool:used'], ['session-telemetry', 'session:started'],
      ['skill-telemetry', 'skill:suggestion-followed'], ['suggestion-telemetry', 'skill:suggested'],
      ['skill-dispositions', 'skill:disposition'],
    ]) writeFileSync(join(folder, `${name}.jsonl`), rows(event).map((row) => JSON.stringify(row)).join('\n'))
    expect(collectTelemetry(window)).toMatchObject({
      totalToolCalls: 2, totalSessions: 2, skillsInvoked: [{ name: 'validate', count: 2 }],
      suggestionsGiven: 2, suggestionsFollowed: 2, skillSource: 'dispositions',
      skillSourceNewestTs: new Date(window.end + 1).toISOString(),
    })
  })
})

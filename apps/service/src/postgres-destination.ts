import { linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { json, type Fixture } from './fixture.js'
import { checkedRunDir, validateInputs } from './storage.js'
import { AdmissionConflictError, requireAdmission } from './admission-conflict.js'

export const RESERVATION_FILE = '.dailylogger-reservation.json'
export interface DestinationReservation {
  schemaVersion: 1
  runId: string
  requestKey: string
  requestDigest: string
  runDir: string
  physicalIdentity: string
}

function exists(path: string): boolean {
  try { lstatSync(path); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function physicalDirectory(directory: string) {
  const checked = checkedRunDir(directory)
  requireAdmission(exists(checked), 'Reserved destination is missing; refusing to recreate it')
  const runDir = realpathSync.native(checked)
  const stat = lstatSync(runDir, { bigint: true })
  requireAdmission(stat.isDirectory() && !stat.isSymbolicLink(), 'Reserved destination must be a plain directory')
  return { runDir, physicalIdentity: `${stat.dev}:${stat.ino}` }
}

function readReservation(directory: string): DestinationReservation {
  const file = join(directory, RESERVATION_FILE)
  requireAdmission(exists(file) && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink(), 'Destination reservation marker is missing or invalid')
  let value: DestinationReservation
  const bytes = readFileSync(file, 'utf8')
  try { value = JSON.parse(bytes) } catch { throw new AdmissionConflictError('Destination reservation marker is invalid; refusing repair') }
  requireAdmission(value?.schemaVersion === 1 && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.runId ?? '')
    && typeof value.requestKey === 'string' && typeof value.requestDigest === 'string'
    && typeof value.runDir === 'string' && typeof value.physicalIdentity === 'string', 'Destination reservation marker is invalid')
  return value
}

export function validateDestination(expected: DestinationReservation): void {
  const observed = physicalDirectory(expected.runDir)
  requireAdmission(observed.runDir === expected.runDir && observed.physicalIdentity === expected.physicalIdentity, 'Destination physical identity changed; refusing reassignment')
  requireAdmission(json(readReservation(expected.runDir)) === json(expected), 'Destination reservation binding changed')
}

/** Atomic filesystem reservation, not database admission. Never deletes/reassigns ownership. */
export function reserveDestination(directory: string, requestKey: string, proposedRunId: string, requestDigest: (canonicalDirectory: string) => string, options: { existingBinding?: boolean; legacyFixture?: Fixture } = {}): DestinationReservation {
  const checked = checkedRunDir(directory)
  if (options.existingBinding) requireAdmission(exists(checked), 'Reserved destination is missing; refusing to recreate it')
  else {
    try { mkdirSync(checked, { mode: 0o700 }) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  const physical = physicalDirectory(checked)
  const marker = join(physical.runDir, RESERVATION_FILE)
  if (!exists(marker)) {
    if (options.existingBinding) {
      requireAdmission(options.legacyFixture, 'Destination reservation marker is missing; refusing reassignment')
      validateInputs(physical.runDir, options.legacyFixture)
    } else requireAdmission(readdirSync(physical.runDir).length === 0 || exists(marker), 'Unreserved destination is not empty; refusing admission')
    const proposed: DestinationReservation = {
      schemaVersion: 1, runId: proposedRunId, requestKey,
      requestDigest: requestDigest(physical.runDir), ...physical,
    }
    // Staging outside the destination keeps a crash-before-link directory empty.
    // A complete marker becomes visible atomically. Competing creators either
    // link once or read the winner, with no polling or partially written marker.
    const staging = join(dirname(physical.runDir), `.dailylogger-reservation-${randomUUID()}.tmp`)
    try {
      writeFileSync(staging, json(proposed), { flag: 'wx', mode: 0o600 })
      try { linkSync(staging, marker) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    } finally { if (exists(staging)) unlinkSync(staging) }
  }
  const reserved = readReservation(physical.runDir)
  requireAdmission(reserved.runDir === physical.runDir && reserved.physicalIdentity === physical.physicalIdentity, 'Destination reservation physical identity or canonical path differs')
  requireAdmission(reserved.requestKey === requestKey, 'Run directory is already bound to another request key')
  requireAdmission(reserved.requestDigest === requestDigest(physical.runDir), 'Destination reservation has different immutable inputs')
  if (options.existingBinding) requireAdmission(reserved.runId === proposedRunId, 'Destination reservation belongs to another run')
  validateDestination(reserved)
  return reserved
}

/** PG-only initialization inside an already reserved directory; SQLite is unchanged. */
export function initializeReservedRun(reserved: DestinationReservation, fixture: Fixture): void {
  validateDestination(reserved)
  const entries = readdirSync(reserved.runDir)
  if (entries.length !== 1 || entries[0] !== RESERVATION_FILE) {
    validateInputs(reserved.runDir, fixture) // partial or foreign contents fail closed
    return
  }
  mkdirSync(join(reserved.runDir, 'inputs'), { mode: 0o700 })
  writeFileSync(join(reserved.runDir, 'inputs/article.md'), fixture.article, { flag: 'wx', mode: 0o600 })
  writeFileSync(join(reserved.runDir, 'inputs/actions.json'), fixture.actions, { flag: 'wx', mode: 0o600 })
  writeFileSync(join(reserved.runDir, 'manifest.json'), fixture.manifestBytes, { flag: 'wx', mode: 0o600 })
}

import { z } from 'zod'
import { canonicalInstant } from './time-reference-schema.js'
import { shipmentSources, type ShipmentSource, type TimeRecord } from './time-references.js'

const ShipmentSourceSchema = z.object({
  repo: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/),
  ref: z.string().regex(/^[1-9]\d*$/),
  url: z.string().url(),
}).strict().refine((source) => source.url === `https://github.com/${source.repo}/pull/${source.ref}`)

export const ShipmentTimeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('available'),
    source: ShipmentSourceSchema,
    at: z.string().refine((value) => canonicalInstant(value) === value),
  }).strict(),
  z.object({
    status: z.literal('unavailable'),
    source: ShipmentSourceSchema,
    reason: z.enum(['missing-merge-time', 'conflicting-merge-times', 'capture-exhausted']),
  }).strict(),
])
export type ShipmentTime = z.infer<typeof ShipmentTimeSchema>

export const ShipmentExclusionSchema = z.object({
  source: ShipmentSourceSchema,
  reason: z.literal('closed-unmerged'),
}).strict()
export type ShipmentExclusion = z.infer<typeof ShipmentExclusionSchema>

export interface ShipmentCoverage {
  times: ShipmentTime[]
  exclusions: ShipmentExclusion[]
}

function sourceKey(source: ShipmentSource): string {
  return `${source.repo.toLowerCase()}#${source.ref}`
}

/** Resolve every PR listed in What shipped without relying on authored clock text. */
export function resolveShipmentTimes(markdown: string, records: TimeRecord[], captureStatus: 'complete' | 'exhausted'): ShipmentCoverage {
  const times: ShipmentTime[] = []
  const exclusions: ShipmentExclusion[] = []
  for (const source of shipmentSources(markdown)) {
    const scoped = records.filter((record) => record.evidence.kind === 'github-pull-request'
      && record.evidence.repo.toLowerCase() === source.repo.toLowerCase()
      && record.evidence.ref === source.ref)
    const merged = [...new Set(scoped.filter((record) => record.evidence.kind === 'github-pull-request' && record.evidence.event === 'merged').map((record) => record.at))]
    if (merged.length === 1) times.push(ShipmentTimeSchema.parse({ status: 'available', source, at: merged[0] }))
    else if (merged.length > 1) times.push(ShipmentTimeSchema.parse({ status: 'unavailable', source, reason: 'conflicting-merge-times' }))
    else if (scoped.some((record) => record.evidence.kind === 'github-pull-request' && record.evidence.event === 'closed-unmerged')) exclusions.push(ShipmentExclusionSchema.parse({ source, reason: 'closed-unmerged' }))
    else times.push(ShipmentTimeSchema.parse({ status: 'unavailable', source, reason: captureStatus === 'exhausted' ? 'capture-exhausted' : 'missing-merge-time' }))
  }
  return { times, exclusions }
}

/** The delivery gate: each in-section source has exactly one control state or a proved closed-unmerged exclusion. */
export function assertShipmentCoverage(markdown: string, coverage: ShipmentCoverage): void {
  const expected = new Map(shipmentSources(markdown).map((source) => [sourceKey(source), source]))
  const times = new Map<string, ShipmentTime>()
  const exclusions = new Map<string, ShipmentExclusion>()
  for (const raw of coverage.times) {
    const time = ShipmentTimeSchema.parse(raw)
    const key = sourceKey(time.source)
    if (!expected.has(key)) throw new Error(`Unexpected shipment time state for ${time.source.repo}#${time.source.ref}`)
    if (times.has(key)) throw new Error(`Duplicate shipment time state for ${time.source.repo}#${time.source.ref}`)
    times.set(key, time)
  }
  for (const raw of coverage.exclusions) {
    const exclusion = ShipmentExclusionSchema.parse(raw)
    const key = sourceKey(exclusion.source)
    if (!expected.has(key)) throw new Error(`Unexpected shipment exclusion for ${exclusion.source.repo}#${exclusion.source.ref}`)
    if (exclusions.has(key)) throw new Error(`Duplicate shipment exclusion for ${exclusion.source.repo}#${exclusion.source.ref}`)
    exclusions.set(key, exclusion)
  }
  for (const [key, source] of expected) {
    if (times.has(key) && exclusions.has(key)) throw new Error(`Unmerged ${source.repo}#${source.ref} cannot expose a shipment time state`)
    if (!times.has(key) && !exclusions.has(key)) throw new Error(`Missing shipment time state for ${source.repo}#${source.ref}`)
  }
}

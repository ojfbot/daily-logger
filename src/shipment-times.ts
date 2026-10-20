import { z } from 'zod'
import { canonicalInstant } from './time-reference-schema.js'
import { shipmentSources, type ShipmentSource, type TimeRecord } from './time-references.js'
import type { BlogContext } from './types.js'

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
  reason: z.enum(['open', 'closed-unmerged']),
}).strict()
export type ShipmentExclusion = z.infer<typeof ShipmentExclusionSchema>

export const ShipmentSourceStateSchema = z.object({
  source: ShipmentSourceSchema,
  state: z.enum(['open', 'closed-unmerged']),
}).strict()
export type ShipmentSourceState = z.infer<typeof ShipmentSourceStateSchema>

export interface ShipmentCoverage {
  times: ShipmentTime[]
  exclusions: ShipmentExclusion[]
}

function sourceKey(source: ShipmentSource): string {
  return `${source.repo.toLowerCase()}#${source.ref}`
}

/** Persist only current provider states for PRs actually linked in What shipped. */
export function shipmentStatesFromContext(ctx: BlogContext, markdown: string): ShipmentSourceState[] {
  const current = new Map<string, ShipmentSourceState['state']>()
  const merged = new Set<string>()
  const key = (repo: string, number: number) => `${repo.includes('/') ? repo.toLowerCase() : `ojfbot/${repo.toLowerCase()}`}#${number}`
  for (const pr of ctx.mergedPRs) merged.add(key(pr.repo, pr.number))
  for (const pr of ctx.recentPRs) if (pr.mergedAt || pr.merged === true) merged.add(key(pr.repo, pr.number))
  const add = (repo: string, number: number, state: ShipmentSourceState['state']) => {
    const id = key(repo, number)
    const prior = current.get(id)
    if (prior && prior !== state) throw new Error(`Conflicting current PR states for ${id}`)
    current.set(id, state)
  }
  for (const pr of ctx.openPRs) add(pr.repo, pr.number, 'open')
  for (const pr of ctx.recentPRs) {
    if (pr.state === 'open') add(pr.repo, pr.number, 'open')
    else if (pr.merged === false && !pr.mergedAt) add(pr.repo, pr.number, 'closed-unmerged')
  }
  return shipmentSources(markdown).flatMap((source) => {
    const id = sourceKey(source)
    const state = current.get(id)
    if (state && merged.has(id)) throw new Error(`Conflicting merge and current PR state for ${id}`)
    return state ? [ShipmentSourceStateSchema.parse({ source, state })] : []
  })
}

/** Resolve every PR listed in What shipped without relying on authored clock text. */
export function resolveShipmentTimes(markdown: string, records: TimeRecord[], captureStatus: 'complete' | 'exhausted', sourceStates: ShipmentSourceState[] = []): ShipmentCoverage {
  const times: ShipmentTime[] = []
  const exclusions: ShipmentExclusion[] = []
  const sources = shipmentSources(markdown)
  const expected = new Set(sources.map(sourceKey))
  const states = new Map<string, ShipmentSourceState['state']>()
  for (const raw of sourceStates) {
    const entry = ShipmentSourceStateSchema.parse(raw)
    const key = sourceKey(entry.source)
    if (!expected.has(key)) throw new Error(`Current PR state has no shipment link for ${key}`)
    if (states.has(key)) throw new Error(`Duplicate current PR state for ${key}`)
    states.set(key, entry.state)
  }
  for (const source of sources) {
    const scoped = records.filter((record) => record.evidence.kind === 'github-pull-request'
      && record.evidence.repo.toLowerCase() === source.repo.toLowerCase()
      && record.evidence.ref === source.ref)
    const merged = [...new Set(scoped.filter((record) => record.evidence.kind === 'github-pull-request' && record.evidence.event === 'merged').map((record) => record.at))]
    const state = states.get(sourceKey(source))
    if (state && merged.length) throw new Error(`Conflicting merge and current PR state for ${source.repo}#${source.ref}`)
    if (state === 'open' && scoped.some((record) => record.evidence.kind === 'github-pull-request' && record.evidence.event === 'closed-unmerged')) throw new Error(`Conflicting open and closed PR state for ${source.repo}#${source.ref}`)
    if (state) exclusions.push(ShipmentExclusionSchema.parse({ source, reason: state }))
    else if (merged.length === 1) times.push(ShipmentTimeSchema.parse({ status: 'available', source, at: merged[0] }))
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

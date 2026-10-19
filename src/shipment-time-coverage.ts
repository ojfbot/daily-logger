import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { readArticleTime } from './article-time-metadata.js'
import { assertShipmentCoverage, ShipmentTimeSchema } from './shipment-times.js'
import { shipmentSources } from './time-references.js'

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ApiArticleSchema = z.object({
  sourceBlobSha: z.string().regex(/^[a-f0-9]{40}$/),
  shipmentTimes: z.array(ShipmentTimeSchema).optional(),
}).passthrough()
export const SHIPMENT_COVERAGE_START_DATE = '2026-10-19'

/** Rollout boundary: dated articles from October 19 onward cannot publish linked shipments without v2 coverage. */
export function requiresShipmentTimeCoverage(date: string, markdown: string): boolean {
  return date >= SHIPMENT_COVERAGE_START_DATE && shipmentSources(markdown).length > 0
}

function blobSha(content: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex')
}

export function checkShipmentTimeCoverage(repoRoot: string, requestedDate: string) {
  const date = DateSchema.parse(requestedDate)
  const markdown = readFileSync(resolve(repoRoot, '_articles', `${date}.md`), 'utf8')
  const expectedSources = shipmentSources(markdown)
  const metadata = readArticleTime({ repoRoot, date, markdown })
  if (requiresShipmentTimeCoverage(date, markdown) && metadata.shipmentCoverage.status !== 'complete') throw new Error(`${date}: immutable shipment-time coverage is not enabled`)
  if (metadata.shipmentCoverage.status !== 'complete') return { date, sourceBlobSha: blobSha(markdown), candidates: 0, available: 0, unavailable: 0, excluded: 0 }
  assertShipmentCoverage(markdown, metadata.shipmentCoverage)

  const api = ApiArticleSchema.parse(JSON.parse(readFileSync(resolve(repoRoot, 'api', 'articles', `${date}.json`), 'utf8')))
  if (api.sourceBlobSha !== blobSha(markdown)) throw new Error(`${date}: API article is stale for the current source blob`)
  const apiCoverage = { times: api.shipmentTimes ?? [], exclusions: metadata.shipmentCoverage.exclusions }
  assertShipmentCoverage(markdown, apiCoverage)
  if (JSON.stringify(apiCoverage.times) !== JSON.stringify(metadata.shipmentCoverage.times)) throw new Error(`${date}: API shipment-time states differ from the immutable artifact resolution`)

  return {
    date,
    sourceBlobSha: api.sourceBlobSha,
    candidates: expectedSources.length,
    available: apiCoverage.times.filter((time) => time.status === 'available').length,
    unavailable: apiCoverage.times.filter((time) => time.status === 'unavailable').length,
    excluded: apiCoverage.exclusions.length,
  }
}

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { ActionEvidenceCoverageSchema, ActionEvidenceRangeSchema } from '../src/action-registry.js'
import { buildActionEvidenceProjection, persistActionEvidenceReply, readActionEvidenceRequest } from '../src/action-evidence-retrieval.js'

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = process.env.ACTION_REPO_ROOT ? resolve(process.env.ACTION_REPO_ROOT) : defaultRoot
const requestId = process.env.ACTION_EVIDENCE_REQUEST_ID?.trim()
const specPath = process.env.ACTION_EVIDENCE_REPLY_SPEC?.trim()
if (!requestId?.match(/^[a-f0-9]{64}$/)) throw new Error('ACTION_EVIDENCE_REQUEST_ID must be the 64-character request ID')
if (!specPath) throw new Error('ACTION_EVIDENCE_REPLY_SPEC must point to JSON with exact ranges and per-obligation coverage')

const { request, source } = readActionEvidenceRequest({ repoRoot, requestId })
if (!source) throw new Error('Stored action evidence request lacks its complete source artifact')
const spec = z.object({ ranges: z.array(ActionEvidenceRangeSchema).min(1), coverage: z.array(ActionEvidenceCoverageSchema).min(1) }).strict()
  .parse(JSON.parse(readFileSync(resolve(repoRoot, specPath), 'utf8')))
const projection = buildActionEvidenceProjection({ request, source, ranges: spec.ranges, coverage: spec.coverage })
persistActionEvidenceReply({ repoRoot, projection })
console.log(JSON.stringify({ requestId: projection.projection?.requestId, projectionId: projection.id, sourceId: source.id, bytes: Buffer.byteLength(projection.content) }))

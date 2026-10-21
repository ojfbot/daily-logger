import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { closeActionEvidenceRequest, readActionEvidenceRequest } from '../src/action-evidence-retrieval.js'

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = process.env.ACTION_REPO_ROOT ? resolve(process.env.ACTION_REPO_ROOT) : defaultRoot
const requestId = z.string().regex(/^[a-f0-9]{64}$/).parse(process.env.ACTION_EVIDENCE_REQUEST_ID?.trim())
const status = z.enum(['cancelled', 'expired', 'superseded', 'declined']).parse(process.env.ACTION_EVIDENCE_STATUS?.trim())
const { request } = readActionEvidenceRequest({ repoRoot, requestId })
const receipt = closeActionEvidenceRequest({ repoRoot, request, status })

console.log(JSON.stringify(receipt))

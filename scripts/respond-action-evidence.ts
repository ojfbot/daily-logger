import { lstatSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { persistActionEvidenceResponse, readActionEvidenceRequest } from '../src/action-evidence-retrieval.js'

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = process.env.ACTION_REPO_ROOT ? resolve(process.env.ACTION_REPO_ROOT) : defaultRoot
const requestId = process.env.ACTION_EVIDENCE_REQUEST_ID?.trim()
const responsePath = process.env.ACTION_EVIDENCE_RESPONSE_FILE?.trim()
const responder = process.env.ACTION_EVIDENCE_RESPONDER?.trim()
if (!requestId?.match(/^[a-f0-9]{64}$/)) throw new Error('ACTION_EVIDENCE_REQUEST_ID must be the 64-character request ID')
if (!responsePath) throw new Error('ACTION_EVIDENCE_RESPONSE_FILE must point to the owner response text')
if (!responder) throw new Error('ACTION_EVIDENCE_RESPONDER must identify the human responder')

const { request } = readActionEvidenceRequest({ repoRoot, requestId })
const resolvedResponsePath = resolve(repoRoot, responsePath)
const responseStats = lstatSync(resolvedResponsePath)
if (responseStats.isSymbolicLink() || !responseStats.isFile()) throw new Error('Action evidence response must be a regular file')
const { path, response } = persistActionEvidenceResponse({ repoRoot, request, responder, answer: readFileSync(resolvedResponsePath, 'utf8') })
console.log(JSON.stringify({ requestId: request.id, responseId: response.id, path }))

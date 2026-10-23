/** Manual synthetic schema probe. No editorial/runtime imports or import-time execution. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'
import type { Fetch } from '@anthropic-ai/sdk/core'

export const FIXTURES = 'tests/fixtures/action-schema-probe'
export const MANIFEST_SHA = 'ddfb016b14633ebc0487153576c634a2e986de99102f025cd7ffb38b325693f7'
const WORKFLOW = '.github/workflows/action-schema-probe.yml'
const DRIVER = 'scripts/probe-action-schema.ts'
const ORIGIN = 'https://api.anthropic.com'
const UNUSABLE_APPROVALS = ['call_7b31265ee4994084ad41ca97a6ae4a6d', 'call_7d9b3db53550499184fb6c002b86fcab', 'call_b2c40b1e97cb46eca57715621e133b4b', 'call_0dd2adeda1c64d6ab5994b0ae17d437b']
const roles = ['proposer', 'verifier'] as const
type Role = typeof roles[number]
type JsonObject = Record<string, unknown>
type ClientOptions = ConstructorParameters<typeof Anthropic>[0]
export type ProbeClientFactory = (options: ClientOptions) => { post(path: string, options: { body: JsonObject }): Promise<unknown> }
export type Wire = (url: string, init: RequestInit) => Promise<Response>
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const commit = z.string().regex(/^[a-f0-9]{40}$/)
const positive = z.number().int().positive().safe()
const filePin = z.strictObject({ sha256: hash, bytes: positive, bodySha256: hash, bodyBytes: positive })
const names = roles.flatMap(role => ['tool-schema', 'synthetic-count-request', 'synthetic-messages-request'].map(suffix => `${role}.${suffix}.json`))
const manifestSchema = z.strictObject({
  version: z.literal(1), candidateCommit: z.literal('31c45e2331f2997be55fa8e261682d1368cc40df'),
  candidateTree: z.literal('b1962d52b99b4c4dec309caaa4c3d17aa59c5a3c'), syntheticOnly: z.literal(true),
  models: z.strictObject({ proposer: z.literal('claude-sonnet-4-6'), verifier: z.literal('claude-opus-4-6') }),
  outputTokens: z.literal(128), contextLimit: z.literal(200000), requestByteLimit: z.literal(655360),
  responseByteLimit: z.literal(131072), timeoutMs: z.literal(120000), maxRetries: z.literal(0),
  files: z.record(z.string(), filePin),
}).refine(value => Object.keys(value.files).sort().join() === [...names].sort().join(), 'closed fixture list')
type Manifest = z.infer<typeof manifestSchema>
export type Loaded = { manifest: Manifest; data: ReadonlyMap<string, JsonObject> }
const object = (value: unknown): JsonObject => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ProbeError('OBJECT_REQUIRED')
  return value as JsonObject // JSON boundary, members remain unknown.
}
const canonical = (value: unknown) => JSON.stringify(value)
class ProbeError extends Error {}
function requireThat(condition: unknown, code: string): asserts condition { if (!condition) throw new ProbeError(code) }

export function loadFixtures(root: string): Loaded {
  const raw = readFileSync(join(root, FIXTURES, 'manifest.json'))
  requireThat(sha(raw) === MANIFEST_SHA, 'MANIFEST_PIN')
  const manifest = manifestSchema.parse(JSON.parse(raw.toString()))
  const data = new Map<string, JsonObject>()
  for (const name of names) {
    const bytes = readFileSync(join(root, FIXTURES, name)); const pin = manifest.files[name]
    requireThat(bytes.length === pin.bytes && sha(bytes) === pin.sha256, 'FIXTURE_FILE_PIN')
    const parsed = object(JSON.parse(bytes.toString())); const body = canonical(parsed)
    requireThat(Buffer.byteLength(body) === pin.bodyBytes && sha(body) === pin.bodySha256, 'FIXTURE_BODY_PIN')
    requireThat(Buffer.byteLength(body) <= manifest.requestByteLimit, 'REQUEST_BYTE_LIMIT')
    data.set(name, parsed)
  }
  for (const role of roles) {
    const count = fixture(data, role, 'count'); const messages = fixture(data, role, 'messages')
    requireThat(messages.model === manifest.models[role] && messages.max_tokens === 128, 'MODEL_OR_RESERVE')
    const withoutReserve = Object.fromEntries(Object.entries(messages).filter(([key]) => key !== 'max_tokens'))
    requireThat(canonical(withoutReserve) === canonical(count), 'COUNT_REQUEST_DRIFT')
    const tools = messages.tools; const choice = object(messages.tool_choice)
    requireThat(Array.isArray(tools) && tools.length === 1, 'ONE_TOOL')
    const tool = object(tools[0])
    requireThat(tool.name === 'review_actions' && tool.strict === true && choice.type === 'tool' && choice.name === 'review_actions', 'STRICT_FORCED_TOOL')
    requireThat(canonical(tool.input_schema) === canonical(data.get(`${role}.tool-schema.json`)), 'SCHEMA_PIN')
  }
  return { manifest, data }
}
function fixture(data: ReadonlyMap<string, JsonObject>, role: Role, kind: 'count' | 'messages'): JsonObject {
  const value = data.get(`${role}.synthetic-${kind}-request.json`); requireThat(value, 'MISSING_FIXTURE'); return value
}

const contextSchema = z.strictObject({
  repository: z.literal('ojfbot/daily-logger'), actor: z.literal('ojfbot'), event: z.literal('workflow_dispatch'),
  ref: z.literal('refs/heads/main'), defaultBranch: z.literal('main'), capabilitySha: commit, actualSha: commit, workflowSha: commit,
  workflowRef: z.literal('ojfbot/daily-logger/.github/workflows/action-schema-probe.yml@refs/heads/main'),
  manifestSha: z.literal(MANIFEST_SHA), runId: z.string().regex(/^[1-9][0-9]{0,19}$/), runAttempt: z.literal('1'),
  probeId: z.string().uuid(), approvalReceipt: z.string().regex(/^call_[A-Za-z0-9]+$/),
}).refine(value => value.actualSha === value.capabilitySha && value.workflowSha === value.capabilitySha, 'trusted source identity')
export type ProbeContext = z.infer<typeof contextSchema>
export function parseContext(value: unknown): ProbeContext {
  const context = contextSchema.parse(value)
  // The sole coordinator must authenticate fresh human approval externally; call_* is only its bound reference.
  requireThat(!UNUSABLE_APPROVALS.includes(context.approvalReceipt), 'PRIOR_APPROVAL_IS_NOT_EXECUTION_AUTHORITY')
  return context
}
function envContext(env: NodeJS.ProcessEnv): ProbeContext {
  return parseContext({ repository: env.GITHUB_REPOSITORY, actor: env.GITHUB_ACTOR, event: env.GITHUB_EVENT_NAME,
    ref: env.GITHUB_REF, defaultBranch: env.PROBE_DEFAULT_BRANCH, capabilitySha: env.PROBE_CAPABILITY_SHA,
    actualSha: env.GITHUB_SHA, workflowSha: env.GITHUB_WORKFLOW_SHA, workflowRef: env.GITHUB_WORKFLOW_REF,
    manifestSha: env.PROBE_MANIFEST_SHA, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    probeId: env.PROBE_ID, approvalReceipt: env.PROBE_APPROVAL_RECEIPT })
}
export function assertSafeEnvironment(env: NodeJS.ProcessEnv, secretless: boolean): void {
  requireThat(env.DEBUG === undefined || env.DEBUG === '', 'DEBUG_DENIED')
  for (const key of ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'GH_PAT', 'GH_TOKEN', 'GITHUB_TOKEN']) requireThat(!env[key], 'ALTERNATE_CREDENTIAL_OR_ROUTE_DENIED')
  if (secretless) requireThat(!env.ANTHROPIC_API_KEY, 'PREFLIGHT_MUST_HAVE_NO_KEY')
}
function sourcePins(root: string, context: ProbeContext): Record<string, string> {
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  requireThat(git(['rev-parse', 'HEAD']).trim() === context.capabilitySha, 'CHECKOUT_SHA')
  const pins: Record<string, string> = {}
  for (const path of [WORKFLOW, DRIVER, 'package.json', 'pnpm-lock.yaml', `${FIXTURES}/manifest.json`, ...names.map(name => `${FIXTURES}/${name}`)]) {
    const bytes = readFileSync(join(root, path))
    requireThat(sha(bytes) === sha(git(['show', `${context.capabilitySha}:${path}`])), 'SOURCE_BLOB_DRIFT')
    pins[path] = sha(bytes)
  }
  return pins
}
export function exclusiveJson(path: string, value: unknown): void {
  const fd = openSync(path, 'wx', 0o600)
  try { writeFileSync(fd, `${JSON.stringify(value)}\n`); fsyncSync(fd) } finally { closeSync(fd) }
  const dir = openSync(resolve(path, '..'), 'r'); try { fsyncSync(dir) } finally { closeSync(dir) }
}
const preparedSchema = z.strictObject({ version: z.literal(1), context: contextSchema, sourcePins: z.record(z.string(), hash), status: z.literal('reserved_not_executed') })
export function prepare(root: string, directory: string, context: ProbeContext): void {
  loadFixtures(root); const pins = sourcePins(root, context)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  exclusiveJson(join(directory, 'reservation.json'), { version: 1, context, sourcePins: pins, status: 'reserved_not_executed' })
}
export function consume(root: string, directory: string, context: ProbeContext): void {
  const prepared = preparedSchema.parse(JSON.parse(readFileSync(join(directory, 'reservation.json'), 'utf8')))
  requireThat(canonical(prepared.context) === canonical(context), 'RESERVATION_CONTEXT_DRIFT')
  requireThat(canonical(prepared.sourcePins) === canonical(sourcePins(root, context)), 'RESERVATION_SOURCE_DRIFT')
  exclusiveJson(join(directory, 'consumed.json'), { version: 1, context, permissionConsumed: true })
}

const safeId = (value: unknown, secret: string): string | null => typeof value === 'string' && /^req_[A-Za-z0-9]{1,96}$/.test(value) && (!secret || !value.includes(secret)) ? value : null
const tokens = (value: unknown): number => { requireThat(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, 'INVALID_TOKEN_COUNT'); return value }
export function assertEmptyOutput(value: unknown): void {
  const output = object(value); const expected = ['changes', 'suggestions', 'candidateDispositions', 'closingOptions']
  requireThat(Object.keys(output).sort().join() === expected.sort().join() && Object.values(output).every(item => Array.isArray(item) && item.length === 0), 'NONEMPTY_OR_INVALID_SYNTHETIC_OUTPUT')
}
const providerErrorType = z.enum(['invalid_request_error', 'authentication_error', 'billing_error', 'permission_error', 'not_found_error', 'conflict_error', 'request_too_large', 'rate_limit_error', 'api_error', 'timeout_error', 'overloaded_error'])
const providerErrorEnvelope = z.object({ type: z.literal('error'), error: z.object({ type: providerErrorType, message: z.string() }) })
type ProviderErrorDiagnostic =
  | { providerErrorType: 'invalid_request_error'; providerErrorReason: 'schema_complexity' | 'schema_feature_unsupported' | 'unclassified' }
  | { providerErrorType: Exclude<z.infer<typeof providerErrorType>, 'invalid_request_error'> | 'unknown'; providerErrorReason: 'unclassified' }
const unknownDiagnostic = { providerErrorType: 'unknown', providerErrorReason: 'unclassified' } satisfies ProviderErrorDiagnostic
function classifyProviderError(value: unknown): ProviderErrorDiagnostic {
  const parsed = providerErrorEnvelope.safeParse(value)
  if (!parsed.success) return unknownDiagnostic
  const { type, message } = parsed.data.error
  if (type !== 'invalid_request_error') return { providerErrorType: type, providerErrorReason: 'unclassified' }
  const normalized = message.trim().toLowerCase()
  if (normalized === 'schema is too complex for compilation.'
    || normalized === 'the compiled grammar is too large, which would cause performance issues. simplify your tool schemas or reduce the number of strict tools.') {
    return { providerErrorType: type, providerErrorReason: 'schema_complexity' }
  }
  const unsupported = /^(?:tools\.\d{1,4}\.(?:custom|input_schema):\s*)?schema type '[a-z0-9_$-]{1,64}' is not supported\.?$/.test(normalized)
  return { providerErrorType: type, providerErrorReason: unsupported ? 'schema_feature_unsupported' : 'unclassified' }
}
async function readProviderError(response: Response, signal: AbortSignal, byteLimit: number): Promise<ProviderErrorDiagnostic> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let onAbort: (() => void) | undefined
  try {
    if (signal.aborted || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) return unknownDiagnostic
    reader = response.body.getReader()
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new ProbeError('DIAGNOSTIC_ABORTED'))
      signal.addEventListener('abort', onAbort, { once: true })
    })
    if (signal.aborted) return unknownDiagnostic
    const chunks: Uint8Array[] = []; let size = 0
    for (;;) {
      const part = await Promise.race([reader.read(), aborted])
      if (part.done) break
      if (part.value.byteLength === 0) return unknownDiagnostic
      size += part.value.byteLength
      if (size > byteLimit) return unknownDiagnostic
      chunks.push(part.value)
    }
    return classifyProviderError(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))))
  } catch {
    return unknownDiagnostic
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
    // Diagnostic cleanup is best effort; it must never delay or replace the primary HTTP failure.
    try { void (reader ? reader.cancel() : response.body?.cancel())?.catch(() => undefined) } catch { /* No provider text escapes. */ }
  }
}
export type CallReceipt = { role: Role; endpoint: 'count' | 'messages'; canonicalBodySha256: string; wireSha256: string; wireBytes: number; status?: number; requestId?: string | null; failureCode?: string }
  & (ProviderErrorDiagnostic | { providerErrorType?: never; providerErrorReason?: never })
export type SafeResult = { version: 1; syntheticOnly: true; compilerAcceptance: Role[]; protocolSuccess: Role[]; calls: CallReceipt[]; counts: Partial<Record<Role, number>>; usage: Partial<Record<Role, { inputTokens: number; outputTokens: number }>>; errorCode?: string }
export function expectedSdkHeaders(secret: string, wireBytes: number): Record<string, string> {
  requireThat((process.platform === 'linux' || process.platform === 'darwin') && (process.arch === 'x64' || process.arch === 'arm64'), 'UNSUPPORTED_RUNNER_PLATFORM')
  return { accept: 'application/json', 'content-type': 'application/json', 'content-length': String(wireBytes),
    'x-api-key': secret, 'anthropic-version': '2023-06-01', 'user-agent': 'Anthropic/JS 0.36.3',
    'x-stainless-lang': 'js', 'x-stainless-package-version': '0.36.3', 'x-stainless-os': process.platform === 'linux' ? 'Linux' : 'MacOS',
    'x-stainless-arch': process.arch, 'x-stainless-runtime': 'node', 'x-stainless-runtime-version': process.version, 'x-stainless-retry-count': '0' }
}
export function createGuardedFetch(loaded: Loaded, wire: Wire, receipts: CallReceipt[], secret = ''): Fetch {
  let next = 0; let stopped = false
  return async (input, init) => {
    let currentReceipt: CallReceipt | undefined
    try {
      requireThat(!stopped, 'TRANSPORT_ALREADY_STOPPED')
      const url = typeof input === 'string' ? input : 'href' in input ? input.href : input.url
      const expectedRole = roles[Math.floor(next / 2)]; const kind = next % 2 === 0 ? 'count' : 'messages'
      const endpoint = kind === 'count' ? '/v1/messages/count_tokens' : '/v1/messages'
      requireThat(next < 4 && url === `${ORIGIN}${endpoint}` && init?.method === 'POST', 'TRANSPORT_ROUTE_OR_SEQUENCE')
      requireThat(typeof init.body === 'string' && init.signal, 'WIRE_BODY_OR_ABORT_SIGNAL')
      const expected = fixture(loaded.data, expectedRole, kind); const body = init.body
      requireThat(canonical(JSON.parse(body)) === canonical(expected), 'WIRE_FIXTURE_DRIFT')
      const wireBytes = Buffer.byteLength(body)
      requireThat(wireBytes <= loaded.manifest.requestByteLimit, 'WIRE_BYTE_LIMIT')
      const headers = new Headers(init.headers as HeadersInit)
      const expectedHeaders = expectedSdkHeaders(secret, wireBytes)
      requireThat([...headers.keys()].sort().join() === Object.keys(expectedHeaders).sort().join()
        && Object.entries(expectedHeaders).every(([name, value]) => headers.get(name) === value), 'WIRE_HEADERS_DENIED')
      const receipt: CallReceipt = { role: expectedRole, endpoint: kind, canonicalBodySha256: sha(canonical(expected)), wireSha256: sha(body), wireBytes }
      currentReceipt = receipt; next += 1; receipts.push(receipt) // Consume before transport, including exceptions/unknown outcomes.
      const response = await wire(url, { method: 'POST', headers, body, signal: init.signal as AbortSignal, redirect: 'error' })
      receipt.status = response.status; receipt.requestId = safeId(response.headers.get('request-id'), secret)
      if (response.redirected || response.status !== 200) {
        if (!response.redirected && response.status >= 400 && response.status <= 599) {
          Object.assign(receipt, await readProviderError(response, init.signal as AbortSignal, loaded.manifest.responseByteLimit))
        } else await response.body?.cancel().catch(() => undefined)
        requireThat(false, response.status === 400 ? 'PROVIDER_400' : 'PROVIDER_HTTP_FAILURE')
      }
      const chunks: Uint8Array[] = []; let size = 0
      requireThat(response.body, 'EMPTY_RESPONSE_BODY')
      const reader = response.body.getReader()
      try {
        for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; requireThat(size <= loaded.manifest.responseByteLimit, 'RESPONSE_BYTE_LIMIT'); chunks.push(part.value) }
      } finally { await reader.cancel().catch(() => undefined) }
      // SDK0.36 uses node-fetch response types; this explicit adapter returns only bounded JSON bytes.
      return new Response(Buffer.concat(chunks), { status: response.status, headers: { 'content-type': 'application/json', ...(receipt.requestId ? { 'request-id': receipt.requestId } : {}) } }) as unknown as Awaited<ReturnType<Fetch>>
    } catch (error) {
      stopped = true
      if (currentReceipt) currentReceipt.failureCode = error instanceof ProbeError ? error.message : 'TRANSPORT_FAILURE'
      throw error
    }
  }
}
export async function runProbe(loaded: Loaded, apiKey: string, factory: ProbeClientFactory, wire: Wire): Promise<SafeResult> {
  const result: SafeResult = { version: 1, syntheticOnly: true, compilerAcceptance: [], protocolSuccess: [], calls: [], counts: {}, usage: {} }
  try {
    const fetch = createGuardedFetch(loaded, wire, result.calls, apiKey)
    const client = factory({ apiKey, authToken: null, baseURL: ORIGIN, fetch, maxRetries: 0, timeout: loaded.manifest.timeoutMs })
    for (const role of roles) {
      const count = object(await client.post('/v1/messages/count_tokens', { body: fixture(loaded.data, role, 'count') }))
      const inputTokens = tokens(count.input_tokens); result.counts[role] = inputTokens
      requireThat(inputTokens + loaded.manifest.outputTokens <= loaded.manifest.contextLimit, 'TOKEN_ENVELOPE_HOLD')
      const message = object(await client.post('/v1/messages', { body: fixture(loaded.data, role, 'messages') }))
      const content = message.content
      requireThat(message.stop_reason === 'tool_use' && Array.isArray(content) && content.length === 1, 'PROTOCOL_STOP_OR_BLOCKS')
      const tool = object(content[0]); requireThat(tool.type === 'tool_use' && tool.name === 'review_actions', 'PROTOCOL_TOOL')
      assertEmptyOutput(tool.input)
      const usage = object(message.usage)
      result.usage[role] = { inputTokens: tokens(usage.input_tokens), outputTokens: tokens(usage.output_tokens) }
      requireThat(result.usage[role].outputTokens <= 128, 'OUTPUT_RESERVE_EXCEEDED')
      result.protocolSuccess.push(role)
    }
  } catch (error) {
    // Never serialize SDK error messages/objects, provider text, headers, credentials or env.
    result.errorCode = error instanceof ProbeError ? error.message : result.calls.at(-1)?.failureCode ?? 'PROBE_STOPPED'
  }
  result.compilerAcceptance = roles.filter(role => result.calls.some(call => call.role === role && call.endpoint === 'messages' && call.status === 200 && call.failureCode === undefined))
  return result
}
async function main(): Promise<void> {
  const mode = process.argv[2]; requireThat(process.argv.length === 3 && (mode === '--prepare' || mode === '--execute'), 'MODE_REQUIRED')
  assertSafeEnvironment(process.env, mode === '--prepare')
  const context = envContext(process.env); const root = process.cwd(); const loaded = loadFixtures(root)
  requireThat(process.env.RUNNER_TEMP && process.env.GITHUB_ACTIONS === 'true', 'HOSTED_RUNNER_REQUIRED')
  const directory = join(process.env.RUNNER_TEMP, 'action-schema-probe', `${context.runId}-${context.probeId}`)
  if (mode === '--prepare') { prepare(root, directory, context); console.log('PROBE_RESERVED_NOT_EXECUTED'); return }
  consume(root, directory, context) // Durable barrier precedes reading key or constructing SDK.
  const apiKey = process.env.ANTHROPIC_API_KEY; requireThat(apiKey && apiKey.length >= 12, 'MISSING_PROVIDER_KEY')
  const { default: SDK } = await import('@anthropic-ai/sdk')
  const result = await runProbe(loaded, apiKey, options => {
    const client = new SDK(options); return { post: (path, request) => client.post<JsonObject, unknown>(path, request) }
  }, (url, init) => globalThis.fetch(url, init))
  const safe = { ...result, context, manifestSha256: MANIFEST_SHA }
  const output = `${JSON.stringify(safe, null, 2)}\n`; requireThat(Buffer.byteLength(output) <= 32768, 'SAFE_ARTIFACT_LIMIT')
  mkdirSync('probe-safe', { mode: 0o700 }); exclusiveJson(join(root, 'probe-safe', 'summary.json'), safe)
  console.log(result.errorCode ? 'PROBE_STOPPED_SEE_SAFE_SUMMARY' : 'SYNTHETIC_SCHEMA_AND_PROTOCOL_PASS')
  if (result.errorCode) process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('PROBE_GUARD_OR_EXECUTION_STOPPED'); process.exitCode = 1 })
}

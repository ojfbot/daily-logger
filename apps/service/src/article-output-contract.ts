import { Ajv } from 'ajv'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { ARTICLE_PROMPT_VERSION, ARTICLE_TOOL_V2, articleSystemPrompt } from '@ojfbot/daily-logger-journal/article-prompts'
import { ArticleDataSchema, type ArticleDataV2 } from '@ojfbot/daily-logger-journal/article-schema'

export const SERVICE_DRAFT_SCHEMA = 'dailylogger-service-draft-v1' as const
export const SERVICE_DRAFT_REQUEST = 'dailylogger-service-draft-request-v1' as const
// Snapshot the compatibility data once. Returned tools cannot mutate this private template.
const template = structuredClone(ARTICLE_TOOL_V2)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
})
const descriptor = z.string().min(1).max(160)
const requestInput = z.strictObject({ reportDate: date, provider: descriptor, model: descriptor,
  hasTelemetry: z.boolean(), userPrompt: z.string(), maxOutputTokens: z.number().int().min(1).max(100_000) })
type RequestInput = z.infer<typeof requestInput>
type Schema = Record<string, unknown>
const object = (value: unknown): value is Schema => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Close declared objects, preserving the intentional string-valued code-reference metadata map. */
function closeObjects(schema: Schema): void {
  if (schema.type === 'object' && object(schema.properties)) schema.additionalProperties = false
  for (const value of Object.values(schema)) {
    if (object(value)) closeObjects(value)
    else if (Array.isArray(value)) for (const item of value) if (object(item)) closeObjects(item)
  }
}

export function serviceDraftTool(reportDate: string) {
  if (!date.safeParse(reportDate).success) throw new Error('Invalid service draft date')
  const schema: Schema = structuredClone(template.input_schema)
  const properties = schema.properties as Schema
  properties.date = { type: 'string', const: reportDate, description: 'Exact reporting date supplied by the application.' }
  properties.schemaVersion = { type: 'integer', const: 2 }
  const telemetry = properties.skillTelemetry as Schema
  telemetry.required = Object.keys(telemetry.properties as Schema)
  const candidates = properties.suggestedActions as Schema
  const candidateProperties = (candidates.items as Schema).properties as Schema
  candidateProperties.sourceDate = { type: 'string', const: reportDate }
  // Every ordinary authored field is explicit; telemetry is the only optional top-level section.
  schema.required = Object.keys(properties).filter(key => key !== 'skillTelemetry')
  closeObjects(schema)
  return { name: 'write_article', description: 'Return one complete draft; candidate ideas are not admitted actions.', input_schema: schema }
}

/** Normalized application request. Its recording proves intent/bytes, never a provider invocation. */
export function serviceDraftRequest(input: RequestInput) {
  const result = requestInput.safeParse(input)
  if (!result.success) throw new Error('Invalid service draft request')
  const value = result.data
  const tool = serviceDraftTool(value.reportDate)
  return { schemaVersion: SERVICE_DRAFT_REQUEST, ...value, promptVersion: ARTICLE_PROMPT_VERSION,
    outputSchemaVersion: SERVICE_DRAFT_SCHEMA, systemPrompt: articleSystemPrompt(value.hasTelemetry),
    tools: [tool], toolChoice: { type: 'tool', name: tool.name } }
}

/** Checks the whole selected request, including the actual tool and system prompt, without normalizing it. */
export function matchesServiceDraftRequest(value: unknown, expected: {
  reportDate: string; provider: string | null; model: string | null; promptVersion: string | null
}): boolean {
  if (!object(value)) return false
  const input = requestInput.safeParse({ reportDate: value.reportDate, provider: value.provider, model: value.model,
    hasTelemetry: value.hasTelemetry, userPrompt: value.userPrompt, maxOutputTokens: value.maxOutputTokens })
  if (!input.success || expected.reportDate !== input.data.reportDate || expected.provider !== input.data.provider
    || expected.model !== input.data.model || expected.promptVersion !== ARTICLE_PROMPT_VERSION) return false
  return isDeepStrictEqual(value, serviceDraftRequest(input.data))
}

export type ServiceDraftArticle = Omit<ArticleDataV2, 'status' | 'outcome' | 'closedActions'>

/** Validate original fields with the supplied tool contract, then check shared-reader compatibility. */
export function validateServiceDraftPayload(value: unknown, reportDate: string): ServiceDraftArticle | null {
  // Ajv retains generated code even after removeSchema; keep the whole compiler short-lived.
  const validator = new Ajv({ strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false })
  const schema = serviceDraftTool(reportDate).input_schema
  const validate = validator.compile(schema)
  if (!validate(value) || !ArticleDataSchema.safeParse(value).success) return null
  // Do not return Zod's normalized view (which may insert service-owned defaults).
  return structuredClone(value) as ServiceDraftArticle
}

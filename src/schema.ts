/**
 * Zod schemas for article data (v2) and validation utilities.
 *
 * v1 = StructuredArticle (prose blobs, flat string[] tags)
 * v2 = ArticleDataV2 (typed tags, structured shipments/decisions/actions)
 *
 * The validation ladder ensures the overnight pipeline never crashes:
 * try v2 → fall back to v1 → produce stub article.
 */

import { z } from 'zod'

// ─── Tag types ───────────────────────────────────────────────────────────────

export const TAG_TYPES = ['repo', 'arch', 'practice', 'phase', 'activity', 'concept', 'infra'] as const

export const TypedTagSchema = z.object({
  name: z.string(),
  type: z.enum(TAG_TYPES),
})

// ─── Structured entries ──────────────────────────────────────────────────────

export const ShipmentEntrySchema = z.object({
  repo: z.string(),
  description: z.string(),
  commits: z.array(z.string()),
  prs: z.array(z.string()).optional(),
})

export const PILLAR_VALUES = [
  'assistant-centric',
  'tooling-for-iteration',
  'model-behavior-as-design',
  'security-as-emergent-ux',
] as const

export const DecisionEntrySchema = z.object({
  title: z.string(),
  summary: z.string(),
  repo: z.string(),
  pillar: z.enum(PILLAR_VALUES).optional(),
  relatedTags: z.array(z.string()),
})

export const ActionItemSchema = z.object({
  command: z.string(),
  description: z.string(),
  repo: z.string(),
  status: z.literal('open'),
  sourceDate: z.string(),
})

export const ACTIVITY_TYPES = ['build', 'rest', 'audit', 'hardening', 'cleanup', 'sprint'] as const

// ─── Full article schema (v2) ────────────────────────────────────────────────

export const ArticleDataSchema = z.object({
  schemaVersion: z.literal(2),
  date: z.string(),
  title: z.string(),
  summary: z.string(),
  lede: z.string().optional(),

  tags: z.array(TypedTagSchema),

  whatShipped: z.array(ShipmentEntrySchema),
  decisions: z.array(DecisionEntrySchema),
  roadmapPulse: z.string().optional(),
  whatsNext: z.string().optional(),

  suggestedActions: z.array(ActionItemSchema),

  commitCount: z.number(),
  reposActive: z.array(z.string()),
  activityType: z.enum(ACTIVITY_TYPES),
})

// ─── v1 schema (for fallback detection) ──────────────────────────────────────

export const StructuredArticleSchema = z.object({
  title: z.string(),
  tags: z.array(z.string()),
  summary: z.string(),
  lede: z.string().optional(),
  whatShipped: z.string(),
  theDecisions: z.string(),
  roadmapPulse: z.string(),
  whatsNext: z.string(),
  actions: z.object({
    whatShipped: z.array(z.string()).optional(),
    theDecisions: z.array(z.string()).optional(),
    roadmapPulse: z.array(z.string()).optional(),
    whatsNext: z.array(z.string()).optional(),
  }).optional(),
})

// ─── Inferred types ──────────────────────────────────────────────────────────

export type TypedTag = z.infer<typeof TypedTagSchema>
export type ShipmentEntry = z.infer<typeof ShipmentEntrySchema>
export type DecisionEntry = z.infer<typeof DecisionEntrySchema>
export type ActionItem = z.infer<typeof ActionItemSchema>
export type ArticleDataV2 = z.infer<typeof ArticleDataSchema>
export type ActivityType = z.infer<typeof ArticleDataSchema>['activityType']

// ─── Stub article (last-resort fallback) ─────────────────────────────────────

export interface StubArticle {
  title: string
  date: string
  summary: string
  rawContext: string
}

// ─── Validation result ───────────────────────────────────────────────────────

export type ValidationResult =
  | { version: 2; data: ArticleDataV2 }
  | { version: 1; data: z.infer<typeof StructuredArticleSchema> }
  | { version: 'stub'; data: StubArticle }

/**
 * Validates raw LLM output against v2 schema, falling back to v1, then stub.
 *
 * The retry-with-error step is NOT here — it belongs in generateArticle()
 * where we have access to the Claude client. This function is pure validation.
 */
export function validateArticleOutput(
  raw: unknown,
  date: string,
  rawContextSnippet?: string,
): ValidationResult {
  // Attempt 1: full v2 schema
  const v2 = ArticleDataSchema.safeParse(raw)
  if (v2.success) {
    return { version: 2, data: v2.data }
  }

  // Attempt 2: v1 schema (backward compat)
  const v1 = StructuredArticleSchema.safeParse(raw)
  if (v1.success) {
    return { version: 1, data: v1.data }
  }

  // Attempt 3: salvage — try to extract whatever fields are valid from raw
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    const title = typeof r.title === 'string' ? r.title : `Generation partially failed — ${date}`
    const summary = typeof r.summary === 'string' ? r.summary : `Article generation for ${date} produced invalid structured data.`

    // Check if we have enough v2 fields to salvage
    const partialV2 = ArticleDataSchema.safeParse({
      schemaVersion: 2,
      date,
      title,
      summary,
      tags: Array.isArray(r.tags) ? r.tags : [],
      whatShipped: Array.isArray(r.whatShipped) ? r.whatShipped : [],
      decisions: Array.isArray(r.decisions) ? r.decisions : [],
      suggestedActions: Array.isArray(r.suggestedActions) ? r.suggestedActions : [],
      commitCount: typeof r.commitCount === 'number' ? r.commitCount : 0,
      reposActive: Array.isArray(r.reposActive) ? r.reposActive : [],
      activityType: typeof r.activityType === 'string' ? r.activityType : 'build',
      roadmapPulse: typeof r.roadmapPulse === 'string' ? r.roadmapPulse : undefined,
      whatsNext: typeof r.whatsNext === 'string' ? r.whatsNext : undefined,
      lede: typeof r.lede === 'string' ? r.lede : undefined,
    })

    if (partialV2.success) {
      return { version: 2, data: partialV2.data }
    }
  }

  // Last resort: stub
  return {
    version: 'stub',
    data: {
      title: `Generation failed — ${date}`,
      date,
      summary: `Article generation for ${date} produced invalid data. Raw context attached.`,
      rawContext: rawContextSnippet ?? JSON.stringify(raw, null, 2).slice(0, 2000),
    },
  }
}

/**
 * Returns the v2 validation error messages for use in retry prompts.
 */
export function getValidationErrors(raw: unknown): string {
  const result = ArticleDataSchema.safeParse(raw)
  if (result.success) return ''
  return result.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('\n')
}

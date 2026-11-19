/**
 * Zod schemas for article data (v2) and validation utilities.
 *
 * v1 = StructuredArticle (prose blobs, flat string[] tags)
 * v2 = ArticleDataV2 (typed tags, structured shipments/decisions/actions)
 *
 * The validation ladder ensures the overnight pipeline never crashes:
 * try v2 → fall back to v1 → produce stub article.
 */

import { createHash } from 'crypto'
import type { z } from 'zod'
import { ArticleDataSchema, StructuredArticleSchema, type ArticleDataV2 } from '@ojfbot/daily-logger-journal/article-schema'

export {
  ACTION_STATUSES, ActionItemSchema, TAG_TYPES, TypedTagSchema, ShipmentEntrySchema,
  PILLAR_VALUES, DecisionEntrySchema, ARTICLE_STATUSES, ARTICLE_OUTCOMES, ACTIVITY_TYPES,
  CODE_REFERENCE_TYPES, CodeReferenceSchema, ClosedActionSchema, ArticleDataSchema, StructuredArticleSchema,
  type ActionItem, type TypedTag, type ShipmentEntry, type DecisionEntry, type ClosedAction,
  type CodeReference, type CodeReferenceType, type ArticleDataV2, type ActivityType,
} from '@ojfbot/daily-logger-journal/article-schema'

/**
 * Generate a deterministic action ID from its fields.
 * Format: `act-{sourceDate}-{command}-{6-char hash of description}`
 * Used for matching closedActions to open actions without relying on
 * exact description text (which Claude may paraphrase).
 */
export function actionId(a: { command: string; sourceDate: string; description: string }): string {
  const hash = createHash('sha256')
    .update(a.description)
    .digest('hex')
    .slice(0, 6)
  return `act-${a.sourceDate}-${a.command.replace(/^\//, '')}-${hash}`
}

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
      // JSON.stringify(undefined) is undefined — the last-resort stub must never
      // itself throw (caught by golden task no-validation-gate/prompt-echo-…, S19)
      rawContext: rawContextSnippet ?? (JSON.stringify(raw, null, 2) ?? String(raw)).slice(0, 2000),
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

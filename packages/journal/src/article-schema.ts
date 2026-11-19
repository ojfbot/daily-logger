/** Existing article schemas: structural validation only, without legacy salvage or authority admission. */

import { z } from 'zod'
import { shipmentPrNumber } from './shipment-reference.js'
import { ActionItemSchema } from './action-item-schema.js'

export { ACTION_STATUSES, ActionItemSchema, type ActionItem } from './action-item-schema.js'

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
}).superRefine((entry, context) => {
  for (const [index, value] of (entry.prs ?? []).entries()) {
    if (!shipmentPrNumber(value, entry.repo)) context.addIssue({ code: 'custom', path: ['prs', index], message: 'Use #N, N, or a canonical same-repo GitHub PR URL' })
  }
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

export const ARTICLE_STATUSES = ['draft', 'accepted', 'rejected'] as const

// S18 (audit I2): the human editorial verdict on this agent-generated article — distinct from
// `status` (the publication lane). Stamped mechanically where humans touch the output:
// the editorial-accept path stamps 'accepted', the ADR-0038 revise path stamps 'edited'.
export const ARTICLE_OUTCOMES = ['accepted', 'edited', 'rejected', 'abandoned'] as const

export const ACTIVITY_TYPES = ['build', 'rest', 'audit', 'hardening', 'cleanup', 'sprint'] as const

// ─── Code references (ADR-0031) ─────────────────────────────────────────────

export const CODE_REFERENCE_TYPES = [
  'commit', 'component', 'file', 'package',
  'command', 'config', 'env', 'endpoint', 'directory',
] as const

export const CodeReferenceSchema = z.object({
  text: z.string(),
  type: z.enum(CODE_REFERENCE_TYPES),
  repo: z.string().optional(),
  path: z.string().optional(),
  url: z.string().optional(),
  meta: z.record(z.string(), z.string()).optional(),
})

// ─── Full article schema (v2) ────────────────────────────────────────────────

export const ClosedActionSchema = z.object({
  id: z.string().optional(),
  command: z.string(),
  description: z.string(),
  repo: z.string(),
  sourceDate: z.string(),
  resolution: z.string(),
})

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
  closedActions: z.array(ClosedActionSchema).optional(),

  commitCount: z.number(),
  reposActive: z.array(z.string()),
  activityType: z.enum(ACTIVITY_TYPES),

  codeReferences: z.array(CodeReferenceSchema).optional(),

  skillTelemetry: z.object({
    adoptionSummary: z.string(),
    qualityCoverage: z.number(),
    suggestionsGiven: z.number(),
    suggestionsFollowed: z.number(),
    prSkillReports: z.array(z.object({
      repo: z.string(),
      pr: z.number(),
      skills: z.array(z.string()),
    })),
    narrative: z.string(),
  }).optional(),

  status: z.enum(ARTICLE_STATUSES).default('draft').optional(),
  // S18 (audit I2): human outcome capture — see ARTICLE_OUTCOMES above. Never set by the LLM;
  // stamped by the accept/revise paths after a human touched the article.
  outcome: z.enum(ARTICLE_OUTCOMES).optional(),
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
export type ClosedAction = z.infer<typeof ClosedActionSchema>
export type CodeReference = z.infer<typeof CodeReferenceSchema>
export type CodeReferenceType = z.infer<typeof CodeReferenceSchema>['type']
export type ArticleDataV2 = z.infer<typeof ArticleDataSchema>
export type ActivityType = z.infer<typeof ArticleDataSchema>['activityType']


import type { BlogContext } from './types.js'
import { shouldSkipRun as journalShouldSkipRun, type SkipDecision } from '@ojfbot/daily-logger-journal/eligibility'

export type { SkipDecision } from '@ojfbot/daily-logger-journal/eligibility'

/** Preserve the existing CLI-facing context contract during extraction. */
export function shouldSkipRun(ctx: BlogContext): SkipDecision {
  return journalShouldSkipRun(ctx)
}

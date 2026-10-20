import { z } from 'zod'
import { canonicalInstant } from './time-reference-schema.js'
import { issueSources, type IssueSource, type TimeRecord } from './time-references.js'
import type { BlogContext } from './types.js'

const IssueSourceSchema = z.object({
  repo: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/),
  ref: z.string().regex(/^[1-9]\d*$/),
  url: z.string().url(),
}).strict().refine((source) => source.url === `https://github.com/${source.repo}/issues/${source.ref}`)

export const IssueTimeSchema = z.object({
  source: IssueSourceSchema,
  event: z.enum(['created', 'updated']),
  at: z.string().refine((value) => canonicalInstant(value) === value),
}).strict()
export type IssueTime = z.infer<typeof IssueTimeSchema>

export const IssueEventChoiceSchema = z.object({ source: IssueSourceSchema, event: z.enum(['created', 'updated']) }).strict()
export type IssueEventChoice = z.infer<typeof IssueEventChoiceSchema>

/** Freeze the collection-time choice: Created for newly created issues, Updated for ongoing ones. */
export function issueEventsFromContext(ctx: BlogContext, markdown: string, renderedHtml?: string): IssueEventChoice[] {
  const choices = new Map<string, IssueEventChoice['event']>()
  for (const issue of [...ctx.openIssues, ...ctx.closedIssues]) {
    const key = `${issue.repo.includes('/') ? issue.repo.toLowerCase() : `ojfbot/${issue.repo.toLowerCase()}`}#${issue.number}`
    const event = issue.createdInWindow || !issue.updatedAt ? 'created' : 'updated'
    const prior = choices.get(key)
    if (prior && prior !== event) throw new Error(`Conflicting issue event choice for ${key}`)
    choices.set(key, event)
  }
  return issueSources(markdown, renderedHtml).flatMap((source) => {
    const event = choices.get(issueTimeSourceKey(source))
    return event ? [IssueEventChoiceSchema.parse({ source, event })] : []
  })
}

/** One source-owned clock per linked issue; competing source facts yield no control. */
export function resolveIssueTimes(markdown: string, records: TimeRecord[], eventChoices: IssueEventChoice[] = [], renderedHtml?: string): IssueTime[] {
  const result: IssueTime[] = []
  const sources = issueSources(markdown, renderedHtml)
  const expected = new Set(sources.map(issueTimeSourceKey))
  const choices = new Map<string, IssueEventChoice['event']>()
  for (const raw of eventChoices) {
    const choice = IssueEventChoiceSchema.parse(raw)
    const key = issueTimeSourceKey(choice.source)
    if (!expected.has(key) || choices.has(key)) throw new Error(`Unexpected or duplicate issue event choice for ${key}`)
    choices.set(key, choice.event)
  }
  for (const source of sources) {
    const matching = records.filter((record) => record.evidence.kind === 'github-issue'
      && record.evidence.repo.toLowerCase() === source.repo.toLowerCase()
      && record.evidence.ref === source.ref)
    const created = new Set(matching.filter((record) => record.evidence.kind === 'github-issue' && record.evidence.event === 'created').map((record) => record.at))
    const updated = new Set(matching.filter((record) => record.evidence.kind === 'github-issue' && record.evidence.event === 'updated').map((record) => record.at))
    if (created.size > 1 || updated.size > 1) continue
    const createdAt = [...created][0], updatedAt = [...updated][0]
    if (createdAt && updatedAt && updatedAt < createdAt) continue
    const chosenEvent = choices.get(issueTimeSourceKey(source))
    const choice = chosenEvent === 'created' ? createdAt ? { event: 'created' as const, at: createdAt } : undefined
      : chosenEvent === 'updated' ? updatedAt ? { event: 'updated' as const, at: updatedAt } : undefined
      : updatedAt && updatedAt !== createdAt ? { event: 'updated' as const, at: updatedAt }
      : createdAt ? { event: 'created' as const, at: createdAt }
      : updatedAt ? { event: 'updated' as const, at: updatedAt } : undefined
    if (choice) result.push(IssueTimeSchema.parse({ source, ...choice }))
  }
  return result
}

export function issueTimeSourceKey(source: IssueSource): string { return `${source.repo.toLowerCase()}#${source.ref}` }

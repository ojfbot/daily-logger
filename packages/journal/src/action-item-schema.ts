import { z } from 'zod'

export const ACTION_STATUSES = ['open', 'done'] as const

export const ActionItemSchema = z.object({
  id: z.string().optional(),
  command: z.string(),
  description: z.string(),
  repo: z.string(),
  status: z.enum(ACTION_STATUSES),
  sourceDate: z.string(),
  closedDate: z.string().optional(),
  resolution: z.string().optional(),
})

export type ActionItem = z.infer<typeof ActionItemSchema>

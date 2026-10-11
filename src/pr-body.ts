export const MERGED_PR_BODY_CHARS = 6000
export const RECENT_PR_PREVIEW_CHARS = 400
export const PROMPT_PR_PREVIEW_CHARS = 200

/** Preserve the introduction and final outcomes under one bounded evidence policy. */
export function boundedMergedPRBody(body: string): string {
  if (body.length <= MERGED_PR_BODY_CHARS) return body
  const markerAllowance = 64
  const retained = MERGED_PR_BODY_CHARS - markerAllowance
  const tail = Math.floor(retained / 4)
  const omitted = body.length - retained
  return `${body.slice(0, retained - tail)}\n[...truncated ${omitted} chars from middle...]\n${body.slice(-tail)}`
}

export function quotedMergedPRBody(body: string): string {
  return `  > ${boundedMergedPRBody(body).replace(/\n/g, '\n  > ')}`
}

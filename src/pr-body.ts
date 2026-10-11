export const MERGED_PR_BODY_CHARS = 6000
// About four full 6k PR bodies. Coverage takes priority over full bodies when activity is high.
export const MERGED_PR_EVIDENCE_CHARS = 24000
export const RECENT_PR_PREVIEW_CHARS = 400
export const PROMPT_PR_PREVIEW_CHARS = 200

/** Preserve the introduction and final outcomes under one bounded evidence policy. */
export function boundedMergedPRBody(body: string, limit = MERGED_PR_BODY_CHARS): string {
  if (body.length <= limit) return body
  const markerAllowance = 64
  const retained = limit - markerAllowance
  const tail = Math.floor(retained / 4)
  const omitted = body.length - retained
  return `${body.slice(0, retained - tail)}\n[...truncated ${omitted} chars from middle...]\n${body.slice(-tail)}`
}

export function quotedMergedPRBody(body: string, limit = MERGED_PR_BODY_CHARS): string {
  return `  > ${boundedMergedPRBody(body, limit).replace(/\n/g, '\n  > ')}`
}

type MergedEvidenceSource = { repo: string; number: number; body?: string }

export function mergedEvidenceKey(pr: MergedEvidenceSource): string {
  return `${pr.repo}#${pr.number}`
}

/** Fair-share the rendered quote budget across unique bodies, returning unused space from short bodies. */
export function allocateMergedPREvidence(prs: MergedEvidenceSource[]): Map<string, string> {
  const unique = new Map<string, string>()
  for (const pr of prs) {
    const key = mergedEvidenceKey(pr)
    if (pr.body && !unique.has(key)) unique.set(key, pr.body)
  }

  const candidates = [...unique].map(([key, body]) => ({ key, body, fullLength: quotedMergedPRBody(body).length }))
  const byLength = [...candidates].sort((a, b) => a.fullLength - b.fullLength || a.key.localeCompare(b.key))
  const shares = new Map<string, number>()
  let remaining = MERGED_PR_EVIDENCE_CHARS
  for (let index = 0; index < byLength.length; index++) {
    const candidate = byLength[index]
    const share = Math.min(candidate.fullLength, Math.floor(remaining / (byLength.length - index)))
    shares.set(candidate.key, share)
    remaining -= share
  }

  const rendered = new Map<string, string>()
  for (const { key, body } of candidates) {
    const share = shares.get(key) ?? 0
    if (share === 0) {
      rendered.set(key, `  > [...omitted ${body.length} chars: merged evidence budget exhausted...]`)
      continue
    }
    if (quotedMergedPRBody(body).length <= share) {
      rendered.set(key, quotedMergedPRBody(body))
      continue
    }
    let low = 65
    let high = Math.min(body.length, MERGED_PR_BODY_CHARS)
    let best = ''
    while (low <= high) {
      const midpoint = Math.floor((low + high) / 2)
      const quote = quotedMergedPRBody(body, midpoint)
      if (quote.length <= share) {
        best = quote
        low = midpoint + 1
      } else {
        high = midpoint - 1
      }
    }
    rendered.set(key, best || `  > [...omitted ${body.length} chars: merged evidence budget exhausted...]`)
  }
  return rendered
}

/**
 * Deterministic fact-checker (TD-001, audit slice I5).
 *
 * Extracts concrete, checkable claims from a generated article body — file
 * paths, PR references, commit SHAs — and verifies each appears in the raw
 * collected context that the drafter was given. Anything the context cannot
 * corroborate is flagged, never blocked: this is a shadow-stage control
 * (record, don't gate). No LLM, no network, no filesystem.
 *
 * Conservative by design — a false alarm trains people to ignore the flag:
 * - file paths must be inline code, contain a directory separator, and end
 *   in an extension (bare filenames like `vite.config.ts` are skipped)
 * - commit SHAs must be inline code and pure hex, 7-40 chars
 * - PR refs must be #N or repo#N with N at least 3 digits total claim length ≥ 4
 * - claims shorter than 4 characters are skipped; results are deduped
 */

export interface VerifyClaimsResult {
  /** Claims found as substrings of the collected context, in order of first appearance. */
  verified: string[]
  /** Claims the context cannot corroborate, in order of first appearance. */
  unverified: string[]
}

/** Inline-code tokens: `like this` (single-line, non-empty). */
const INLINE_CODE_RE = /`([^`\n]+)`/g

/** PR references in prose or code: #123 or repo#123. */
const PR_REF_RE = /(?:\b[A-Za-z][\w.-]*)?#\d+/g

/** Pure hex, 7-40 chars — a commit SHA when it stands alone in inline code. */
const SHA_RE = /^[a-f0-9]{7,40}$/

/** A path with a directory component and a file extension, e.g. src/foo.ts. */
const FILE_PATH_RE = /^[\w@.~-]+(?:\/[\w@.-]+)+\.[A-Za-z0-9]+$/

function extractClaims(articleBody: string): string[] {
  const claims: string[] = []

  for (const match of articleBody.matchAll(INLINE_CODE_RE)) {
    const token = match[1].trim()
    if (token.length < 4) continue
    if (SHA_RE.test(token) || FILE_PATH_RE.test(token)) {
      claims.push(token)
    }
  }

  for (const match of articleBody.matchAll(PR_REF_RE)) {
    const token = match[0]
    if (token.length < 4) continue
    claims.push(token)
  }

  return [...new Set(claims)]
}

/**
 * Check every concrete claim in `articleBody` against the collected `context`.
 * A claim is verified when it appears as a literal substring of the context.
 */
export function verifyFileExistenceClaims(
  articleBody: string,
  context: string,
): VerifyClaimsResult {
  const verified: string[] = []
  const unverified: string[] = []

  for (const claim of extractClaims(articleBody)) {
    if (context.includes(claim)) {
      verified.push(claim)
    } else {
      unverified.push(claim)
    }
  }

  return { verified, unverified }
}

import type { BlogContext } from './types.js'
import { githubReferenceKinds as sharedGithubReferenceKinds } from '@ojfbot/daily-logger-journal/article-references'
export { githubReferenceKey, normalizeArticleResourceLinks, assertArticleReferenceContract, shipmentPrNumber } from '@ojfbot/daily-logger-journal/article-references'
export type { GithubResourceKind, GithubReferenceKinds } from '@ojfbot/daily-logger-journal/article-references'

/** Preserve the CLI's full collected-context signature. */
export function githubReferenceKinds(ctx: BlogContext) {
  return sharedGithubReferenceKinds(ctx)
}

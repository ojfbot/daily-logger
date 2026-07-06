/**
 * Outcome stamping — S18 (audit I2): record the human editorial verdict on an
 * agent-generated article as an `outcome` frontmatter field.
 *
 * The stamp is MECHANICAL, never LLM-written: the revise path (ADR-0038) calls
 * stampOutcome(..., 'edited') after a successful revision, and the accept workflow
 * invokes this file as a CLI to stamp 'accepted' on the accept/<date> branch.
 * Everything outside the one `outcome:` line is preserved byte-for-byte.
 *
 * CLI usage (from .github/workflows/editorial-revise.yml):
 *   ARTICLE_PATH=_articles/2026-07-06.md OUTCOME=accepted tsx src/stamp-outcome.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { ARTICLE_OUTCOMES } from './schema.js'

export type ArticleOutcome = (typeof ARTICLE_OUTCOMES)[number]

/**
 * Add or overwrite `outcome: <value>` in the article's YAML frontmatter.
 *
 * Placement: overwrites an existing `outcome:` line in place; otherwise inserts
 * directly after the `status:` line; otherwise appends at the end of the block.
 * Returns the markdown unchanged when no frontmatter block exists (nothing to
 * stamp — an article without frontmatter is already broken upstream).
 */
export function stampOutcome(markdown: string, outcome: ArticleOutcome): string {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return markdown

  let fm = match[1]
  if (/^outcome:.*$/m.test(fm)) {
    fm = fm.replace(/^outcome:.*$/m, `outcome: ${outcome}`)
  } else if (/^status:.*$/m.test(fm)) {
    fm = fm.replace(/^(status:.*)$/m, `$1\noutcome: ${outcome}`)
  } else {
    fm = `${fm}\noutcome: ${outcome}`
  }

  // match[0] is exactly `---\n<fm>\n---`; everything after it is untouched.
  return `---\n${fm}\n---${markdown.slice(match[0].length)}`
}

function main() {
  const articlePath = process.env.ARTICLE_PATH?.trim()
  const outcome = process.env.OUTCOME?.trim() as ArticleOutcome | undefined

  if (!articlePath || !existsSync(articlePath)) {
    console.error(`❌ ARTICLE_PATH missing or not found: ${articlePath}`)
    process.exit(1)
  }
  if (!outcome || !ARTICLE_OUTCOMES.includes(outcome)) {
    console.error(`❌ OUTCOME must be one of ${ARTICLE_OUTCOMES.join('|')} (got: ${outcome})`)
    process.exit(1)
  }

  const original = readFileSync(articlePath, 'utf-8')
  const stamped = stampOutcome(original, outcome)
  if (stamped === original) {
    console.error(`ℹ️ outcome already ${outcome} (or no frontmatter) — nothing written`)
    return
  }
  writeFileSync(articlePath, stamped, 'utf-8')
  console.error(`✓ stamped outcome: ${outcome} on ${articlePath}`)
}

// Run only when invoked directly (tsx src/stamp-outcome.ts), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}

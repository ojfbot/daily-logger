/**
 * Shared helpers for the golden eval suite (audit S19 / I4).
 *
 * Design rules (see evals/README.md):
 * - deterministic assertions only — no LLM-as-judge (S20 does not exist yet)
 * - every task cites its `failure:` cluster + real evidence in the file header
 * - stochastic paths run `trialCount()` trials (≥3) so a flaky pass cannot
 *   masquerade as a stable one
 */

import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/** Repo root (evals/ lives directly under it). */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const articlesDir = path.join(repoRoot, '_articles')

/** All committed article filenames (YYYY-MM-DD.md), sorted ascending. */
export function listArticles(): string[] {
  return readdirSync(articlesDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
}

export function readArticle(name: string): string {
  return readFileSync(path.join(articlesDir, name), 'utf-8')
}

export interface Frontmatter {
  /** Raw scalar fields, quotes stripped (e.g. title, date, status, outcome). */
  fields: Record<string, string>
  /** Everything after the closing `---`. */
  body: string
}

/**
 * Minimal frontmatter parser for the article corpus — the repo has no YAML
 * dependency and the generator only ever writes `key: value` scalar lines
 * (tags are a JSON-ish inline array, kept verbatim as a string).
 * Returns null when the document has no leading frontmatter block.
 */
export function parseFrontmatter(markdown: string): Frontmatter | null {
  const m = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return null
  const fields: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (!kv) continue
    let value = kv[2].trim()
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1)
    }
    fields[kv[1]] = value
  }
  return { fields, body: m[2] }
}

/**
 * Trial count for stochastic-path tasks. Defaults to 3 (the I4 contract:
 * ≥3 trials wherever the exercised path is the real-call code path).
 * Override with EVAL_TRIALS.
 */
export function trialCount(): number {
  const n = Number.parseInt(process.env.EVAL_TRIALS ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : 3
}

/** 1-based trial indices, for it.each(). */
export function trialIndices(): number[] {
  return Array.from({ length: trialCount() }, (_, i) => i + 1)
}

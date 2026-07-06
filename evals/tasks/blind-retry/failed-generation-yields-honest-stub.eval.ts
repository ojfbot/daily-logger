/**
 * Golden task: failed-generation-yields-honest-stub
 * Cluster:  failure:blind-retry (failure-taxonomy v1, cluster 2)
 * Evidence: three consecutive identical generation failures 2026-07-03→05;
 *           origin/article/2026-07-04 decision — "if generation fails, the
 *           day's post names the failure, its probable cause, and the
 *           recovery path" (the honest-failure-stub policy), never a blind
 *           retry or published garbage.
 *
 * Guarantee pinned, END-TO-END through generateArticle(): when every LLM call
 * fails, the pipeline emits the structured failure stub — `generation-failed`
 * tag, failure-naming title, raw context fenced for diagnosis — instead of
 * throwing, hanging, or fabricating.
 *
 * Harness note: this exercises the REAL-CALL code path (not MOCK_LLM), kept
 * hermetic by pointing the SDK at an unroutable localhost endpoint. Because
 * it is the stochastic-path lane of the suite, it runs trialCount() (≥3)
 * trials per the I4 contract. No LLM judging anywhere (S20 not calibrated).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { generateArticle } from '../../../src/generate-article.js'
import { corruptedRegistryContext } from '../../fixtures/corrupted-adr-registry.js'
import { trialIndices } from '../../harness.js'

const savedEnv: Record<string, string | undefined> = {}
const ENV_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'MOCK_LLM'] as const

beforeAll(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  // Real-call path, offline: connection refused on every attempt.
  process.env.ANTHROPIC_API_KEY = 'sk-ant-eval-offline-replay'
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:1'
  delete process.env.MOCK_LLM
})

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

describe('failure:blind-retry — failed generation yields the honest stub, every trial', () => {
  it.each(trialIndices())(
    'trial %i: total API failure produces the structured failure stub',
    async () => {
      const article = await generateArticle(corruptedRegistryContext('2026-07-03'))

      // names the failure — never masquerades as a normal post
      expect(article.title).toBe('Generation failed — 2026-07-03')
      expect(article.tags).toContain('generation-failed')
      expect(article.summary).toContain('invalid data')

      // carries the diagnosis: raw context fenced, corruption visible
      expect(article.body).toContain('```')
      expect(article.body).toContain('0004-narrow-su')
    },
    60_000,
  )
})

import { describe, expect, it } from 'vitest'
import { detachArticleTime, preserveTimeDuringRevision } from '../article-time-frontmatter.js'

describe('time authority is outside editorial model input and output', () => {
  it.each(['\n', '\r\n'])('strips and restores the original pointer for line ending %j', async (eol) => {
    const original = ['---', 'title: "Original"', 'date: 2026-10-18', `time_records_sha256: ${'a'.repeat(64)}`, '---', 'Body.', ''].join(eol)
    const detached = detachArticleTime(original)
    expect(detached.markdown).not.toContain('time_records_sha256')
    expect(detached.restore(detached.markdown)).toBe(original)
    const result = await preserveTimeDuringRevision({ originalMarkdown: original, revise: async (modelMarkdown) => ({
      revisedMarkdown: modelMarkdown.replace(`---${eol}`, `---${eol}time_records_sha256: ${'f'.repeat(64)}${eol}`).replace('Body.', 'Body revised.'), changesSummary: ['Changed body.'], changed: true,
    }) })
    expect(result.revisedMarkdown).toContain(`time_records_sha256: ${'a'.repeat(64)}`)
    expect(result.revisedMarkdown).not.toContain('f'.repeat(64))
    expect(result.revisedMarkdown).toContain('Body revised.')
  })
  it.each([['\n', '\r\n'], ['\r\n', '\n']])('preserves pointer through model line-ending conversion %j to %j', async (originalEol, modelEol) => {
    const original = ['---', 'title: "Original"', 'date: 2026-10-18', `time_records_sha256: ${'a'.repeat(64)}`, '---', 'Body.', ''].join(originalEol)
    const result = await preserveTimeDuringRevision({ originalMarkdown: original, revise: async (modelMarkdown) => ({ revisedMarkdown: modelMarkdown.replace(/\r?\n/g, modelEol).replace('Body.', 'Edited.'), changesSummary: ['Edited body.'], changed: true }) })
    expect(result.revisedMarkdown.match(/time_records_sha256:/g)).toHaveLength(1)
    expect(result.revisedMarkdown).toContain('a'.repeat(64))
  })
})

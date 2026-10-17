const TIME_FIELD = /^(?:timeReferences|time_references|time_references_body_sha256|time_records_sha256):/

function header(markdown: string) {
  const match = /^---(\r?\n)([\s\S]*?)\r?\n---(?=\r?\n|$)/.exec(markdown)
  return match ? { raw: match[0], eol: match[1], lines: match[2].split(/\r?\n/), rest: markdown.slice(match[0].length) } : undefined
}

/** Keep recorded facts/pointers outside editorial model input and restore only the original declaration. */
export function detachArticleTime(markdown: string): { markdown: string; restore: (revisedMarkdown: string) => string } {
  const original = header(markdown)
  const fields = original?.lines.filter((line) => TIME_FIELD.test(line)) ?? []
  function withoutTimeFields(value: string): string {
    const parsed = header(value)
    if (!parsed || !parsed.lines.some((line) => TIME_FIELD.test(line))) return value
    return `---${parsed.eol}${parsed.lines.filter((line) => !TIME_FIELD.test(line)).join(parsed.eol)}${parsed.eol}---${parsed.rest}`
  }
  return {
    markdown: withoutTimeFields(markdown),
    restore(revisedMarkdown) {
      const clean = withoutTimeFields(revisedMarkdown)
      if (!fields.length) return clean
      const cleanHeader = header(clean)
      if (!cleanHeader) throw new Error('Cannot preserve recorded time metadata without article frontmatter')
      const detachedHeader = header(withoutTimeFields(markdown))
      if (original && cleanHeader.raw === detachedHeader?.raw) return original.raw + cleanHeader.rest
      return `---${cleanHeader.eol}${[...cleanHeader.lines, ...fields].join(cleanHeader.eol)}${cleanHeader.eol}---${cleanHeader.rest}`
    },
  }
}

export interface RevisionResult {
  revisedMarkdown: string
  changesSummary: string[]
  changed: boolean
}

export async function preserveTimeDuringRevision(input: {
  originalMarkdown: string
  revise: (modelMarkdown: string) => Promise<RevisionResult>
}): Promise<RevisionResult> {
  const detached = detachArticleTime(input.originalMarkdown)
  const result = await input.revise(detached.markdown)
  const revisedMarkdown = detached.restore(result.revisedMarkdown)
  return { ...result, revisedMarkdown, changed: revisedMarkdown.trim() !== input.originalMarkdown.trim() }
}

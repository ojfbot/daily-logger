type JsonRecord = Record<string, unknown>

export const ACTION_INDEX_ENCODING = {
  format: 'shape-groups-v1',
  rule: 'Each actions, held and rejectionMemory value is an array of groups. A group lists columns once. Each row starts with its original zero-based ordinal, followed by the value for each column in order. Restore rows by ordinal. Only listed columns are present; null remains null. Nested values are unchanged. Every original identity, history, gate, hold and field value is retained.',
} as const

export type PackedRows = Array<{ columns: string[]; rows: unknown[][] }>

export function packActionIndexRows(rows: readonly JsonRecord[]): PackedRows {
  const groups: PackedRows = []
  const byShape = new Map<string, PackedRows[number]>()
  rows.forEach((row, ordinal) => {
    const columns = Object.keys(row)
    const shape = JSON.stringify(columns)
    let group = byShape.get(shape)
    if (!group) {
      group = { columns, rows: [] }
      groups.push(group)
      byShape.set(shape, group)
    }
    group.rows.push([ordinal, ...columns.map(key => row[key])])
  })
  return groups
}

export function unpackActionIndexRows(groups: readonly { columns: readonly string[]; rows: readonly unknown[][] }[]): JsonRecord[] {
  const result: JsonRecord[] = []
  const seen = new Set<number>()
  for (const group of groups) for (const [ordinal, ...values] of group.rows) {
    if (!Number.isInteger(ordinal) || (ordinal as number) < 0 || seen.has(ordinal as number) || values.length !== group.columns.length) throw new Error('Invalid packed action-index row')
    seen.add(ordinal as number)
    result[ordinal as number] = Object.fromEntries(group.columns.map((key, index) => [key, values[index]]))
  }
  if (seen.size !== result.length) throw new Error('Non-contiguous packed action-index row order')
  return result
}

export function packActionIndex(index: Record<string, readonly JsonRecord[]>): Record<string, PackedRows> {
  return Object.fromEntries(Object.entries(index).map(([key, rows]) => [key, packActionIndexRows(rows)]))
}

export function unpackActionIndex(index: Record<string, PackedRows>): Record<string, JsonRecord[]> {
  return Object.fromEntries(Object.entries(index).map(([key, groups]) => [key, unpackActionIndexRows(groups)]))
}

export function serializeActionModelView(value: JsonRecord & { sources: Array<JsonRecord & { id: string; content: string }> }): string {
  const { sources, ...context } = value
  const bytes = (text: string) => Buffer.byteLength(text, 'utf8')
  const manifest = sources.map(({ content, ...source }, index) => ({ ...source, contentSection: index + 1, contentUtf8Bytes: bytes(content) }))
  return ['ACTION_REVIEW_CONTEXT_SOURCE_SECTIONS_V1', JSON.stringify({ ...context, sources: manifest }), ...sources.flatMap((source, index) => [
    `SOURCE_CONTENT ${index + 1} ${source.id} ${bytes(source.content)} UTF-8 BYTES`,
    source.content,
    `END_SOURCE_CONTENT ${index + 1} ${source.id}`,
  ])].join('\n\n')
}

export function parseActionModelView(value: string): JsonRecord & { sources: Array<JsonRecord & { id: string; content: string }> } {
  const data = Buffer.from(value, 'utf8')
  const delimiter = Buffer.from('\n\n')
  let cursor = 0
  const takeExact = (text: string) => {
    const expected = Buffer.from(text, 'utf8')
    if (!data.subarray(cursor, cursor + expected.length).equals(expected)) throw new Error('Invalid action model-view boundary')
    cursor += expected.length
  }
  takeExact('ACTION_REVIEW_CONTEXT_SOURCE_SECTIONS_V1\n\n')
  const metadataEnd = data.indexOf(delimiter, cursor)
  const parsed = JSON.parse(data.subarray(cursor, metadataEnd === -1 ? data.length : metadataEnd).toString('utf8')) as JsonRecord & { sources: Array<JsonRecord & { id: string; contentSection: number; contentUtf8Bytes: number }> }
  const { sources, ...context } = parsed
  cursor = metadataEnd === -1 ? data.length : metadataEnd + delimiter.length
  const restored = sources.map(({ contentSection, contentUtf8Bytes, ...source }, index) => {
    if (contentSection !== index + 1 || !Number.isInteger(contentUtf8Bytes) || contentUtf8Bytes < 0) throw new Error('Invalid action model-view source manifest')
    takeExact(`SOURCE_CONTENT ${index + 1} ${String(source.id)} ${contentUtf8Bytes} UTF-8 BYTES\n\n`)
    const contentBytes = data.subarray(cursor, cursor + contentUtf8Bytes)
    if (contentBytes.length !== contentUtf8Bytes) throw new Error('Truncated action model-view source content')
    cursor += contentUtf8Bytes
    const content = contentBytes.toString('utf8')
    if (Buffer.byteLength(content, 'utf8') !== contentUtf8Bytes) throw new Error('Invalid UTF-8 action model-view source content')
    takeExact(`\n\nEND_SOURCE_CONTENT ${index + 1} ${String(source.id)}`)
    if (index + 1 < sources.length) takeExact('\n\n')
    return { ...source, content }
  })
  if (cursor !== data.length) throw new Error('Trailing action model-view bytes')
  return { ...context, sources: restored }
}

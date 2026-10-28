/** A reversible disk representation for generated coverage, never for primary evidence. */
const columns = ['id', 'kind', 'locator', 'fullContentSha256', 'collectedContentSha256', 'bytes', 'lines', 'modelBytes', 'modelContentSha256', 'modelPolicySha256', 'required', 'included', 'reason'] as const
const header = ['version', 'unit', 'collection', 'selection', 'authority', 'requiredReferences', 'contextReferences', 'referenceRequirements', 'reviewActionKeys', 'preservedTerminalActionKeys', 'expandedActionKeys', 'resolvedRequests'] as const
const marker = 'coverage-storage-rows-v1'
const maxRows = 4096
const maxStoredBytes = 64 * 1024
const maxExpandedBytes = 128 * 1024
const encoder = new TextEncoder()
type RecordValue = Record<string, unknown>
const object = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value)
const equalKeys = (value: RecordValue, keys: readonly string[]) => JSON.stringify(Object.keys(value)) === JSON.stringify(keys)
const suffix = (id: unknown) => typeof id === 'string' ? /@([a-f0-9]{64})$/.exec(id)?.[1] : undefined

export function packCoverageForStorage(content: string): string | undefined {
  if (encoder.encode(content).length > maxExpandedBytes) return undefined
  let value: unknown
  try { value = JSON.parse(content) } catch { return undefined }
  if (!object(value) || !equalKeys(value, [...header, 'sources']) || typeof value.version !== 'string' || !value.version.startsWith('progressive-action-evidence-')
    || !Array.isArray(value.sources) || value.sources.length > maxRows || value.sources.some(row => !object(row) || !equalKeys(row, columns))) return undefined
  const rows = value.sources as RecordValue[]
  const reasons = [...new Set(rows.map(row => row.reason))]
  const kinds = [...new Set(rows.map(row => row.kind))]
  if (reasons.some(item => typeof item !== 'string') || kinds.some(item => typeof item !== 'string')) return undefined
  const policy = rows.length && rows.every(row => row.modelPolicySha256 === rows[0].modelPolicySha256) ? rows[0].modelPolicySha256 : null
  const packed = { encoding: marker, header: header.map(key => value[key]), reasons, kinds, policy, rows: rows.map(row => columns.map(key => {
    const item = row[key]
    if (key === 'reason') return reasons.indexOf(item)
    if (key === 'kind') return kinds.indexOf(item)
    if (key === 'modelPolicySha256' && item === policy) return null
    if (key === 'fullContentSha256' && item === suffix(row.id)) return null
    if (key === 'collectedContentSha256' && item === row.fullContentSha256) return null
    if (key === 'modelContentSha256' && item === row.collectedContentSha256) return null
    return item
  })) }
  const result = JSON.stringify(packed)
  return unpackCoverageFromStorage(result) === content ? result : undefined
}

export function unpackCoverageFromStorage(content: string): string | undefined {
  if (encoder.encode(content).length > maxStoredBytes) return undefined
  let packed: unknown
  try { packed = JSON.parse(content) } catch { return undefined }
  if (!object(packed) || !equalKeys(packed, ['encoding', 'header', 'reasons', 'kinds', 'policy', 'rows']) || packed.encoding !== marker
    || !Array.isArray(packed.header) || packed.header.length !== header.length || !Array.isArray(packed.reasons) || !Array.isArray(packed.kinds)
    || packed.reasons.some(item => typeof item !== 'string') || packed.kinds.some(item => typeof item !== 'string')
    || !Array.isArray(packed.rows) || packed.rows.length > maxRows || packed.rows.some(row => !Array.isArray(row) || row.length !== columns.length)
    || JSON.stringify(packed) !== content) return undefined
  const reasons = packed.reasons as string[], kinds = packed.kinds as string[], headerValues = packed.header as unknown[]
  const rows = packed.rows as unknown[][]
  const sources: RecordValue[] = []
  let expandedBytes = encoder.encode(JSON.stringify(headerValues)).length
  for (const values of rows) {
    const raw = Object.fromEntries(columns.map((key, index) => [key, values[index]]))
    const full = raw.fullContentSha256 === null ? suffix(raw.id) : raw.fullContentSha256
    const collected = raw.collectedContentSha256 === null ? full : raw.collectedContentSha256
    const source = Object.fromEntries(columns.map(key => [key,
      key === 'reason' ? reasons[raw.reason as number] :
      key === 'kind' ? kinds[raw.kind as number] :
      key === 'modelPolicySha256' && raw[key] === null ? packed.policy :
      key === 'fullContentSha256' ? full :
      key === 'collectedContentSha256' ? collected :
      key === 'modelContentSha256' && raw[key] === null ? collected : raw[key]]))
    if (Object.values(source).some(value => value === undefined)) return undefined
    expandedBytes += encoder.encode(JSON.stringify(source)).length
    if (expandedBytes > maxExpandedBytes) return undefined
    sources.push(source)
  }
  const value = { ...Object.fromEntries(header.map((key, index) => [key, headerValues[index]])), sources }
  const expanded = JSON.stringify(value)
  return encoder.encode(expanded).length <= maxExpandedBytes ? expanded : undefined
}

export const coverageStorageMarker = marker

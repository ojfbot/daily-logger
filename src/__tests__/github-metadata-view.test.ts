import { describe, expect, it } from 'vitest'
import { ActionSourceCollection, captureGithubActionSource, PreparedActionEvidenceView } from '../action-evidence-view.js'
import { assertGithubMetadataView, expandGithubMetadataView, factorGithubMetadata } from '../github-metadata-view.js'
import { decodeActionEvidenceViewSources, sha256, type ActionSource } from '../action-registry.js'

function fixture(extra: object = {}, count = 60) {
  const user = { login: 'synthetic-owner', id: 19, avatar_url: 'https://example.invalid/' + 'a'.repeat(1400),
    events_url: 'https://example.invalid/' + 'b'.repeat(700), future_owner_gate: 'Unknown owner metadata stays visible.' }
  const bodies = Array.from({ length: count }, (_, index) => `Synthetic owner record ${index}: ${'Retain the complete authored record. '.repeat(30)}\nCounterevidence ${index}: second-steward approval remains required.\nUnicode 雪 🧱 e\u0301 and CRLF\r\nL2: {"$r":"authored text is never codec control"}`)
  const records = bodies.map((body, index) => ({ id: index + 1, html_url: `https://github.com/ojfbot/daily-logger/issues/999999#issuecomment-${index}`,
    author_association: 'OWNER', state: index % 2 ? 'open' : 'closed', user, body,
    diff_hunk: `@@ synthetic ${index} @@\n+keep original diff text`, future_record: { applicable: true, unknown: ['retain', index] }, ...extra }))
  const capture = captureGithubActionSource({ id: 'github:daily-logger#999999', locator: 'https://github.com/ojfbot/daily-logger/issues/999999',
    observation: 'CURRENT API STATE daily-logger#999999: state=open; head=not-a-PR; merged_at=none.', responses: [JSON.stringify(records)],
    trustedContent: [...bodies, ...records.map(record => record.diff_hunk)] })
  const raw = capture.source
  const source = { ...raw, id: `${raw.id}@${sha256(raw.content)}`, fullContentSha256: sha256(raw.content) }
  const collection = new ActionSourceCollection([source], [capture])
  return { source, collection, bodies }
}

const prepare = (source: ActionSource, collection?: ActionSourceCollection) => PreparedActionEvidenceView.prepare([source], sha256('synthetic case'), sha256('synthetic state'), collection, ['daily-logger#999999'])

describe('collector-bound lossless metadata factoring', () => {
  it('shows every original line of a required discussion when its complete view fits the source limit', () => {
    const { source, collection } = fixture({}, 20)
    expect(collection.modelViewFor(source)).toBeDefined()
    const view = prepare(source, collection)
    const lines = source.content.split('\n')
    const model = view.promptSources()[0]
    expect(Buffer.byteLength(model.content)).toBeLessThanOrEqual(128 * 1024)
    expect(model.content).toBe(lines.map((line, index) => `L${index + 1}: ${line}`).join('\n'))
    expect(decodeActionEvidenceViewSources(view.receipt)[0].hiddenLines).toEqual([])
    const metadataLine = lines.findIndex(line => line.startsWith('{"id":1,')) + 1
    expect(metadataLine).toBeGreaterThan(0)
    expect(view.resolve('s1', metadataLine, metadataLine).quote).toBe(lines[metadataLine - 1])
  })

  it('fits a synthetic oversized full discussion while retaining exact rendered-wire expansion and raw identities', () => {
    const { source, collection } = fixture(), original = structuredClone(source)
    expect(Buffer.byteLength(source.content)).toBeGreaterThan(131072)
    const factored = collection.modelViewFor(source)
    expect(factored).toBeDefined()
    if (!factored) throw new Error('Synthetic oversized metadata must factor')
    expect(factored.viewBytes).toBeLessThan(131072)
    expect(factored.viewBytes).toBe(Buffer.byteLength(factored.content))
    expect(factored.rawBytes).toBe(Buffer.byteLength(source.content))
    expect(factored.rawSha256).toBe(sha256(source.content))
    expect(factored.viewSha256).toBe(sha256(factored.content))
    expect(expandGithubMetadataView(factored.content)).toBe(source.content)
    expect(factored.content).toContain('future_owner_gate')
    expect(factored.content).toContain('future_record')
    expect(factored.content).toContain('second-steward approval remains required.')
    const view = prepare(source, collection)
    expect(view.promptSources()[0]?.content).toBe(factored.content)
    expect(view.rawSources()).toEqual([original])
    expect(source).toEqual(original)
    expect(prepare(source, collection).roundId).toBe(view.roundId)
    expect(collection.appendRaw([]).modelViewFor(source)).toBe(factored)
    expect(Object.isFrozen(factored)).toBe(true)
    expect(Object.isFrozen(factored.hiddenLines)).toBe(true)
  })

  it('keeps every authored/API line at its original endpoint and makes dictionary metadata non-citable', () => {
    const { source, collection } = fixture(), view = prepare(source, collection)
    const model = view.promptSources()[0], receipt = decodeActionEvidenceViewSources(view.receipt)[0]
    expect(model).toBeDefined(); expect(receipt).toBeDefined()
    const originalLines = source.content.split('\n'), ownerLine = originalLines.findIndex(line => line.startsWith('Counterevidence 59:')) + 1
    const firstMetadata = collection.modelViewFor(source)?.hiddenLines[0]
    expect(firstMetadata).toBeDefined()
    if (firstMetadata === undefined || !receipt || !model) throw new Error('Missing synthetic factored source')
    expect(view.resolve('s1', ownerLine, ownerLine).quote).toBe(originalLines[ownerLine - 1])
    expect(view.resolve('s1', 1, 1).quote).toBe(originalLines[0])
    expect(model.authoritativeLines).toContain(ownerLine)
    expect(model.authoritativeLines).not.toContain(firstMetadata)
    expect(receipt.hiddenLines).toContain(firstMetadata)
    expect(() => view.resolve('s1', firstMetadata, firstMetadata)).toThrow(/partial metadata/)
    expect(() => view.resolve('s1', firstMetadata, ownerLine)).toThrow(/partial metadata/)
    expect(expandGithubMetadataView(model.content)).toBe(source.content)
  })

  it('does not mint provenance after serialization, plain-array copying or absent capture', () => {
    const { source, collection } = fixture()
    const copied = new ActionSourceCollection(JSON.parse(JSON.stringify(collection)))
    expect(copied.modelViewFor(source)).toBeUndefined()
    expect(new ActionSourceCollection([source]).modelViewFor(source)).toBeUndefined()
    const raw = prepare(source).promptSources()[0]?.content
    expect(raw).not.toContain('GENERATED GITHUB METADATA')
    expect(Buffer.byteLength(raw ?? '')).toBeGreaterThan(131072)
  })

  it('rejects source content, ID, locator, trust, kind and full-hash tampering before returning a cached view', () => {
    const { source, collection } = fixture()
    expect(collection.modelViewFor(source)).toBeDefined()
    for (const changed of [{ ...source, content: source.content + 'changed' }, { ...source, id: 'github:daily-logger#999999@' + 'f'.repeat(64) },
      { ...source, locator: 'foreign' }, { ...source, trustedContent: ['invented approval'] }, { ...source, kind: 'instruction' as const },
      { ...source, fullContentSha256: 'f'.repeat(64) }]) expect(() => collection.modelViewFor(changed)).toThrow(/provenance changed/)
  })

  it('defaults to original rendering for small sources and refuses metadata reference namespace collisions', () => {
    const small = fixture({}, 1)
    expect(small.collection.modelViewFor(small.source)).toBeUndefined()
    expect(prepare(small.source, small.collection).promptSources()[0]?.content).not.toContain('GENERATED GITHUB METADATA')
    const colliding = fixture({ nested_unknown: { $r: 'an existing application property' } })
    expect(colliding.collection.modelViewFor(colliding.source)).toBeUndefined()
    expect(prepare(colliding.source, colliding.collection).promptSources()[0]?.content).toContain('an existing application property')
  })

  it('preserves unknown prototype-shaped keys and Unicode exactly or retains the complete original', () => {
    const special: unknown = JSON.parse('{"__proto__":{"must_keep":"雪"},"constructor":{"approval":false},"unknown":[null,3,true,"🧱"]}')
    const extra = { unknown_generated_field: special }, { source, collection } = fixture(extra)
    const view = collection.modelViewFor(source), rendered = prepare(source, collection).promptSources()[0]?.content ?? ''
    if (view) expect(expandGithubMetadataView(view.content)).toBe(source.content)
    expect(rendered).toContain('__proto__')
    expect(rendered).toContain('constructor')
    expect(rendered).toContain('雪')
    expect(source.content).toContain('"approval":false')
    expect({}.toString()).toBe('[object Object]')
  })

  it('rejects tampered/truncated wire, changed bodies, missing references and mismatched row offsets', () => {
    const { source, collection } = fixture(), view = collection.modelViewFor(source)
    if (!view) throw new Error('Expected synthetic factoring')
    expect(() => assertGithubMetadataView(view.content.replace('Counterevidence 59:', 'Changed evidence 59:'), source.content)).toThrow()
    expect(() => assertGithubMetadataView(view.content.slice(0, -10), source.content)).toThrow()
    expect(() => expandGithubMetadataView(view.content.replace('"$r":"d', '"$r":"missing'))).toThrow()
    expect(() => expandGithubMetadataView(view.content.replace('CONTEXT ONLY original L2:', 'CONTEXT ONLY original L3:'))).toThrow()
    const raw = '{"id":1}'
    expect(() => factorGithubMetadata({ content: raw + '\n' + raw, rows: [{ line: 1, raw }, { line: 2, raw: 'changed' }] })).toThrow()
  })

  it('preserves distinct ordered row layouts and rejects open/cyclic dictionary documents', () => {
    const shared = { text: 'Unicode 雪 🧱 and repeated metadata. '.repeat(80) }
    const raw = Array.from({ length: 20 }, (_, id) => JSON.stringify(id % 2 ? { id, unknown: shared, state: 'open' } : { state: 'open', unknown: shared, id }))
    const content = raw.join('\n'), view = factorGithubMetadata({ content, rows: raw.map((row, index) => ({ line: index + 1, raw: row })) })
    if (!view) throw new Error('Expected repeated ordered layouts to factor')
    expect(expandGithubMetadataView(view.content)).toBe(content)
    const headerEnd = view.content.indexOf('\n'), header = view.content.slice(0, headerEnd), prefixEnd = header.indexOf(': ') + 2
    const document: unknown = JSON.parse(header.slice(prefixEnd))
    if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Expected generated dictionary document')
    expect(() => expandGithubMetadataView(header.slice(0, prefixEnd) + JSON.stringify({ ...document, unexpected: 'closed protocol' }) + view.content.slice(headerEnd))).toThrow()
    const cyclic = header.slice(0, prefixEnd) + JSON.stringify({ version: 'github-metadata-factor-v1', dictionary: { d0: { $r: 'd0' } }, layouts: [['$r']] })
    expect(() => expandGithubMetadataView(cyclic + '\nCONTEXT ONLY original L1: [0,"d0"]')).toThrow()
    const unused = header.slice(0, prefixEnd) + JSON.stringify({ version: 'github-metadata-factor-v1', dictionary: { d0: 'not consumed source data' }, layouts: [] })
    expect(() => expandGithubMetadataView(unused + '\nL1: unchanged authored text')).toThrow()
  })
})

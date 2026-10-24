import { describe, expect, it, vi } from 'vitest'
import { ActionSourceCollection, PreparedActionEvidenceView, captureGithubActionSource, renderGithubEvidence, actionEvidenceRegistryDigest } from '../action-evidence-view.js'
import { decodeActionEvidenceViewSources, ActionEvidenceRequestReceiptSchema, ActionRegistrySchema, ArticleActionFileContractSchema, ArticleActionFileSchema, ActionSourceSchema, captureDraftActionCandidates, assertActionSnapshotStateIntegrity, articleActionFileBytes, sha256, splitActionRegistry, type ActionSource } from '../action-registry.js'
import { applyVerifiedActionReview, resolveActionSourceLines, pendingActionReview, reviewArticleActions, ActionContextNeedError, reviewProducedDraftActions, type ActionProposal } from '../review-actions.js'
import { buildActionEvidenceProjection, createActionEvidenceRequest } from '../action-evidence-retrieval.js'
import { ACTION_REVIEW_PROMPT_VERSION, CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS, RANKED_ACTION_REVIEW_PROMPT_VERSIONS, generationActionCycle } from '../action-review-cycle.js'
const date = '2026-10-17', markdown = `---\ndate: ${date}\nstatus: draft\n---\nA focused report.\n`
const empty = () => ActionRegistrySchema.parse({ schemaVersion: 1, baseline: { commit: 'a'.repeat(40), openSha256: 'b'.repeat(64), doneSha256: 'c'.repeat(64), articleActions: {}, heldSuggestions: [] }, records: [], articles: [] })
const issue = (body = 'Owner gate remains required until explicit acceptance.', avatar = 'x'.repeat(1000)) => ({ id: 1, html_url: 'https://github.com/ojfbot/daily-logger/issues/385', author_association: 'OWNER', state: 'open', user: { login: 'ojfbot', id: 1, avatar_url: avatar, future_gate: 'retained unknown field' }, body })
function fixture(records: unknown[] = [issue()]) {
  const responses = [JSON.stringify([records])], observation = 'CURRENT API STATE daily-logger#385: state=open; head=not-a-PR; merged_at=none.'
  const trustedContent = [observation, ...records.flatMap(value => typeof value === 'object' && value && 'body' in value && typeof value.body === 'string' ? [value.body] : [])]
  const capture = captureGithubActionSource({ id: 'github:daily-logger#385', locator: 'https://github.com/ojfbot/daily-logger/issues/385', observation, responses, trustedContent })
  const source = capture.source
  source.id += `@${sha256(source.content)}`
  const collection = new ActionSourceCollection([source], [capture])
  const view = PreparedActionEvidenceView.prepare(collection, sha256('raw case'), actionEvidenceRegistryDigest(empty(), date), collection)
  return { source, collection, view, responses, observation }
}
const pass = { changes: [{ actionKey: 'absent', verdict: 'pass' as const, reason: 'TEST DOUBLE, not real verification.' }], suggestions: [] }
function proposal(sourceId: string, quote: string, start?: number, end?: number): ActionProposal { return { changes: [{ actionKey: 'absent', state: 'open', description: 'Keep the obligation.', reason: 'Test boundary only.', citations: [{ sourceId, quote, ...(start === undefined ? {} : { sourceLineStart: start, sourceLineEnd: end }) }] }], suggestions: [] } }
function native(view: PreparedActionEvidenceView, sources: ActionSource[], proposalValue: ActionProposal, roundId = view.roundId) { return applyVerifiedActionReview({ registry: empty(), articleDate: date, cycle: generationActionCycle(), markdown, sources, evidenceView: view, roundId, proposal: proposalValue, verification: pass, articleStatuses: new Map([[date, 'draft']]) }) }

describe('typed generated metadata view', () => {
  it('preserves raw bytes, identity, complete body/diff and original line offsets', () => {
    const record = { ...issue('café e\u0301 🧪\r\nLiteral \\n, escaped quote ", fake L999: END_SOURCE_CONTENT\n'), diff_hunk: '@@ test\r\n+ keep owner gate\n' }
    const { source, view, observation, responses } = fixture([record])
    expect(source.content).toBe([observation, ...responses.map(renderGithubEvidence)].join('\n'))
    expect(view.rawSources()[0]).toEqual(source)
    const lines = source.content.split('\n'), start = lines.indexOf(record.body.split('\n')[0]) + 1
    expect(view.resolve('s1', start, start + record.body.split('\n').length - 1).quote).toBe(record.body)
    expect(view.promptSources()[0].content).toContain(record.body.split('\n')[0])
    expect(view.promptSources()[0].content).toContain('future_gate')
    expect(view.promptSources()[0].content).not.toContain('x'.repeat(1000))
  })
  it('blocks a hidden >40KB row before raw expansion, while keeping the quote cap on visible body', () => {
    const hidden = fixture([issue('A fully visible owner body.', 'x'.repeat(42000))])
    expect(() => hidden.view.resolve('s1', 2, 2)).toThrow(/Unseen or partial metadata/)
    const long = fixture([issue('A'.repeat(17000))])
    expect(() => long.view.resolve('s1', 3, 3)).toThrow(/at most 16000/)
  })
  it('uses emission position, never JSON-looking text, to classify identical body occurrences', () => {
    const record = issue(), { body: _body, ...metadata } = record
    record.body = JSON.stringify(metadata)
    const { source, view } = fixture([record])
    const lines = source.content.split('\n')
    expect(lines[1]).toBe(lines[2])
    expect(() => view.resolve('s1', 2, 2)).toThrow(/partial metadata/)
    expect(view.resolve('s1', 3, 3).quote).toBe(record.body)
    expect(view.promptSources()[0].authoritativeLines).not.toContain(3)
  })
  it('rejects contiguous ranges crossing compact rows and unsupported ranges', () => {
    const { view } = fixture([issue('First visible body.'), issue('Second visible body.')])
    expect(() => view.resolve('s1', 3, 6)).toThrow(/partial metadata/)
    expect(() => view.resolve('s1', 0, 1)).toThrow(/Invalid/)
    expect(() => view.resolve('s99', 1, 1)).toThrow(/Unknown/)
  })
  it('retains unknown record variants/fields and unusual incidental value types', () => {
    const unknown = fixture([{ user: { avatar_url: 'x'.repeat(1000) }, body: 'Unknown record stays full.' }])
    expect(decodeActionEvidenceViewSources(unknown.view.receipt)[0].hiddenLines).toEqual([])
    const known = fixture([{ ...issue(), extra: { user: { avatar_url: 'unknown nested data' } }, user: { avatar_url: { policy: 'not a transport string' }, login: 'ojfbot' } }])
    expect(known.view.promptSources()[0].content).toContain('unknown nested data')
    expect(known.view.promptSources()[0].content).toContain('not a transport string')
  })
  it('retains own prototype-shaped and constructor metadata keys at every unknown occurrence', () => {
    const record = JSON.parse('{"id":1,"html_url":"https://github.com/ojfbot/core/issues/1","author_association":"OWNER","__proto__":{"future_required_fact":"retain this unknown value"},"constructor":{"future_owner_gate":"retain constructor value"},"user":{"id":1,"login":"ojfbot","avatar_url":"https://example.test/avatar","__proto__":{"nested_required_fact":"retain nested unknown value"}},"body":"visible authored text"}')
    const { source, view } = fixture([record])
    for (const fact of ['future_required_fact', 'retain this unknown value', 'future_owner_gate', 'retain constructor value', 'nested_required_fact', 'retain nested unknown value']) {
      expect(source.content).toContain(fact)
      expect(view.promptSources()[0].content).toContain(fact)
    }
    expect(view.promptSources()[0].content).toContain('"__proto__"')
    expect(view.promptSources()[0].content).not.toContain('https://example.test/avatar')
    expect(() => view.resolve('s1', 2, 2)).toThrow(/partial metadata/)
    expect(view.resolve('s1', 3, 3).quote).toBe(record.body)
  })
  it('gives plain/serialized/spread sources verbatim fallback without minting provenance', () => {
    const { source, collection, view } = fixture()
    for (const raw of [[source], [...collection], JSON.parse(JSON.stringify(collection))]) {
      const fallback = PreparedActionEvidenceView.prepare(raw, sha256('raw case'), actionEvidenceRegistryDigest(empty(), date))
      expect(decodeActionEvidenceViewSources(fallback.receipt)[0].hiddenLines).toEqual([])
      expect(fallback.resolve('s1', 2, 2).quote).toBe(source.content.split('\n')[1])
      expect(fallback.roundId).not.toBe(view.roundId)
    }
    expect(ActionSourceSchema.safeParse({ ...source, generatedRows: [{ line: 2 }] }).success).toBe(false)
  })
  it('keeps appended raw replies separate while preserving genuine live collection provenance', () => {
    const { collection } = fixture()
    const appended = collection.appendRaw([{ id: 'reply', kind: 'instruction', locator: 'test', content: 'A fully visible reply.' }])
    const view = PreparedActionEvidenceView.prepare(appended, sha256('case'), sha256('state'), appended)
    expect(decodeActionEvidenceViewSources(view.receipt)[0].hiddenLines).toEqual([2])
    expect(decodeActionEvidenceViewSources(view.receipt)[1].hiddenLines).toEqual([])
  })
  it('does not expose mutable receipt, raw sources, or prompt object state', () => {
    const { view } = fixture()
    expect(() => view.receipt.sources[0][3].push(3)).toThrow()
    const sources = view.rawSources(); sources[0].content = 'tampered'
    const shown = view.promptSources(); shown[0].content = 'tampered'
    expect(view.resolve('s1', 3, 3).quote).toContain('Owner gate')
    expect(view.promptSources()[0].content).not.toBe('tampered')
  })
  it('blocks provider conversion and native injected hidden lines below the quote cap despite a pass double', () => {
    const { source, view } = fixture()
    const row = source.content.split('\n')[1]
    expect(row.length).toBeLessThan(16000)
    expect(() => resolveActionSourceLines({ changes: [{ actionKey: 'absent', state: 'open', description: 'Keep.', reason: 'Test.', citations: [{ sourceId: 's1', startLine: 2, endLine: 2 }] }], suggestions: [] }, view)).toThrow(/partial metadata/)
    expect(() => native(view, [source], proposal(source.id, row, 2, 2))).toThrow(/partial metadata/)
    expect(() => native(view, [source], proposal(source.id, source.content.split('\n')[2]))).toThrow(/endpoints/)
    expect(native(view, [source], proposal(source.id, source.content.split('\n')[2], 3, 3)).articles[0].review.state).toBe('verified')
  })
  it('rejects missing views, different source bytes and full-fallback substitution for a consumed compact round', () => {
    const { source, view } = fixture(), p = proposal(source.id, source.content.split('\n')[2], 3, 3)
    expect(() => native(undefined as never, [source], p, view.roundId)).toThrow()
    expect(() => native(view, [{ ...source, content: source.content + '\nextra' }], p)).toThrow(/does not match/)
    const fallback = PreparedActionEvidenceView.prepare([source], sha256('raw case'), actionEvidenceRegistryDigest(empty(), date))
    expect(() => native(fallback, [source], p, view.roundId)).toThrow(/does not match/)
  })
  it('binds the published state to actual view and output receipts without changing legacy shape', () => {
    const { source, view } = fixture()
    const reviewed = native(view, [source], proposal(source.id, source.content.split('\n')[2], 3, 3))
    expect(() => assertActionSnapshotStateIntegrity(reviewed, reviewed.articles[0])).not.toThrow()
    const tampered = structuredClone(reviewed); tampered.articles[0].verification.evidenceView!.sources[0][3] = []
    expect(() => assertActionSnapshotStateIntegrity(tampered, tampered.articles[0])).toThrow(/stale/)
    const deleted = structuredClone(reviewed); delete deleted.articles[0].verification.evidenceView
    expect(() => assertActionSnapshotStateIntegrity(deleted, deleted.articles[0])).toThrow(/stale/)
    expect(articleActionFileBytes(splitActionRegistry(reviewed).files[0]).length).toBeLessThan(64 * 1024)
    expect(CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS).toContain('action-review-v15-draft-candidate-linkage')
    expect(RANKED_ACTION_REVIEW_PROMPT_VERSIONS).toContain('action-review-v15-draft-candidate-linkage')
    expect(CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS).toContain('action-review-v16-typed-evidence-view')
    expect(CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS).toContain('action-review-v18-native-validated-tool')
    expect(RANKED_ACTION_REVIEW_PROMPT_VERSIONS).toContain('action-review-v16-typed-evidence-view')
    expect(CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS).toContain('action-review-v19-compact-verifier-proposal')
    expect(RANKED_ACTION_REVIEW_PROMPT_VERSIONS).toContain('action-review-v19-compact-verifier-proposal')
    expect(CONTEXT_BOUND_ACTION_REVIEW_PROMPT_VERSIONS).toContain('action-review-v20-captured-candidate-references')
    expect(RANKED_ACTION_REVIEW_PROMPT_VERSIONS).toContain('action-review-v20-captured-candidate-references')
    expect(ACTION_REVIEW_PROMPT_VERSION).toBe('action-review-v23-targeted-candidate-record-repair')
  })
  it('retains primary context failure when Accepted pending persistence is forbidden', async () => {
    await expect(reviewProducedDraftActions({ registry: empty(), articleDate: date, cycle: generationActionCycle(), markdown: markdown.replace('draft', 'accepted'), feedback: '', articleStatuses: new Map([[date, 'accepted']]), collectSources: () => [], agents: { propose: async () => { throw new Error('PRIMARY CONTEXT FAILURE') }, verify: vi.fn() } })).rejects.toThrow(/PRIMARY CONTEXT FAILURE.*pending persistence refused/)
  })
  it('caches exact native output, but binds external registry/held-memory changes', async () => {
    const registry = empty(), agents = { propose: vi.fn(async () => ({ changes: [], suggestions: [] })), verify: vi.fn(async () => ({ changes: [], suggestions: [] })) }
    const input = { registry, articleDate: date, cycle: generationActionCycle(), markdown, feedback: '', sources: [] as ActionSource[], agents, articleStatuses: new Map([[date, 'draft']]) }
    const first = await reviewArticleActions(input)
    expect((await reviewArticleActions({ ...input, registry: first.registry, markdown: first.markdown })).cached).toBe(true)
    const changed = structuredClone(first.registry); changed.baseline.heldSuggestions.push({ articlePath: 'articles/2026-10-16.md', sourceDate: '2026-10-16', line: 1, invocation: '/review', suggestionLineSha256: sha256('Held memory'), suggestion: 'Held memory' })
    expect(actionEvidenceRegistryDigest(changed, date)).not.toBe(actionEvidenceRegistryDigest(first.registry, date))
    expect((await reviewArticleActions({ ...input, registry: changed, markdown: first.markdown })).cached).toBe(false)
  })
  it.each(['action-review-v19-compact-verifier-proposal', 'action-review-v21-exact-invocation-admission', 'action-review-v22-role-local-output-repair'])('reads historical %s output without reusing it under role-local repair', async version => {
    const registry = empty(), agents = { propose: vi.fn(async () => ({ changes: [], suggestions: [] })), verify: vi.fn(async () => ({ changes: [], suggestions: [] })) }
    const input = { registry, articleDate: date, cycle: generationActionCycle(), markdown, feedback: '', sources: [] as ActionSource[], agents, articleStatuses: new Map([[date, 'draft']]) }
    const first = await reviewArticleActions(input), historical = structuredClone(first.registry)
    historical.articles[0].verification.promptVersion = version
    expect(ActionRegistrySchema.parse(historical)).toEqual(historical)
    const before = JSON.stringify(historical)
    const fresh = await reviewArticleActions({ ...input, registry: historical, markdown: first.markdown })
    expect(fresh.cached).toBe(false)
    expect(fresh.registry.articles[0].verification.promptVersion).toBe(ACTION_REVIEW_PROMPT_VERSION)
    expect(agents.propose).toHaveBeenCalledTimes(2)
    expect(agents.verify).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(historical)).toBe(before)
  })
  it('holds unvalidated retained excerpts without changing historical reads or native projections', () => {
    const { source } = fixture()
    const excerpt = { ...source, content: 'Only a retained quote.', fullContentSha256: sha256(source.content), trustedContent: ['Only a retained quote.'] }
    expect(ActionSourceSchema.safeParse(excerpt).success).toBe(true)
    expect(() => PreparedActionEvidenceView.prepare([excerpt], sha256('case'), sha256('state'))).toThrow(/not a complete raw source/)
  })
  it('emits an explicit context need without a second provider negotiation', async () => {
    const propose = vi.fn(async () => { throw new ActionContextNeedError('Complete action provider request exceeds token budget (193064 input + 12000 output reserve > 200000); review pending') })
    const verify = vi.fn()
    const result = await reviewProducedDraftActions({ registry: empty(), articleDate: date, cycle: generationActionCycle(), markdown, feedback: '', articleStatuses: new Map([[date, 'draft']]), collectSources: () => [], agents: { propose, verify } })
    expect(result.registry.articles[0].review.state).toBe('pending')
    expect(result.registry.articles[0].evidenceRequests?.[0]).toMatchObject({ kind: 'clarification', sourceKey: 'model-context', status: 'open' })
    expect(propose).toHaveBeenCalledOnce(); expect(verify).not.toHaveBeenCalled()
  })
  it('round-trips and archives a genuine native view receipt with synthetic verdict doubles inside the unchanged storage cap', async () => {
    const { collection } = fixture()
    const payload = { command: '/review', repo: 'daily-logger', description: 'Review https://github.com/ojfbot/daily-logger/issues/385 for this synthetic storage control.', status: 'open' as const, sourceDate: date }
    const candidateId = captureDraftActionCandidates([payload])[0].candidateId
    const result = await reviewProducedDraftActions({ registry: empty(), articleDate: date, cycle: generationActionCycle(), markdown, feedback: '', draftCandidates: [payload], articleStatuses: new Map([[date, 'draft']]), collectSources: () => collection,
      agents: { identity: { proposer: 'synthetic-storage-test-double', verifier: 'synthetic-storage-test-double' },
        propose: async (_prompt, view) => { const source = view.rawSources(true).find(source => source.kind === 'github')!; return { changes: [], suggestions: [], candidateDispositions: [{ candidateId, kind: 'reject', reason: 'SYNTHETIC storage fixture, no real candidate verdict.', citations: [view.resolve(source.id, 3, 3)] }] } },
        verify: async () => ({ changes: [], suggestions: [], candidateDispositions: [{ candidateId, verdict: 'pass', reason: 'SYNTHETIC test double only, no real semantic verification.' }] }) } })
    expect(result.registry.records).toEqual([])
    expect(result.registry.articles[0].review.state).toBe('verified')
    const pending = pendingActionReview({ registry: result.registry, articleDate: date, cycle: generationActionCycle(), markdown, reason: 'Synthetic new-case storage control.', articleStatuses: new Map([[date, 'draft']]), resetDraftCandidateReviews: true })
    const archive = pending.registry.articles[0].candidateReviewHistory?.[0]
    expect(archive?.verification.evidenceView).toEqual(result.registry.articles[0].verification.evidenceView)
    const file = splitActionRegistry(pending.registry).files[0]
    expect(ArticleActionFileContractSchema.parse(file)).toEqual(file)
    const sizes = { qualification: 'pure synthetic source/candidate/verdict-double fixture', verifiedPrettyBytes: Buffer.byteLength(articleActionFileBytes(splitActionRegistry(result.registry).files[0])), archivedPrettyBytes: Buffer.byteLength(articleActionFileBytes(file)), archivedCompactBytes: Buffer.byteLength(JSON.stringify(file)), archivedViewBytes: Buffer.byteLength(JSON.stringify(archive?.verification.evidenceView)) }
    expect(sizes.archivedPrettyBytes).toBeLessThan(64 * 1024)
    console.info('METADATA_VIEW_STORAGE_FIXTURE ' + JSON.stringify(sizes))
  })

  it('rejects drift under a genuine captured identity rather than converting it to legacy fallback', () => {
    const { source, collection } = fixture()
    const metadata = source.content.split('\n')[1]
    const variants = [
      { ...source, content: source.content.replace('x'.repeat(1000), 'y'.repeat(1000)) },
      { ...source, locator: source.locator + '/changed' },
      { ...source, kind: 'instruction' as const },
      { ...source, trustedContent: [...source.trustedContent!, metadata] },
      { ...source, id: source.id.replace(/@[a-f0-9]{64}$/, '@' + 'f'.repeat(64)) },
      { ...source, trustedContent: [...source.trustedContent!, metadata], response: { requestId: sha256('request'), caseDigest: sha256('case'), responseId: sha256('reply'), actionKeys: ['article-feedback'] } },
      { ...source, trustedContent: [...source.trustedContent!, metadata], projection: { version: 'action-evidence-projection-v1' as const, requestId: sha256('request'), caseDigest: sha256('case'), fullSourceId: source.id, fullContentSha256: sha256(source.content), ranges: [{ startLine: 2, endLine: 2, role: 'support' as const }], coverage: [{ obligationId: sha256('obligation'), status: 'support' as const, rangeIndexes: [0] }] } },
    ]
    for (const changed of variants) expect(() => PreparedActionEvidenceView.prepare([changed], sha256('case'), sha256('state'), collection)).toThrow(/Collector provenance changed/)
    expect(decodeActionEvidenceViewSources(PreparedActionEvidenceView.prepare([source], sha256('case'), sha256('state'), collection).receipt)[0].hiddenLines).toEqual([2])
    const unrelated = { ...source, id: 'github:unrelated#999' }
    expect(decodeActionEvidenceViewSources(PreparedActionEvidenceView.prepare([unrelated], sha256('case'), sha256('state'), collection).receipt)[0].hiddenLines).toEqual([])
  })
  it('persists canonical raw/view/range pins when a complete required row exceeds the quote cap', async () => {
    const { source, collection } = fixture([issue('A fully visible owner body.', 'x'.repeat(17000))])
    let consumedRound = '', policy = ''
    const result = await reviewProducedDraftActions({ registry: empty(), articleDate: date, cycle: generationActionCycle(), markdown, feedback: 'Inspect daily-logger #385 current owner gate.', articleStatuses: new Map([[date, 'draft']]), collectSources: () => collection,
      agents: { propose: async (_prompt, view) => { consumedRound = view.roundId; policy = view.receipt.policySha256; const alias = view.rawSources(true).find(source => source.kind === 'github')!; view.resolve(alias.id, 2, 2); throw new Error('Hidden line unexpectedly resolved') }, verify: vi.fn() } })
    const parsed = ArticleActionFileContractSchema.parse(JSON.parse(articleActionFileBytes(splitActionRegistry(result.registry).files[0])))
    const request = parsed.snapshot!.evidenceRequests![0]
    expect(request).toMatchObject({ kind: 'source-view', sourceId: source.id, sourceLocator: source.locator, sourceFullContentSha256: sha256(source.content), status: 'open' })
    expect(request.question).toContain(`View round ${consumedRound}`)
    expect(request.question).toContain(`policy ${policy}`)
    expect(request.question).toContain(`collected SHA256 ${sha256(source.content)}`)
    expect(request.question).toContain('original lines 2-2')
    expect(parsed.snapshot!.sources).toEqual([])
    expect(request).not.toHaveProperty('content')
    expect(ArticleActionFileSchema.parse(parsed).snapshot?.evidenceRequests?.[0]).toEqual(request)
    expect(request.question?.length).toBeLessThanOrEqual(512)
    expect(Buffer.byteLength(articleActionFileBytes(parsed))).toBeLessThan(64 * 1024)
    expect(Buffer.byteLength(JSON.stringify(parsed))).toBeLessThan(64 * 1024)
  })
  it('includes current-snapshot rejection memory in cache input/output and still replays its own unchanged result', async () => {
    const agents = { propose: vi.fn(async () => ({ changes: [], suggestions: [] })), verify: vi.fn(async () => ({ changes: [], suggestions: [] })) }
    const input = { registry: empty(), articleDate: date, cycle: generationActionCycle(), markdown, feedback: '', sources: [] as ActionSource[], agents, articleStatuses: new Map([[date, 'draft']]) }
    const first = await reviewArticleActions(input)
    expect((await reviewArticleActions({ ...input, registry: first.registry, markdown: first.markdown })).cached).toBe(true)
    const changed = structuredClone(first.registry)
    changed.articles[0].rejected.push({ description: 'Synthetic newly held work', reason: 'Synthetic new owner/counterevidence context.', workKey: 'daily-logger|new-held-work|keep-held', evidenceDigest: sha256('new evidence') })
    expect(actionEvidenceRegistryDigest(changed, date)).not.toBe(actionEvidenceRegistryDigest(first.registry, date))
    const fresh = await reviewArticleActions({ ...input, registry: changed, markdown: first.markdown })
    expect(fresh.cached).toBe(false); expect(agents.propose).toHaveBeenCalledTimes(2); expect(agents.verify).toHaveBeenCalledTimes(2)
    expect((await reviewArticleActions({ ...input, registry: fresh.registry, markdown: fresh.markdown })).cached).toBe(true)
  })

  it('preserves distinct native exact-range projection identity through the existing source-view protocol', () => {
    const { source, collection } = fixture()
    const obligation = sha256('Synthetic projection control')
    const request = createActionEvidenceRequest({ kind: 'source-view', caseDigest: sha256('case'), articleDate: date, cycle: generationActionCycle(), actionKeys: ['article-feedback'], sourceKey: 'github:daily-logger#385', source, question: 'Synthetic exact-range protocol control.', obligations: [obligation] })
    const projected = buildActionEvidenceProjection({ request, source, ranges: [{ startLine: 1, endLine: 1, role: 'support' }, { startLine: 3, endLine: 3, role: 'counterevidence' }], coverage: [{ obligationId: obligation, status: 'counterevidence', rangeIndexes: [1] }] })
    expect(projected.id).toMatch(/^action-evidence-view:/)
    const view = PreparedActionEvidenceView.prepare([projected], sha256('case'), sha256('state'), collection)
    expect(decodeActionEvidenceViewSources(view.receipt)[0].hiddenLines).toEqual([])
    expect(view.rawSources()[0]).toEqual(projected)
  })
  it('requires complete new source-view diagnostics while preserving legacy absence', () => {
    const receipt = { version: 'action-evidence-request-v1', id: sha256('request'), kind: 'source-view', caseDigest: sha256('case'), articleDate: date, cycle: generationActionCycle(), actionKeys: ['article-feedback'], sourceKey: 'model-context', obligations: [sha256('obligation')], recipient: 'coordinator-owner', status: 'open' }
    expect(ActionEvidenceRequestReceiptSchema.safeParse(receipt).success).toBe(true)
    const complete = { ...receipt, question: 'Synthetic bounded view/range diagnostic.', sourceId: 'github:daily-logger#385', sourceLocator: 'https://github.com/ojfbot/daily-logger/issues/385', sourceFullContentSha256: sha256('raw') }
    expect(ActionEvidenceRequestReceiptSchema.safeParse(complete).success).toBe(true)
    for (const field of ['question', 'sourceLocator', 'sourceId', 'sourceFullContentSha256']) {
      const partial: Record<string, unknown> = { ...complete }; delete partial[field]
      expect(ActionEvidenceRequestReceiptSchema.safeParse(partial).success).toBe(false)
    }
    expect(ActionEvidenceRequestReceiptSchema.safeParse({ ...receipt, sourceLocator: complete.sourceLocator }).success).toBe(false)
  })
  it('canonicalizes only article membership order across native writer/read boundaries', () => {
    const a = native(fixture().view, fixture().view.rawSources(), proposal(fixture().source.id, fixture().source.content.split('\n')[2], 3, 3))
    const second = structuredClone(a.articles[0]); second.date = '2026-10-18'
    const ordered = { ...a, articles: [a.articles[0], second] }
    const reversed = structuredClone(ordered); reversed.articles.reverse()
    expect(actionEvidenceRegistryDigest(ordered, date)).toBe(actionEvidenceRegistryDigest(reversed, date))
    reversed.articles[0].rejected.push({ description: 'Different memory', reason: 'Retained values still matter.' })
    expect(actionEvidenceRegistryDigest(ordered, date)).not.toBe(actionEvidenceRegistryDigest(reversed, date))
  })

})

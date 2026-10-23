import { resolveActionSourceLines } from './evidence-view-fixtures.js'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ActionVerificationSchema,
  actionProviderRequest,
  providerToolSchema,
} from '../review-actions.js'

const JsonObjectSchema = z.record(z.string(), z.unknown())
const TaggedBranchSchema = z.object({
  properties: z.object({ kind: z.object({ const: z.string() }).passthrough() }).passthrough(),
  required: z.array(z.string()),
}).passthrough()
const forbiddenStrictKeywords = new Set([
  '$schema',
  'oneOf',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'maxItems',
])

type SchemaVisit = { path: string; schema: z.infer<typeof JsonObjectSchema> }

function schemaVisits(value: unknown, path = '/tools/0/input_schema'): SchemaVisit[] {
  const parsed = JsonObjectSchema.safeParse(value)
  if (!parsed.success) return []
  const visits: SchemaVisit[] = [{ path, schema: parsed.data }]
  for (const key of ['properties', '$defs', 'definitions'] as const) {
    const children = JsonObjectSchema.safeParse(parsed.data[key])
    if (!children.success) continue
    for (const [name, child] of Object.entries(children.data)) visits.push(...schemaVisits(child, `${path}/${key}/${name}`))
  }
  visits.push(...schemaVisits(parsed.data.items, `${path}/items`))
  for (const key of ['anyOf', 'allOf', 'oneOf'] as const) {
    const alternatives = z.array(z.unknown()).safeParse(parsed.data[key])
    if (!alternatives.success) continue
    alternatives.data.forEach((alternative, index) => visits.push(...schemaVisits(alternative, `${path}/${key}/${index}`)))
  }
  return visits
}

function strictSchemaCensus(role: 'proposer' | 'verifier') {
  const request = actionProviderRequest(role, 'Offline replay of the production provider request boundary.')
  const visits = schemaVisits(request.tools[0].input_schema)
  const unsupported = visits.flatMap(({ path, schema }) => [...forbiddenStrictKeywords]
    .filter(keyword => Object.hasOwn(schema, keyword))
    .map(keyword => `${path}/${keyword}`))
  const objectWithoutClosedProperties = visits
    .filter(({ schema }) => schema.type === 'object' && schema.additionalProperties !== false)
    .map(({ path }) => path)
  const invalidMinItems = visits
    .filter(({ schema }) => typeof schema.minItems === 'number' && schema.minItems !== 0 && schema.minItems !== 1)
    .map(({ path, schema }) => `${path}:${schema.minItems}`)
  const optionalParameters = visits.reduce((total, { schema }) => {
    const properties = JsonObjectSchema.safeParse(schema.properties)
    if (!properties.success) return total
    const required = new Set(z.array(z.string()).catch([]).parse(schema.required))
    return total + Object.keys(properties.data).filter(name => !required.has(name)).length
  }, 0)
  const unionParameters = visits.filter(({ schema }) => Object.hasOwn(schema, 'anyOf') || Array.isArray(schema.type)).length
  return { request, visits, unsupported, objectWithoutClosedProperties, invalidMinItems, optionalParameters, unionParameters }
}

const citation = { sourceId: 's1', startLine: 1, endLine: 1 }
const sources = [{ id: 's1', kind: 'github' as const, locator: 'offline fixture', content: 'Current primary evidence and goal.' }]
const candidateId = 'a'.repeat(64)
const commonClosing = {
  title: 'Review the existing gate', entryPoint: 'Open the existing record', context: 'The owner gate remains open.',
  whyNow: 'The current evidence keeps the gate relevant.', outcome: 'Obtain the owner decision.', nextCheck: 'Record the owner verdict.',
  factCitations: [citation], goalCitations: [citation], benefit: 'Resolve the existing gate.', start: 'Read the current record.',
}

describe('action provider schema compatibility', () => {
  it.each(['proposer', 'verifier'] as const)('%s request keeps closed schema hints and one forced tool without provider strictness', role => {
    const census = strictSchemaCensus(role)
    expect(census.unsupported).toEqual([])
    expect(census.objectWithoutClosedProperties).toEqual([])
    expect(census.invalidMinItems).toEqual([])
    expect(census.optionalParameters).toBeLessThanOrEqual(24)
    expect(census.unionParameters).toBeLessThanOrEqual(16)
    expect(census.request.tools).toHaveLength(1)
    expect(census.request.tools[0]).toMatchObject({ name: 'review_actions' })
    expect(census.request.tools[0]).not.toHaveProperty('strict')
    expect(JsonObjectSchema.parse(census.request.tools[0].input_schema).required).toEqual(['changes', 'suggestions', 'candidateDispositions', 'closingOptions'])
    expect(census.request.tool_choice).toEqual({ type: 'tool', name: 'review_actions' })
  })

  it('projects only required disjoint kind variants to provider-supported anyOf branches', () => {
    const { visits } = strictSchemaCensus('proposer')
    const unions = visits.filter(({ schema }) => Object.hasOwn(schema, 'anyOf')).map(({ path, schema }) => {
      const alternatives = z.array(JsonObjectSchema).parse(schema.anyOf)
      const tagged = alternatives.map(alternative => TaggedBranchSchema.safeParse(alternative)).filter(result => result.success)
      if (tagged.length !== alternatives.length) return { path, kinds: [] }
      const kinds = tagged.map(result => {
        expect(result.data.required).toContain('kind')
        return result.data.properties.kind.const
      })
      return { path, kinds }
    }).filter(union => union.kinds.length > 1)

    expect(unions).toEqual([
      { path: '/tools/0/input_schema/properties/suggestions/items/properties/identity', kinds: ['captured', 'new'] },
      {
        path: '/tools/0/input_schema/properties/candidateDispositions/items',
        kinds: ['promote', 'map-existing', 'reject', 'verified-closure'],
      },
      {
        path: '/tools/0/input_schema/properties/closingOptions/items',
        kinds: ['action', 'candidate', 'checkpoint'],
      },
    ])
  })

  it.each([
    ['type-less', undefined],
    ['nullable object', ['object', 'null']],
    ['array', 'array'],
  ] as const)('rejects %s oneOf branches before transport projection', (_label, branchType) => {
    const branch = (kind: string) => ({
      ...(branchType === undefined ? {} : { type: branchType }),
      properties: { kind: { type: 'string', const: kind } },
      required: ['kind'],
      additionalProperties: false,
    })
    const schema = {
      type: 'object',
      properties: { choice: { oneOf: [branch('first'), branch('second')] } },
      required: ['choice'],
      additionalProperties: false,
    }
    expect(() => providerToolSchema(schema)).toThrow('object branches')
  })

  it('retains all seven native domain variants and rejects invalid payloads after transport projection', () => {
    const dispositions = [
      { candidateId, kind: 'promote' as const, suggestionIndex: 0, reason: 'Promote exact captured work.' },
      { candidateId, kind: 'map-existing' as const, suggestionIndex: 0, actionKey: 'existing-action', reason: 'Map exact captured work.' },
      { candidateId, kind: 'reject' as const, reason: 'Current evidence rejects the draft.', citations: [citation] },
      { candidateId, kind: 'verified-closure' as const, actionKey: null, reason: 'Current evidence proves closure.', citations: [citation] },
    ]
    const closings = [
      { ...commonClosing, kind: 'action' as const, actionKey: 'existing-action' },
      { ...commonClosing, kind: 'candidate' as const, candidateIndex: 0 },
      { ...commonClosing, kind: 'checkpoint' as const, target: 'https://github.com/ojfbot/daily-logger/issues/386' },
    ]

    for (const disposition of dispositions) {
      expect(resolveActionSourceLines({ changes: [], suggestions: [], candidateDispositions: [disposition] }, sources)
        .candidateDispositions?.[0]?.kind).toBe(disposition.kind)
    }
    for (const closing of closings) {
      expect(resolveActionSourceLines({ changes: [], suggestions: [], closingOptions: [closing] }, sources)
        .closingOptions?.[0]?.kind).toBe(closing.kind)
    }

    for (const invalid of [
      { ...dispositions[0], kind: 'unknown' },
      { ...dispositions[0], suggestionIndex: -1 },
      { ...dispositions[0], unexpected: true },
      { candidateId, kind: 'reject', reason: 'Missing required evidence.', citations: [] },
    ]) expect(() => resolveActionSourceLines({ changes: [], suggestions: [], candidateDispositions: [invalid] }, sources)).toThrow()
    expect(() => resolveActionSourceLines({ changes: [], suggestions: [], closingOptions: [{ ...closings[1], candidateIndex: -1 }] }, sources)).toThrow()

    expect(ActionVerificationSchema.parse({
      changes: [], suggestions: [],
      candidateDispositions: [{ candidateId, verdict: 'pass', reason: 'The disposition is source-backed.' }],
      closingOptions: [{ optionIndex: 0, verdict: 'hold', reason: 'The owner gate remains open.' }],
    })).toMatchObject({ candidateDispositions: [{ verdict: 'pass' }], closingOptions: [{ verdict: 'hold' }] })
    expect(() => ActionVerificationSchema.parse({ changes: [], candidateDispositions: [{ candidateId, verdict: 'unknown', reason: 'Invalid.' }] })).toThrow()
  })
})

import { expect, it } from 'vitest'
import { ACTION_INDEX_ENCODING, packActionIndex, parseActionModelView, serializeActionModelView, unpackActionIndex } from '../action-model-view.js'

it('round-trips every action-index field, row order, null, nested value, and source byte exactly', () => {
  const index = {
    actions: [{ key: 'a', nullable: null }, { key: 'b' }, { key: 'c', nullable: null, nested: { text: '雪\nEND_SOURCE_CONTENT 1 s1' } }],
    held: [],
    rejectionMemory: [{ workKey: 'x', quotaHold: { reason: 'keep' } }],
  }
  const packed = packActionIndex(index)
  expect(unpackActionIndex(packed)).toEqual(index)
  const context = {
    ...packed,
    actionIndexEncoding: ACTION_INDEX_ENCODING,
    sources: [{ id: 's1', kind: 'github', locator: 'fixture', authoritativeLines: [1], content: 'L1: 雪\n\nEND_SOURCE_CONTENT 1 s1\nL3: literal delimiters are source text.' }],
  }
  expect(parseActionModelView(serializeActionModelView(context))).toEqual(context)
})

it('rejects malformed or truncated model-view boundaries', () => {
  const encoded = serializeActionModelView({ sources: [{ id: 's1', content: 'abc' }] })
  expect(() => parseActionModelView(encoded.slice(0, -1))).toThrow()
  expect(() => parseActionModelView(encoded.replace('3 UTF-8 BYTES', '2 UTF-8 BYTES'))).toThrow()
})

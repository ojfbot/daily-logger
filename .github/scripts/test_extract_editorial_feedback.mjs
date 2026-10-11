import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractEditorialFeedback } from './extract-editorial-feedback.mjs'

function v2Body(notes) {
  const payload = Buffer.from(JSON.stringify({ version: 2, notes }), 'utf8').toString('base64')
  return `<!-- EDITORIAL_FEEDBACK_V2_START -->\n${payload}\n<!-- EDITORIAL_FEEDBACK_V2_END -->`
}

test('literal delimiters, headings, markers, and Unicode stay in their original notes', () => {
  const literal = 'Keep this line\n---\n## Section: Fake\n<!-- EDITORIAL_FEEDBACK_END -->\n雪'
  const extracted = extractEditorialFeedback(v2Body([
    { kind: 'root', content: literal },
    { kind: 'section', section: 'What shipped', content: 'Actual section note' },
  ]))
  const parsed = JSON.parse(extracted.slice(extracted.indexOf('[\n')))
  assert.deepEqual(parsed, [
    { kind: 'root', content: literal },
    { kind: 'section', section: 'What shipped', content: 'Actual section note' },
  ])
})

test('legacy PR feedback remains readable', () => {
  const body = '<!-- EDITORIAL_FEEDBACK_START -->\nFirst\n<!-- EDITORIAL_FEEDBACK_END --> inside note\nSecond\n<!-- EDITORIAL_FEEDBACK_END -->'
  assert.equal(extractEditorialFeedback(body), 'First\n<!-- EDITORIAL_FEEDBACK_END --> inside note\nSecond')
})

test('invalid v2 feedback fails closed', () => {
  assert.throws(() => extractEditorialFeedback('<!-- EDITORIAL_FEEDBACK_V2_START -->\nnot base64\n<!-- EDITORIAL_FEEDBACK_V2_END -->'))
  assert.throws(() => extractEditorialFeedback(v2Body([{ kind: 'root', content: '  ' }])))
  assert.throws(() => extractEditorialFeedback(v2Body([{ kind: 'other', content: 'Unknown' }])))
})

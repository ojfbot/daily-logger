import assert from 'node:assert/strict'
import { test } from 'node:test'
import { skipBotRevision } from './editorial-revision-admission.mjs'

const body = text => `<!-- EDITORIAL_FEEDBACK_START -->\n${text}\n<!-- EDITORIAL_FEEDBACK_END -->`
const event = { action: 'edited', sender: { type: 'User', login: 'editor' }, changes: { body: { from: body('First correction') } }, pull_request: { body: body('Additional correction') } }
test('a bot commit stays blocked without new human feedback', () => {
  assert.equal(skipBotRevision('ojfbot-blog[bot]', {}), true)
  assert.equal(skipBotRevision('ojfbot-blog[bot]', { ...event, action: 'synchronize' }), true)
  assert.equal(skipBotRevision('ojfbot-blog[bot]', { ...event, sender: { type: 'Bot', login: 'other[bot]' } }), true)
  assert.equal(skipBotRevision('ojfbot-blog[bot]', { ...event, pull_request: { body: body('First correction') + '\nNew unrelated prose' } }), true)
})
test('new literal feedback from a human resumes the supervised cycle', () => {
  assert.equal(skipBotRevision('ojfbot-blog[bot]', event), false)
  assert.equal(skipBotRevision('editor', event), false)
})

test('sender and changed-feedback guards apply independently of HEAD authorship', () => {
  for (const author of ['editor', 'ojfbot-blog[bot]']) {
    for (const sender of [undefined, { type: 'Bot', login: 'other[bot]' }, { type: 'User', login: 'other[bot]' }, { type: 'User' }]) {
      assert.equal(skipBotRevision(author, { ...event, sender }), true)
    }
    assert.equal(skipBotRevision(author, { ...event, pull_request: { body: body('First correction') + '\nChanged PR description' } }), true)
    assert.equal(skipBotRevision(author, { ...event, changes: {} }), true)
    assert.equal(skipBotRevision(author, { ...event, action: 'synchronize' }), true)
    assert.equal(skipBotRevision(author, {}), true)
  }
})

test('opening a revision requires a non-bot account and valid feedback', () => {
  const opened = { ...event, action: 'opened' }
  assert.equal(skipBotRevision('editor', opened), false)
  assert.equal(skipBotRevision('ojfbot-blog[bot]', opened), true)
  assert.equal(skipBotRevision('editor', { ...opened, sender: { type: 'Bot', login: 'other[bot]' } }), true)
  assert.equal(skipBotRevision('editor', { ...opened, pull_request: { body: body('') } }), true)
  assert.equal(skipBotRevision('editor', { ...opened, pull_request: { body: '<!-- EDITORIAL_FEEDBACK_V2_START -->invalid' } }), true)
})
test('empty or malformed feedback cannot bypass the bot guard', () => {
  assert.equal(skipBotRevision('ojfbot-blog[bot]', { ...event, pull_request: { body: body('') } }), true)
  assert.equal(skipBotRevision('ojfbot-blog[bot]', { ...event, pull_request: { body: '<!-- EDITORIAL_FEEDBACK_V2_START -->invalid' } }), true)
})

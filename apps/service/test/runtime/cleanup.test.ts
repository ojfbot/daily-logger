import assert from 'node:assert/strict'
import { test } from 'node:test'

const { ownedContainer } = await import(new URL('../../runtime/owned-container.mjs', import.meta.url).href)
const name = 'dailylogger-runtime-fixture-offline'
const owner = '11111111-1111-4111-8111-111111111111'
const id = 'a'.repeat(64)
const ok = (stdout = '') => ({ status: 0, stdout })

test('a timed-out standalone run removes only its verified immutable container ID with bounded calls', () => {
  const calls: string[][] = []
  const timeout = new Error('synthetic Docker client timeout')
  const container = ownedContainer((args: string[], options?: { timeout?: number; acceptFailure?: boolean }) => {
    calls.push(args)
    if (args[0] === 'run') { assert.ok(args.includes(name)); assert.ok(args.includes(`dailylogger.runtime-smoke.owner=${owner}`)); throw timeout }
    assert.equal(options?.timeout, 5000); assert.equal(options?.acceptFailure, true)
    if (args[1] === 'ls') return ok(id + '\n')
    if (args[0] === 'inspect') return ok(JSON.stringify({ id, name: '/' + name, owner }))
    assert.deepEqual(args, ['container', 'rm', '--force', id]); return ok()
  }, name, owner)
  assert.throws(() => { try { container.run(['--rm', 'synthetic-image']) } finally { container.cleanup() } }, error => error === timeout)
  assert.equal(calls.filter(args => args[1] === 'rm').length, 1)
})

test('name/label collisions never remove an unverified container', () => {
  for (const identity of [{ id, name: '/' + name, owner: 'someone-else' }, { id, name: '/different-container', owner }]) {
    let removed = false
    const container = ownedContainer((args: string[]) => {
      if (args[1] === 'ls') return ok(id + '\n')
      if (args[0] === 'inspect') return ok(JSON.stringify(identity))
      removed = true; return ok()
    }, name, owner)
    assert.throws(() => container.cleanup(), /ownership mismatch/)
    assert.equal(removed, false)
  }
})

test('already removed containers and an auto-removal inspection race require no force removal', () => {
  for (const race of [false, true]) {
    let listings = 0, removed = false
    const container = ownedContainer((args: string[]) => {
      if (args[1] === 'ls') return ok(race && listings++ === 0 ? id + '\n' : '')
      if (args[0] === 'inspect') return { status: 1, stdout: '' }
      removed = true; return ok()
    }, name, owner)
    assert.doesNotThrow(() => container.cleanup())
    assert.equal(removed, false)
  }
})

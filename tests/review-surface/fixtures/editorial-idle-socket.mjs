import assert from 'node:assert/strict'
import { execFile, execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { Socket } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const [mode, state, root] = process.argv.slice(2)
const self = fileURLToPath(import.meta.url)
const credential = 'OFFLINE_SYNTHETIC_CREDENTIAL'
const commentPath = '/repos/ojfbot/daily-logger/issues/416/comments'
const marker = name => join(state, name)

if (mode === 'peer') {
  let warmSocket, closed = false, nextSocket = 0
  const sockets = new Map()
  const server = http.createServer(async (request, response) => {
    assert.equal(request.socket.remoteAddress, '127.0.0.1')
    assert.equal(request.headers.authorization, `Bearer ${credential}`)
    console.log(JSON.stringify({ event: 'request', method: request.method, socket: sockets.get(request.socket) }))
    response.setHeader('content-type', 'application/json')
    response.setHeader('connection', 'keep-alive')
    response.setHeader('keep-alive', 'timeout=60')
    if (request.method === 'GET' && request.url === '/user') {
      warmSocket = request.socket
      response.end(JSON.stringify({ login: 'ojfbot' }))
      return
    }
    assert.equal(request.method, 'POST')
    assert.equal(request.url, commentPath)
    let body = ''
    for await (const chunk of request) { body += chunk; assert(body.length <= 4096) }
    const parsed = JSON.parse(body)
    assert(parsed.body.startsWith('## Editorial execution receipt'))
    response.statusCode = 201
    response.end(JSON.stringify({ id: 42, body: parsed.body,
      html_url: 'https://github.com/ojfbot/daily-logger/pull/416#issuecomment-42',
      user: { login: 'github-actions[bot]' }, author_association: 'MEMBER',
      created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T00:00:00Z' }))
  })
  server.keepAliveTimeout = 60000
  server.keepAliveTimeoutBuffer = 0
  const poll = setInterval(() => {
    if (!closed && warmSocket && existsSync(marker('child-started'))) { closed = true; warmSocket.destroy() }
  }, 5)
  server.on('connection', socket => {
    sockets.set(socket, ++nextSocket)
    socket.on('close', () => { if (socket === warmSocket) writeFileSync(marker('peer-closed'), 'closed') })
  })
  server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ event: 'ready', port: server.address().port })))
  const close = () => { clearInterval(poll); server.closeAllConnections(); server.close() }
  const deadline = setTimeout(() => { close(); process.exitCode = 1 }, 6000)
  process.on('SIGTERM', () => { clearTimeout(deadline); close() })
} else if (mode === 'child') {
  const pause = new Int32Array(new SharedArrayBuffer(4))
  writeFileSync(marker('child-started'), 'started')
  const deadline = Date.now() + 2000
  while (!existsSync(marker('peer-closed'))) {
    if (Date.now() > deadline) throw Error('Peer close deadline')
    Atomics.wait(pause, 0, 0, 5)
  }
  const release = Date.now() + 250
  while (!existsSync(marker('parent-observed-close')) && Date.now() < release) Atomics.wait(pause, 0, 0, 5)
  process.stdout.write(JSON.stringify({ peerClosed: true, parentAcknowledged: existsSync(marker('parent-observed-close')) }))
} else {
  assert(mode === 'sync' || mode === 'async')
  const peer = spawn(process.execPath, [self, 'peer', state], { env: {}, stdio: ['ignore', 'pipe', 'pipe'] })
  const events = [], sockets = new WeakSet(), emit = Socket.prototype.emit
  let pending = '', peerStderr = '', heartbeats = 0, attempts = 0, delivered = false, errorCode = null, child
  peer.stderr.on('data', chunk => { peerStderr += chunk; assert(peerStderr.length <= 4096) })
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Peer startup deadline')), 2000)
    peer.once('error', reject)
    peer.once('exit', code => { clearTimeout(timeout); reject(Error(`Peer exited ${code}`)) })
    peer.stdout.on('data', chunk => {
      pending += chunk
      assert(pending.length <= 8192)
      let end
      while ((end = pending.indexOf('\n')) >= 0) {
        const event = JSON.parse(pending.slice(0, end)); pending = pending.slice(end + 1); events.push(event)
        if (event.event === 'ready') { clearTimeout(timeout); resolve(event.port) }
      }
    })
  })
  try {
    const port = await ready
    const source = readFileSync(join(root, '.github/scripts/continue-editorial.ts'), 'utf8')
    const start = source.indexOf('  const github: GitHub ='), end = source.indexOf('  const execution =', start)
    assert(start >= 0 && end > start)
    const adapter = source.slice(start, end).replace(': GitHub', '')
    const github = new Function('fetch', 'token', adapter + ';return github')(async (url, options) => {
      const target = new URL(url)
      assert.equal(target.origin, 'https://api.github.com')
      assert(target.pathname === '/user' || target.pathname === commentPath)
      assert(['GET', 'POST'].includes(options?.method ?? 'GET'))
      if (options?.method === 'POST') { assert.equal(target.pathname, commentPath); assert.equal(++attempts, 1) }
      return fetch(`http://127.0.0.1:${port}${target.pathname}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(1500) })
    }, credential)
    const { createReviewSource } = await import(pathToFileURL(join(root, 'api/_lib/article-review-sources.ts')).href)
    Socket.prototype.emit = function (event, ...args) {
      if (event === 'connect' && this.remoteAddress === '127.0.0.1' && this.remotePort === port) sockets.add(this)
      const result = emit.call(this, event, ...args)
      if (event === 'close' && sockets.has(this)) writeFileSync(marker('parent-observed-close'), 'observed')
      return result
    }
    assert.equal((await (await github('/user')).json()).login, 'ojfbot')
    await new Promise(setImmediate)
    const heartbeat = setInterval(() => heartbeats++, 10)
    const args = [self, 'child', state], options = { encoding: 'utf8', timeout: 3000, maxBuffer: 4096 }
    try {
      if (mode === 'sync') child = JSON.parse(execFileSync(process.execPath, args, options))
      else {
        const run = promisify(execFile)(process.execPath, args, options)
        run.child.stdin.end()
        child = JSON.parse((await run).stdout)
      }
    } finally { clearInterval(heartbeat) }
    try {
      await createReviewSource(github).postComment(416, '## Editorial execution receipt\n{"outcome":"uncertain","reason":"OFFLINE fixture only"}')
      delivered = true
    } catch (error) { errorCode = error.cause?.code ?? error.code ?? error.name }
    console.log(JSON.stringify({ mode, node: process.version, adapterSha256: createHash('sha256').update(adapter).digest('hex'),
      child, heartbeats, attempts, delivered, errorCode, events, peerStderr, externalCalls: 0, providerCalls: 0 }))
  } finally {
    Socket.prototype.emit = emit
    peer.kill('SIGTERM')
    if (peer.exitCode === null && peer.signalCode === null) await new Promise(resolve => peer.once('exit', resolve))
  }
}

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID, X509Certificate } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { preparePrivateIngress, PROXY_IMAGE } from './prepare-ingress.ts'

const [image, ...extra] = process.argv.slice(2)
assert.ok(image && extra.length === 0, 'Usage: pnpm service:ingress:smoke IMAGE')
const root = mkdtempSync(join(tmpdir(), 'dailylogger-tls-proof-'))
const base = fileURLToPath(new URL('./compose.yaml', import.meta.url))
const project = `dailylogger-tls-${randomUUID().slice(0, 8)}`
const clients = { allowed: `${project}-allowed`, denied: `${project}-denied`, outside: `${project}-outside`, fault: `${project}-fault` }
const outsideNetwork = `${project}-outside`
const password = randomUUID()
const origin = 'https://dailylogger.test:8443'
const environment = { ...process.env, DAILYLOGGER_RUNTIME_IMAGE: image, DAILYLOGGER_DATABASE_PASSWORD: password,
  DAILYLOGGER_DATABASE_URL: `postgresql://dailylogger:${password}@database:5432/dailylogger`,
  DAILYLOGGER_PRIVATE_ORIGIN: origin, DAILYLOGGER_OWNER_GITHUB_ID: '42',
  DAILYLOGGER_GITHUB_CLIENT_ID: 'tls-fixture-client', DAILYLOGGER_GITHUB_CLIENT_SECRET: 'tls-fixture-secret',
  DAILYLOGGER_TLS_DIRECTORY: join(root, 'leaf'), DAILYLOGGER_INGRESS_CONFIG_DIR: join(root, 'ingress') }
let withOverlay = false, failed = false
let capturedLogs = ''

function command(binary, args, { input, timeout = 30000, acceptFailure = false } = {}) {
  const result = spawnSync(binary, args, { input, env: environment, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 })
  if (!acceptFailure && (result.error || result.status !== 0)) {
    throw new Error(`TLS proof command failed: ${binary} ${args[0]}; exit ${result.status}; ${result.stderr.slice(-3000) || result.error?.message || ''}\n${result.stdout.slice(-5000)}`)
  }
  return result
}
const docker = (args, options) => command('docker', args, options)
const compose = (args, options) => docker(['compose', '-p', project, '-f', base,
  ...(withOverlay ? ['-f', join(root, 'ingress/compose.json')] : []), ...args], options)
const container = service => compose(['ps', '-q', service]).stdout.trim()
const inspect = id => JSON.parse(docker(['inspect', id]).stdout)[0]
const node = (name, code) => docker(['exec', '-i', name, 'node', '--input-type=module'], { input: code }).stdout
const application = code => node(container('api'), code)
const readJson = text => JSON.parse(text.trim())
const openssl = args => command('openssl', args)
const captureLogs = () => { capturedLogs += compose(['logs', '--no-color', 'proxy', 'api']).stdout }
const actor = 'github:42'
const credential = randomBytes(32).toString('base64url')
const csrf = randomBytes(32).toString('base64url')
const cookie = `__Host-dailylogger_session=${credential}`
const canaries = { code: `callback-code-${randomUUID()}`, state: randomBytes(32).toString('base64url'),
  cookie: `cookie-${randomUUID()}`, authorization: `authorization-${randomUUID()}` }

async function waitFor(read, timeout = 20000) {
  const end = Date.now() + timeout
  let lastError
  while (Date.now() < end) {
    try { const result = read(); if (result) return result } catch (error) { lastError = error }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('TLS proof did not reach expected state', { cause: lastError })
}

function createLeaf(generation, serial) {
  const directory = join(root, 'leaf/generations', generation)
  mkdirSync(directory, { recursive: true, mode: 0o755 })
  openssl(['req', '-new', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
    '-keyout', join(directory, 'privkey.pem'), '-out', join(root, 'leaf.csr'), '-subj', '/CN=dailylogger.test'])
  writeFileSync(join(root, 'leaf.ext'), 'subjectAltName=DNS:dailylogger.test\nextendedKeyUsage=serverAuth\nbasicConstraints=critical,CA:FALSE\n')
  openssl(['x509', '-req', '-in', join(root, 'leaf.csr'), '-CA', join(root, 'issuer/root.crt'),
    '-CAkey', join(root, 'issuer/root.key'), '-set_serial', String(serial), '-days', '2',
    '-extfile', join(root, 'leaf.ext'), '-out', join(directory, 'fullchain.pem')])
  chmodSync(join(directory, 'privkey.pem'), 0o600)
  const certificate = new X509Certificate(readFileSync(join(directory, 'fullchain.pem')))
  const issuance = { scope: 'disposable-CI', serialNumber: certificate.serialNumber,
    fingerprint256: certificate.fingerprint256, dnsName: 'dailylogger.test' }
  writeFileSync(join(directory, 'issuance.json'), JSON.stringify(issuance))
  // Only throwaway fixture keys are transferred to the tested runtime UID.
  command('sudo', ['chown', '1000:1000', join(directory, 'privkey.pem')])
  return issuance
}

function startClient(name, network) {
  docker(['run', '-d', '--name', name, '--network', network, '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,mode=1777,size=16m',
    '-v', `${join(root, 'issuer/root.crt')}:/trust/root.crt:ro`, image, '-e', 'setInterval(()=>{},1000)'])
}
function request(name, { path = '/v1/auth/me', method = 'GET', headers = {}, body, peer = 'proxy', urlOrigin = origin, trust = true, captureFailure = false } = {}) {
  return readJson(node(name, `
    import {request} from 'node:https'; import {lookup} from 'node:dns'; import {readFileSync} from 'node:fs';
    const response=await new Promise((resolve,reject)=>{
      const req=request(new URL(${JSON.stringify(path)},${JSON.stringify(urlOrigin)}),{
        ca:${trust ? "readFileSync('/trust/root.crt')" : 'undefined'},servername:${JSON.stringify(new URL(urlOrigin).hostname)},
        method:${JSON.stringify(method)},headers:${JSON.stringify(headers)},
        lookup:(host,options,callback)=>lookup(${JSON.stringify(peer)},options,callback)
      },res=>{let body='';const cert=res.socket.getPeerCertificate();res.on('data',chunk=>body+=chunk);res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body,serial:cert.serialNumber,fingerprint256:cert.fingerprint256}))});
      req.on('error',reject);req.setTimeout(3000,()=>req.destroy(new Error('TLS proof request timeout')));req.end(${JSON.stringify(body)});
    }).catch(error=>{if(${JSON.stringify(captureFailure)})return{errorCode:error.code};throw error});console.log(JSON.stringify(response));
  `))
}
function cannotConnect(name, host, port) {
  return readJson(node(name, `
    import {connect} from 'node:net';
    const connected=await new Promise(resolve=>{const socket=connect({host:${JSON.stringify(host)},port:${port}});
      socket.setTimeout(1200);socket.once('connect',()=>{socket.destroy();resolve(true)});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false)})});
    console.log(JSON.stringify(!connected));
  `))
}

try {
  mkdirSync(join(root, 'issuer'), { mode: 0o700 })
  mkdirSync(join(root, 'leaf'), { mode: 0o755 })
  openssl(['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
    '-keyout', join(root, 'issuer/root.key'), '-out', join(root, 'issuer/root.crt'), '-days', '2',
    '-subj', '/CN=DailyLogger disposable CI CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign'])
  chmodSync(join(root, 'issuer/root.crt'), 0o644)
  createLeaf('generation-1', 1)
  symlinkSync('generations/generation-1', join(root, 'leaf/current'))
  compose(['up', '-d', '--wait', 'database'], { timeout: 120000 })
  compose(['run', '--rm', 'migrate'])
  compose(['up', '-d', 'api'])
  const ordinaryNetwork = `${project}_oauth-outbound`
  startClient(clients.allowed, ordinaryNetwork)
  startClient(clients.denied, ordinaryNetwork)
  docker(['network', 'create', outsideNetwork])
  startClient(clients.outside, outsideNetwork)
  const edge = readJson(docker(['network', 'inspect', ordinaryNetwork]).stdout)[0]
  const allowedIp = inspect(clients.allowed).NetworkSettings.Networks[ordinaryNetwork].IPAddress
  const gateway = edge.IPAM.Config[0].Gateway
  await waitFor(() => readJson(application(`
    import{request}from'node:http';
    const status=await new Promise((resolve,reject)=>{const req=request('http://127.0.0.1:4300/v1/auth/me',{headers:{Host:'dailylogger.test:8443'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});req.on('error',reject);req.end()});console.log(JSON.stringify(status));
  `)) === 401)
  const apiAddress = inspect(container('api')).NetworkSettings.Networks[ordinaryNetwork].IPAddress
  assert.equal(cannotConnect(clients.allowed, apiAddress, 4300), true, 'Base production entrypoint must retain loopback')
  preparePrivateIngress({ origin, bindIpv4: '127.0.0.1', allowedPeerCidrs: [`${allowedIp}/32`, `${gateway}/32`] }, join(root, 'ingress'))
  withOverlay = true
  const merged = readJson(compose(['config', '--format', 'json']).stdout)
  assert.equal(merged.services.api.ports?.length ?? 0, 0)
  assert.equal(merged.services.database.ports?.length ?? 0, 0)
  assert.equal(merged.services.proxy.ports.length, 1)
  const adapted = readJson(docker(['run', '--rm', '-v', `${join(root, 'ingress/Caddyfile')}:/etc/caddy/Caddyfile:ro`,
    '--entrypoint', 'caddy', PROXY_IMAGE, 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']).stdout)
  assert.ok(adapted.logging.logs.default.exclude.includes('http'))
  assert.equal(adapted.admin.disabled, true)
  for (const key of ['DAILYLOGGER_TLS_DIRECTORY', 'DAILYLOGGER_INGRESS_CONFIG_DIR']) {
    const original = environment[key]
    const missing = join(root, `missing-${key}`)
    environment[key] = missing
    try {
      const rejected = compose(['run', '--rm', '--no-deps', 'proxy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], { acceptFailure: true })
      assert.equal(rejected.error, undefined)
      assert.ok(Number.isInteger(rejected.status) && rejected.status > 0)
      assert.ok(rejected.stderr.includes(missing))
      assert.match(rejected.stderr, /bind|mount/i)
      assert.match(rejected.stderr, /does not exist|no such file or directory/i)
      assert.equal(existsSync(missing), false, 'Missing bind sources must not be created')
    } finally { environment[key] = original }
  }
  compose(['up', '-d', 'api', 'worker', 'proxy'])
  try { await waitFor(() => request(clients.allowed).status === 401) }
  catch (error) {
    const states = Object.fromEntries(['api', 'proxy'].map(service => {
      const info = inspect(container(service))
      return [service, { status: info.State.Status, exitCode: info.State.ExitCode,
        addresses: Object.values(info.NetworkSettings.Networks).map(network => network.IPAddress) }]
    }))
    const dns = readJson(node(clients.allowed, "import{lookup}from'node:dns/promises';console.log(JSON.stringify(await lookup('proxy',{all:true}).catch(error=>({code:error.code}))))"))
    const messages = compose(['logs', '--no-color', 'proxy', 'api']).stdout.split('\n').flatMap(line => {
      try {
        const record = JSON.parse(line.slice(line.indexOf('{')))
        return typeof record.msg === 'string' ? [{ level: record.level, message: record.msg.slice(0, 300), error: String(record.error ?? '').slice(0, 300) }] : []
      } catch { return [] }
    })
    console.log(JSON.stringify({ startupDiagnostic: { states, dns, messages } }))
    throw error
  }
  const published = docker(['run', '--rm', '-i', '--network', 'host', '--read-only',
    '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,mode=1777,size=16m',
    '-v', `${join(root, 'issuer/root.crt')}:/trust/root.crt:ro`, image, '--input-type=module'], { input: `
      import{request}from'node:https';import{readFileSync}from'node:fs';import{lookup}from'node:dns';
      const status=await new Promise((resolve,reject)=>{const req=request('${origin}/v1/auth/me',{ca:readFileSync('/trust/root.crt'),lookup:(host,options,cb)=>lookup('127.0.0.1',options,cb)},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});req.on('error',reject);req.setTimeout(3000,()=>req.destroy(new Error('Published TLS timeout')));req.end()});
      if(status!==401)throw new Error('Published TLS must return unauthenticated401');console.log('Published TLS verified');
    ` })
  assert.ok(published.stdout.includes('Published TLS verified'))
  const proxyInfo = inspect(container('proxy'))
  assert.equal(proxyInfo.Config.User, '1000:1000')
  assert.equal(proxyInfo.HostConfig.ReadonlyRootfs, true)
  assert.deepEqual(Object.keys(proxyInfo.NetworkSettings.Networks), [ordinaryNetwork])
  assert.deepEqual(Object.keys(proxyInfo.HostConfig.PortBindings), ['8443/tcp'])
  assert.deepEqual(proxyInfo.HostConfig.PortBindings['8443/tcp'], [{ HostIp: '127.0.0.1', HostPort: '8443' }])
  assert.ok(proxyInfo.Mounts.some(mount => mount.Destination === '/tls' && mount.RW === false))
  assert.equal(proxyInfo.Config.Env.some(value => /^DAILYLOGGER_(?:DATABASE|GITHUB)/.test(value)), false)
  for (const service of ['api', 'database']) {
    const info = inspect(container(service))
    assert.equal(Object.keys(info.HostConfig.PortBindings ?? {}).length, 0)
    for (const network of Object.values(info.NetworkSettings.Networks)) {
      assert.equal(cannotConnect(clients.outside, network.IPAddress, service === 'api' ? 4300 : 5432), true)
    }
  }
  const denied = request(clients.denied, { headers: { 'X-Forwarded-For': allowedIp, Forwarded: `for=${allowedIp}` } })
  assert.equal(denied.status, 403); assert.equal(denied.headers['cache-control'], 'no-store')
  for (const host of ['foreign.test:8443', 'dailylogger.test:9999']) {
    const response = request(clients.allowed, { headers: { Host: host } })
    assert.equal(response.status, 403); assert.equal(response.headers['cache-control'], 'no-store')
  }
  const wrongName = request(clients.allowed, { urlOrigin: 'https://wrong-name.test:8443', captureFailure: true })
  assert.ok(['ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR', 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE'].includes(wrongName.errorCode))
  const untrusted = request(clients.allowed, { trust: false, captureFailure: true })
  assert.ok(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(untrusted.errorCode))
  const callbackPath = `/v1/auth/callback?code=${canaries.code}&state=${canaries.state}`
  const privateHeaders = { Cookie: canaries.cookie, Authorization: canaries.authorization }
  assert.equal(request(clients.allowed, { path: callbackPath, headers: privateHeaders }).status, 403)
  assert.equal(request(clients.denied, { path: callbackPath, headers: privateHeaders }).status, 403)
  const login = request(clients.allowed, { path: '/v1/auth/login' })
  assert.equal(login.status, 302)
  assert.equal(new URL(login.headers.location).searchParams.get('redirect_uri'), `${origin}/v1/auth/callback`)
  assert.equal(new URL(login.headers.location).searchParams.get('code_challenge_method'), 'S256')
  assert.match(login.headers['set-cookie'][0], /Secure; HttpOnly; SameSite=Lax; Path=\//)
  assert.equal(login.headers['set-cookie'][0].includes('Domain='), false)
  const hash = createHash('sha256').update(credential).digest('hex')
  application(`
    import pg from'pg';const pool=new pg.Pool({connectionString:process.env.DAILYLOGGER_DATABASE_URL});
    try{await pool.query("INSERT INTO dailylogger_service.owner_sessions(session_hash,actor_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",${JSON.stringify([hash, actor, csrf])})}finally{await pool.end()}
  `)
  const authenticatedHeaders = { Cookie: cookie }
  const me = request(clients.allowed, { headers: authenticatedHeaders })
  assert.equal(me.status, 200)
  const mutationHeaders = { ...authenticatedHeaders, Origin: origin, 'X-CSRF-Token': csrf, 'Idempotency-Key': 'tls-command', 'Content-Type': 'application/json' }
  const admitted = request(clients.allowed, { path: '/v1/fixture/runs', method: 'POST', headers: mutationHeaders, body: '{}' })
  assert.equal(admitted.status, 202)
  const receipt = JSON.parse(admitted.body)
  const waiting = await waitFor(() => {
    const view = request(clients.allowed, { path: `/v1/runs/${receipt.runId}`, headers: authenticatedHeaders })
    assert.equal(view.status, 200); const value = JSON.parse(view.body); return value.resumeTarget ? value : false
  })
  const stable = () => {
    assert.equal(request(clients.allowed, { headers: authenticatedHeaders }).body, me.body)
    const state = JSON.parse(request(clients.allowed, { path: `/v1/runs/${receipt.runId}`, headers: authenticatedHeaders }).body)
    assert.equal(state.checkpointId, waiting.checkpointId)
    assert.equal(state.runId, waiting.runId)
    const replay = request(clients.allowed, { path: '/v1/fixture/runs', method: 'POST', headers: mutationHeaders, body: '{}' })
    assert.equal(replay.status, 202); assert.equal(replay.body, admitted.body)
  }
  let proxyId = container('proxy'), apiId = container('api')
  captureLogs()
  compose(['up', '-d', '--no-deps', '--force-recreate', 'api'])
  assert.notEqual(container('api'), apiId); assert.equal(container('proxy'), proxyId)
  await waitFor(() => request(clients.allowed, { headers: authenticatedHeaders }).status === 200)
  stable()
  apiId = container('api')
  const apiStartedAt = inspect(apiId).State.StartedAt
  captureLogs()
  compose(['up', '-d', '--no-deps', '--force-recreate', 'proxy'])
  assert.notEqual(container('proxy'), proxyId); assert.equal(container('api'), apiId)
  assert.equal(inspect(apiId).State.StartedAt, apiStartedAt)
  await waitFor(() => request(clients.allowed, { headers: authenticatedHeaders }).status === 200)
  stable()
  const issuance = createLeaf('generation-2', 2)
  symlinkSync('generations/generation-2', join(root, 'leaf/current.next'))
  renameSync(join(root, 'leaf/current.next'), join(root, 'leaf/current'))
  compose(['restart', 'proxy'])
  await waitFor(() => request(clients.allowed).fingerprint256 === issuance.fingerprint256)
  assert.equal(request(clients.allowed).serial, issuance.serialNumber)
  assert.equal(container('api'), apiId)
  assert.equal(inspect(apiId).State.StartedAt, apiStartedAt)
  stable()
  const badOrigin = request(clients.allowed, { path: '/v1/fixture/runs', method: 'POST',
    headers: { ...mutationHeaders, Origin: 'https://foreign.test' }, body: '{}' })
  assert.equal(badOrigin.status, 403)
  const logout = request(clients.allowed, { path: '/v1/auth/logout', method: 'POST', headers: mutationHeaders, body: '{}' })
  assert.equal(logout.status, 204)
  assert.equal(request(clients.allowed, { headers: authenticatedHeaders }).status, 401)
  compose(['stop', 'api'])
  const unavailable = request(clients.allowed, { path: callbackPath, headers: privateHeaders })
  assert.equal(unavailable.status, 503)
  assert.equal(unavailable.headers['cache-control'], 'no-store')
  captureLogs()
  const faultServer = `
    const {createServer}=require('node:http'),{writeFileSync}=require('node:fs');let count=0;
    createServer((req,res)=>{if(req.method==='POST'){writeFileSync('/tmp/count',String(++count));req.resume();req.on('end',()=>req.socket.destroy())}else{res.end('ready')}})
      .listen(4300,'0.0.0.0',()=>writeFileSync('/tmp/ready','ready'));
  `
  docker(['run', '-d', '--name', clients.fault, '--network', ordinaryNetwork, '--network-alias', 'api',
    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,mode=1777,size=16m', image, '-e', faultServer])
  await waitFor(() => readJson(node(clients.fault, "import{existsSync}from'node:fs';console.log(JSON.stringify(existsSync('/tmp/ready')))")))
  compose(['up', '-d', '--no-deps', '--force-recreate', 'proxy'])
  await waitFor(() => request(clients.allowed).status === 200)
  const uncertain = request(clients.allowed, { path: '/v1/fixture/runs', method: 'POST', body: '{}',
    headers: { ...privateHeaders, 'Idempotency-Key': 'proxy-no-retry', 'Content-Type': 'application/json' } })
  assert.equal(uncertain.status, 503)
  assert.equal(Number(node(clients.fault, "import{readFileSync}from'node:fs';console.log(readFileSync('/tmp/count','utf8'))")), 1)
  const logs = capturedLogs + compose(['logs', '--no-color', 'proxy', 'api']).stdout
  for (const value of [...Object.values(canaries), credential, csrf]) assert.equal(logs.includes(value), false, 'Proxy/app logs must exclude private request values')
  console.log(JSON.stringify({ proof: 'private-tls-proxy', strictTls: true, defaultLoopback: true, peerAcl: 'passed',
    hostPort: 'preserved', independentContainerRecreation: 'passed', leafReplacement: 'passed',
    sessionsAndCommands: 'preserved', logout: 'revoked', mutationForwardCount: 1, logCanaries: 'absent', realGithubLogin: 'not-qualified' }))
} catch (error) { failed = true; throw error }
finally {
  for (const name of Object.values(clients)) docker(['rm', '-f', name], { acceptFailure: true })
  docker(['network', 'rm', outsideNetwork], { acceptFailure: true })
  const cleanup = compose(['down', '--volumes', '--remove-orphans'], { timeout: 45000, acceptFailure: true })
  rmSync(root, { recursive: true, force: true })
  if ((cleanup.error || cleanup.status !== 0) && !failed) throw new Error('Private TLS proof cleanup failed')
}

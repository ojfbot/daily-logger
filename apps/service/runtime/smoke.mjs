import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const [image, ...extra] = process.argv.slice(2)
assert.ok(image && extra.length === 0, 'Usage: pnpm service:runtime:smoke IMAGE')
const composeFile = fileURLToPath(new URL('./compose.yaml', import.meta.url))
const httpTests = fileURLToPath(new URL('../test/http', import.meta.url))
const deliveryTests = fileURLToPath(new URL('../test/delivery', import.meta.url))
const project = `dailylogger-runtime-${randomUUID().slice(0, 8)}`
const password = randomUUID()
const environment = { ...process.env, DAILYLOGGER_RUNTIME_IMAGE: image,
  DAILYLOGGER_DATABASE_PASSWORD: password,
  DAILYLOGGER_DATABASE_URL: `postgresql://dailylogger:${password}@database:5432/dailylogger`,
  DAILYLOGGER_TEST_DATABASE_URL: `postgresql://dailylogger:${password}@database:5432/dailylogger`,
  DAILYLOGGER_PRIVATE_ORIGIN: 'https://dailylogger.invalid', DAILYLOGGER_OWNER_GITHUB_ID: '151410806',
  DAILYLOGGER_GITHUB_CLIENT_ID: 'runtime-fixture-client', DAILYLOGGER_GITHUB_CLIENT_SECRET: 'runtime-fixture-secret' }

function docker(args, { input, acceptFailure = false, timeout = 30000 } = {}) {
  const result = spawnSync('docker', args, { env: environment, input, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 })
  if (!acceptFailure && (result.error || result.status !== 0)) {
    throw new Error(`Runtime proof Docker command failed: ${args[0]}; exit ${result.status}; ${result.stderr.slice(-4000) || result.error?.message || ''}\n${result.stdout.slice(-6000)}`)
  }
  return result
}
const compose = (args, options) => docker(['compose', '-p', project, '-f', composeFile, ...args], options)
const script = (service, input) => compose(['exec', '-T', service, 'node', '--import', 'tsx', '--input-type=module'], { input }).stdout
const cli = (service, args) => JSON.parse(script(service, `
  import { execFileSync } from 'node:child_process';
  const value = execFileSync(process.execPath, ['--import','tsx','src/delivery-cli.ts',...${JSON.stringify(args)}], {encoding:'utf8'});
  console.log(value);
`))
const enqueue = request => {
  const value = JSON.parse(script('api', `
    import { writeFileSync } from 'node:fs';
    import { execFileSync } from 'node:child_process';
    writeFileSync('/tmp/runtime-request.json',${JSON.stringify(JSON.stringify(request))},{mode:0o600});
    console.log(execFileSync(process.execPath,['--import','tsx','src/delivery-cli.ts','enqueue','--request','/tmp/runtime-request.json'],{encoding:'utf8'}));
  `))
  assert.equal(value.status, 202)
  return JSON.parse(value.body)
}
async function waitFor(read, timeout = 20000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try { const value = read(); if (value) return value } catch (error) { lastError = error }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Runtime image did not reach expected state', { cause: lastError })
}

let failed = false
try {
  const offline = docker(['run', '--rm', '-i', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,mode=1777,size=64m', image,
    '--input-type=module'], { input: `
      import assert from 'node:assert/strict';
      import { execFileSync } from 'node:child_process';
      import { existsSync,readFileSync,writeFileSync } from 'node:fs';
      import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
      import { readFixture,reviewFixture } from './src/fixture.ts';
      assert.equal(process.getuid(),1000);
      assert.equal(existsSync('test'),false);
      assert.equal(existsSync('/app/.git/objects/info/alternates'),false);
      assert.equal(existsSync('/app/.git/logs'),false);
      assert.equal(execFileSync('git',['-C','/app','remote'],{encoding:'utf8'}),'');
      assert.throws(()=>writeFileSync('/app/runtime-write-canary','forbidden'));
      const native=SqliteSaver.fromConnString(':memory:'); native.db.close();
      const fixture=readFixture(),review=reviewFixture(fixture);
      const context=JSON.parse(readFileSync('/app/runtime-context.json','utf8'));
      assert.equal(review.articleSha256,context.articleSha256);
      assert.equal(review.actionsSha256,context.actionsSha256);
      await import('./src/http-server.ts'); await import('./src/delivery-worker.ts');
      console.log(JSON.stringify({proof:'offline-final-image',node:process.version,git:execFileSync('git',['--version'],{encoding:'utf8'}).trim(),uid:process.getuid(),fixtureCommit:context.fixtureCommit,nativeSqlite:'passed'}));
    ` })
  process.stdout.write(offline.stdout)
  const config = JSON.parse(compose(['config', '--format', 'json']).stdout)
  for (const service of Object.values(config.services)) assert.equal(service.ports?.length ?? 0, 0)
  compose(['up', '-d', '--wait', 'database'], { timeout: 120000 })
  const uninitialized = compose(['run', '--rm', '--no-deps', 'api'], { acceptFailure: true, timeout: 20000 })
  assert.equal(uninitialized.status, 1, 'Production API must reject an unmigrated database')
  compose(['run', '--rm', 'migrate'])
  compose(['run', '--rm', 'migrate'])
  compose(['up', '-d', 'api', 'worker'])
  await waitFor(() => {
    const response = JSON.parse(script('api', `
      import { request } from 'node:http';
      const result=await new Promise((resolve,reject)=>{const req=request('http://127.0.0.1:4300/v1/auth/me',{headers:{Host:'dailylogger.invalid'}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,cache:res.headers['cache-control']}))});req.on('error',reject);req.end()});
      console.log(JSON.stringify(result));
    `))
    assert.equal(response.status, 401); assert.equal(response.cache, 'no-store'); return true
  })
  for (const service of ['api', 'worker']) {
    const id = compose(['ps', '-q', service]).stdout.trim()
    const info = JSON.parse(docker(['inspect', id]).stdout)[0]
    assert.equal(info.Config.User, '1000:1000')
    assert.equal(info.HostConfig.ReadonlyRootfs, true)
    assert.equal(Object.keys(info.HostConfig.PortBindings ?? {}).length, 0)
    assert.equal(JSON.parse(script(service, 'console.log(JSON.stringify(process.getuid()))')), 1000)
  }
  const runDir = `/var/lib/dailylogger/fixtures/proof-${randomUUID()}`
  const start = { schemaVersion: 1, actorId: 'runtime-fixture-owner', key: 'runtime-start', operation: 'start', payload: { runDir } }
  const admitted = enqueue(start)
  const waiting = await waitFor(() => { const state = cli('api', ['run', '--run-id', admitted.runId]); return state.status === 'awaiting-approval' && state.resumeTargetId ? state : false })
  assert.equal(waiting.runDir, runDir)
  compose(['stop', 'worker'])
  const workerId = compose(['ps', '-aq', 'worker']).stdout.trim()
  assert.equal(JSON.parse(docker(['inspect', workerId]).stdout)[0].State.ExitCode, 0)
  compose(['up', '-d', 'worker'])
  assert.deepEqual(enqueue(start), admitted)
  enqueue({ schemaVersion: 1, actorId: start.actorId, key: 'runtime-resume', operation: 'resume', payload: { runId: admitted.runId, resumeTargetId: waiting.resumeTargetId } })
  const complete = await waitFor(() => { const state = cli('api', ['run', '--run-id', admitted.runId]); return state.status === 'complete' ? state : false })
  assert.ok(complete.receiptSha256)
  script('api', `
    import assert from 'node:assert/strict';
    import { readFileSync,statSync } from 'node:fs';
    import { join } from 'node:path';
    import { readFixture,ARTICLE_PATH,ACTIONS_PATH } from './src/fixture.ts';
    const fixture=readFixture(),root=${JSON.stringify(runDir)};
    assert.equal(statSync(root).uid,1000);
    assert.deepEqual(readFileSync(join(root,'artifacts',ARTICLE_PATH)),fixture.article);
    assert.deepEqual(readFileSync(join(root,'artifacts',ACTIONS_PATH)),fixture.actions);
  `)
  compose(['stop', 'api', 'worker'])
  for (const service of ['api', 'worker']) {
    const id = compose(['ps', '-aq', service]).stdout.trim()
    assert.equal(JSON.parse(docker(['inspect', id]).stdout)[0].State.ExitCode, 0)
  }
  console.log(JSON.stringify({ proof: 'production-entrypoints-and-cross-container-storage', migration: 'explicit-and-repeatable', fixture: 'complete', shutdown: 'clean', publishedPorts: 0 }))
  const http = compose(['run', '--rm', '--no-deps', '-T', '-e', 'DAILYLOGGER_TEST_DATABASE_URL',
    '-v', `${httpTests}:/app/apps/service/test/http:ro`, '-v', `${deliveryTests}:/app/apps/service/test/delivery:ro`,
    'api', '--import', './test/http/faults.mjs', '--test', 'test/http/http.test.ts'], { timeout: 120000 })
  process.stdout.write(http.stdout)
  console.log(JSON.stringify({ proof: 'production-runtime-with-external-http-tests', result: 'passed', realGithubLogin: 'not-qualified' }))
} catch (error) { failed = true; throw error }
finally {
  const cleanup = compose(['down', '--volumes', '--remove-orphans'], { timeout: 45000, acceptFailure: true })
  if (cleanup.error || cleanup.status !== 0) {
    process.stderr.write(`Disposable runtime cleanup failed: ${cleanup.stderr.slice(-2000)}\n`)
    if (!failed) throw new Error('Disposable runtime cleanup failed')
  }
}

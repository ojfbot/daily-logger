import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ownedContainer } from './owned-container.mjs'

const OWNER = 'dailylogger.runtime-smoke.owner'
const SHA = /^sha256:[a-f0-9]{64}$/
const ID = /^[a-f0-9]{64}$/
const TESTS = [
  'actual API and worker CLIs remain no-op without the explicit option despite ambient SDK settings',
  'enabled strict-TLS exports correlate real HTTP admission and restarted durable-worker attempts without content',
  'a real TLS export blackhole cannot change admission, settlement or bounded CLI shutdown',
  'protected config rejection is fixed and enabled API startup failure reaps its actual exporter child',
]

/** Accept only the complete unchanged four-test suite, never a partial/skip run. */
export function exporterTapCounts(tap) {
  assert.ok(typeof tap === 'string' && Buffer.byteLength(tap) <= 1024 * 1024)
  assert.equal(/^not ok\b|^Bail out!|^\s*(?:ok|not ok) \d+[^\r\n]*#\s*(?:SKIP|TODO)\b/im.test(tap), false)
  assert.equal((tap.match(/^TAP version 13\s*$/gm) ?? []).length, 1)
  assert.deepEqual(tap.match(/^1\.\.\d+\s*$/gm)?.map(line => line.trim()), ['1..4'])
  const outcomes = [...tap.matchAll(/^ok (\d+) - (.+)$/gm)].map(([, number, name]) => [Number(number), name.trim()])
  assert.deepEqual(outcomes, TESTS.map((name, index) => [index + 1, name]))
  const rows = [...tap.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)]
  assert.equal(rows.length, 6)
  const counts = Object.fromEntries(rows.map(([, key, value]) => [key, Number(value)]))
  assert.deepEqual(counts, { tests: 4, pass: 4, fail: 0, cancelled: 0, skipped: 0, todo: 0 })
  return counts
}

/** Deliberately excludes assertion values, messages, SQL, URLs and full stacks. */
function testFailureLocations(tap) {
  const locations = [...tap.matchAll(/(?:\/app\/apps\/service\/)?(?:test\/exporter\/)(telemetry-enabled\.integration\.test\.ts|process-probe\.mjs):(\d{1,6})(?::\d{1,6})?/g)]
    .map(([, file, line]) => ({ file, line: Number(line) }))
  return [...new Map(locations.map(value => [`${value.file}:${value.line}`, value])).values()].slice(0, 6)
}

export async function exporterSmoke(image, configId) {
  assert.match(image ?? '', SHA, 'Exact already-loaded image ID required')
  assert.match(configId ?? '', SHA, 'Config ID from the same qualified artifact required')
  const owner = randomUUID(), prefix = `dl-exporter-${owner.slice(0, 8)}`
  const clientRoot = mkdtempSync(join(tmpdir(), 'dailylogger-exporter-smoke-'))
  const clientConfig = join(clientRoot, 'docker-client'); mkdirSync(clientConfig, { mode: 0o700 })
  const environment = { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' }
  const password = randomUUID()
  const connection = `postgresql://dailylogger:${password}@database:5432/dailylogger`
  const compose = readFileSync(new URL('./compose.yaml', import.meta.url), 'utf8')
  const postgresImage = compose.match(/^    image: (postgres:[^\s]+@sha256:[a-f0-9]{64})$/m)?.[1]
  const networkName = `${prefix}-network`
  const containers = []
  let networkIntended = false, phase = 'prerequisites', failure = null
  const receipt = { schemaVersion: 1, proof: 'enabled-exporter-final-image', owner, image, configId,
    result: 'failed', productionEligible: false, actualLangfuseBackend: false, indexingQualified: false,
    hostDeploymentQualified: false, publishedPorts: 0, externalNetwork: false, volumesCreated: 0,
    resourceScope: 'disposable-combined-api-worker-test-process-only', cleanup: 'pending' }

  function docker(args, { input, timeout = 15_000, acceptFailure = false } = {}) {
    const result = spawnSync('docker', ['--host', 'unix:///var/run/docker.sock', '--config', clientConfig, ...args],
      { env: environment, input, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 })
    receipt.lastDockerCall = { operation: args[0], exit: Number.isInteger(result.status) ? result.status : null,
      timedOut: result.error?.code === 'ETIMEDOUT' }
    if (!acceptFailure) assert.ok(!result.error && result.status === 0, 'Docker command failed; raw output withheld')
    return result
  }
  const text = (args, options) => docker(args, options).stdout.trim()
  const parsed = (args, options) => JSON.parse(text(args, options))
  const inspect = id => parsed(['inspect', '--type', 'container', '--format',
    `{"id":{{json .Id}},"name":{{json .Name}},"owner":{{json (index .Config.Labels "${OWNER}")}},"image":{{json .Image}},"requestedImage":{{json .Config.Image}},"user":{{json .Config.User}},"readonly":{{json .HostConfig.ReadonlyRootfs}},"init":{{json .HostConfig.Init}},"caps":{{json .HostConfig.CapDrop}},"security":{{json .HostConfig.SecurityOpt}},"ports":{{json .HostConfig.PortBindings}},"networks":{{json .NetworkSettings.Networks}},"mounts":{{json .Mounts}},"tmpfs":{{json .HostConfig.Tmpfs}},"pids":{{json .HostConfig.PidsLimit}},"memory":{{json .HostConfig.Memory}},"cpus":{{json .HostConfig.NanoCpus}},"running":{{json .State.Running}}}`, id])
  const inspectNetwork = id => parsed(['network', 'inspect', '--format',
    `{"id":{{json .Id}},"name":{{json .Name}},"owner":{{json (index .Labels "${OWNER}")}},"internal":{{json .Internal}},"ipv6":{{json .EnableIPv6}}}`, id])
  const imageInfo = image => parsed(['image', 'inspect', '--format',
    '{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}},"volumes":{{json (index .Config "Volumes")}}}', image])
  function start(role, args) {
    const name = `${prefix}-${role}`
    assert.equal(text(['container', 'ls', '--all', '--quiet', '--filter', `name=^/${name}$`]), '')
    const owned = ownedContainer(docker, name, owner)
    containers.push(owned) // Reconcile a daemon-side create even if the client times out.
    const id = owned.run(['--detach', '--pull=never', '--platform', 'linux/amd64', '--init', '--network', networkName,
      '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', ...args]).stdout.trim()
    assert.match(id, ID)
    const info = inspect(id)
    assert.equal(info.id, id); assert.equal(info.name, `/${name}`); assert.equal(info.owner, owner)
    assert.equal(info.init, true); assert.equal(info.readonly, true)
    assert.deepEqual(info.caps?.map(value => value.toUpperCase()), ['ALL'])
    assert.ok(info.security?.includes('no-new-privileges:true'))
    assert.equal(Object.keys(info.ports ?? {}).length, 0)
    assert.deepEqual(Object.keys(info.networks), [networkName])
    assert.ok(info.mounts.every(mount => mount.Type === 'bind' || mount.Type === 'tmpfs'))
    assert.equal(info.running, true)
    return { id, info }
  }
  function cleanNetwork() {
    if (!networkIntended) return
    const list = () => text(['network', 'ls', '--quiet', '--no-trunc', '--filter', `name=^${networkName}$`, '--filter', `label=${OWNER}=${owner}`])
      .split('\n').filter(Boolean)
    const ids = list()
    assert.ok(ids.length <= 1 && ids.every(id => ID.test(id)))
    if (!ids.length) return
    const info = inspectNetwork(ids[0])
    assert.equal(info.id, ids[0]); assert.equal(info.name, networkName); assert.equal(info.owner, owner)
    const removed = docker(['network', 'rm', info.id], { acceptFailure: true, timeout: 5000 })
    if (removed.error || removed.status !== 0) assert.equal(list().length, 0)
  }
  try {
    assert.ok(postgresImage, 'Pinned Compose PostgreSQL image required')
    const runtimeImage = imageInfo(image), databaseImage = imageInfo(postgresImage)
    assert.equal(runtimeImage.id, image)
    for (const info of [runtimeImage, databaseImage]) {
      assert.match(info.id, SHA)
      assert.equal(info.os, 'linux'); assert.equal(info.arch, 'amd64')
    }
    assert.equal(Object.keys(runtimeImage.volumes ?? {}).length, 0)
    assert.deepEqual(Object.keys(databaseImage.volumes ?? {}), ['/var/lib/postgresql'])
    receipt.postgresImage = postgresImage
    receipt.platform = 'linux/amd64'
    const mounts = [
      ['../test/exporter', '/app/apps/service/test/exporter', 'directory'],
      ['../test/fixtures/telemetry-tls.ts', '/app/apps/service/test/fixtures/telemetry-tls.ts', 'file'],
      ['../test/database-cleanup.ts', '/app/apps/service/test/database-cleanup.ts', 'file'],
    ].map(([relative, target, type]) => {
      const path = fileURLToPath(new URL(relative, import.meta.url)), stat = lstatSync(path)
      assert.equal(stat.isSymbolicLink(), false)
      assert.ok(type === 'directory' ? stat.isDirectory() : stat.isFile())
      const source = realpathSync.native(path)
      assert.equal(source.includes(','), false)
      return { source, target }
    })
    assert.equal(text(['network', 'ls', '--quiet', '--filter', `name=^${networkName}$`]), '')
    networkIntended = true
    const network = text(['network', 'create', '--internal', '--label', `${OWNER}=${owner}`, networkName])
    assert.match(network, ID)
    const networkInfo = inspectNetwork(network)
    assert.deepEqual(networkInfo, { id: network, name: networkName, owner, internal: true, ipv6: false })
    receipt.network = { id: network, internal: true, ipv6: false }
    phase = 'database-start'
    const db = start('database', ['--network-alias', 'database', '--user', '999:999', '--memory', '768m', '--cpus', '1', '--pids-limit', '128',
      '--tmpfs', '/var/lib/postgresql:rw,nosuid,nodev,noexec,mode=0700,uid=999,gid=999,size=256m',
      '--tmpfs', '/var/run/postgresql:rw,nosuid,nodev,noexec,mode=0770,uid=999,gid=999,size=8m',
      '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,mode=1777,size=16m',
      '--env', 'POSTGRES_USER=dailylogger', '--env', 'POSTGRES_DB=dailylogger', '--env', `POSTGRES_PASSWORD=${password}`, postgresImage])
    assert.equal(db.info.user, '999:999'); assert.equal(db.info.requestedImage, postgresImage)
    assert.match(db.info.image, SHA)
    assert.ok(db.info.mounts.every(mount => mount.Type === 'tmpfs'))
    assert.equal(db.info.memory, 768 * 1024 * 1024); assert.equal(db.info.cpus, 1_000_000_000); assert.equal(db.info.pids, 128)
    assert.deepEqual(Object.keys(db.info.tmpfs).sort(), ['/tmp', '/var/lib/postgresql', '/var/run/postgresql'])
    receipt.database = { container: db.id, requestedImage: postgresImage, inspectedImage: databaseImage.id,
      resolvedImage: db.info.image, uid: 999, gid: 999, tmpfsOnly: true }
    phase = 'database-tcp-ready'
    const deadline = performance.now() + 60_000
    for (;;) {
      // Unix-socket readiness can accidentally observe entrypoint's temporary server.
      const result = docker(['exec', '--env', `PGPASSWORD=${password}`, db.id, 'psql', '-h', '127.0.0.1',
        '-U', 'dailylogger', '-d', 'dailylogger', '-Atqc', 'SELECT 1'], { acceptFailure: true, timeout: 5000 })
      if (!result.error && result.status === 0 && result.stdout.trim() === '1') break
      assert.ok(performance.now() < deadline && inspect(db.id).running, 'PostgreSQL final TCP readiness failed')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    const pgVersion = text(['exec', '--env', `PGPASSWORD=${password}`, db.id, 'psql', '-h', '127.0.0.1',
      '-U', 'dailylogger', '-d', 'dailylogger', '-Atqc', 'SHOW server_version_num'])
    assert.match(pgVersion, /^18\d{4}$/); receipt.postgresVersionNumber = Number(pgVersion)
    phase = 'runtime-start'
    const runtime = start('tests', ['--user', '1000:1000', '--memory', '2g', '--cpus', '2', '--pids-limit', '256',
      '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,mode=1777,size=128m',
      '--env', `DAILYLOGGER_TEST_DATABASE_URL=${connection}`,
      ...mounts.flatMap(mount => ['--mount', `type=bind,src=${mount.source},dst=${mount.target},readonly`]),
      '--entrypoint', 'node', image, '--input-type=module', '-e', 'setInterval(()=>{},1000)'])
    assert.equal(runtime.info.user, '1000:1000'); assert.equal(runtime.info.requestedImage, image)
    assert.ok([image, configId].includes(runtime.info.image))
    assert.equal(runtime.info.memory, 2 * 1024 * 1024 * 1024); assert.equal(runtime.info.cpus, 2_000_000_000); assert.equal(runtime.info.pids, 256)
    assert.deepEqual(Object.keys(runtime.info.tmpfs), ['/tmp'])
    assert.deepEqual(runtime.info.mounts.filter(mount => mount.Type === 'bind').map(mount => ({ source: mount.Source, target: mount.Destination, writable: mount.RW }))
      .sort((a, b) => a.target.localeCompare(b.target)), mounts.map(mount => ({ ...mount, writable: false })).sort((a, b) => a.target.localeCompare(b.target)))
    receipt.runtime = { container: runtime.id, requestedImage: image, resolvedImage: runtime.info.image, uid: 1000, gid: 1000,
      readonly: true, init: true, pids: 256, memoryBytes: runtime.info.memory, cpus: 2, testMountsReadonly: 3 }
    phase = 'runtime-preflight'
    text(['exec', runtime.id, 'node', '--input-type=module', '-e', `
      import assert from 'node:assert/strict'; import {existsSync,statSync,writeFileSync} from 'node:fs';
      assert.equal(process.getuid(),1000); assert.equal(process.getgid(),1000);
      assert.equal(process.platform,'linux'); assert.equal(process.arch,'x64');
      for(const path of ['src/http-cli.ts','src/delivery-cli.ts','dist/telemetry/telemetry-export-child.mjs','dist/telemetry/telemetry-export-worker.mjs']) {
        assert.ok(statSync(path).isFile()); assert.throws(()=>writeFileSync(path,'forbidden'));
      }
      assert.equal(existsSync('scripts/build-telemetry.mjs'),false);
    `])
    phase = 'exporter-tests'
    const tests = docker(['exec', runtime.id, 'node', '--import', 'tsx', '--test', '--test-reporter=tap', '--test-concurrency=1',
      'test/exporter/telemetry-enabled.integration.test.ts'], { timeout: 240_000, acceptFailure: true })
    receipt.testFailureLocations = testFailureLocations(tests.stdout ?? '')
    assert.ok(!tests.error && tests.status === 0, 'Exporter tests failed; raw output withheld')
    receipt.counts = exporterTapCounts(tests.stdout)
    assert.equal(inspect(runtime.id).running, true)
    receipt.result = 'passed'
  } catch (error) {
    const sourceLine = /\/exporter-smoke\.mjs:(\d{1,6}):\d{1,6}/.exec(error instanceof Error ? error.stack ?? '' : '')
    failure = { code: 'ENABLED_IMAGE_QUALIFICATION_FAILED', phase, lastDockerCall: receipt.lastDockerCall ?? null,
      locations: [...(sourceLine ? [{ file: 'exporter-smoke.mjs', line: Number(sourceLine[1]) }] : []), ...(receipt.testFailureLocations ?? [])] }
  } finally {
    let cleanupFailed = false
    for (const container of containers.reverse()) try { container.cleanup() } catch { cleanupFailed = true }
    try { cleanNetwork() } catch { cleanupFailed = true }
    // Remove only these empty private client directories; never recurse by pathname.
    try { rmdirSync(clientConfig); rmdirSync(clientRoot) } catch { cleanupFailed = true }
    receipt.cleanup = cleanupFailed ? 'failed' : 'passed'
    if (cleanupFailed && !failure) failure = { code: 'OWNED_RESOURCE_CLEANUP_FAILED', phase: 'cleanup' }
  }
  delete receipt.testFailureLocations
  if (failure) { receipt.result = 'failed'; receipt.failure = failure }
  return receipt
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [image, configId, ...extra] = process.argv.slice(2)
  try {
    assert.equal(extra.length, 0)
    const receipt = await exporterSmoke(image, configId)
    process.stdout.write(`${JSON.stringify(receipt)}\n`)
    if (receipt.result !== 'passed') process.exitCode = 1
  } catch {
    process.stderr.write('{"proof":"enabled-exporter-final-image","result":"failed","code":"INVALID_PREREQUISITE"}\n')
    process.exitCode = 1
  }
}

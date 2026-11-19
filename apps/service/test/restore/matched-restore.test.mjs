import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { RUN_ROOT, MARKER, encode, hash, validateArchive } from './archive.mjs'
import { dockerDiagnostic, failureDiagnostic, readDriverDiagnostic } from './diagnostics.mjs'

const OWNER = 'dailylogger.restore-proof.owner'
const sourceDirectory = fileURLToPath(new URL('.', import.meta.url))
const compose = readFileSync(new URL('../../runtime/compose.yaml', import.meta.url), 'utf8')
const postgresImage = compose.match(/^    image: (postgres:[^\s]+@sha256:[a-f0-9]{64})$/m)?.[1]
assert.ok(postgresImage, 'The existing pinned runtime PostgreSQL image is required')
const rows = (snapshot, table) => snapshot.tables[`dailylogger_service.${table}`].rows
const jobs = snapshot => snapshot.tables['dailylogger_delivery.job'].rows
const find = (snapshot, table, id, key = 'run_id') => rows(snapshot, table).find(row => row[key] === id)

export function verifyPair(seal, trustedSeal, dump, files, raw) {
  assert.equal(hash(encode(seal)), trustedSeal, 'Recovery point identity changed')
  assert.equal(hash(dump), seal.dump.sha256); assert.equal(dump.length, seal.dump.size)
  assert.equal(hash(encode(files)), seal.files.sha256); assert.equal(encode(files).length, seal.files.size)
  assert.equal(hash(encode(raw)), seal.rawSha256)
  validateArchive(files)
}

test('matched database/files restore preserves authority and resumes only the fenced fixture command', { timeout: 600_000 }, async () => {
  const image = process.env.DAILYLOGGER_RESTORE_IMAGE
  const imageConfigId = process.env.DAILYLOGGER_RESTORE_CONFIG_ID
  assert.ok(/^sha256:[0-9a-f]{64}$/.test(image ?? ''), 'DAILYLOGGER_RESTORE_IMAGE must be the qualified, already-loaded exact image ID; prerequisites never skip')
  assert.ok(/^sha256:[0-9a-f]{64}$/.test(imageConfigId ?? ''), 'DAILYLOGGER_RESTORE_CONFIG_ID must come from the same qualified artifact manifest')
  const owner = randomUUID(), prefix = `dl-restore-${owner.slice(0, 8)}`
  const evidence = mkdtempSync(join(tmpdir(), 'dailylogger-matched-restore-')); chmodSync(evidence, 0o700)
  mkdirSync(join(evidence, 'docker-client'), { mode: 0o700 })
  const environment = { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' }
  const password = randomUUID(), connection = `postgresql://dailylogger:${password}@database:5432/dailylogger`
  const containers = [], networks = [], volumes = []
  let phase = 'prerequisites', failed = false, driverFailure = null
  const receipt = { schemaVersion: 1, proof: 'isolated-matched-fixture-restore', owner, image, imageConfigId, postgresImage,
    productionEligible: false, authorityEpochQualified: false, publishedPorts: 0, externalProviders: false, checks: {}, resources: {} }
  const save = (name, value) => writeFileSync(join(evidence, name), value, { flag: 'wx', mode: 0o600 })
  function docker(args, { input, timeout = 30_000, acceptFailure = false } = {}) {
    const result = spawnSync('docker', ['--host', 'unix:///var/run/docker.sock', '--config', join(evidence, 'docker-client'), ...args],
      { env: environment, input, timeout, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 * 1024 })
    receipt.lastDockerCall = dockerDiagnostic(args, result)
    if (!acceptFailure) assert.ok(!result.error && result.status === 0, `Docker ${args[0]} failed during ${phase}; raw output withheld`)
    return result
  }
  const text = (args, options) => docker(args, options).stdout.toString('utf8').trim()
  const parsed = (args, options) => JSON.parse(text(args, options))
  const inspect = id => parsed(['inspect', '--type', 'container', '--format',
    `{"id":{{json .Id}},"name":{{json .Name}},"owner":{{json (index .Config.Labels "${OWNER}")}},"image":{{json .Image}},"requestedImage":{{json .Config.Image}},"running":{{json .State.Running}},"exit":{{json .State.ExitCode}},"ports":{{json .HostConfig.PortBindings}},"network":{{json .HostConfig.NetworkMode}},"user":{{json .Config.User}},"readonly":{{json .HostConfig.ReadonlyRootfs}}}`, id])
  const inspectNetwork = id => parsed(['network', 'inspect', '--format', `{"id":{{json .Id}},"name":{{json .Name}},"owner":{{json (index .Labels "${OWNER}")}},"internal":{{json .Internal}},"ipv6":{{json .EnableIPv6}}}`, id])
  const inspectVolume = name => parsed(['volume', 'inspect', '--format', `{"name":{{json .Name}},"owner":{{json (index .Labels "${OWNER}")}},"created":{{json .CreatedAt}},"mount":{{json .Mountpoint}}}`, name])
  async function waitFor(read, timeout = 30_000) {
    const end = Date.now() + timeout
    while (Date.now() < end) { const value = read(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 100)) }
    throw new Error(`Bounded fixture condition failed during ${phase}`)
  }
  function network(role) {
    const name = `${prefix}-${role}`
    assert.equal(text(['network', 'ls', '--quiet', '--filter', `name=^${name}$`]), '')
    const record = { name, id: null }; networks.push(record)
    record.id = text(['network', 'create', '--internal', '--label', `${OWNER}=${owner}`, name])
    assert.match(record.id, /^[0-9a-f]{64}$/)
    const info = inspectNetwork(record.id)
    assert.equal(info.id, record.id); assert.equal(info.name, name); assert.equal(info.owner, owner)
    assert.equal(info.internal, true); assert.equal(info.ipv6, false)
    return name
  }
  function volume(role) {
    const name = `${prefix}-${role}`
    assert.equal(text(['volume', 'ls', '--quiet', '--filter', `name=^${name}$`]), '')
    const record = { name, observed: null, state: 'intended' }; volumes.push(record)
    assert.equal(text(['volume', 'create', '--label', `${OWNER}=${owner}`, name]), name)
    record.observed = inspectVolume(name)
    assert.equal(record.observed.name, name); assert.equal(record.observed.owner, owner)
    return name
  }
  function container(role, args) {
    const name = `${prefix}-${role}`
    assert.equal(text(['container', 'ls', '--all', '--quiet', '--filter', `name=^/${name}$`]), '')
    const record = { name, id: null }; containers.push(record)
    record.id = text(['create', '--pull=never', '--name', name, '--label', `${OWNER}=${owner}`, ...args])
    assert.match(record.id, /^[0-9a-f]{64}$/)
    const info = inspect(record.id)
    assert.equal(info.id, record.id); assert.equal(info.name, '/' + name); assert.equal(info.owner, owner)
    assert.equal(Object.keys(info.ports ?? {}).length, 0)
    text(['start', record.id]); return record.id
  }
  function runtime(role, net, files, worker = false) {
    const id = container(role, ['--network', net, '--user', '1000:1000', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--pids-limit', '256', '--memory', '512m', '--cpus', '2', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,mode=1777,size=64m',
      '--env', `DAILYLOGGER_DATABASE_URL=${connection}`, '--env', 'LANGCHAIN_TRACING_V2=false', '--env', 'LANGSMITH_TRACING=false',
      '--mount', `type=volume,src=${files},dst=/var/lib/dailylogger/fixtures`,
      '--mount', `type=bind,src=${sourceDirectory},dst=/app/apps/service/test/restore,readonly`,
      '--entrypoint', 'node', image, '--import', 'tsx', ...(worker ? ['src/delivery-cli.ts', 'work'] : ['--input-type=module', '-e', 'setInterval(()=>{},1000)'])])
    const info = inspect(id); assert.equal(info.user, '1000:1000'); assert.equal(info.readonly, true)
    assert.equal(info.requestedImage, image); assert.ok([image, imageConfigId].includes(info.image)); assert.equal(info.network, net)
    Object.assign(containers.find(record => record.id === id), { requestedImage: info.requestedImage, resolvedImage: info.image })
    return id
  }
  const driver = (id, operation, value = {}, options = {}) => {
    receipt.lastDriverOperation = operation
    const result = docker(['exec', '-i', id, 'node', '--import', 'tsx', 'test/restore/driver.mjs', operation],
      { input: encode(value), timeout: 40_000, ...options, acceptFailure: true })
    if (!options.acceptFailure && (result.error || result.status !== 0)) {
      driverFailure = readDriverDiagnostic(result.stderr, operation)
      throw new Error('Restore driver failed')
    }
    return options.acceptFailure ? result : JSON.parse(result.stdout.toString('utf8'))
  }
  const stopWorker = id => { text(['stop', '--time', '10', id], { timeout: 15_000 }); const state = inspect(id); assert.equal(state.running, false); assert.equal(state.exit, 0) }
  const request = (operation, key, payload) => ({ schemaVersion: 1, actorId: 'restore-fixture-owner', key, operation, payload })
  const admit = (id, value) => { const result = driver(id, 'admit', { request: value }); assert.equal(result.status, 202); return { request: value, response: result, ...JSON.parse(result.body) } }
  const settled = (id, commandId) => waitFor(() => { const value = driver(id, 'command', { commandId }); return value.disposition === 'succeeded' && value.job_state === 'completed' ? value : false })
  try {
    assert.equal(parsed(['image', 'inspect', '--format', '{{json .Id}}', image]), image)
    text(['image', 'inspect', '--format', '{{.Id}}', postgresImage]) // Local only: no pull/build/load.
    const sourceNet = network('source-net'), targetNet = network('target-net')
    const sourceData = volume('source-db'), targetData = volume('target-db')
    const sourceFiles = volume('source-files'), targetFiles = volume('target-files')
    const database = (role, net, data) => container(role, ['--network', net, '--network-alias', 'database',
      '--env', 'POSTGRES_USER=dailylogger', '--env', 'POSTGRES_DB=dailylogger', '--env', `POSTGRES_PASSWORD=${password}`,
      '--mount', `type=volume,src=${data},dst=/var/lib/postgresql`, postgresImage])
    const sourceDb = database('source-database', sourceNet, sourceData), targetDb = database('target-database', targetNet, targetData)
    for (const id of [sourceDb, targetDb]) await waitFor(() => docker(['exec', id, 'pg_isready', '-U', 'dailylogger', '-d', 'dailylogger'], { acceptFailure: true }).status === 0, 60_000)
    const version = id => text(['exec', id, 'psql', '-U', 'dailylogger', '-d', 'dailylogger', '-Atqc', 'SHOW server_version'])
    assert.equal(version(sourceDb), version(targetDb)); receipt.postgresVersion = version(sourceDb)
    receipt.dumpVersion = text(['exec', sourceDb, 'pg_dump', '--version'])
    receipt.restoreVersion = text(['exec', targetDb, 'pg_restore', '--version'])
    const source = runtime('source-controller', sourceNet, sourceFiles), target = runtime('target-controller', targetNet, targetFiles)
    const sourceContext = driver(source, 'initialize').context, targetContext = driver(target, 'initialize').context
    assert.deepEqual(sourceContext, targetContext); receipt.contextSha256 = hash(encode(sourceContext))
    driver(source, 'migrate')
    const dump = id => docker(['exec', id, 'pg_dump', '-U', 'dailylogger', '-d', 'dailylogger', '--format=custom', '--no-owner', '--no-acl'], { timeout: 60_000 }).stdout
    const incompatibleDump = dump(sourceDb) // A genuinely different database state for the pair-mismatch control.
    phase = 'seed-source'
    const sourceWorker = runtime('source-worker', sourceNet, sourceFiles, true)
    const complete = admit(source, request('start', 'restore-complete-start', { runDir: `${RUN_ROOT}/complete` }))
    await settled(source, complete.commandId)
    const completeWait = driver(source, 'run', { runId: complete.runId })
    const completeResume = admit(source, request('resume', 'restore-complete-resume', { runId: complete.runId, resumeTargetId: completeWait.resumeTargetId }))
    await settled(source, completeResume.commandId)
    const pending = admit(source, request('start', 'restore-pending-start', { runDir: `${RUN_ROOT}/pending` }))
    await settled(source, pending.commandId)
    const pendingWait = driver(source, 'run', { runId: pending.runId }); assert.equal(pendingWait.status, 'awaiting-approval')
    const cancelled = admit(source, request('start', 'restore-cancelled-start', { runDir: `${RUN_ROOT}/cancelled` }))
    await settled(source, cancelled.commandId)
    const cancel = admit(source, request('cancel', 'restore-cancel', { runId: cancelled.runId }))
    await settled(source, cancel.commandId)
    stopWorker(sourceWorker)
    driver(source, 'sessions')
    const pendingResume = admit(source, request('resume', 'restore-pending-resume', { runId: pending.runId, resumeTargetId: pendingWait.resumeTargetId }))
    phase = 'capture-quiescent-source'
    const baseline = driver(source, 'snapshot')
    const queued = rows(baseline.raw, 'fixture_commands').filter(row => row.disposition === 'queued')
    assert.equal(queued.length, 1); assert.equal(queued[0].command_id, pendingResume.commandId)
    assert.equal(jobs(baseline.raw).filter(job => job.state === 'created').length, 1)
    assert.ok(jobs(baseline.raw).some(job => job.id === queued[0].job_id && job.state === 'created'))
    assert.ok(Object.values(baseline.raw.sequences).some(sequence => sequence.is_called === true))
    assert.ok(Object.values(baseline.raw.sequences).some(sequence => sequence.is_called === false))
    const databaseDump = dump(sourceDb), backupId = randomUUID()
    const seal = { schemaVersion: 1, backupId, image, imageConfigId, postgresImage, contextSha256: receipt.contextSha256,
      dump: { sha256: hash(databaseDump), size: databaseDump.length }, files: { sha256: hash(encode(baseline.files)), size: encode(baseline.files).length }, rawSha256: hash(encode(baseline.raw)) }
    const trustedSeal = hash(encode(seal))
    save('database.dump', databaseDump); save('files.json', encode(baseline.files)); save('raw-state.json', encode(baseline.raw)); save('seal.json', encode(seal))
    assert.deepEqual(driver(source, 'snapshot'), baseline); assert.equal(inspect(sourceWorker).running, false)
    verifyPair(seal, trustedSeal, databaseDump, baseline.files, baseline.raw)
    assert.throws(() => verifyPair(seal, trustedSeal, incompatibleDump, baseline.files, baseline.raw))
    assert.throws(() => verifyPair({ ...seal, backupId: randomUUID() }, trustedSeal, databaseDump, baseline.files, baseline.raw))
    const badFiles = structuredClone(baseline.files); badFiles.entries[0].mode = 0o777
    assert.throws(() => verifyPair(seal, trustedSeal, databaseDump, badFiles, baseline.raw))
    receipt.backupId = backupId; receipt.checks.matchedPairAndNegativeControls = true
    phase = 'restore-with-all-authority-fenced'
    // No migrator, producer, API, worker or supervisor starts in the target before raw equality.
    docker(['exec', '-i', targetDb, 'pg_restore', '-U', 'dailylogger', '-d', 'dailylogger', '--no-owner', '--no-acl', '--exit-on-error', '--single-transaction'], { input: databaseDump, timeout: 60_000 })
    driver(target, 'restore-files', { archive: baseline.files })
    assert.deepEqual(driver(target, 'raw'), baseline.raw)
    receipt.checks.allRawTablesAndSequencesEqual = true
    assert.equal(driver(target, 'copy-rejected', { runId: complete.runId }).ordinaryCopyRejected, true)
    assert.deepEqual(driver(target, 'raw'), baseline.raw)
    const negatives = driver(target, 'negative-database', { expectedRaw: baseline.raw })
    assert.ok(Object.values(negatives).every(value => value === true))
    assert.ok(Object.values(driver(target, 'negative-cases', { archive: baseline.files, backupId })).every(value => value === true))
    receipt.checks.ordinaryCopyAndDamagedStateRejected = true
    phase = 'planned-physical-identity-reconciliation'
    const plan = driver(target, 'plan', { archive: baseline.files, backupId }); save('reconciliation-plan.json', encode(plan))
    const interrupted = driver(target, 'reconcile', { archive: baseline.files, plan, interruptAfterOne: true }, { acceptFailure: true })
    assert.equal(interrupted.status, 86)
    assert.notEqual(driver(target, 'gate', { archive: baseline.files, plan }, { acceptFailure: true }).status, 0)
    assert.equal(inspect(sourceWorker).running, false)
    assert.equal(driver(target, 'reconcile', { archive: baseline.files, plan }).complete, true)
    assert.equal(driver(target, 'reconcile', { archive: baseline.files, plan }).changed, 0)
    assert.equal(driver(target, 'gate', { archive: baseline.files, plan }).allMarkersReconciled, true)
    assert.equal(driver(target, 'validate-restored').immutableInputsCheckpointAndArtifacts, true)
    assert.deepEqual(driver(target, 'raw'), baseline.raw)
    receipt.checks.narrowReconciliationRestartAndRuntimeValidation = true
    phase = 'explicitly-release-one-fixture-command'
    const targetWorker = runtime('target-worker', targetNet, targetFiles, true)
    const completedPending = await settled(target, pendingResume.commandId)
    assert.equal(completedPending.job_id, queued[0].job_id); assert.equal(completedPending.retry_count, 0)
    stopWorker(targetWorker)
    const afterResume = driver(target, 'snapshot')
    assert.equal(find(afterResume.raw, 'fixture_runs', pending.runId).status, 'complete')
    for (const run of [complete, cancelled]) {
      assert.deepEqual(find(afterResume.raw, 'fixture_runs', run.runId), find(baseline.raw, 'fixture_runs', run.runId))
      for (const table of ['fixture_commands', 'operation_attempts', 'resume_targets', 'run_cancellations'])
        assert.deepEqual(rows(afterResume.raw, table).filter(row => row.run_id === run.runId), rows(baseline.raw, table).filter(row => row.run_id === run.runId))
    }
    const pendingBefore = baseline.files.entries.find(entry => entry.path === 'pending/attempts.jsonl')
    const pendingAfter = afterResume.files.entries.find(entry => entry.path === 'pending/attempts.jsonl')
    assert.equal(Buffer.from(pendingAfter.data, 'base64').toString(), Buffer.from(pendingBefore.data, 'base64').toString() + '{"node":"write_shadow_artifacts"}\n')
    assert.equal(find(afterResume.raw, 'resume_targets', pendingWait.resumeTargetId, 'target_id').consumed_by, pendingResume.commandId)
    for (const run of ['complete', 'cancelled']) {
      const beforeFiles = baseline.files.entries.filter(entry => entry.path.startsWith(run + '/') && !entry.path.endsWith('/' + MARKER) && entry.type === 'file')
      assert.deepEqual(afterResume.files.entries.filter(entry => entry.path.startsWith(run + '/') && !entry.path.endsWith('/' + MARKER) && entry.type === 'file'), beforeFiles)
    }
    const jobIds = jobs(afterResume.raw).map(job => job.id).sort()
    assert.deepEqual(driver(target, 'admit', { request: pendingResume.request }), pendingResume.response)
    const stale = driver(target, 'admit', { request: request('resume', 'restore-consumed-target-new-key', { runId: complete.runId, resumeTargetId: completeWait.resumeTargetId }) })
    assert.equal(stale.status, 409); assert.equal(JSON.parse(stale.body).error, 'resume_target_stale')
    const cancelledAdmission = driver(target, 'admit', { request: request('recover', 'restore-cancelled-new-key', { runId: cancelled.runId }) })
    assert.equal(cancelledAdmission.status, 409); assert.equal(JSON.parse(cancelledAdmission.body).error, 'run_cancelled')
    const final = driver(target, 'snapshot')
    assert.deepEqual(jobs(final.raw).map(job => job.id).sort(), jobIds)
    assert.deepEqual(rows(final.raw, 'operation_attempts'), rows(afterResume.raw, 'operation_attempts'))
    assert.deepEqual(final.files, afterResume.files)
    assert.deepEqual(driver(source, 'snapshot'), baseline); assert.equal(inspect(sourceWorker).running, false)
    receipt.checks.singleOriginalResumeNoRepeatedSteps = true
    receipt.checks.duplicateConsumedAndCancelledAuthorityPreserved = true
    receipt.checks.zeroPostCutSourceEffects = true
    receipt.status = 'PASS'
  } catch (error) {
    failed = true; receipt.status = 'FAIL'; receipt.failedPhase = phase
    receipt.failure = { ...failureDiagnostic('RESTORE_PROOF_FAILED', 'proof', error),
      driver: driverFailure, lastDriverOperation: receipt.lastDriverOperation ?? null, docker: receipt.lastDockerCall ?? null }
  } finally {
    let cleanupFailed = false
    for (const record of containers.reverse()) {
      try {
        const ids = text(['container', 'ls', '--all', '--quiet', '--no-trunc', '--filter', `name=^/${record.name}$`, '--filter', `label=${OWNER}=${owner}`]).split(/\s+/).filter(Boolean)
        assert.ok(ids.length <= 1)
        if (!ids.length) continue
        const info = inspect(ids[0]); assert.equal(info.id, record.id ?? ids[0]); assert.equal(info.name, '/' + record.name); assert.equal(info.owner, owner)
        record.id = info.id
        text(['container', 'rm', '--force', info.id], { timeout: 15_000 })
      } catch (error) { cleanupFailed = true; receipt.cleanupFailure ??= { ...failureDiagnostic('RESTORE_PROOF_FAILED', 'proof', error), docker: receipt.lastDockerCall ?? null } }
    }
    for (const volume of volumes) {
      try {
        const names = text(['volume', 'ls', '--quiet', '--filter', `name=^${volume.name}$`, '--filter', `label=${OWNER}=${owner}`]).split(/\s+/).filter(Boolean)
        assert.ok(names.length <= 1)
        if (!names.length) { volume.state = 'absent'; continue }
        assert.equal(names[0], volume.name)
        const observed = inspectVolume(volume.name)
        assert.equal(observed.name, volume.name); assert.equal(observed.owner, owner)
        if (volume.observed) assert.deepEqual(observed, volume.observed)
        volume.observed = observed
        volume.state = 'retained'
        // On failure retain every discovered owned data volume, including create-after-timeout cases.
        if (!failed && !cleanupFailed) { text(['volume', 'rm', volume.name], { timeout: 10_000 }); volume.state = 'removed' }
      } catch (error) { cleanupFailed = true; volume.state = 'unverified'; receipt.cleanupFailure ??= { ...failureDiagnostic('RESTORE_PROOF_FAILED', 'proof', error), docker: receipt.lastDockerCall ?? null } }
    }
    for (const network of networks) {
      try {
        const ids = text(['network', 'ls', '--quiet', '--no-trunc', '--filter', `name=^${network.name}$`, '--filter', `label=${OWNER}=${owner}`]).split(/\s+/).filter(Boolean)
        assert.ok(ids.length <= 1)
        if (!ids.length) { network.absent = true; continue }
        const observed = inspectNetwork(ids[0])
        assert.equal(observed.id, network.id ?? ids[0]); assert.equal(observed.name, network.name); assert.equal(observed.owner, owner)
        network.id = observed.id
        text(['network', 'rm', observed.id], { timeout: 10_000 })
      } catch (error) { cleanupFailed = true; receipt.cleanupFailure ??= { ...failureDiagnostic('RESTORE_PROOF_FAILED', 'proof', error), docker: receipt.lastDockerCall ?? null } }
    }
    receipt.resources = { containers: containers.map(({ name, id, requestedImage, resolvedImage }) => ({ name, id, requestedImage, resolvedImage })), volumes: volumes.map(({ name, state }) => ({ name, state })), networks }
    receipt.cleanupComplete = !cleanupFailed
    receipt.retainedVolumeNames = volumes.filter(volume => volume.state === 'retained').map(volume => volume.name)
    receipt.uncertainVolumeNames = volumes.filter(volume => ['intended', 'unverified'].includes(volume.state)).map(volume => volume.name)
    receipt.dataVolumesRetained = receipt.retainedVolumeNames.length > 0
    if (cleanupFailed) { failed = true; receipt.status = 'FAIL'; receipt.failedPhase ??= 'owned-resource-cleanup' }
    save(failed ? 'UNQUALIFIED.json' : 'receipt.json', encode(receipt))
  }
  if (failed) throw new Error(`Isolated restore proof failed during ${receipt.failedPhase}; diagnostic=${JSON.stringify(receipt.failure ?? receipt.cleanupFailure)}; private evidence retained under ${evidence}; no database/configuration payload logged`)
  console.log(JSON.stringify({ proof: receipt.proof, status: receipt.status, backupId: receipt.backupId, image,
    productionEligible: false, authorityEpochQualified: false, checks: receipt.checks, cleanupComplete: receipt.cleanupComplete }))
})

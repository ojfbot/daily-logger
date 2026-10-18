import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discoverTimeSources, recordsFromGitHubResponse } from '../src/backfill-times.ts'
import { articleTimeMetadata } from '../src/article-time-metadata.ts'
import { articleBodySha256, resolveTimeReferences, scanTimeTokens, selectTimeRecords, TimeRecordSchema, TimeReferenceSidecarSchema, unsupportedTimeTokens } from '../src/time-references.ts'

const json = value => `${JSON.stringify(value, null, 2)}\n`
const sha256 = value => createHash('sha256').update(value).digest('hex')
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const key = value => JSON.stringify([value.text, value.occurrence])
const requestKey = value => `${value.kind}:${value.repo}:${value.ref}`
const sourceKey = evidence => evidence.kind === 'explicit-offset' ? evidence.value : `${evidence.kind === 'github-commit' ? 'commit' : 'pull'}:${evidence.repo}:${evidence.ref}`
function outputPath(path) {
  let ancestor = resolve(path)
  const tail = []
  while (!existsSync(ancestor)) { tail.unshift(basename(ancestor)); ancestor = dirname(ancestor) }
  return resolve(realpathSync(ancestor), ...tail)
}

/** Offline, source-pinned replay. Only --apply writes the three existing runtime metadata files. */
export function replayMonth({ repoRoot, month, outputRoot, apply = false }) {
  assert(/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month), 'Expected YYYY-MM')
  repoRoot = realpathSync(repoRoot)
  assert.equal(repoRoot, realpathSync(resolve(import.meta.dirname, '..')), 'Run the script from the checkout whose pinned helpers it imports')
  outputRoot = outputPath(outputRoot)
  assert(outputRoot !== repoRoot && !outputRoot.startsWith(`${repoRoot}/`), 'Replay output must be outside the source checkout')
  const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trimEnd()
  const inputDir = `docs/time-backfill/${month}`
  const observations = JSON.parse(readFileSync(join(repoRoot, inputDir, 'source-observations.json'), 'utf8'))
  const adjudications = JSON.parse(readFileSync(join(repoRoot, inputDir, 'adjudications.json'), 'utf8'))
  const plan = JSON.parse(readFileSync(join(repoRoot, inputDir, 'harvest-plan.json'), 'utf8'))
  const base = observations.base
  assert(/^[a-f0-9]{40}$/.test(base), 'Invalid source pin')
  for (const input of [observations, adjudications, plan]) assert(input.schemaVersion === 1 && input.month === month && input.base === base, 'Mismatched frozen input')
  git('merge-base', '--is-ancestor', base, 'HEAD')
  const helpers = ['src/article-time-metadata.ts', 'src/time-references.ts', 'src/time-reference-schema.ts', 'src/time-reference-text.ts', 'src/render-article.ts', 'src/backfill-times.ts']
  const allPaths = git('ls-tree', '-r', '--name-only', base, '_articles').split('\n').filter(path => /\d{4}-\d{2}-\d{2}\.md$/.test(path))
  const inputs = [...allPaths, ...helpers, 'api/time-evidence.json', 'api/time-refs.json', 'api/time-refs-report.json']
  const batch = execFileSync('git', ['cat-file', '--batch'], { cwd: repoRoot, input: inputs.map(path => `${base}:${path}\n`).join(''), maxBuffer: 32 * 1024 * 1024 })
  const blobs = new Map()
  let cursor = 0
  for (const path of inputs) {
    const end = batch.indexOf(10, cursor)
    const header = /^([a-f0-9]{40}) blob (\d+)$/.exec(batch.subarray(cursor, end).toString())
    assert(header, `Missing source blob: ${path}`)
    cursor = end + 1
    const bytes = batch.subarray(cursor, cursor + Number(header[2]))
    cursor += bytes.length
    assert.equal(batch[cursor++], 10, 'Invalid Git batch frame')
    blobs.set(path, { sha: header[1], bytes })
  }
  const atBase = path => { const blob = blobs.get(path); assert(blob, `Unknown source blob: ${path}`); return blob.bytes }
  for (const path of helpers) assert(readFileSync(join(repoRoot, path)).equals(atBase(path)), `Production helper changed: ${path}`)
  const paths = allPaths.filter(path => path.startsWith(`_articles/${month}-`))
  const diskPaths = readdirSync(join(repoRoot, '_articles')).filter(name => name.startsWith(`${month}-`) && name.endsWith('.md')).map(name => `_articles/${name}`)
  assert.deepEqual([...diskPaths].sort(), [...paths].sort(), 'Monthly article inventory changed; refresh the source pin')
  for (const path of allPaths) assert(readFileSync(join(repoRoot, path)).equals(atBase(path)), `Article changed: ${path}`)
  const articles = paths.map(path => ({ date: path.slice(10, -3), markdown: atBase(path).toString('utf8'), path, blob: blobs.get(path).sha }))
  assert.deepEqual(articles.map(article => article.date), plan.articleDates, 'Harvest plan inventory mismatch')
  const beforeEvidence = JSON.parse(atBase('api/time-evidence.json'))
  const beforeRecords = TimeRecordSchema.array().parse(beforeEvidence.records)
  const beforeSidecar = TimeReferenceSidecarSchema.parse(JSON.parse(atBase('api/time-refs.json')))
  const beforeReport = JSON.parse(atBase('api/time-refs-report.json'))
  const discovered = discoverTimeSources(articles)
  assert.deepEqual(discovered, plan.requests.map(({ kind, repo, ref }) => ({ kind, repo, ref })), 'Harvest request plan changed')
  for (const request of plan.requests) {
    const covered = beforeRecords.some(row => row.evidence.kind !== 'explicit-offset' && row.evidence.repo === request.repo &&
      (request.kind === 'pull' ? row.evidence.kind === 'github-pull-request' && row.evidence.ref === request.ref : row.evidence.kind === 'github-commit' && row.evidence.ref.startsWith(request.ref)))
    assert.equal(request.alreadyCovered, covered, 'Incorrect baseline coverage in harvest plan')
  }
  const expectedFresh = plan.requests.filter(request => !request.alreadyCovered).map(requestKey).sort()
  assert.deepEqual(observations.observations.map(row => requestKey(row.request)).sort(), expectedFresh, 'Missing, duplicate or unexpected observations')
  const fresh = []
  for (const row of observations.observations) {
    const projection = row.response ?? { outcome: row.outcome, reason: row.reason }
    assert.equal(sha256(JSON.stringify(canonical(projection))), row.projectionSha256, 'Observation projection digest mismatch')
    assert.equal(row.sourceUrl, `https://api.github.com/repos/${row.request.repo}/${row.request.kind === 'pull' ? 'pulls' : 'commits'}/${row.request.ref}`)
    if (row.outcome === 'unavailable') continue
    assert.equal(row.outcome, 'observed')
    const expectedUrl = `https://github.com/${row.request.repo}/${row.request.kind === 'pull' ? 'pull' : 'commit'}/`
    if (row.request.kind === 'pull') assert.equal(row.sourcePins.htmlUrl.toLowerCase(), `${expectedUrl}${row.request.ref}`.toLowerCase())
    else {
      assert.equal(row.sourcePins.htmlUrl.toLowerCase(), `${expectedUrl}${row.response.sha}`.toLowerCase())
      assert.equal(row.sourcePins.commitSha, row.response.sha, 'Commit source pin mismatch')
      assert.equal(row.timestampSource.kind, 'immutable-git-object')
      assert.equal(row.timestampSource.objectSha, row.response.sha, 'Commit timestamp object mismatch')
    }
    fresh.push(...recordsFromGitHubResponse(row.request, row.response))
  }
  const prior = new Set(beforeRecords.map(row => JSON.stringify(row)))
  const additions = [...new Map(fresh.filter(row => !prior.has(JSON.stringify(row))).map(row => [JSON.stringify(row), row])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const records = TimeRecordSchema.array().max(4096).parse([...beforeRecords, ...additions])
  const failures = [...beforeEvidence.failures]
  for (const row of observations.observations.filter(row => row.outcome === 'unavailable')) {
    const request = requestKey(row.request)
    if (!failures.some(failure => failure.request === request)) failures.push({ request, reason: 'Source unavailable or invalid; no timestamp inferred' })
  }
  const evidence = { schemaVersion: 1, records, failures }
  const sidecar = TimeReferenceSidecarSchema.parse(beforeSidecar)
  const decisions = new Map(adjudications.decisions.map(row => [`${row.date}:${key(row)}`, row]))
  assert.equal(decisions.size, adjudications.decisions.length, 'Duplicate adjudication')
  const inventory = []
  const reports = []
  const checkedDecisions = new Set()
  for (const article of articles) {
    assert(!/^time_records_sha256:/m.test(article.markdown), 'Generation-owned article requires its own retained records, not legacy backfill')
    const before = articleTimeMetadata({ content: article.markdown, records: beforeRecords, sidecar: beforeSidecar.articles[article.date] })
    const raw = resolveTimeReferences(article.markdown, records)
    const previous = new Map(before.references.map(reference => [key(reference), reference]))
    const admitted = []
    const withheld = []
    for (const reference of raw.references) {
      if (previous.has(key(reference))) {
        assert.deepEqual(reference, previous.get(key(reference)), 'Previously valid binding changed')
        admitted.push(reference)
        continue
      }
      const decisionKey = `${article.date}:${key(reference)}`
      const decision = decisions.get(decisionKey)
      assert(decision && decision.articleBlobSha === article.blob, `Unreviewed new reference: ${decisionKey}`)
      checkedDecisions.add(decisionKey)
      if (decision.decision === 'leave-plain') { withheld.push({ reference, reason: decision.reason }); continue }
      assert.equal(decision.decision, 'eligible-if-authoritative')
      const { day, ...expectedSource } = decision.expectedSource
      const { url: _url, ...actualSource } = reference.evidence
      assert.deepEqual(actualSource, expectedSource, 'Eligible source/event identity mismatch')
      assert.equal(reference.at.slice(0, 10), day, 'Eligible source day mismatch')
      admitted.push(reference)
    }
    for (const reference of before.references) assert(admitted.some(candidate => JSON.stringify(candidate) === JSON.stringify(reference)), 'Previously admitted reference disappeared')
    const supported = scanTimeTokens(article.markdown)
    const unsupported = unsupportedTimeTokens(article.markdown)
    const occurrenceDecisions = supported.map(token => {
      const decisionKey = `${article.date}:${key(token)}`
      const decision = decisions.get(decisionKey)
      if (decision) { assert.equal(decision.articleBlobSha, article.blob, 'Stale adjudication'); checkedDecisions.add(decisionKey) }
      const reference = admitted.find(reference => key(reference) === key(token))
      if (!reference && !previous.has(key(token))) assert(decision, `Unclassified plain token: ${decisionKey}`)
      return { text: token.text, occurrence: token.occurrence, status: reference ? 'admitted' : 'plain', reference: reference ?? null, eligibility: decision ?? { decision: 'preserve-existing-binding' }, parserDiagnostic: raw.unresolved.find(item => key(item) === key(token)) ?? null }
    })
    if (supported.length || unsupported.length) sidecar.articles[article.date] = { bodySha256: articleBodySha256(article.markdown), references: admitted }
    const after = articleTimeMetadata({ content: article.markdown, records, sidecar: sidecar.articles[article.date] })
    assert.deepEqual(after.references, admitted, 'Production legacy admission disagrees with the sidecar')
    assert.equal(after.warnings.length, 0, `Unexpected admission warning: ${article.date}`)
    const sourceGroups = [...new Set(selectTimeRecords(article.markdown, records).map(row => sourceKey(row.evidence)))].sort()
    inventory.push({ date: article.date, articlePresent: true, articleBlobBefore: article.blob, articleBlobAfter: article.blob, articleSha256: sha256(article.markdown), bodySha256: articleBodySha256(article.markdown), articleBlobChanged: false, reviewFreshnessEffect: 'none; article bytes and blob unchanged', supportedTokens: supported.length, unsupportedSpellings: unsupported, trueNoMentions: !supported.length && !unsupported.length, before: { admitted: before.references, unresolved: before.unresolved }, after: { admitted, parserCandidates: raw.references, parserUnresolved: raw.unresolved, policyWithheld: withheld, plainSupportedCount: supported.length - admitted.length }, occurrences: occurrenceDecisions, sourceGroups, freshObservationKeys: sourceGroups.filter(group => observations.observations.some(row => requestKey(row.request) === group)) })
    if (supported.length || unsupported.length) reports.push({ date: article.date, resolved: admitted.length, unresolved: [...raw.unresolved, ...unsupported], policyWithheld: withheld })
  }
  assert.equal(checkedDecisions.size, decisions.size, 'Unused or stale adjudication')
  for (const path of allPaths.filter(path => !paths.includes(path))) {
    const markdown = atBase(path).toString('utf8'), date = path.slice(10, -3)
    const before = articleTimeMetadata({ content: markdown, records: beforeRecords, sidecar: beforeSidecar.articles[date] })
    const after = articleTimeMetadata({ content: markdown, records, sidecar: sidecar.articles[date] })
    assert.deepEqual(after.references, before.references, `Outside-month binding changed: ${date}`)
    assert.deepEqual(sidecar.articles[date], beforeSidecar.articles[date], `Outside-month sidecar changed: ${date}`)
  }
  const report = [...beforeReport.filter(row => !row.date.startsWith(`${month}-`)), ...reports].sort((a, b) => a.date.localeCompare(b.date))
  const outputs = { 'api/time-evidence.json': json(evidence), 'api/time-refs.json': json(TimeReferenceSidecarSchema.parse(sidecar)), 'api/time-refs-report.json': json(report) }
  for (const [path, bytes] of Object.entries(outputs)) assert(Buffer.byteLength(bytes) <= 1024 * 1024, `Legacy metadata exceeds reader limit: ${path}`)
  const count = field => inventory.reduce((total, row) => total + field(row), 0)
  const summary = { month, existingArticles: articles.length, supportedTokens: count(row => row.supportedTokens), beforeAdmitted: count(row => row.before.admitted.length), afterAdmitted: count(row => row.after.admitted.length), plainSupported: count(row => row.after.plainSupportedCount), policyWithheld: count(row => row.after.policyWithheld.length), unsupportedSpellings: count(row => row.unsupportedSpellings.length), sourceRecordsBefore: beforeRecords.length, sourceRecordsAfter: records.length, newSourceRecords: additions.length, observedSourceGroups: observations.observations.filter(row => row.outcome === 'observed').length, unavailableSourceGroups: observations.observations.filter(row => row.outcome === 'unavailable').length, trueNoMentions: inventory.filter(row => row.trueNoMentions).map(row => row.date) }
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()
  const dates = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
  const manifest = { schemaVersion: 1, base, month, summary, inputHashes: Object.fromEntries(['harvest-plan.json', 'source-observations.json', 'adjudications.json'].map(name => [name, sha256(readFileSync(join(repoRoot, inputDir, name)))])), helperHashes: Object.fromEntries(helpers.map(path => [path, sha256(readFileSync(join(repoRoot, path)))])), artifactHashes: Object.fromEntries(Object.entries(outputs).map(([path, bytes]) => [path, { before: sha256(atBase(path)), after: sha256(bytes) }])), articles: dates.map(date => inventory.find(row => row.date === date) ?? { date, articlePresent: false, disposition: 'absent-at-frozen-source' }), conservation: { articleBlobsChanged: 0, priorBindingsChanged: 0, outsideMonthBindingsChanged: 0, articleAcceptanceProvenanceAndReviewFreshnessChanged: false }, limits: ['A supported token is not necessarily an eligible event.', 'Legacy parser diagnostics omit parser-resolved references intentionally withheld from the sidecar; plainSupported includes them.', 'Source observations/digests establish consistency and do not authenticate a provider account.', 'No grammar, prose, generation model, acceptance, action or review change is performed.'] }
  outputs['manifest.json'] = json(manifest)
  for (const [path, bytes] of Object.entries(outputs)) {
    const output = join(outputRoot, path)
    mkdirSync(dirname(output), { recursive: true })
    assert(outputPath(dirname(output)) === dirname(output), 'Replay output directory contains a symlink')
    if (existsSync(output)) assert(lstatSync(output).isFile() && !lstatSync(output).isSymbolicLink(), 'Replay output must be a regular file')
    if (existsSync(output)) assert.equal(readFileSync(output, 'utf8'), bytes, `Refusing to overwrite different replay output: ${output}`)
    else writeFileSync(output, bytes)
  }
  if (apply) {
    const targets = Object.entries(outputs).filter(([path]) => path.startsWith('api/'))
    assert(lstatSync(join(repoRoot, 'api')).isDirectory() && !lstatSync(join(repoRoot, 'api')).isSymbolicLink(), 'Metadata directory must be regular')
    for (const [path, bytes] of targets) {
      const stat = lstatSync(join(repoRoot, path))
      assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, 'Metadata target must be a regular unlinked file')
      const current = readFileSync(join(repoRoot, path))
      assert(current.equals(atBase(path)) || current.toString('utf8') === bytes, `Unrelated metadata edits present: ${path}`)
    }
    for (const [path, bytes] of targets) {
      const target = join(repoRoot, path)
      const temporary = `${target}.${process.pid}.tmp`
      writeFileSync(temporary, bytes)
      renameSync(temporary, target)
    }
  }
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const options = { repoRoot: process.cwd(), month: undefined, outputRoot: undefined, apply: false }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--apply') { options.apply = true; continue }
    assert(['--month', '--out', '--repo'].includes(arg), `Unknown option: ${arg}`)
    const value = args[++i]
    assert(value && !value.startsWith('--'), `Missing value: ${arg}`)
    options[arg === '--month' ? 'month' : arg === '--out' ? 'outputRoot' : 'repoRoot'] = value
  }
  assert(options.month && options.outputRoot, 'Usage: pnpm exec node --import tsx scripts/backfill-time-month.mjs --month YYYY-MM --out /absolute/fresh-output [--apply]')
  console.log(json(replayMonth(options).summary))
}

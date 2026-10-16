import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { registrySchema, reviewSchema } from '../../shared/article-review.js'

type ReadBytes = (path: string) => Buffer

function validateRegisteredRecords(input: unknown, read: ReadBytes = readFileSync) {
  const registry = registrySchema.parse(input)
  const identities = new Set<string>()
  const paths = new Set<string>()
  for (const entry of registry.records) {
    if (paths.has(entry.path)) throw new Error(`Duplicate registered path: ${entry.path}`)
    paths.add(entry.path)
    const review = reviewSchema.parse(JSON.parse(read(entry.path).toString('utf8')))
    if (review.article.date !== entry.date) throw new Error(`Article date mismatch: ${entry.path}`)
    // The runtime checks ID collisions after filtering to one article date.
    const identity = `${entry.date}:${review.id}`
    if (identities.has(identity)) throw new Error(`Duplicate review identity: ${identity}`)
    identities.add(identity)
    const bytes = read(review.fullRecordPath)
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (blob !== review.fullRecordBlobSha) throw new Error(`Full review hash mismatch: ${entry.path}`)
  }
  return registry.records.length
}

const registry = registrySchema.parse(JSON.parse(readFileSync('reviews/registry.json', 'utf8')))
const seed = registry.records[0]
if (!seed) throw new Error('Registered-review negative controls require an existing record')
const seedReview = reviewSchema.parse(JSON.parse(readFileSync(seed.path, 'utf8')))
const oneRecord = { ...registry, records: [seed] }
function changeSeed(patch: object): ReadBytes {
  return (path) => path === seed.path
    ? Buffer.from(JSON.stringify({ ...seedReview, ...patch }))
    : readFileSync(path)
}

describe('all registered published review artifacts', () => {
  it('validates every registry entry, record schema, date, identity and full-record byte hash without Git', () => {
    expect(validateRegisteredRecords(registry)).toBe(registry.records.length)
  })
  it('rejects a malformed new record instead of relying on the seeded service fixture', () => {
    expect(() => validateRegisteredRecords(oneRecord, changeSeed({ result: 'not-a-result' }))).toThrow()
  })
  it('rejects a date binding that disagrees with the registry', () => {
    expect(() => validateRegisteredRecords(oneRecord, changeSeed({ article: { ...seedReview.article, date: '2000-01-01' } }))).toThrow('Article date mismatch')
  })
  it('rejects an incorrect stored full-record hash', () => {
    const wrong = `${seedReview.fullRecordBlobSha[0] === 'a' ? 'b' : 'a'}${seedReview.fullRecordBlobSha.slice(1)}`
    expect(() => validateRegisteredRecords(oneRecord, changeSeed({ fullRecordBlobSha: wrong }))).toThrow('Full review hash mismatch')
  })
  it('rejects changed Unicode Markdown bytes when metadata was not updated', () => {
    const changed: ReadBytes = (path) => path === seedReview.fullRecordPath
      ? Buffer.concat([readFileSync(path), Buffer.from('\n雪\n')]) : readFileSync(path)
    expect(() => validateRegisteredRecords(oneRecord, changed)).toThrow('Full review hash mismatch')
  })
  it('rejects a missing full artifact', () => {
    expect(() => validateRegisteredRecords(oneRecord, changeSeed({ fullRecordPath: 'reviews/articles/missing-negative-control.md' }))).toThrow(/ENOENT/)
  })
  it('rejects duplicate registrations', () => {
    expect(() => validateRegisteredRecords({ ...registry, records: [seed, seed] })).toThrow('Duplicate registered path')
  })
  it('rejects conflicting duplicate review identities at different registered paths', () => {
    const alias = 'reviews/registered/duplicate-negative-control.json'
    expect(() => validateRegisteredRecords({ ...registry, records: [seed, { ...seed, path: alias }] },
      (path) => readFileSync(path === alias ? seed.path : path))).toThrow('Duplicate review identity')
  })
})

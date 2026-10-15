import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { renderArticle } from '../../src/render-article.js'

const snapshotSchema = z.object({
  sourceCommitSha: z.string().regex(/^[a-f0-9]{40}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourcePath: z.string().regex(/^_articles\/\d{4}-\d{2}-\d{2}\.md$/),
  file: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-f0-9]{40}\.md$/),
  blobSha: z.string().regex(/^[a-f0-9]{40}$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export const articleManifest = z.object({ schemaVersion: z.literal(1), articles: z.array(snapshotSchema) }).strict()
  .parse(JSON.parse(readFileSync(new URL('./fixtures/manifest.json', import.meta.url), 'utf8')))
export const correctedSource = '59d39b52f87629945b70cb13840ee3ad90ca7454'

export function verifyArticleSnapshot(snapshot: z.infer<typeof snapshotSchema>, bytes: Buffer) {
  const blobSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (blobSha !== snapshot.blobSha || sha256 !== snapshot.sha256) throw new Error(`Frozen article bytes disagree with ${snapshot.sourceCommitSha}:${snapshot.sourcePath}`)
  if (snapshot.sourcePath !== `_articles/${snapshot.date}.md` || snapshot.file !== `${snapshot.date}-${snapshot.sourceCommitSha}.md`) throw new Error('Frozen article source identity is inconsistent')
  return { ...snapshot, content: bytes.toString('utf8') }
}

export function readArticleSnapshot(sourceCommitSha: string, date: string) {
  const matches = articleManifest.articles.filter((entry) => entry.sourceCommitSha === sourceCommitSha && entry.date === date)
  if (matches.length !== 1) throw new Error(`No unique frozen article fixture for ${sourceCommitSha}:${date}`)
  const snapshot = matches[0]
  if (!snapshot) throw new Error('Missing frozen article entry')
  return verifyArticleSnapshot(snapshot, readFileSync(new URL(`./fixtures/${snapshot.file}`, import.meta.url)))
}

export function browserArticle(sourceCommitSha: string, date: string) {
  const snapshot = readArticleSnapshot(sourceCommitSha, date)
  const frontmatter = snapshot.content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!frontmatter) throw new Error('Missing frozen article frontmatter')
  const raw = frontmatter[1]
  function quoted(field: string) {
    const literal = raw.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))?.[1]
    if (!literal) throw new Error(`Missing ${field} in frozen article`)
    return z.string().parse(JSON.parse(literal))
  }
  const status = z.enum(['draft', 'accepted', 'rejected']).parse(raw.match(/^status:\s*"?(\w+)"?$/m)?.[1])
  if (raw.match(/^date:\s*(\S+)$/m)?.[1] !== snapshot.date) throw new Error('Frozen article date disagrees with its source identity')
  // Ancillary metrics are empty fixtures. Displayed prose, title, summary, status,
  // and fingerprint all come from these exact verified bytes, never current API output.
  return { date, title: quoted('title'), summary: quoted('summary'), status,
    tags: [], reposActive: [], commitCount: 0, activityType: 'fixture', schemaVersion: 2,
    sourceBlobSha: snapshot.blobSha, bodyHtml: renderArticle(snapshot.content.slice(frontmatter[0].length)),
  }
}

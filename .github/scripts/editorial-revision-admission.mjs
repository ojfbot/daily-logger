import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractEditorialFeedback } from './extract-editorial-feedback.mjs'

export function skipBotRevision(author, event) {
  if (!author.includes('[bot]')) return false
  // Retain the bot guard. Only a changed feedback payload from a human can
  // resume the supervised cycle after its previous bot revision.
  if (event?.action !== 'edited' || event?.sender?.type !== 'User' || typeof event.sender.login !== 'string' || event.sender.login.endsWith('[bot]')) return true
  const previousBody = event?.changes?.body?.from
  const currentBody = event?.pull_request?.body
  if (typeof previousBody !== 'string' || typeof currentBody !== 'string') return true
  try {
    const previous = extractEditorialFeedback(previousBody)
    const current = extractEditorialFeedback(currentBody)
    return !current.trim() || previous === current
  } catch { return true }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  console.log(String(skipBotRevision(process.argv[2] ?? '', event)))
}

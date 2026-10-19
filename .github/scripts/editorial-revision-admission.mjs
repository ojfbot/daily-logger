import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractEditorialFeedback } from './extract-editorial-feedback.mjs'

export function skipBotRevision(author, event) {
  if (event?.sender?.type !== 'User' || typeof event.sender.login !== 'string' || !event.sender.login.trim() || event.sender.login.endsWith('[bot]')) return true
  const currentBody = event?.pull_request?.body
  if (typeof currentBody !== 'string') return true
  if (event.action === 'opened') {
    if (author.includes('[bot]')) return true
    try { return !extractEditorialFeedback(currentBody).trim() } catch { return true }
  }
  if (event.action !== 'edited') return true
  const previousBody = event?.changes?.body?.from
  if (typeof previousBody !== 'string') return true
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

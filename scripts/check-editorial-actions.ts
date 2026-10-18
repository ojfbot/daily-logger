import { admitActionRegistry } from '../.github/scripts/editorial-action-registry.js'

const [base, head, date, actor, pullRequest] = process.argv.slice(2)
if (!base || !head || !date || !actor) throw new Error('Expected base, head, date, actor and event')
await admitActionRegistry({ workspace: process.env.EDITORIAL_WORKSPACE ?? process.cwd(), base, head, date, actor, pullRequest: Number(pullRequest), github: (path, options) => fetch(`https://api.github.com${path}`, { ...options, headers: { Authorization: `Bearer ${process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? ''}`, Accept: 'application/vnd.github+json' } }) })

import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('child_process', () => ({ execSync: vi.fn() }))

import { execSync } from 'child_process'
import {
  EXCLUDED_REPOS,
  KNOWN_REPOS,
  REPO_NOTES,
  classifyFleet,
  discoverRepos,
  reportSurfaceDrift,
  selectSweptRepos,
} from '../fleet.js'

// The sweep set is derived from `gh repo list`; these are the pure pieces.
// Incident: 2026-08-21 → 09-24, four repos founded outside /fleet-onboard were
// invisible to the sweep because membership was a hand-maintained array.

describe('selectSweptRepos', () => {
  const list = [
    { name: 'b-recent', pushedAt: '2026-09-24T20:00:00Z', isArchived: false, isFork: false, visibility: 'PUBLIC' },
    { name: 'a-older', pushedAt: '2026-08-01T00:00:00Z', isArchived: false, isFork: false, visibility: 'PUBLIC' },
    { name: 'archived', pushedAt: '2026-09-24T21:00:00Z', isArchived: true, isFork: false, visibility: 'PUBLIC' },
    { name: 'fork', pushedAt: '2026-09-24T22:00:00Z', isArchived: false, isFork: true, visibility: 'PUBLIC' },
    { name: 'selfco', pushedAt: '2026-09-24T23:00:00Z', isArchived: false, isFork: false, visibility: 'PRIVATE' },
    { name: 'no-push-date', visibility: 'PUBLIC' },
  ]

  it('drops archived repos, forks, and the denylist', () => {
    const out = selectSweptRepos(list)
    expect(out).not.toContain('archived')
    expect(out).not.toContain('fork')
    expect(out).not.toContain('selfco')
  })

  it('orders by pushedAt descending, undated last', () => {
    expect(selectSweptRepos(list)).toEqual(['b-recent', 'a-older', 'no-push-date'])
  })

  it('keeps PUBLIC repos that have no REPO_NOTES entry — unknown public repos are swept, then reported as drift', () => {
    expect(selectSweptRepos([{ name: 'brand-new', pushedAt: '2026-09-24T00:00:00Z', visibility: 'PUBLIC' }])).toEqual(['brand-new'])
  })
})

describe('EXCLUDED_REPOS / KNOWN_REPOS', () => {
  it('excludes the private vault by policy', () => {
    expect(EXCLUDED_REPOS.has('selfco')).toBe(true)
  })

  it('derives KNOWN_REPOS from REPO_NOTES so a note is the registration', () => {
    for (const name of Object.keys(REPO_NOTES)) expect(KNOWN_REPOS.has(name)).toBe(true)
  })

  it('carries the 2026-09-24 backport repos', () => {
    for (const r of ['lego-village-pipeline', 'play-well-library', 'foundry-recipes']) {
      expect(KNOWN_REPOS.has(r)).toBe(true)
    }
  })

  it('keeps legacy aliases that still appear in older article tags', () => {
    expect(KNOWN_REPOS.has('gcgcca')).toBe(true)
  })
})

describe('reportSurfaceDrift', () => {
  const prompt = 'Additional repos:\n- **shell** — Frame OS.\n- **brand-new** — something.'

  it('is silent when every swept repo has a note and a prompt bullet', () => {
    expect(reportSurfaceDrift(['shell'], prompt)).toEqual([])
  })

  it('names the missing surface for a repo with a prompt bullet but no note', () => {
    const [w] = reportSurfaceDrift(['brand-new'], prompt)
    expect(w).toContain('brand-new')
    expect(w).toContain('surface 3')
    expect(w).not.toContain('surface 4')
    expect(w).toContain('/fleet-onboard brand-new')
  })

  it('names both surfaces for a repo missing from both', () => {
    const [w] = reportSurfaceDrift(['ghost'], prompt)
    expect(w).toContain('surface 3')
    expect(w).toContain('surface 4')
  })

  it('reports one line per drifted repo, none for clean ones', () => {
    expect(reportSurfaceDrift(['shell', 'ghost', 'brand-new'], prompt)).toHaveLength(2)
  })
})

// Operator ruling 2026-09-24 (PR #280): the blog is PUBLIC, so a PRIVATE/INTERNAL
// repo is swept only when REPO_NOTES opts it in. Everything else private is skipped.
describe('classifyFleet — private-repo opt-in', () => {
  const notes = { 'noted-private': 'x', 'noted-public': 'y' }

  it('(a) skips a private repo with no REPO_NOTES entry', () => {
    const sel = classifyFleet([
      { name: 'client-work', visibility: 'PRIVATE' },
      { name: 'intranet', visibility: 'INTERNAL' },
      { name: 'noted-private', visibility: 'PRIVATE' },
    ], notes)
    expect(sel.swept).toEqual(['noted-private'])
    expect(sel.skippedPrivate).toEqual(['client-work', 'intranet'])
  })

  it('(b) sweeps a private repo that has a REPO_NOTES entry', () => {
    expect(classifyFleet([{ name: 'noted-private', visibility: 'PRIVATE' }], notes).swept).toEqual(['noted-private'])
  })

  it('(c) always sweeps a public repo, noted or not', () => {
    const sel = classifyFleet([
      { name: 'noted-public', visibility: 'PUBLIC' },
      { name: 'unnoted-public', visibility: 'public' },
    ], notes)
    expect(sel.swept).toEqual(['noted-public', 'unnoted-public'])
    expect(sel.skippedPrivate).toEqual([])
  })

  it('treats a missing visibility field as non-public (safe default)', () => {
    expect(classifyFleet([{ name: 'shape-drift' }], notes).skippedPrivate).toEqual(['shape-drift'])
  })

  it('(d) reports noted repos absent from discovery; archived noted repos are not "missing"', () => {
    const sel = classifyFleet([{ name: 'noted-public', visibility: 'PUBLIC', isArchived: true }], notes)
    expect(sel.missingNoted).toEqual(['noted-private'])
  })

  it('the real REPO_NOTES opts in no repo that is also EXCLUDED', () => {
    for (const r of EXCLUDED_REPOS) expect(r in REPO_NOTES).toBe(false)
  })
})

describe('discoverRepos — visibility gate and lost-token guard', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const notedPrivate = Object.keys(REPO_NOTES).filter((n) => n !== 'shell' && n !== 'core')
  const payload = (list: object[]) => vi.mocked(execSync).mockReturnValue(JSON.stringify(list) as never)
  // Every noted repo present: 'shell' + 'core' public, the rest private.
  const fullOrg = () => [
    { name: 'shell', visibility: 'PUBLIC', pushedAt: '2026-09-24T02:00:00Z' },
    { name: 'core', visibility: 'PUBLIC', pushedAt: '2026-09-24T01:00:00Z' },
    ...notedPrivate.map((name) => ({ name, visibility: 'PRIVATE' })),
  ]
  const warnings = () => warn.mock.calls.map((c) => String(c[0]))

  afterEach(() => {
    warn.mockClear()
    log.mockClear()
    vi.mocked(execSync).mockReset()
  })

  it('requests visibility from gh repo list', () => {
    payload(fullOrg())
    discoverRepos('ojfbot')
    expect(String(vi.mocked(execSync).mock.calls[0][0])).toContain('visibility')
  })

  it('(a) skips an un-noted private repo and emits ONE ::warning:: naming it (names only)', () => {
    payload([...fullOrg(), { name: 'client-secret', visibility: 'PRIVATE', description: 'bid for ACME' }])
    const repos = discoverRepos('ojfbot')
    expect(repos).not.toContain('client-secret')
    const w = warnings().filter((l) => l.includes('client-secret'))
    expect(w).toHaveLength(1)
    expect(w[0]).toMatch(/^::warning::/)
    expect(w[0]).not.toContain('ACME')
  })

  it('(b) sweeps a private repo that REPO_NOTES opts in', () => {
    payload(fullOrg())
    expect(discoverRepos('ojfbot')).toContain('foundry-recipes')
    expect(warnings()).toEqual([])
  })

  it('never sweeps dealdesk (client work, excluded by policy) and does not warn about it', () => {
    payload([...fullOrg(), { name: 'dealdesk', visibility: 'PRIVATE' }])
    expect(discoverRepos('ojfbot')).not.toContain('dealdesk')
    expect(warnings().some((l) => l.includes('dealdesk'))).toBe(false)
    expect(KNOWN_REPOS.has('dealdesk')).toBe(false)
  })

  it('does not treat inherited object keys as an opt-in (no `in` bypass)', () => {
    const tricks = ['constructor', 'toString', 'hasOwnProperty', '__proto__']
    payload([...fullOrg(), ...tricks.map((name) => ({ name, visibility: 'PRIVATE' }))])
    const repos = discoverRepos('ojfbot')
    for (const n of tricks) expect(repos).not.toContain(n)
  })

  it('(c) sweeps a public repo with no note', () => {
    payload([...fullOrg(), { name: 'fresh-public', visibility: 'PUBLIC' }])
    expect(discoverRepos('ojfbot')).toContain('fresh-public')
  })

  it('(d) warns when a noted repo is absent from discovery', () => {
    payload(fullOrg().filter((r) => r.name !== 'foundry-recipes'))
    discoverRepos('ojfbot')
    expect(warnings()).toContain('::warning::fleet drift: noted repo(s) not discovered: foundry-recipes')
  })

  it('(e) throws when every private noted repo is absent while public ones are present (lost private scope)', () => {
    payload(fullOrg().filter((r) => r.visibility === 'PUBLIC'))
    expect(() => discoverRepos('ojfbot')).toThrow(/lost private-repo scope/)
  })

  it('keeps the existing silent-zero guards', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('HTTP 403') })
    expect(() => discoverRepos('ojfbot')).toThrow(/was rejected/)
    vi.mocked(execSync).mockReturnValue('not json' as never)
    expect(() => discoverRepos('ojfbot')).toThrow(/unparseable/)
    payload([])
    expect(() => discoverRepos('ojfbot')).toThrow(/no repos/)
    payload([
      ...fullOrg().map((r) => ({ ...r, isArchived: true })),
      { name: 'only-private', visibility: 'PRIVATE' },
    ])
    expect(() => discoverRepos('ojfbot')).toThrow(/filtered out/)
  })
})

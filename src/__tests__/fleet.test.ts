import { describe, it, expect } from 'vitest'
import { EXCLUDED_REPOS, KNOWN_REPOS, REPO_NOTES, reportSurfaceDrift, selectSweptRepos } from '../fleet.js'

// The sweep set is derived from `gh repo list`; these are the pure pieces.
// Incident: 2026-08-21 → 09-24, four repos founded outside /fleet-onboard were
// invisible to the sweep because membership was a hand-maintained array.

describe('selectSweptRepos', () => {
  const list = [
    { name: 'b-recent', pushedAt: '2026-09-24T20:00:00Z', isArchived: false, isFork: false },
    { name: 'a-older', pushedAt: '2026-08-01T00:00:00Z', isArchived: false, isFork: false },
    { name: 'archived', pushedAt: '2026-09-24T21:00:00Z', isArchived: true, isFork: false },
    { name: 'fork', pushedAt: '2026-09-24T22:00:00Z', isArchived: false, isFork: true },
    { name: 'selfco', pushedAt: '2026-09-24T23:00:00Z', isArchived: false, isFork: false },
    { name: 'no-push-date' },
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

  it('keeps repos that have no REPO_NOTES entry — unknown repos are swept, then reported as drift', () => {
    expect(selectSweptRepos([{ name: 'brand-new', pushedAt: '2026-09-24T00:00:00Z' }])).toEqual(['brand-new'])
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
    for (const r of ['lego-village-pipeline', 'play-well-library', 'dealdesk', 'foundry-recipes']) {
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

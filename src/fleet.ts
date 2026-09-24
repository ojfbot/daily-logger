/**
 * Fleet membership for the sweep — derived from GitHub, not hand-listed.
 *
 * Until 2026-09-24 the sweep enumerated a hand-maintained REPOS array, and every
 * repo founded without a /fleet-onboard pass went dark until someone noticed:
 * lego-village-pipeline + play-well-library (founded 09-17; 74 commits and
 * 20 merged PRs invisible for a week), dealdesk (08-19), foundry-recipes
 * (04-30). That was the fourth drift episode recorded in this file's history.
 *
 * Now `discoverRepos()` asks GitHub for the org's live repo set, so surface 2 of
 * the fleet-onboard surface matrix is AUTO. Surfaces 3–4 (KNOWN_REPOS below and
 * the "Additional repos" prose in generate-article.ts) stay explicit because
 * they carry hand-written meaning; `reportSurfaceDrift()` turns a swept repo
 * that is missing from them into a loud run-log warning instead of a silent gap.
 */
import { execSync } from 'child_process'

/** Repos in the org that are deliberately NOT swept. Policy, not drift. */
export const EXCLUDED_REPOS: ReadonlySet<string> = new Set([
  'selfco', // the operator's private vault — intentionally unswept (see daily-logger tracking note)
  'dealdesk', // client bids/proposals/engagements — never reaches the public blog (operator ruling 2026-09-24, PR #280)
])

/**
 * One-line role per repo. Drafter grounding and the surface-3/4 anchor:
 * a repo listed here is a KNOWN_REPO for the API builder; a PUBLIC swept repo
 * that is NOT listed here is still swept, and reported as drift.
 *
 * An entry here is also the opt-in for a PRIVATE (or INTERNAL) repo: the blog is
 * public, so a non-public repo is swept only when it is listed here, and skipped
 * with a run-log warning otherwise (operator ruling 2026-09-24, PR #280).
 */
export const REPO_NOTES: Record<string, string> = {
  'shell': 'Frame OS — Vite Module Federation host + frame-agent LLM gateway + K8s',
  'cv-builder': 'AI resume builder — multi-agent orchestration, the most active CI/CD repo',
  'BlogEngine': 'AI-powered blog content creation — daily-logger publishes here',
  'TripPlanner': 'AI trip planning and itinerary management',
  'core': 'core (formerly node-template) — slash commands + TypeScript engine; hosts the selfco/vault skill',
  'core-reader': 'CoreReader — metadata dashboard for core commands, ADRs, roadmap',
  'MrPlug': 'Chrome extension for AI UI/UX feedback on localhost pages',
  'purefoy': 'Roger Deakins cinematography knowledge base — scraper + podcast transcripts',
  'daily-logger': 'this repo — captures the logger\'s own commits and improvements',
  'lean-canvas': 'Lean Canvas — Frame OS sub-app, AI-assisted business model design',
  'seh-study': 'SEH Study — NASA SE Handbook study client, Frame OS sub-app',
  'GroupThink': 'GroupThink — LLM-powered tab grouping Chrome extension',
  'landing': 'jim.software — personal landing page',
  'capture-agent': 'Golf-course capture agent (renamed from gcgcca 2026-07-30) — USGS Earth Explorer acquisition + TX-corpus/segmentation-model mission',
  'fairway': 'Golf digital twin (decomposed from mirrorworld 2026-07-30) — explorable twin surface',
  'cca-prep': 'Multi-exam Claude-cert prep engine (CCAR-F/CCDV-F/CCAR-P) — generation-over-content drill server + deck registry',
  'jim-camera': 'jim.camera portfolio + Lightroom-cloud pipeline — manifest-fed gallery + darkroom CLI',
  'beaverGame': 'Cozy Beaver — 3D beaver simulator (Three.js client)',
  'asset-foundry': 'AI-driven Blender asset pipeline consumed by beaverGame',
  'github-actions': 'Shared GitHub Actions + reusable workflows for the fleet (ADR-0067)',
  'selfco-box': 'selfco vault runner — Notion/iOS/MCP capture daemon ingesting into the (untracked) ~/selfco vault',
  'morning-cockpit': 'local-first morning dashboard — beads + reading + research-paper explainers',
  'f1-pit-wall': 'F1 race-engineering dashboard — telemetry literacy layer + claim-grounding harness',
  'f1-substrate': 'F1 telemetry substrate — DuckDB FastF1 store, gap algorithm, FastAPI query layer',
  'lofi-beaver': 'Willow Bend story-world — 1-bit isometric game, Blender sprite pipeline',
  'golf-platform-scripts': 'golf platform automation scripts',
  'dive-briefing': 'public dive-Q&A RAG service — hybrid retrieval + citation verification (buddy-check\'s public sibling)',
  'switchboard': 'fleet LLM gateway — provider adapters, per-app budgets, opt-in labeled failover',
  'agent-anatomy': 'anatomy of the fleet\'s multi-agent system — diagrams + pattern excerpts (article companion)',
  'buddy-check': 'SME-calibrated dive-storefront Q&A + eval harness — judge calibration, standards-grounded hybrid RAG lab',
  'silicon-empires': 'AoE-style RTS of the AI-infrastructure complex — queues, capital, energy, silicon',
  'f1-press-room': 'F1 teaching studio — claim-checked articles + shorts consuming the f1 pair\'s export seam',
  'bldgblog-corpus': 'deterministic BLDGBLOG archive ingest (2,512 posts) — annotated corpus + selfco deposit-library collection #1',
  'gastown-pilot': 'Gas Town 6-tab coordination dashboard — reads the bead store',
  'frame-ui-components': 'shared Carbon DS component library for Frame sub-apps',
  'workstation-yuri': 'macOS workstation automation — Focus modes, wallpapers, launcher registrations',
  'virtualLight': 'book-to-cinema pipeline — deterministic passage extraction + cinematography-styled video prompts (Gibson corpus private, public-domain demo)',
  'mirrorworld': 'real places as explorable three.js scenes — earth bundles (3DEP/imagery/OSM) + golf digital twin producer; Bilawal Sidhu mentor corpus',
  'f1-doctrine': 'doctrine corpus + retriever suggesting strategist questions bound to f1-substrate calls; never computes numbers',
  // Added 2026-09-24 (fleet-onboard backport after the 08-21 → 09-24 silent-sweep incident).
  'lego-village-pipeline': 'play-well cluster — digital twin + build harness for the family LEGO Christmas village (correspondence register, design packages, DT-DESIGN cuts)',
  'play-well-library': 'play-well cluster — canonical LEGO village content library (branch flow play/<user> → staging → main)',
  'foundry-recipes': 'Blender tutorial extraction pipeline — sped-up reels become structured BlenderRecipe records in Notion, read on demand by asset-foundry',
}

/** Names that appear in older article tags/bodies but are no longer org repos (renames). */
const LEGACY_REPO_ALIASES = ['gcgcca', 'node-template']

/**
 * Repo names the API builder recognizes in article bodies and tags (surface 3).
 * Derived from REPO_NOTES so a note IS the registration — the 2026-05-05
 * incident was a set/map asymmetry between two hand lists.
 */
export const KNOWN_REPOS: ReadonlySet<string> = new Set([
  ...Object.keys(REPO_NOTES),
  ...LEGACY_REPO_ALIASES,
])

export interface DiscoveredRepo {
  name: string
  pushedAt?: string | null
  isArchived?: boolean
  isFork?: boolean
  /** `PUBLIC` | `PRIVATE` | `INTERNAL` from `gh repo list --json visibility`. */
  visibility?: string | null
}

/**
 * Private-repo opt-in (operator ruling 2026-09-24, PR #280): the blog is PUBLIC,
 * so a non-public repo reaches the drafter ONLY when it has a REPO_NOTES entry.
 * A repo whose visibility is missing or unrecognized is treated as non-public —
 * the safe default when GitHub's payload shape drifts.
 */
export function isPublicRepo(r: DiscoveredRepo): boolean {
  return typeof r.visibility === 'string' && r.visibility.toUpperCase() === 'PUBLIC'
}

export interface FleetSelection {
  /** Repos to sweep, most recently pushed first. */
  swept: string[]
  /** Non-public, non-archived, non-fork repos skipped for lack of a REPO_NOTES opt-in. */
  skippedPrivate: string[]
  /** REPO_NOTES entries that discovery did not return at all (lost token scope, rename, deletion). */
  missingNoted: string[]
  /** How many non-public repos discovery returned (any state) — 0 is the lost-private-scope signature. */
  privateDiscovered: number
}

/** Pure classification of a `gh repo list` payload — exported for tests. */
export function classifyFleet(
  list: DiscoveredRepo[],
  notes: Record<string, string> = REPO_NOTES,
): FleetSelection {
  const valid = list.filter((r) => r && typeof r.name === 'string')
  const live = valid
    .filter((r) => !r.isArchived && !r.isFork && !EXCLUDED_REPOS.has(r.name))
    .sort((a, b) => (b.pushedAt ?? '').localeCompare(a.pushedAt ?? ''))
  const swept: string[] = []
  const skippedPrivate: string[] = []
  for (const r of live) {
    // Own-property check: `in` would opt in a repo named e.g. `constructor` or `toString`.
    if (isPublicRepo(r) || Object.prototype.hasOwnProperty.call(notes, r.name)) swept.push(r.name)
    else skippedPrivate.push(r.name)
  }
  const discovered = new Set(valid.map((r) => r.name))
  const missingNoted = Object.keys(notes).filter((n) => !discovered.has(n))
  const privateDiscovered = valid.filter((r) => !isPublicRepo(r)).length
  return { swept, skippedPrivate, missingNoted, privateDiscovered }
}

/** Swept names only — exported for tests. */
export function selectSweptRepos(list: DiscoveredRepo[]): string[] {
  return classifyFleet(list).swept
}

/**
 * The live sweep set: every non-archived, non-fork repo in the org minus
 * EXCLUDED_REPOS, most recently pushed first — public repos always, non-public
 * repos only when opted in via REPO_NOTES. Throws on any failure — a failed
 * discovery must go red, not sweep nothing and retire the day as "no activity"
 * (the same silent-green shape as the 2026-05-19 expired-PAT outage).
 */
export function discoverRepos(org: string): string[] {
  // Test seam: FLEET_REPOS="a,b" pins the sweep set (CI smoke test, local
  // replays). Never set in the scheduled workflows — membership there is derived.
  const pinned = process.env.FLEET_REPOS?.split(',').map((r) => r.trim()).filter(Boolean)
  if (pinned && pinned.length > 0) {
    console.log(`  → fleet: FLEET_REPOS override — sweeping ${pinned.length} pinned repo(s), discovery skipped`)
    return pinned
  }
  let raw: string
  try {
    raw = execSync(
      `gh repo list ${org} --limit 300 --json name,pushedAt,isArchived,isFork,visibility 2>/dev/null`,
      { encoding: 'utf-8', env: { ...process.env }, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
    )
  } catch {
    throw new Error(
      `Fleet discovery failed: \`gh repo list ${org}\` was rejected. ` +
        'Check GH_PAT scope (metadata:read on the org) before re-running the sweep.',
    )
  }
  let list: unknown
  try {
    list = JSON.parse(raw)
  } catch {
    throw new Error('Fleet discovery failed: `gh repo list` returned unparseable output.')
  }
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`Fleet discovery failed: \`gh repo list ${org}\` returned no repos.`)
  }
  const sel = classifyFleet(list as DiscoveredRepo[])

  if (sel.skippedPrivate.length > 0) {
    // Names only — nothing else about a non-opted-in private repo leaves this function.
    console.warn(
      `::warning::fleet: skipped ${sel.skippedPrivate.length} private repo(s) with no REPO_NOTES opt-in: ${sel.skippedPrivate.join(', ')}`,
    )
  }
  if (sel.missingNoted.length > 0) {
    // Lost-token guard: a PAT that lost private-repo scope makes `gh repo list`
    // return public repos only. With zero non-public repos in the payload, every
    // private noted repo is necessarily absent — fail loud rather than publish a
    // day that silently omits them.
    if (sel.privateDiscovered === 0 && sel.swept.length > 0) {
      throw new Error(
        'Fleet discovery failed: `gh repo list` returned no private repos, so every private REPO_NOTES ' +
          `repo is missing (${sel.missingNoted.join(', ')}). GH_PAT has likely lost private-repo scope.`,
      )
    }
    console.warn(`::warning::fleet drift: noted repo(s) not discovered: ${sel.missingNoted.join(', ')}`)
  }
  if (sel.swept.length === 0) {
    throw new Error('Fleet discovery failed: every org repo was filtered out (archived/fork/excluded/private).')
  }
  return sel.swept
}

/**
 * Surfaces 3–4 drift: swept repos with no REPO_NOTES entry (→ unknown to the
 * API builder) or no `**name**` bullet in the drafter's system prompt (→ Claude
 * mischaracterizes their activity). Returns one warning line per gap; the
 * caller decides how loudly to print it.
 */
export function reportSurfaceDrift(repos: string[], systemPrompt: string): string[] {
  const warnings: string[] = []
  for (const repo of repos) {
    const gaps: string[] = []
    if (!Object.prototype.hasOwnProperty.call(REPO_NOTES, repo)) gaps.push('src/fleet.ts REPO_NOTES (surface 3)')
    if (!systemPrompt.includes(`**${repo}**`)) gaps.push('generate-article.ts "Additional repos" (surface 4)')
    if (gaps.length > 0) {
      warnings.push(`fleet drift: ${repo} is swept but missing from ${gaps.join(' and ')} — run /fleet-onboard ${repo}`)
    }
  }
  return warnings
}

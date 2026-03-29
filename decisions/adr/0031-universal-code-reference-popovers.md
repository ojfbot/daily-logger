# ADR-0031: Universal Code Reference Popovers

Date: 2026-03-28
Status: Proposed
OKR: 2026-Q1 / O1 / KR2 (premium visual treatment)
Commands affected: /sweep, /generate-article
Repos affected: daily-logger, core
Linked: ADR-0032 (React + Vercel migration — defines the rendering layer for this data model)

---

## Context

The dashboard migration (PR #67) and TypeScript migration (PR #68) added a commit hash popover prototype: hover over a 7-char hex `<code>` token in an article and a tooltip shows the commit message, PR number, author, and date fetched from the GitHub API.

Two problems surfaced immediately:

1. **Repo detection is fragile.** The popover walks the DOM backward to the nearest `<h3>` heading to determine which repo a commit belongs to. This fails for commits mentioned in prose outside a repo section, producing "Commit not found on GitHub" errors.

2. **Commits are only ~30% of code references.** Across 5 sampled articles (339 backtick-wrapped tokens), 9 distinct reference types exist:

| Type | Pattern | Count | Example |
|------|---------|-------|---------|
| Commit hash | `/^[a-f0-9]{7}$/` | 103 | `f1e5ba1` |
| File path | Contains `.` or `/` | 79 | `vite.config.ts` |
| Component name | PascalCase | 29 | `DashboardLayout` |
| Package name | `@scope/name` or hyphenated | 21 | `@ojfbot/frame-ui-components` |
| Config key | camelCase identifier | 18 | `optimizeDeps` |
| CLI command | Starts with `/` | 9 | `/scaffold-app` |
| HTTP endpoint | `GET/POST /path` | 8 | `GET /api/tools` |
| Directory path | Ends with `/` | 8 | `formulas/` |
| Environment var | ALL_CAPS | 6 | `VITE_API_URL` |

The popover system should cover all of these, not just commits. This requires a structured data model generated at article-creation time, a backfill script for the 33 existing articles, and a unified popover component that renders type-appropriate content.

## Decision

Extend the article schema with an optional `codeReferences` array that maps every backtick-wrapped token to its type, source repo, and resolvable URL. Claude populates this array at article generation time using classification rules in the system prompt. A one-time backfill script classifies existing articles using regex pattern matching. The frontend renders popovers for all classified references using a single unified popover component, with type-specific content and click-to-open behavior.

### Schema extension

Add to `src/schema.ts`:

```typescript
export const CodeReferenceSchema = z.object({
  text: z.string(),
  type: z.enum([
    'commit', 'component', 'file', 'package',
    'command', 'config', 'env', 'endpoint', 'directory'
  ]),
  repo: z.string().optional(),
  path: z.string().optional(),
  url: z.string().optional(),
  meta: z.record(z.string()).optional(),
})
```

Add to `ArticleDataV2`:

```typescript
codeReferences: z.array(CodeReferenceSchema).optional()
```

### Implementation steps

1. **Schema** (`src/schema.ts`) — Add `CodeReferenceSchema`, extend `ArticleDataV2` with optional `codeReferences` field.

2. **System prompt** (`src/generate-article.ts`) — Add "Code reference standards" section to `SYSTEM_PROMPT` with classification rules and examples for each of the 9 types. Include instruction: "For every backtick-wrapped token in the article body, add a corresponding entry to `codeReferences`."

3. **Tool schema** (`src/generate-article.ts`) — Add `codeReferences` array to `ARTICLE_TOOL_V2` input schema so Claude returns structured refs alongside the article body.

4. **Backfill script** (`src/backfill-code-refs.ts`, NEW) — Regex-classify all `<code>` tokens across 33 existing articles. Write results to `api/code-refs.json` keyed by date. Classification priority:
   - Commit: `/^[a-f0-9]{7,40}$/`
   - File: contains `.` with known extension, or contains `/`
   - Component: PascalCase, 2+ capital letters
   - Package: starts with `@` or matches `^[a-z]+-[a-z]+`
   - Environment: ALL_CAPS with underscores
   - Endpoint: starts with `GET|POST|PUT|DELETE|PATCH`
   - Command: starts with `/`
   - Directory: ends with `/`
   - Config: camelCase fallback

5. **API build** (`src/build-api.ts`) — Include `codeReferences` in `entries.json` per article (from generated data or backfill fallback).

6. **Frontend popover** (`src/frontend/popover.ts`) — Refactor from commit-only to universal:
   - On init, load the article's `codeReferences` index from the API
   - Match each `<code>` element's text content against the index
   - Render type-appropriate popover content (see below)
   - Fall back to regex classification for unindexed tokens

7. **Frontend types** (`src/frontend/types.ts`) — Add `CodeReference` interface mirroring the Zod schema.

8. **Popover content by type:**

   | Type | Popover shows | Click action |
   |------|---------------|--------------|
   | Commit | SHA, message, PR link, author, date | Open commit on GitHub |
   | Component | File path, repo, line count | Open source file on GitHub |
   | File | First 8 lines preview (raw API), repo | Open file on GitHub |
   | Package | Version, repo link | Open package.json or npm |
   | Command | Skill description, usage | Open skill definition on GitHub |
   | Config/env | Contextual note from article | Open relevant config file |
   | Endpoint | HTTP method, path, handler file | Open handler source |
   | Directory | File listing (tree API, max 10) | Open directory on GitHub |

9. **CSS** (`assets/css/dashboard.css`) — Add type-specific popover styling: colored left border per type, file preview with syntax highlighting placeholder, consistent 150ms scale+fade animation.

10. **CI** (`.github/workflows/daily-blog.yml`) — No changes needed; `codeReferences` flows through the existing article generation pipeline.

11. **Package scripts** (`package.json`) — Add `backfill:refs` script: `tsx src/backfill-code-refs.ts`.

### Files modified

| File | Change |
|------|--------|
| `src/schema.ts` | Add `CodeReferenceSchema`, extend `ArticleDataV2` |
| `src/generate-article.ts` | `SYSTEM_PROMPT` + `ARTICLE_TOOL_V2` code ref guidance |
| `src/backfill-code-refs.ts` | **NEW** — regex classification + backfill |
| `src/build-api.ts` | Include `codeReferences` in `entries.json` |
| `src/frontend/popover.ts` | Refactor to universal code reference popovers |
| `src/frontend/types.ts` | Add `CodeReference` interface |
| `assets/css/dashboard.css` | Type-specific popover styling |
| `package.json` | Add `backfill:refs` script |

## Consequences

### Gains
- Every code reference in every article becomes an interactive link to its source
- Repo detection moves from fragile DOM walking to a structured index — eliminates "Commit not found" errors
- Claude generates the index at article-creation time — zero manual curation
- Backfill script ensures 33 existing articles get full coverage retroactively
- Data model is framework-agnostic — survives the React migration (ADR-0032) unchanged

### Costs
- `codeReferences` adds ~2-5KB per article to the API payload
- Backfill regex classification will have ~10-15% misclassification rate (e.g., `frame-os-context` could be a file or a config key) — acceptable for hover tooltips, not for critical logic
- GitHub raw API calls for file previews add latency on first hover; mitigated by sessionStorage cache
- System prompt grows by ~200 tokens with classification rules

### Neutral
- Existing commit popover behavior is preserved as a subset of the universal system
- Articles generated before backfill still work — regex fallback handles unindexed tokens
- The `meta` field is intentionally open-ended (`Record<string, string>`) to avoid schema churn as new type-specific metadata emerges

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Client-side-only regex classification (no schema change) | Fragile, can't resolve repo/path without structured data, repeats classification work on every page load |
| Separate `code-refs.json` API endpoint per article | Adds N+1 fetch problem; embedding in `entries.json` is simpler |
| Use GitHub search API for all lookups | Rate-limited (10 req/min unauthenticated), slow, unreliable for private repos |
| Only support commits + files (skip other 7 types) | 70% of code references would remain inert — defeats the purpose |
| Store references in frontmatter YAML | YAML arrays of objects are unwieldy; JSON in the API layer is cleaner |

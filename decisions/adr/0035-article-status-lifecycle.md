# ADR-0035: Article Status Lifecycle and Auto-Merge Editorial Workflow

Date: 2026-03-28
Status: Proposed
OKR: 2026-Q1 / O1 / KR2 (premium visual treatment)
Commands affected: /plan-feature, /daily-logger
Repos affected: daily-logger
Linked: ADR-0032 (React frontend renders status), ADR-0033 (chat validates before approval), ADR-0034 (auth required for status changes)

---

## Context

The daily-logger overnight pipeline generates articles via Claude, commits them to an `article/YYYY-MM-DD` branch, and opens a draft PR against `main`. Currently, a human must manually merge the PR for the article to go live. This creates a bottleneck: articles sit in draft PRs until the developer checks GitHub, reviews the diff, and clicks merge.

Issue #5 identified a deeper problem: the pipeline takes commit messages and PR descriptions at face value with no mechanism to distinguish "this shipped and works" from "this shipped as a step toward something not fully working yet." The council review phase (personas critiquing the draft) partially addresses this, but the council only has access to the same commit-feed context — human ground truth is the missing input.

Three goals converge:
1. **Articles should be live by morning** without manual intervention
2. **Articles need a quality signal** — readers should know if content is AI-generated-and-unreviewed vs. human-verified
3. **Human corrections should feed back into future articles** — closing the loop that issue #5 describes

## Decision

Introduce an article status lifecycle stored in YAML frontmatter, auto-merge overnight PRs so articles publish immediately as drafts, and build a feedback mechanism that injects human corrections into the next day's generation prompt.

### Status Model

Articles carry a `status` field in YAML frontmatter:

```yaml
---
title: "..."
date: 2026-03-28
status: draft
tags: [...]
---
```

Three values:
- **`draft`** — AI-generated, not yet reviewed by a human. Default for all new articles.
- **`accepted`** — Human has reviewed via inline section chat (ADR-0033) and approved. The article's claims have been validated against ground truth.
- **`rejected`** — Human determined the article is significantly inaccurate or should not be published. Hidden from default index view but retained in the archive.

Older articles (pre-status-field) default to `"accepted"` — they were manually merged, implying implicit human approval.

### Auto-Merge

The overnight pipeline workflow (`.github/workflows/daily-blog.yml`) changes:

1. Remove `--draft` flag from `gh pr create`
2. Add a step that immediately merges the PR: `gh pr merge --merge --delete-branch`
3. The merge triggers deployment workflows (`deploy-vercel.yml`, `deploy-pages.yml`), making the article live

The PR still exists as an audit trail (commit history, CI checks) but no longer requires manual intervention. The article goes live with `status: draft`.

### Human Review Flow

1. Developer opens `log.jim.software` in the morning
2. Draft articles are visually distinguished (amber "DRAFT" badge, subtle border)
3. Developer reads the article, uses inline section chat (ADR-0033) to question claims, request elaboration, or flag inaccuracies
4. Developer clicks "Accept" → authenticated API call (ADR-0034) updates frontmatter `status: accepted` via GitHub Contents API commit
5. The commit triggers a rebuild, and the article displays as "ACCEPTED"

### Feedback Persistence

When a developer reviews an article (especially when providing corrections via chat), corrections are saved to `feedback/YYYY-MM-DD.json`:

```json
{
  "date": "2026-03-28",
  "notes": "The article overstated cv-builder dashboard readiness",
  "corrections": [
    "cv-builder visual regression dashboard is infrastructure-only, not production-ready"
  ],
  "focusAreas": ["accuracy", "maturity-assessment"],
  "chatExcerpts": [
    {
      "section": "What shipped",
      "userMessage": "This isn't actually production-ready yet",
      "assistantMessage": "You're right — the infrastructure exists but..."
    }
  ]
}
```

Feedback files are committed to the repo via GitHub Contents API (same as status updates). They're human-editable JSON — no TypeScript knowledge required (issue #5 acceptance criterion).

### Feedback Injection

`collect-context.ts` reads `feedback/*.json` for the last N days and adds a "Prior corrections" section to the generation prompt:

```
## Corrections from recent articles

The following feedback was provided by the human reviewer:

- [2026-03-27] The article overstated cv-builder dashboard readiness.
  Actual state: infrastructure exists but dashboard is not production-ready.
- [2026-03-26] Focus more on technical decisions, less on listing commits.
```

This creates a closed loop: AI generates → human corrects → AI incorporates corrections → better articles over time.

### Schema Changes

In `src/schema.ts`:
```typescript
export const ARTICLE_STATUSES = ['draft', 'accepted', 'rejected'] as const

// In ArticleDataSchema:
status: z.enum(ARTICLE_STATUSES).default('draft').optional()
```

In `src/build-api.ts`: parse `status` from frontmatter, default to `"accepted"` for articles without the field.

In `packages/frontend/src/store/types.ts`: add `status?: 'draft' | 'accepted' | 'rejected'` to `EntryData`.

### Frontend Rendering

- `ArticlePage.tsx`: Status badge next to article title. "Accept" button for authenticated users viewing draft articles.
- `IndexPage.tsx`: Draft articles show badge in entry list. Optional filter for status.
- `dashboard.css`: Status badge styles (`.status-draft` amber, `.status-accepted` green, `.status-rejected` muted).

## Consequences

### Gains
- Articles are live by morning with zero human intervention
- Status model enables progressive trust: `draft` = AI-generated, `accepted` = human-verified
- Feedback loop closes issue #5 — human corrections improve future articles
- Frontmatter-based status is simple, versionable, git-native, and editable without code
- The PR audit trail is preserved even with auto-merge
- Older articles gracefully default to `"accepted"`

### Costs
- Auto-merge means occasionally publishing inaccurate content before human review (mitigated by prominent "DRAFT" badge)
- Status changes require GitHub API commit (not instant, ~1-2s latency)
- Feedback extraction from chat conversations is heuristic, not perfect
- `feedback/` directory adds a new data surface to manage

### Neutral
- `"rejected"` status is rarely used but available for skip/hide cases
- Feedback files accumulate over time — may need periodic cleanup or archival
- The auto-merge pattern could be reversed (back to manual) by re-adding `--draft` flag

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Status in separate database | Over-engineered; frontmatter keeps everything in git, versionable |
| Status in separate JSON sidecar | Splits article data across two files; frontmatter is simpler |
| Keep manual PR merge | Defeats the purpose of automation; human reviews via chat instead of PR diff |
| GitHub label-based status | Labels don't travel with the article file; harder to query in static API |
| Webhook-triggered merge on label | More complex than direct merge in the workflow; adds moving parts |
| Feedback via PR comments | Less structured than JSON; harder to parse reliably for prompt injection |
| Feedback via GitHub Issues | Disconnected from the article lifecycle; harder to associate with specific dates |

# ADR-0036: Structured Decision Output for Rich UI

- **Date**: 2026-03-29
- **Status**: Proposed
- **OKR**: Editorial workflow — rich decision browsing UI

## Context

The `write_article` tool schema generates structured decision data with `title`, `summary`, `repo`, `pillar`, and `relatedTags` fields. However, `build-api.ts` extracts decisions from the rendered markdown using `### ` heading regex, which only captures titles. Summaries, pillars, and related tags are lost in the markdown-to-JSON round-trip.

The Decisions page currently shows flat cards with titles only. The target UI includes:
1. Collapsible accordion cards (implemented in this PR)
2. Decision summary text
3. Decision basis matrix — alternatives considered with rationale

## Decision

### Phase 1: Preserve tool_use output (build pipeline fix)

Modify `build-api.ts` to read structured decision data from the per-article JSON (which already contains the full tool_use output) rather than re-extracting from markdown. This immediately populates summaries, pillars, and tags in `api/entries.json`.

### Phase 2: Add alternatives/basis matrix to schema

Extend `DecisionEntrySchema` in `src/schema.ts`:

```typescript
export const DecisionEntrySchema = z.object({
  title: z.string(),
  summary: z.string(),
  repo: z.string(),
  pillar: z.enum(PILLAR_VALUES).optional(),
  relatedTags: z.array(z.string()),
  alternatives: z.array(z.object({
    option: z.string(),
    chosen: z.boolean(),
    reason: z.string(),
  })).optional(),
})
```

Update the `write_article` tool schema in `generate-article.ts` to include `alternatives` in the decisions array items.

### Phase 3: Frontend decision matrix UI

Render `alternatives` as a table in the expanded accordion body:
- Option name
- Chosen/rejected indicator
- Rationale column

## Consequences

### Gains
- Decisions page becomes a useful architectural reference, not just a title list
- Decision basis matrices support async review and onboarding
- Structured data enables future search/filter by pillar

### Costs
- Tool schema change requires re-testing article generation quality
- Older articles won't have alternatives data (graceful degradation — field is optional)

### Neutral
- No breaking changes — all new fields are optional

## Alternatives considered

| Alternative | Why not chosen |
|-------------|---------------|
| Parse summaries from markdown body text | Fragile regex, loses structured data that already exists in tool_use output |
| Store decisions in separate JSON files | Over-engineers the data model; decisions belong with their article |
| Add alternatives to ADR files only | ADRs are a subset of decisions; daily article decisions deserve the same structure |

# ADR-0033: Inline Section Chat

Date: 2026-03-28
Status: Proposed
OKR: 2026-Q1 / O1 / KR2 (premium visual treatment)
Commands affected: /plan-feature, /scaffold
Repos affected: daily-logger
Linked: ADR-0031 (code references enrich chat system prompt), ADR-0032 (React migration provides Phase 1 rendering layer)

---

## Context

Daily-logger articles are structured into named sections (## What shipped, ## The decisions, ## Roadmap pulse, ## What's next) with inline code references (ADR-0031) and per-repo subsections. Readers — primarily the developer and potential hiring reviewers — often want to ask follow-up questions about a specific section: "What was the alternative to Module Federation here?", "Show me the ADR for this decision", "What tech debt does this introduce?"

Today there is no way to interact with article content. The reader must context-switch to a separate Claude conversation, manually paste the section text, and reconstruct the project context. This breaks the reading flow and loses the structured metadata (code references, tags, repo context) that daily-logger already has.

Three constraints shape the design:

1. **No backend exists.** Daily-logger is a static site on GitHub Pages. There is no Express server, no API gateway, no WebSocket infrastructure.

2. **The React migration (ADR-0032) is planned but unexecuted.** The vanilla TypeScript frontend is the only working frontend today.

3. **The stated goal is minimal.** Connect to a basic chat agent interaction preloaded with the context of that section, ready for users to ask questions for further elaboration.

These constraints point toward a browser-direct implementation: the browser calls the Claude API directly using an API key stored in localStorage, with no backend intermediary. This is explicitly a developer tool (single user, own API key), not a public-facing product.

## Decision

Implement inline section chat in two phases. Phase 0 ships in the current vanilla TypeScript frontend as a minimal prototype. Phase 1 rebuilds it as a React component after ADR-0032 lands.

### Phase 0: Vanilla TS prototype (ships now)

**Trigger.** A subtle chat icon button (monospace `›` or small speech-bubble SVG, 16px, low-opacity until hover) appears next to each `<h2>` section heading on article detail pages. Clicking it opens a sidebar chat panel anchored to that section's context.

**Chat panel.** A fixed sidebar (right edge, 380px wide, full viewport height) containing:
- Header bar: section title (e.g. "Chat — The decisions"), close button
- Scrollable message list: alternating user/assistant bubbles, markdown-rendered
- Input area: textarea with send button, `/` command hint bar
- Slide-in animation: 150ms `cubic-bezier(0.16, 1, 0.3, 1)`, matching popover easing

**API connection.** Browser-direct to `https://api.anthropic.com/v1/messages` using an API key from `localStorage('dl-anthropic-key')`. On first use, if no key is found, the panel shows a one-time setup prompt: "Paste your Anthropic API key to enable section chat." The key is stored in localStorage and never transmitted anywhere except the Anthropic API. Requires the `anthropic-dangerous-direct-browser-access: true` header — acceptable for single-developer use, not for public deployment.

**System prompt construction.** Built per-section when the chat icon is clicked:

```
You are a technical assistant for the ojfbot daily development log.
You have deep knowledge of the Frame OS project architecture.
The user is reading the article "{article.title}" ({article.date}).

## Current section: {sectionHeading}

{sectionContent — full text from <h2> to next <h2>}

## Article metadata
- Repos active: {reposActive.join(', ')}
- Tags: {tags.map(t => `${t.name} (${t.type})`).join(', ')}
- Activity type: {activityType}
- Schema version: {schemaVersion}

## Code references in this section
{codeReferences filtered to those whose text appears in sectionContent,
 formatted as: `text` — type (repo, path if available)}

## Available commands
The user may type slash commands. When they do, explain what the
command does in the context of this section and suggest a terminal
invocation using Claude Code.

Commands:
- /roadmap — Review and update the project roadmap
- /adr — Create or review Architecture Decision Records
- /plan-feature — Plan a new feature with acceptance criteria
- /scaffold — Scaffold a new app or component
- /techdebt — Identify and propose tech debt fixes
- /investigate — Root-cause analysis for issues
- /sweep — Audit code for patterns or problems
- /validate — Validate framework and auth patterns

Answer concisely. Reference specific files, commits, and PRs by name.
If the user asks about something outside this section, draw from the
full article context but note you're reaching beyond the current section.
```

**Section content extraction.** Walk the DOM from the clicked `<h2>` element, collecting all sibling elements until the next `<h2>` or end of `.article-content`. Extract `textContent` from each element. Cross-reference inline `<code>` tokens against the article's `codeReferences` array (already loaded by the popover system from `getEntries()`).

**Command detection.** When user input starts with `/`, match against the hardcoded command list. Phase 0 is informational only — Claude explains what the command does and suggests a terminal invocation. Commands are not dispatched to any backend.

**Streaming.** Use `stream: true` in the API request. Parse the `ReadableStream` with `TextDecoder`, buffer SSE lines, extract `content_block_delta` events, and append tokens to the assistant message in real-time.

**Conversation persistence.** Ephemeral. Messages live in a module-scoped `Map<string, ChatMessage[]>` keyed by section heading. Switching sections preserves each section's history for the session. Lost on page navigation. No localStorage persistence for conversations (API key only).

**Model.** Claude Sonnet (`claude-sonnet-4-6`) for fast responses. Max tokens: 2048 (section chat answers should be concise).

### Phase 1: React component (after ADR-0032)

Replace the vanilla TS prototype with a React implementation:
- Reuse `ChatShell` + `ChatMessage` from `@ojfbot/frame-ui-components`
- Redux chat slice (messages[], isStreaming, streamingContent, activeSection)
- Connect to a proper agent backend (MetaOrchestratorAgent or lightweight daily-logger domain agent)
- Support real `/command` dispatch via agent tool-use
- Persist conversations in Redux (session-scoped)
- ThreadSidebar integration: each section becomes a "thread"

Phase 1 is out of scope for this ADR. It will be planned when ADR-0032 Phase A is complete.

### Files created/modified (Phase 0)

| File | Change |
|------|--------|
| `src/frontend/section-chat.ts` | **NEW** — Chat sidebar DOM, Anthropic API streaming, section content extraction, message rendering, command detection |
| `assets/css/dashboard.css` | Section chat sidebar styles: panel slide-in, message bubbles, input bar, API key setup prompt, command hint bar |
| `src/frontend/app.ts` | Import + call `initSectionChat()` in DOMContentLoaded |

### Existing code to reuse

| What | Where | How |
|------|-------|-----|
| Article data + code references | `src/frontend/data.ts` → `getEntries()` | Already loaded by popover system; no extra fetch needed |
| Entry types | `src/frontend/types.ts` → `EntryData`, `CodeReference` | Import for type safety |
| Animation easing | `assets/css/dashboard.css` | Reuse `cubic-bezier(0.16, 1, 0.3, 1)` from popover transitions |
| Date extraction | `src/frontend/popover.ts` → `extractDateFromURL()` | Reuse to find current article's entry data |

## Consequences

### Gains
- Every article section becomes interactive — readers can ask follow-up questions grounded in the specific section's content and code references
- System prompt includes structured metadata (code references from ADR-0031, tags, repos) — Claude's answers are specific, not generic
- No backend required — ships today with zero infrastructure changes
- Phase 0 validates the UX before investing in a full React + agent backend implementation
- Section-scoped context means Claude gives focused answers rather than trying to address the entire article
- Command hints introduce readers to the ojfbot core toolkit organically

### Costs
- Browser-direct API calls expose the API key in DevTools network tab — acceptable for single-developer use, not for public deployment
- No conversation persistence across page navigations (ephemeral by design)
- Vanilla TS chat implementation becomes throwaway code after ADR-0032 Phase 1
- CORS: requires `anthropic-dangerous-direct-browser-access: true` header — explicitly marked unsafe for production by Anthropic
- Manual ReadableStream handling for streaming (no React hooks or SDK helpers)
- Bundle size increases ~3-4KB for the chat module

### Neutral
- Slash commands are informational only in Phase 0 — they describe what the command does but don't execute anything
- Chat panel coexists with the popover system — no conflicts (popovers are hover, chat is click)
- Article data already loaded by popover init — section chat adds zero network requests for data fetching
- Per-section conversation isolation means context stays focused but users can't cross-reference sections in one thread

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Wait for React migration (ADR-0032) before any chat | User wants it now. Phase 0 validates the UX cheaply with ~200 lines of vanilla TS. |
| Route through a backend API (Express/Vercel serverless) | No backend exists. Adding one for a single-user chat is over-engineering at this stage. |
| Use Anthropic's official JS SDK in the browser | SDK doesn't support browser-direct mode. Raw `fetch` with streaming is straightforward for this use case. |
| Full agent with tool-use (MetaOrchestratorAgent) | Requires the shell backend. Phase 1 work after ADR-0032. |
| Chat in a modal instead of sidebar | Sidebar keeps the article visible for reference while chatting. Modal obscures the content the user is asking about. |
| Persist conversations in localStorage | Adds complexity for unclear value. Articles are generated daily — yesterday's chat context is stale. |
| One global chat per article (not per-section) | Loses the benefit of focused context. Section-scoped prompts produce better answers than stuffing the entire article into the system prompt. |

# ADR-0037: Editorial Stamp Workflow — Draft Acceptance via GitHub API Proxy

Date: 2026-03-30
Status: Accepted
OKR: 2026-Q1 / O1 / KR3 (editorial workflow)
Commands affected: /validate, /hardening, /deploy
Repos affected: daily-logger
Linked: ADR-0034 (OAuth architecture, refined here), ADR-0035 (article status lifecycle)

---

## Context

Daily-logger generates articles overnight with `status: "draft"`. These are auto-merged to main (ADR-0035). We need a human review step: an authorized user views the draft in the React frontend and clicks "Accept Draft" to change the status to `accepted`. This creates a PR against main — the user merges manually in the GitHub UI.

ADR-0034 proposed GitHub OAuth with JWT tokens via `jose`. This ADR refines that decision based on implementation: we use AES-256-GCM encrypted tokens in httpOnly cookies (zero additional dependencies) and a full GitHub API proxy pattern (token never touches the browser).

## Decision

### Architecture: Full Proxy Pattern

All GitHub API calls are proxied through a Vercel serverless function (`/api/github/[...path]`). The access token lives only in an AES-256-GCM encrypted httpOnly cookie. JavaScript never sees the token.

```
Browser → /api/github/* (Vercel serverless) → api.github.com
              ↑ reads token from httpOnly cookie
```

### Refinement from ADR-0034

| ADR-0034 proposed | ADR-0037 implements | Rationale |
|---|---|---|
| JWT via `jose` library | AES-256-GCM encrypted GitHub token | Zero dependencies. Raw crypto is sufficient for single-token storage. No JWT claims needed — GitHub `/user` endpoint provides identity on each call. |
| `scope=read:user` | `scope=public_repo` | Stamp workflow requires branch/commit/PR creation, not just identity. |
| Direct GitHub API calls from browser | Full proxy pattern | Token never in browser memory. Eliminates XSS token theft entirely. |
| `SameSite=strict` | `SameSite=Lax` | Strict blocks the OAuth callback redirect (cookie not sent on cross-origin redirect from GitHub). Lax is correct for OAuth flows. |

### Security Layers

1. **httpOnly cookie** — token not accessible to JavaScript
2. **AES-256-GCM encryption** — token encrypted at rest in cookie
3. **CSRF state parameter** — random 32-byte state validated on OAuth callback
4. **X-Requested-With header** — required for all mutating proxy requests (blocks cross-origin form submissions)
5. **SameSite=Lax** — cookie not sent on cross-origin POST
6. **ALLOWED_USERS** — server-side allowlist checked before any write operation
7. **Path restriction** — proxy only forwards requests to `repos/ojfbot/daily-logger/`
8. **Race condition guard** — checks for existing branch/PR before creating duplicates

### Serverless Functions

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/login` | GET | Generate state, redirect to GitHub OAuth |
| `/api/auth/callback` | GET | Validate state, exchange code for token, set encrypted cookie |
| `/api/auth/logout` | GET | Clear cookie |
| `/api/auth/me` | GET | Decrypt token, call GitHub `/user`, return identity + authorized flag |
| `/api/github/[...path]` | ANY | Proxy to GitHub API with auth from cookie |

### Stamp Workflow

1. User navigates to draft article in React frontend
2. Green "ACCEPT DRAFT" button visible (only for authorized users)
3. Click triggers: GET article → create branch `accept/YYYY-MM-DD` → commit status change → open PR
4. PR opened with structured body template — manual merge required
5. On merge, deploy-pages.yml rebuilds the site

### Environment Variables (Vercel)

| Variable | Purpose |
|---|---|
| `GITHUB_CLIENT_ID` | OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | OAuth App client secret |
| `AUTH_COOKIE_SECRET` | 32-byte random key for AES-256-GCM |
| `ALLOWED_USERS` | Comma-separated GitHub logins (e.g., `ojfbot`) |
| `AUTH_COOKIE_DOMAIN` | Optional: cookie domain for custom domains |

## Consequences

### Gains
- Token never in browser — XSS cannot steal credentials
- Zero additional npm dependencies for auth (raw Node.js crypto + fetch)
- Full proxy means future GitHub integrations (feedback save, article edit) use the same pattern
- Multi-user allowlist ready from day one
- Manual merge step provides final human gate before publish

### Costs
- ~100ms latency per GitHub API call (proxied through Vercel)
- Requires GitHub OAuth App setup (one-time)
- 5 Vercel environment variables to manage
- GitHub token in encrypted cookie has 30-day expiry (re-login monthly)

### Risks Addressed

| Risk | Mitigation |
|---|---|
| XSS token theft | httpOnly cookie — JS cannot read token |
| CSRF on OAuth | state parameter + timing-safe comparison |
| CSRF on stamp | X-Requested-With header + SameSite=Lax |
| Unauthorized stamp | ALLOWED_USERS server-side gate |
| Duplicate stamp | Check for existing branch/PR before creating |
| Stale file SHA | GitHub Contents API optimistic concurrency check |
| Token revocation | Proxy handles 401 by clearing cookie |
| Supply chain | Zero auth dependencies — raw fetch + crypto |

## Alternatives Considered

| Alternative | Why rejected |
|---|---|
| JWT via jose (ADR-0034) | Adds dependency. JWT claims unnecessary — GitHub API provides identity. AES-256-GCM simpler for single-token storage. |
| sessionStorage token | XSS can read sessionStorage. Proxy pattern eliminates this class of attack entirely. |
| GitHub App installation token | Over-engineered for user-facing editorial workflow. Apps are for automation. |
| Direct browser → GitHub API | Token in browser memory. Network tab shows Bearer header. XSS can exfiltrate. |

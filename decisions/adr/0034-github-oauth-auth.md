# ADR-0034: GitHub OAuth Authentication for Editorial UI

Date: 2026-03-28
Status: Proposed
OKR: 2026-Q1 / O1 / KR2 (premium visual treatment)
Commands affected: /validate, /hardening
Repos affected: daily-logger
Linked: ADR-0032 (React migration provides UI layer), ADR-0033 (chat requires authenticated backend)

---

## Context

Daily-logger's React frontend (ADR-0032) is deployed to Vercel as a static SPA. The inline section chat (ADR-0033) requires authenticated API calls to proxy Anthropic requests — exposing the API key in the browser via `anthropic-dangerous-direct-browser-access` is acceptable for a Phase 0 prototype but not for a production editorial workflow. Article status updates (draft → accepted) require authorization to prevent unauthorized modifications.

The existing ojfbot stack uses a JWT middleware pattern (`authenticateJWT` + `checkThreadOwnership`) documented in `core/domain-knowledge/shared-stack.md`. Daily-logger has no Express backend, but Vercel supports serverless functions that can serve the same role.

Three constraints:
1. **Single-developer use case** — the system has one human reviewer (the developer). Auth must be proper but the authorization model is trivially simple: an allowlist of GitHub usernames.
2. **No backend server** — Vercel serverless functions are the only backend surface. No Express, no persistent process.
3. **GitHub identity is natural** — the developer already authenticates to GitHub for the repo. GitHub OAuth provides identity without a separate account system.

## Decision

Implement GitHub OAuth via three Vercel serverless functions. Issue JWTs stored in httpOnly cookies. Authorize against a static allowlist of GitHub usernames.

### Auth Flow

1. **`/api/auth/login`** — Generates a random `state` parameter, stores it in a short-lived cookie, redirects to `https://github.com/login/oauth/authorize` with `client_id`, `redirect_uri`, `scope=read:user`, and `state`.

2. **`/api/auth/callback`** — Receives the OAuth callback. Validates `state` against the cookie to prevent CSRF. Exchanges the `code` for an access token via GitHub's token endpoint. Fetches the user profile (`GET /user`). Validates `login` against the `ALLOWED_USERS` environment variable. If authorized, mints a JWT (HS256, 7-day expiry) containing `{ sub: githubUserId, login: githubUsername }`. Sets the JWT as an httpOnly, secure, SameSite=strict cookie. Redirects to the frontend.

3. **`/api/auth/me`** — Validates the JWT from the cookie. Returns `{ login, avatarUrl }` or 401.

### Protected Endpoints

All endpoints that modify state or call external APIs (chat, status update, feedback save) validate the JWT before proceeding. A shared `validateAuth(request)` utility extracts and verifies the cookie.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `JWT_SECRET` | Random 256-bit key for HS256 signing |
| `ALLOWED_USERS` | Comma-separated GitHub usernames (e.g., `"ojfbot"`) |

### Dev Mode

When `MOCK_AUTH=true`, `/api/auth/me` returns a mock user `{ login: 'dev-user', avatarUrl: '' }` without requiring real OAuth. This matches the `MOCK_AUTH` pattern from `shared-stack.md` and enables local development without a GitHub OAuth App.

### Frontend Integration

- Redux `authSlice`: `user`, `isAuthenticated`, `loading` state. Async thunk calls `/api/auth/me` on app mount.
- `LoginButton` component in header nav: shows "Login" link or user avatar.
- Protected UI elements (chat input, accept button, feedback save) check `isAuthenticated` and show login prompt if false.

### JWT Library

Use `jose` (Edge-compatible, no Node.js crypto dependency) for JWT signing and verification. This is required because Vercel Edge Runtime doesn't support Node.js `crypto` module.

## Consequences

### Gains
- Anthropic API key never touches the browser — all LLM calls proxied through authenticated serverless functions
- Standard OAuth flow — no custom auth system, no password storage
- GitHub identity provides natural authorization via username allowlist
- httpOnly cookie prevents XSS token theft
- `jose` library works in both Edge and Node.js runtimes
- Dev bypass enables local development without OAuth App setup

### Costs
- Requires GitHub OAuth App setup (one-time, ~2 minutes in GitHub Settings)
- Adds 4 Vercel environment variables to manage
- Cookie-based auth requires CSRF consideration (mitigated by SameSite=strict + state parameter)
- 7-day JWT expiry means re-login weekly (acceptable for single-developer)

### Neutral
- Allowlist is trivially one entry for the current use case but scales to multiple reviewers if needed
- No refresh token mechanism — JWT expiry forces full re-auth, which is fine for weekly cadence

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| localStorage API key (ADR-0033 Phase 0) | Exposes Anthropic key in DevTools; not suitable for production serverless endpoints |
| Vercel Auth / Auth.js | Adds significant dependency weight and vendor coupling for a single-user case |
| Magic link email auth | Over-engineered for single user; GitHub identity is already the natural identity |
| No auth, IP restriction | Unreliable on mobile/VPN; not a proper auth mechanism; can't distinguish users |
| API key in request header | Still requires the key in the browser; no better than direct API calls |
| GitHub App (not OAuth App) | Over-complex for user authentication; Apps are for repo automation, not user identity |

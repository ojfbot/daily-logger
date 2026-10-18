# ADR-0040: Verified article actions in one registry

Status: proposed. Implementation authorized by the operator on October 17, 2026.

## Context

An article can preserve a disproved suggestion in its active block while explaining its disposition elsewhere. Rebuilding the action index from that prose admits stale work again. Another model pass alone cannot fix this because quoted history still looks like an executable suggestion.

The operator approved preserving the existing queue and reconciling current and future articles. Admission must run automatically during multiagent drafting and revision. Human review keeps an opt-out control, without becoming a required per-suggestion approval step.

## Decision

`actions/registry.json` freezes imported identities, original rows, historical appearances, and held suggestions. `actions/articles/YYYY-MM-DD.json` owns that article's new identities, inclusion choices, decisions, and review receipt. Together they form one logical registry. Only the dated file is writable in an article cycle. Markdown and static JSON APIs are projections. Generation, editorial revision, clean acceptance, cleaner context, and the frontend all use this registry in one delivery. The old markdown admission parser is available only to the explicit one-shot importer and its tests.

A Sonnet proposer reconciles current suggestions and relevant earlier work against source evidence and goals. It selects numbered source lines; code resolves their exact text before an independent Opus verifier judges each proposed disposition and candidate. Code also checks identities, verdict coverage, article binding, terminal states, protected historical records, and admission limits. Each decision retains its verifier and evidence. Missing evidence holds the existing action or excludes a new candidate. An optional held or invalid disposition is rejected without discarding valid work. A provider outage or material unresolved finding retains the daily article as a draft with action review pending, no new admissions, and acceptance blocked. Editorial failures preserve the prior accepted state.

Each article can introduce at most two new identities across its whole revision cycle. Completed, excluded, or rejected work does not create another admission slot. Equivalent work keeps its identity and opt-out choice. Existing work can supply the next checkpoint when no grounded new suggestion passes. A new date or new wording does not establish novelty. One repair attempt is allowed for malformed JSON, schema, or source-line selections. Semantic holds and provider failures do not trigger another negotiation. Bot output does not start another round; changed human feedback can resume the supervised cycle.

Draft decisions are proposals. Accepted article receipts commit dispositions and admit checked suggestions to the open feed. A status change without a matching fresh receipt fails publication. A later draft cannot close work or alter an earlier accepted article's displayed disposition. Completion, dismissal, supersession, and deferral retain distinct states. Dismissals never increase the completed-work count.

The draft article shows a checked-by-default **Include in master actions index** control for its new suggestions. A change saves to the existing `accept/YYYY-MM-DD` branch using GitHub Contents SHA comparison. Acceptance reuses that branch after complete immutable-tree and inclusion-only checks, and publishes a commit with its exact parent through a non-force ref update. An agent can make the same choice with an identified operator instruction through `pnpm actions:reconcile`. The checkbox controls admission before acceptance. Accepted work requires an explicit verified disposition.

Initial and continued editorial jobs execute a pinned trusted policy and emit exact output receipts. Further editorial rounds and every acceptance PR head require a matching hash-named immutable Actions artifact and bot receipt with workflow provenance, first-attempt identity, exact dated blob, direct parent, and ancestry, or an explicit inclusion-only change. Trusted main retains the normal human-reviewed authority for source/data PRs.

The Git commit containing the article and registry is the publication boundary. Local writers check both inputs under one registry lock and restore article bytes on an ordinary write failure. A process crash can leave interrupted local files; stale-binding checks prevent their publication. Retrying reconciles from the canonical registry. Git conflicts and Contents SHA conflicts require a refresh, never last-writer-wins behavior.

## Historical boundary

The importer freezes 91 open and 125 completed rows at `d540e2c5d7aa21b3916c3db1527e993e66c705bd`. This includes the original 88 open and 125 completed rows plus three October 18 identities accepted on main while this PR was open. Public IDs and completion objects remain unchanged, including 64 old completion rows without IDs. Internal keys identify those rows without adding public IDs. The 138 held suggestions retain their exact source lines and hashes for duplicate review. They are not admitted. The three protected October 15 records retain their existing execution and settlement limits.

## Consequences

The cutover needs one merge, without a second runtime writer or a gradual compatibility period. Model latency and source availability can block a review. This is preferable to publishing a suggestion the verifier cannot support. Independent model agreement does not prove semantic equivalence or source truth; exact evidence checks, preserved history, bounded admission, regression tests, and human article acceptance provide separate controls.

The migration preserves the October 17 original queue rows. This delivery then reconciles that current article: its repeated unsupported prerequisite and closure instruction are dismissed, and the #372 review is completed from fresh merge evidence. Its resolved suggestions move into the history card. Historical article cleanup is outside this delivery.

Verification commands and operational limits are recorded in [Action intake](../../docs/action-intake.md).

## Storage, cost, and recovery

The frozen baseline is 556,370 bytes. October 17's dated state is about 32 KiB. Each dated file has a 64 KiB ceiling, so 365 daily files add at most 22.9 MiB per year. Git stores earlier review rounds. The current file retains only the current round and its cited excerpts, source locators, and full-source hashes. Full discussions are transient review inputs. The browser reads and writes one dated file with a SHA comparison.

Each source is limited to 128 KiB, all current sources to 384 KiB, and the serialized review context to 640 KiB. Exceeding a budget holds action admission and preserves a pending daily draft. The model receives compact global identity context and only the current article's prior rejection context. Deterministic duplicate checks inspect the composed registry. Separate unmerged branches cannot reserve work globally; merging duplicate work keys fails closed and requires reconciliation. Independent date files merge without a shared append conflict.

A review normally makes two model calls, with at most one pair for format repair. Calls have no SDK retries and a two-minute timeout. Token cost depends on the cited sources; there is no fixed dollar estimate. Acceptance intentionally runs a fresh pair because state and evidence may change since drafting. Suggestions remain provisional until that review passes and the owner merges the visible output.

Rejected storage alternatives were a mutable monolithic file, which creates a daily conflict and reader-size problem; a second advisory queue, which restores competing authority; and SQLite or Dolt, which adds deployment and service ownership to a standalone Git pipeline. The dated-file layout uses the existing Git, CI, and deployment boundary.

The operational pause switch, evidence-window limits, editorial rebind, and atomic rollback procedure are in [Action recovery](../../docs/action-recovery.md). A whole-prose binding remains deliberate. A documented model-free rebind repairs a prose-only edit without changing decisions, evidence, or the model round.

# ADR-0040: Verified article actions in one registry

Status: proposed. Implementation authorized by the operator on October 17, 2026.

## Context

An article can preserve a disproved suggestion in its active block while explaining its disposition elsewhere. Rebuilding the action index from that prose admits stale work again. Another model pass alone cannot fix this because quoted history still looks like an executable suggestion.

The operator approved preserving the existing queue and reconciling current and future articles. Admission must run automatically during multiagent drafting and revision. Human review keeps an opt-out control, without becoming a required per-suggestion approval step.

## Decision

`actions/registry.json` owns action identities, immutable original rows, verified decisions, inclusion choices, historical holds, and article review receipts. Markdown and static JSON APIs are projections. Generation, editorial revision, clean acceptance, cleaner context, and the frontend all use this registry in one delivery. The old markdown admission parser is available only to the explicit one-shot importer and its tests.

A Sonnet proposer reconciles current suggestions and relevant earlier work against source evidence and goals. It selects numbered source lines; code resolves their exact text before an independent Opus verifier judges each proposed disposition and candidate. Code also checks identities, verdict coverage, article binding, terminal states, protected historical records, and admission limits. Each decision retains its verifier and evidence. Missing evidence holds the existing action or excludes a new candidate. A failed review leaves canonical files unchanged.

Each article can introduce at most two new identities across its whole revision cycle. Completed, excluded, or rejected work does not create another admission slot. Equivalent work keeps its identity and opt-out choice. Existing work can supply the next checkpoint when no grounded new suggestion passes. A new date or new wording does not establish novelty. One repair attempt is allowed. Bot output does not start another round; changed human feedback can resume the supervised cycle.

Draft decisions are proposals. Accepted article receipts commit dispositions and admit checked suggestions to the open feed. A status change without a matching fresh receipt fails publication. A later draft cannot close work or alter an earlier accepted article's displayed disposition. Completion, dismissal, supersession, and deferral retain distinct states. Dismissals never increase the completed-work count.

The draft article shows a checked-by-default **Include in master actions index** control for its new suggestions. A change saves to the existing `accept/YYYY-MM-DD` branch using GitHub Contents SHA comparison. Acceptance reuses that branch. An agent can make the same choice with an identified operator instruction through `pnpm actions:reconcile`. The checkbox controls admission before acceptance. Accepted work requires an explicit verified disposition.

The Git commit containing the article and registry is the publication boundary. Local writers check both inputs under one registry lock and restore article bytes on an ordinary write failure. A process crash can leave interrupted local files; stale-binding checks prevent their publication. Retrying reconciles from the canonical registry. Git conflicts and Contents SHA conflicts require a refresh, never last-writer-wins behavior.

## Historical boundary

The importer freezes 88 open and 125 completed rows at `faac3c9bb310bc0fc1c1ec445433e310e0498558`. Public IDs and completion objects remain unchanged, including 64 old completion rows without IDs. Internal keys identify those rows without adding public IDs. The 138 held suggestions retain their exact source lines and hashes for duplicate review. They are not admitted. The three protected October 15 records retain their existing execution and settlement limits.

## Consequences

The cutover needs one merge, without a second runtime writer or a gradual compatibility period. Model latency and source availability can block a review. This is preferable to publishing a suggestion the verifier cannot support. Independent model agreement does not prove semantic equivalence or source truth; exact evidence checks, preserved history, bounded admission, regression tests, and human article acceptance provide separate controls.

The migration preserves the October 17 original queue rows. This delivery then reconciles that current article: its repeated unsupported prerequisite and closure instruction are dismissed, and the #372 review is completed from fresh merge evidence. Its resolved suggestions move into the history card. Historical article cleanup is outside this delivery.

Verification commands and operational limits are recorded in [Action intake](../../docs/action-intake.md).

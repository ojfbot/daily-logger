# Open reviews and saved discussion

An authorized reader can inspect a review while its PR is still open. Reviews
are grouped by exact article blob; each card shows its recorded reviewer claim,
review ID, lifecycle, freshness and GitHub carrier before the detailed findings.
An open record is proposed and a merged registration is published. Neither
state accepts the article or establishes that a finding or reviewer claim is
correct.

The authenticated review service owns discovery and routing. It admits bounded,
validated same-repository review-data PRs to main, verifies their registry
manifest and article/full-review blob bindings, and rechecks their observed head.
It does not run branch code or adopt correspondence destinations from an
unmerged registry. Published-path commit/PR associations and exact `accept/date`
branch lookup recover historical review and human editorial correspondence.
Missing access, malformed records, source changes and reader limits are visible
availability failures, never a clean-review verdict.

The correspondence panel loads PR descriptions, decoded version-2 editorial
feedback, ordinary comments, submitted reviews and inline discussions from
GitHub. It groups them by review PR, editorial PR or pilot issue and shows each
PR's current structured head, state and GitHub author. Saved section notes and
completed assistant transcripts reload into the section UI as well. Account
attribution comes from GitHub; reviewer, assistant model and session metadata
are recorded claims. Unstructured PR bodies, comments and reviews can also make
model, session, identity or commit claims, so the UI keeps those claims in raw
text and labels them unverified. A shared account cannot prove independent agent
identity. GitHub edits and deletions change the returned history; this is not an
immutable archive.

The current PR head is not a historical event receipt. If a PR moves after a
workflow comment, GitHub's issue-comment object does not identify the output head
that produced that comment. The UI shows the current structured head and leaves
any body-reported commit as unverified text. Exact per-event input/output heads
need a separate structured producer receipt.

**Save note** records text without a provider call or article acceptance. **Ask
assistant** remains a separate explicit action using the existing configured
provider. The human message must save first; completed output then receives its
own receipt. A failed output save can be retried without another model call.
Partial streams and unsent drafts are not durable messages. A saved thread can
be hidden locally; this does not delete its GitHub comments.

The server chooses an eligible source PR; an existing trusted-main per-date
pilot issue is only a fallback. Ambiguous or absent targets disable saves.
Correspondence shares the destination's GitHub visibility. New writes require
the visible article still to match main. Historical discussion remains readable;
selecting it as new editorial instructions is deliberate rather than automatic.

Append-only comments carry exact UTF-8 payloads, stable request/thread IDs and
the actual posting account. Serial identical retries reuse a receipt; changed
payloads under one ID conflict. GitHub cannot atomically enforce one comment per
ID, so concurrent duplicate physical writes remain possible. Reads reconcile
identical envelopes and disclose conflicts. Comment display neutralizes the
repository's known mention/command triggers; loading or saving creates no
acceptance branch, PR, provider dispatch, action disposition or finding decision.

Verification: run `pnpm test` and `pnpm test:browser` for native source/admission
controls and real component/service browser cases with controlled GitHub and
provider boundaries. Then verify authorized production OAuth, proposed PR
visibility and durable reload separately. Fixture success alone does not prove
production deployment or OAuth configuration.

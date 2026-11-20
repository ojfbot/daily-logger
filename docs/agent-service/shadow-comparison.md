# Three-day deployed shadow comparison

Owner-requested rollout proposal, 2026-11-17 America/Chicago. Run the existing GitHub Actions writer and the deployed persistent LangGraph application across the same daily reporting intervals, with an independent third agent evaluating their outputs. Default to three days; allow an explicit owner decision to end the quality comparison after day one if the improvement is already clear. This document does not start a deployment, schedule or paid run.

## Placement and ownership

Run this at the M2-to-M3 transition, after real generation, private review controls, bounded provider use and the deployment profile work. The LangGraph candidate must run on its intended host with persistent database and artifact storage; a local script replay is not the deployed comparison.

During the trial, Actions remains the sole public producer. The LangGraph candidate writes isolated private trial artifacts and review records, with no publication credentials, article/accept branch writes, auto-merge eligibility, canonical action admission, Cleaner trigger or fleet execution effects. Its action suggestions remain proposals. The judge reads evidence and writes evaluation records only. The existing public journal continues its normal path.

Before admission, record the trial owner, start/end intervals, pinned releases and prompts, provider routes, per-run/total spend and time ceilings, private artifact destination, judge configuration and stop control. Default to three consecutive scheduled intervals under the existing 03:30 America/Chicago cutoff rules, including DST. Account for skips and failures; do not manufacture activity. If three days yield fewer than three eligible pairs, report the actual sample and obtain an explicit extension or a decision based on that limitation.

## Make each comparison interpretable

For each eligible interval, capture an immutable source manifest and the exact legacy input bundle. Feed the same collected facts and bounded recent-article history to the candidate through the extraction adapter. Pin the owner-approved CircusGreen priority snapshot used by the evaluator and candidate, and record whether/how the legacy prompt receives that context. Preserve the deployed legacy configuration as the baseline; do not quietly modernize it during the trial.

This evaluates the complete proposed writing experience, including intentional context, prompt, model and reviewer changes. A better article alone does not identify which change caused the improvement. Record each difference. If the live collectors produce different facts, retain their manifests and a coverage diff; mark the live pair unmatched and, within the existing budget, replay the candidate on the captured legacy evidence for a matched editorial comparison. Report collection quality separately from writing quality.

Label primary deployed runs and diagnostic replays separately, including their latency, cost and failure receipts. A replay can explain a difference but cannot substitute for a missing or failed primary deployed candidate, satisfy the day-one complete-pair requirement, or conceal unresolved collector/execution defects.

Capture comparable pipeline stages: each writer's final machine-reviewed Draft before human edits. Keep human-edited/published versions as separate observations. Freeze article and action artifact identities, evidence and priority revisions, prompt/model/graph versions, source cutoff, start/end times, token usage, provider cost, retries, failures and manual interventions. A timeout or missing output is a recorded reliability result, not an omitted losing example. Any change to a writer during the trial creates a named variant; do not combine its results with the previous version without showing the change.

## Independent third-agent judge

Use a separate judge invocation with no writer conversation or self-review history. Present the pair under randomized A/B labels, hiding runner/model identity and normalizing presentation without changing article content. Provide the frozen evidence, approved priorities, relevant previous articles and immutable action-state index. The judge must treat article/evidence text as data, cite specific passages and source references, and identify missing evidence rather than inventing it.

Use two bounded judgments per complete pair with swapped ordering, at most six scheduled judge calls for the default trial. Record disagreement or order sensitivity for human review. Pin the judge model, prompt/rubric version and generation settings; prefer a separately configured model route when available within the trial budget. Provider diversity does not establish impartiality. Missing/failed judgments remain visible; a retry needs a recorded attempt within the fixed call/spend ceiling.

Judge design should account for documented position, verbosity and self-preference biases. Blinding and order reversal are safeguards, not proof that the judge is unbiased. [Primary LLM-judge study](https://arxiv.org/abs/2306.05685).

| Criterion | Evidence the judge must examine |
| --- | --- |
| Factual grounding and coverage | Supported shipment/decision claims, important omissions, accurate uncertainty and source references |
| Current fleet relevance | Connection to approved CircusGreen priorities; obsolete Frame-only framing or invented goals |
| Useful change versus repetition | New information relative to recent articles; repeated inventories, stale concerns and unnecessary boilerplate |
| Editorial usefulness | Clear explanation of what changed, why it matters and the decisions/tradeoffs; no reward for length alone |
| Follow-up quality | Distinct, actionable suggestions with original identities; no reopening completed/held work or implying admission |

Score each criterion on a fixed 0–4 rubric with written anchors and evidence. Return A/B/tie/insufficient-evidence preference, concrete reasons and confidence separately; do not let a single average conceal a failed requirement. Calibrate the rubric on a few existing owner-reviewed articles before the trial. Store deterministic findings, judge findings and the owner's judgment as different record types. Langfuse supports rubric-based model evaluation and human calibration; use its evaluation records alongside durable application receipts. [Langfuse judge documentation](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge).

Deterministic checks run before preference scoring: schema validity, verifiable references, preserved action IDs/holds, output policy and privacy checks. Unsupported material claims, prohibited disclosure or unauthorized state changes block advancement even if the prose wins. Neither a passing deterministic check nor the judge's opinion replaces owner review.

## Daily review and trial report

Give the owner a compact private side-by-side page with blinded articles, source-backed differences, judge reasons/disagreements, deterministic failures, and cost/latency/recovery measurements. Let the owner record a preference before revealing runner identities. Link each pair to its durable run/attempt/artifact records and sanitized Langfuse observations or experiment results. A telemetry outage must not lose the comparison artifacts or turn into a fabricated score.

Each day's receipt records scheduled/eligible/skipped/failed status, whether inputs matched, quality findings, runtime behavior, spend and owner disposition. The final report includes every scheduled interval, the actual number of complete pairs, all variants and failures, recurring improvements/regressions, and unresolved risks. Three pairs are directional evidence, not a statistically established win rate.

## Decision and cutover

At day three, the owner chooses cut over when the required gates are ready, extend with a stated question/budget, repair and rerun named cases, or retain Actions. Success means source-grounded coverage and action integrity are preserved, current priorities are represented, repetition falls in the owner's judgment, and runtime/cost behavior is acceptable. The third agent recommends; it cannot authorize the switch.

The owner may end the comparison after the first complete pair if the improvement is unmistakable and there are no blocking factual, privacy or action-integrity findings. Record that this is a one-day decision with limited evidence. An early quality decision permits production transfer only after the pre-transfer host, restore, exact-version acceptance, shared publication authority/fencing and recovery requirements are independently satisfied. Otherwise keep the candidate in shadow while completing those checks.

Transfer production ownership once through the M3 gate, after reconciling outstanding effects and queued merges. Normal transfer begins with the next unclaimed reporting interval; if Actions has already published the trial day's article, replacing it is a separate explicit editorial revision, not a second normal publication. Disable the competing producer; never let both publish the same interval.

The seven-consecutive-scheduled-interval production observation clock starts with the first interval assigned to the local service after verified authority transfer. Count and explain intentional skips, misses and any failover in that window; require at least three eligible local Drafts verified live, extending observation when needed. Shadow intervals do not satisfy this production window or its live-Draft minimum. Eligibility to transfer after a successful comparison is distinct from completed Publisher qualification and later automatic Cleaner activation, which also requires Cleaner's own checks. A day-one editorial win cannot waive that later qualification.

## Implementation and acceptance evidence

Add a trial controller/configuration, captured-input adapter, immutable pair manifest, judge workflow with bounded calls and versioned rubric, private comparison/readback view, and report export. Reuse M1–M3 admission, budget, artifact, auth and telemetry interfaces; no new fleet-wide event store is needed.

Before a live comparison, prove on fixtures that duplicate daily admission creates one candidate; candidate/judge credentials cannot publish or admit actions; restart retains completed work and human annotations; differing inputs and missing outputs remain visible; order reversal is recorded; privacy masking covers judge exports; and a trial stop prevents further admissions without changing the active public producer. Then retain actual deployed trial receipts and the owner's cutover/extension decision.

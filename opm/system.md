# System model — Mermaid compatibility views

> Generated from `system.opl` by the /opm subset renderer v1. Do not hand-edit.
> Source SHA-256: `1ba28656aa7709bd5471b28d1b0fca836933b70da2aeda960d24af1ee7ffc9fb`.
> Lossy projection, not a native OPD or ISO conformance claim. Rounded process nodes and
> labeled arrows replace standard symbols. States are summarized; native state, control,
> property, and refinement geometry is omitted. No order is inferred from decomposition.

## SD — daily-logger: one article per day

**Caption:** This view summarizes the source facts in this section. Rectangles identify objects;
rounded nodes identify processes. Labeled solid arrows distinguish human participation,
required instruments, and transformations. These are compatibility labels, not native OPM links.
Use the source facts below for properties, state detail, and decomposition membership.

```mermaid
---
title: "SD — daily-logger: one article per day"
---
flowchart TD
  accTitle: SD — daily-logger: one article per day
  accDescr: Lossy system model projection. Complete source facts follow this diagram.
  n19["Jim"]
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n36["Claude API"]
  style n36 stroke-dasharray: 5 5
  n0["Article — states: draft, accepted, rejected"]
  n1["Run Admission — states: generate, recover, complete"]
  n2["Cron Firing"]
  n3("Run Admitting")
  n5("Run Evidence Capturing")
  n6["Run Evidence"]
  n7("Article Generating")
  n8("Branch Recovering")
  n9["Article Completion"]
  n10("Cleaner Admitting")
  n11["Cleaner Admission — states: run, skip"]
  n12("Stale Content Cleaning")
  n13["Canonical Action Projection"]
  n14("Fallback Checking")
  n15["Fallback Decision — states: missing, active, complete, failed"]
  n16("Fallback Dispatching")
  n17["Workflow Run"]
  n18["Draft Action Candidates"]
  n20("Editorial Accepting")
  n21("API Building")
  n22("Action Projecting")
  n23["Action Registry"]
  n24["Closing Prompt — states: legacy-options, ranked-shortlist, needs-evidence"]
  n25("Suggested Action Card Rendering")
  n26["Suggested Actions Card"]
  n27["Draft Continuation Context — states: transient, retained"]
  n28("Action Reconciling")
  n29["Action Review Cycle — states: generation, revision"]
  n30["Source Evidence"]
  n31["Recommendation Maintenance Memory"]
  n32["Draft Candidate Evidence Requirements — states: prior-binding, current-binding"]
  n33("Suggestion Proposing")
  n34("Candidate Reference Resolving")
  n35("Suggestion Verifying")
  n37["Provider Action Proposal"]
  n38["Provider Action Proposal and Draft Action Candidates"]
  n39["Canonical Action Proposal"]
  n40["Malformed Output Repair Budget — states: available, spent"]
  n41("Action Output Repairing")
  n42["Output Shape Diagnostic"]
  n43["Lossless Action Model View"]
  n44["Candidate Record Binding — states: available, unavailable"]
  n45("Candidate Record Isolating")
  n46("Candidate Record Repairing")
  n47["Candidate Record Binding, Provider Action Proposal, and Source Evidence"]
  n48["Draft Action Candidate — states: awaiting-review, promoted, mapped-existing, rejected, verified-closure"]
  n156["Candidate Review History"]
  n207["Candidate Review Transition"]
  n208["Historical Source Metadata"]
  n49["Source Identity, Source Kind, Source Locator, and Full Content Digest"]
  n50["Draft Candidate Evidence Association — states: required, context"]
  n209["Background Evidence Reference"]
  n210["Candidate Action Relation"]
  n211["Candidate Input View"]
  n51["Action Registry, Draft Action Candidates, Action Review Cycle, Operator Feedback, and Article Status"]
  n52("Candidate Evidence Preparing")
  n212["Canonical Action Index"]
  n213["Held Suggestion Memory"]
  n214["Rejection Memory"]
  n53["Action Review Snapshot"]
  n54("Candidate Evidence Refreshing")
  n55["unchanged Draft Candidate Evidence Association"]
  n56["unchanged prior Candidate Input View"]
  n57["Accepted Outcome Stamp"]
  n58["Action Review Snapshot and Accepted Outcome Stamp"]
  n59("Acceptance Status Evidence Refreshing")
  n60["current-binding Draft Candidate Evidence Requirements"]
  n215["Ranked Recommendations"]
  n216["Handled Suggestions"]
  n61("Editorial Revising")
  n62["Editorial Revision Request"]
  n63["Draft Suggestion — states: proposed, open, done, dismissed, superseded, deferred"]
  n161["Imported Action Baseline"]
  n113["Article Action Files — states: pending, verified"]
  n64("Inclusion Choosing")
  n65["Reviewed Disposition — states: deferred, completed-existing-evidence, pending-receipt"]
  n217["Canonical Actions"]
  n66["JSON API"]
  n67("Frontend Rendering")
  n68["Rendered Site"]
  n69["Article Fingerprint"]
  n70("Independent Review Projecting")
  n71["Review Projection"]
  n72("Revision Requesting")
  n73["Revision Request"]
  n74("Conversation Saving")
  n75["Saved Message"]
  n218["Review Records"]
  n219["Correspondence"]
  n76["Time Record Pointer"]
  n77("Time Recording")
  n78["Commit Context"]
  n79["Issue Context"]
  n80["Time Evidence"]
  n81("Time Backfilling")
  n82("Time Resolving")
  n83["Time References"]
  n84["Shipment Timestamp — states: available, unavailable"]
  n85["Shipment Source State — states: open, closed-unmerged"]
  n86["Shipment Coverage — states: complete, unavailable"]
  n87("Shipment Time Resolving")
  n88("Issue Time Resolving")
  n89["Projected Issue Times"]
  n90["Time Expressions"]
  n91("Time Projecting")
  n92("Shipment Coverage Checking")
  n93["Projected Time References"]
  n94["Projected Shipment Timestamps"]
  n95["Projected Time Expressions"]
  n96("Time Visualizing")
  n97["Device Timezone"]
  n98["Time Popover"]
  n99("Time Metadata Preserving")
  n2 -->|"object event"| n3
  n4 -->|"requires (instrument)"| n3
  n3 -->|"yields"| n1
  n3 -->|"invokes"| n5
  n4 -->|"requires (instrument)"| n5
  n5 -->|"yields"| n6
  n1 -->|"condition: generate"| n7
  n1 -->|"condition: recover"| n8
  n4 -->|"requires (instrument)"| n8
  n8 -->|"yields"| n9
  n7 -->|"yields"| n9
  n9 -->|"requires (instrument)"| n10
  n10 -->|"yields"| n11
  n11 -->|"condition: run"| n12
  n13 -->|"requires (instrument)"| n12
  n12 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n14
  n14 -->|"yields"| n15
  n15 -->|"condition: missing"| n16
  n4 -->|"requires (instrument)"| n16
  n16 -->|"yields"| n17
  n17 -->|"object event"| n3
  n7 -->|"yields"| n0
  n7 -->|"yields"| n18
  n19 -->|"handles (human)"| n20
  n20 -->|"changes: draft to accepted"| n0
  n0 -->|"requires (instrument)"| n21
  n0 -->|"requires (instrument)"| n22
  n23 -->|"requires (instrument)"| n22
  n22 -->|"yields"| n13
  n24 -->|"requires (instrument)"| n25
  n23 -->|"requires (instrument)"| n25
  n25 -->|"yields"| n26
  n0 -->|"requires (instrument)"| n28
  n23 -->|"requires (instrument)"| n28
  n29 -->|"requires (instrument)"| n28
  n30 -->|"requires (instrument)"| n28
  n31 -->|"requires (instrument)"| n28
  n18 -->|"requires (instrument)"| n28
  n32 -->|"requires (instrument)"| n28
  n28 -->|"invokes"| n33
  n28 -->|"invokes"| n34
  n28 -->|"invokes"| n35
  n36 -->|"requires (instrument)"| n33
  n36 -->|"requires (instrument)"| n35
  n31 -->|"requires (instrument)"| n33
  n31 -->|"requires (instrument)"| n35
  n18 -->|"requires (instrument)"| n33
  n33 -->|"yields"| n37
  n38 -->|"requires (instrument)"| n34
  n34 -->|"yields"| n39
  n39 -->|"requires (instrument)"| n35
  n28 -->|"invokes"| n41
  n40 -->|"condition: available"| n41
  n41 -->|"changes: available to spent"| n40
  n42 -->|"requires (instrument)"| n41
  n43 -->|"requires (instrument)"| n41
  n38 -->|"requires (instrument)"| n45
  n45 -->|"yields"| n44
  n33 -->|"invokes"| n45
  n44 -->|"condition: available"| n46
  n41 -->|"invokes"| n46
  n47 -->|"requires (instrument)"| n46
  n36 -->|"requires (instrument)"| n46
  n46 -->|"yields"| n37
  n18 -->|"requires (instrument)"| n35
  n28 <-->|"affects"| n23
  n28 <-->|"affects"| n0
  n28 -->|"yields"| n24
  n28 -->|"yields"| n31
  n28 -->|"changes: transient to retained"| n27
  n48 -->|"part of"| n18
  n207 -->|"part of"| n156
  n208 -->|"part of"| n156
  n208 -->|"exhibits"| n49
  n50 -->|"part of"| n32
  n209 -->|"part of"| n32
  n210 -->|"part of"| n32
  n211 -->|"part of"| n32
  n51 -->|"requires (instrument)"| n52
  n52 -->|"yields"| n32
  n212 -->|"part of"| n211
  n213 -->|"part of"| n211
  n214 -->|"part of"| n211
  n53 -->|"requires (instrument)"| n54
  n55 -->|"requires (instrument)"| n54
  n56 -->|"requires (instrument)"| n54
  n54 -->|"changes: prior-binding to current-binding"| n32
  n20 -->|"yields"| n57
  n58 -->|"requires (instrument)"| n59
  n0 -->|"condition: accepted"| n59
  n59 -->|"yields"| n60
  n215 -->|"part of"| n26
  n18 -->|"part of"| n26
  n27 -->|"part of"| n26
  n216 -->|"part of"| n26
  n7 -->|"yields"| n29
  n7 -->|"invokes"| n28
  n61 -->|"yields"| n29
  n61 -->|"invokes"| n28
  n62 -->|"requires (instrument)"| n61
  n20 -->|"yields"| n29
  n61 -->|"invokes"| n52
  n20 -->|"invokes"| n52
  n20 -->|"invokes"| n28
  n161 -->|"part of"| n23
  n113 -->|"part of"| n23
  n23 -->|"requires (instrument)"| n64
  n4 -->|"requires (instrument)"| n64
  n64 <-->|"affects"| n23
  n19 -->|"handles (human)"| n64
  n217 -->|"part of"| n13
  n65 -->|"part of"| n13
  n21 -->|"invokes"| n22
  n13 -->|"requires (instrument)"| n21
  n21 -->|"yields"| n66
  n66 -->|"requires (instrument)"| n67
  n13 -->|"requires (instrument)"| n67
  n67 -->|"yields"| n68
  n21 -->|"yields"| n69
  n67 -->|"invokes"| n70
  n4 -->|"requires (instrument)"| n70
  n69 -->|"requires (instrument)"| n70
  n70 -->|"yields"| n71
  n19 -->|"handles (human)"| n72
  n71 -->|"requires (instrument)"| n72
  n72 -->|"yields"| n73
  n72 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n74
  n69 -->|"requires (instrument)"| n74
  n71 -->|"requires (instrument)"| n74
  n74 -->|"yields"| n75
  n74 <-->|"affects"| n4
  n218 -->|"part of"| n71
  n219 -->|"part of"| n71
  n0 -->|"exhibits"| n76
  n0 -->|"requires (instrument)"| n77
  n13 -->|"requires (instrument)"| n77
  n78 -->|"requires (instrument)"| n77
  n79 -->|"requires (instrument)"| n77
  n77 -->|"yields"| n80
  n77 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n81
  n4 -->|"requires (instrument)"| n81
  n81 -->|"yields"| n80
  n81 -->|"invokes"| n82
  n80 -->|"requires (instrument)"| n82
  n0 -->|"requires (instrument)"| n82
  n82 -->|"yields"| n83
  n0 -->|"requires (instrument)"| n87
  n80 -->|"requires (instrument)"| n87
  n85 -->|"requires (instrument)"| n87
  n87 -->|"yields"| n84
  n0 -->|"requires (instrument)"| n88
  n13 -->|"requires (instrument)"| n88
  n80 -->|"requires (instrument)"| n88
  n88 -->|"yields"| n89
  n77 -->|"invokes"| n87
  n82 -->|"yields"| n90
  n21 -->|"invokes"| n91
  n21 -->|"invokes"| n92
  n0 -->|"requires (instrument)"| n92
  n80 -->|"requires (instrument)"| n92
  n92 -->|"yields"| n86
  n0 -->|"requires (instrument)"| n91
  n13 -->|"requires (instrument)"| n91
  n80 -->|"requires (instrument)"| n91
  n91 -->|"invokes"| n82
  n91 -->|"invokes"| n87
  n91 -->|"invokes"| n88
  n91 -->|"yields"| n93
  n91 -->|"yields"| n94
  n93 -->|"part of"| n66
  n94 -->|"part of"| n66
  n89 -->|"part of"| n66
  n91 -->|"yields"| n95
  n95 -->|"part of"| n66
  n67 -->|"invokes"| n96
  n93 -->|"requires (instrument)"| n96
  n94 -->|"requires (instrument)"| n96
  n89 -->|"requires (instrument)"| n96
  n97 -->|"requires (instrument)"| n96
  n96 -->|"yields"| n98
  n19 -->|"handles (human)"| n61
  n61 -->|"invokes"| n99
  n0 -->|"requires (instrument)"| n99
  n99 <-->|"affects"| n0
```

Initial-state shorthand: Draft. Object scope must be checked in the source model.

**Source facts (OJF-OPL; bracketed provenance is local metadata):**

```text
Jim is physical.
GitHub is environmental.
Claude API is environmental.
Article can be draft, accepted, or rejected. [src: src/schema.ts]
Draft is initial.
Run Admission can be generate, recover, or complete. [src: .github/scripts/daily_blog_schedule.py]
Cron Firing triggers Run Admitting. [src: .github/workflows/daily-blog.yml]
Run Admitting requires GitHub. [src: .github/scripts/daily_blog_schedule.py]
Run Admitting yields Run Admission. [src: .github/scripts/daily_blog_schedule.py]
Run Admitting invokes Run Evidence Capturing. [src: .github/scripts/daily_blog_schedule.py]
Run Evidence Capturing requires GitHub. [src: .github/scripts/daily_blog_schedule.py]
Run Evidence Capturing yields Run Evidence. [src: .github/scripts/daily_blog_schedule.py]
Article Generating occurs if Run Admission is generate. [src: .github/workflows/daily-blog.yml]
Branch Recovering occurs if Run Admission is recover. [src: .github/workflows/daily-blog.yml]
Branch Recovering requires GitHub. [src: .github/workflows/daily-blog.yml]
Branch Recovering yields Article Completion. [src: .github/workflows/daily-blog.yml]
Article Generating yields Article Completion. [src: .github/workflows/daily-blog.yml]
Cleaner Admitting requires Article Completion. [src: .github/scripts/daily_blog_schedule.py]
Cleaner Admitting yields Cleaner Admission. [src: .github/scripts/daily_blog_schedule.py]
Cleaner Admission can be run or skip. [src: .github/scripts/daily_blog_schedule.py]
Stale Content Cleaning occurs if Cleaner Admission is run. [src: .github/workflows/daily-cleaner.yml]
Stale Content Cleaning requires Canonical Action Projection. [src: src/cleaner.ts]
Stale Content Cleaning affects GitHub. [src: .github/workflows/daily-cleaner.yml]
Fallback Checking requires GitHub. [src: .github/scripts/daily_blog_schedule.py]
Fallback Checking yields Fallback Decision. [src: .github/scripts/daily_blog_schedule.py]
Fallback Decision can be missing, active, complete, or failed. [src: .github/scripts/daily_blog_schedule.py]
Fallback Dispatching occurs if Fallback Decision is missing. [src: .github/scripts/daily_blog_schedule.py]
Fallback Dispatching requires GitHub. [src: .github/scripts/daily_blog_schedule.py]
Fallback Dispatching yields Workflow Run. [src: .github/scripts/daily_blog_schedule.py]
Workflow Run triggers Run Admitting. [src: .github/workflows/daily-blog.yml]
Article Generating yields Article. [src: src/index.ts]
Article Generating yields Draft Action Candidates. [src: src/index.ts]
Jim handles Editorial Accepting. [src: .github/workflows/editorial-revise.yml]
Editorial Accepting changes Article from draft to accepted. [src: packages/frontend/src/utils/stampDraft.ts]
API Building requires Article. [src: src/build-api.ts]
Action Projecting requires Article. [src: src/action-registry.ts]
Action Projecting requires Action Registry. [src: src/action-registry.ts]
Action Projecting yields Canonical Action Projection. [src: src/action-registry.ts]
Suggested Action Card Rendering requires Closing Prompt. [src: src/action-registry.ts]
Suggested Action Card Rendering requires Action Registry. [src: src/action-registry.ts]
Suggested Action Card Rendering yields Suggested Actions Card. [src: src/action-registry.ts]
Draft Continuation Context can be transient or retained. [src: src/recommendation-prose.ts]
Action Reconciling requires Article. [src: src/review-actions.ts]
Action Reconciling requires Action Registry. [src: src/review-actions.ts]
Action Review Cycle can be generation or revision. [src: src/action-review-cycle.ts]
Action Reconciling requires Action Review Cycle. [src: src/review-actions.ts]
Action Reconciling requires Source Evidence. [src: src/review-actions.ts]
Action Reconciling requires Recommendation Maintenance Memory. [src: src/review-actions.ts]
Action Reconciling requires Draft Action Candidates. [src: src/review-actions.ts]
Action Reconciling requires Draft Candidate Evidence Requirements. [src: src/review-actions.ts]
Action Reconciling invokes Suggestion Proposing. [src: src/review-actions.ts]
Action Reconciling invokes Candidate Reference Resolving. [src: src/review-actions.ts]
Action Reconciling invokes Suggestion Verifying. [src: src/review-actions.ts]
Suggestion Proposing requires Claude API. [src: src/review-actions.ts]
Suggestion Verifying requires Claude API. [src: src/review-actions.ts]
Suggestion Proposing requires Recommendation Maintenance Memory. [src: src/review-actions.ts]
Suggestion Verifying requires Recommendation Maintenance Memory. [src: src/review-actions.ts]
Suggestion Proposing requires Draft Action Candidates. [src: src/review-actions.ts]
Suggestion Proposing yields Provider Action Proposal. [src: src/review-actions.ts]
Candidate Reference Resolving requires Provider Action Proposal and Draft Action Candidates. [src: src/review-actions.ts]
Candidate Reference Resolving yields Canonical Action Proposal. [src: src/review-actions.ts]
Suggestion Verifying requires Canonical Action Proposal. [src: src/review-actions.ts]
Malformed Output Repair Budget can be available or spent. [src: src/review-actions.ts]
Action Reconciling invokes Action Output Repairing. [src: src/review-actions.ts]
Action Output Repairing occurs if Malformed Output Repair Budget is available. [src: src/review-actions.ts]
Action Output Repairing changes Malformed Output Repair Budget from available to spent. [src: src/review-actions.ts]
Action Output Repairing requires Output Shape Diagnostic. [src: src/review-actions.ts]
Action Output Repairing requires Lossless Action Model View. [src: src/review-actions.ts]
Candidate Record Binding can be available or unavailable. [src: src/review-actions.ts]
Candidate Record Isolating requires Provider Action Proposal and Draft Action Candidates. [src: src/review-actions.ts]
Candidate Record Isolating yields Candidate Record Binding. [src: src/review-actions.ts]
Suggestion Proposing invokes Candidate Record Isolating. [src: src/review-actions.ts]
Candidate Record Repairing occurs if Candidate Record Binding is available. [src: src/review-actions.ts]
Action Output Repairing invokes Candidate Record Repairing. [src: src/review-actions.ts]
Candidate Record Repairing requires Candidate Record Binding, Provider Action Proposal, and Source Evidence. [src: src/review-actions.ts]
Candidate Record Repairing requires Claude API. [src: src/review-actions.ts]
Candidate Record Repairing yields Provider Action Proposal. [src: src/review-actions.ts]
Suggestion Verifying requires Draft Action Candidates. [src: src/review-actions.ts]
Action Reconciling affects Action Registry. [src: src/review-actions.ts]
Action Reconciling affects Article. [src: src/action-registry.ts]
Action Reconciling yields Closing Prompt. [src: src/review-actions.ts]
Action Reconciling yields Recommendation Maintenance Memory. [src: src/review-actions.ts]
Action Reconciling changes Draft Continuation Context from transient to retained. [src: src/recommendation-prose.ts]
Closing Prompt can be legacy-options, ranked-shortlist, or needs-evidence. [src: src/action-registry-schema.ts]
Draft Action Candidate can be awaiting-review, promoted, mapped-existing, rejected, or verified-closure. [src: src/action-registry-schema.ts]
Draft Action Candidates consists of Draft Action Candidate. [src: src/action-registry-schema.ts]
Candidate Review History consists of Candidate Review Transition. [src: src/action-registry-contract.ts]
Candidate Review History consists of Historical Source Metadata. [src: src/action-registry-contract.ts]
Historical Source Metadata exhibits Source Identity, Source Kind, Source Locator, and Full Content Digest. [src: src/action-registry-contract.ts]
Draft Candidate Evidence Requirements consists of Draft Candidate Evidence Association and Background Evidence Reference. [src: src/action-registry-contract.ts]
Draft Candidate Evidence Association can be required or context. [src: src/action-registry-contract.ts]
Draft Candidate Evidence Requirements consists of Candidate Action Relation and Candidate Input View. [src: src/action-registry-contract.ts]
Candidate Evidence Preparing requires Action Registry, Draft Action Candidates, Action Review Cycle, Operator Feedback, and Article Status. [src: src/action-evidence-selection.ts]
Candidate Evidence Preparing yields Draft Candidate Evidence Requirements. [src: src/action-evidence-selection.ts]
Candidate Input View consists of Canonical Action Index, Held Suggestion Memory, and Rejection Memory. [src: src/action-evidence-selection.ts]
Draft Candidate Evidence Requirements can be prior-binding or current-binding. [src: src/action-evidence-selection.ts]
Candidate Evidence Refreshing requires Action Review Snapshot. [src: src/action-evidence-selection.ts]
Candidate Evidence Refreshing requires unchanged Draft Candidate Evidence Association. [src: src/action-evidence-selection.ts]
Candidate Evidence Refreshing requires unchanged prior Candidate Input View. [src: src/action-evidence-selection.ts]
Candidate Evidence Refreshing changes Draft Candidate Evidence Requirements from prior-binding to current-binding. [src: src/action-evidence-selection.ts]
Editorial Accepting yields Accepted Outcome Stamp. [src: src/stamp-outcome.ts]
Acceptance Status Evidence Refreshing requires Action Review Snapshot and Accepted Outcome Stamp. [src: src/action-evidence-selection.ts]
Acceptance Status Evidence Refreshing occurs if Article is accepted. [src: src/action-evidence-selection.ts]
Acceptance Status Evidence Refreshing yields current-binding Draft Candidate Evidence Requirements. [src: src/action-evidence-selection.ts]
Suggested Actions Card consists of Ranked Recommendations, Draft Action Candidates, Draft Continuation Context, and Handled Suggestions. [src: src/action-registry.ts]
Article Generating yields Action Review Cycle. [src: src/index.ts]
Article Generating invokes Action Reconciling. [src: src/index.ts]
Editorial Revising yields Action Review Cycle. [src: src/revise-article.ts]
Editorial Revising invokes Action Reconciling. [src: src/revise-article.ts]
Editorial Revising requires Editorial Revision Request. [src: .github/scripts/editorial-revision-admission.mjs]
Editorial Accepting yields Action Review Cycle. [src: scripts/reconcile-actions.ts]
Editorial Revising invokes Candidate Evidence Preparing. [src: src/revise-article.ts]
Editorial Accepting invokes Candidate Evidence Preparing. [src: scripts/reconcile-actions.ts]
Editorial Accepting invokes Action Reconciling. [src: .github/workflows/editorial-revise.yml]
Draft Suggestion can be proposed, open, done, dismissed, superseded, or deferred. [src: src/action-registry-schema.ts]
Action Registry consists of Imported Action Baseline and Article Action Files. [src: src/action-registry-schema.ts]
Inclusion Choosing requires Action Registry. [src: packages/frontend/src/utils/actionInclusion.ts]
Inclusion Choosing requires GitHub. [src: packages/frontend/src/utils/actionInclusion.ts]
Inclusion Choosing affects Action Registry. [src: packages/frontend/src/utils/actionInclusion.ts]
Jim handles Inclusion Choosing. [src: packages/frontend/src/components/ArticleActions.tsx]
Reviewed Disposition can be deferred, completed-existing-evidence, or pending-receipt. [src: src/action-model.ts]
Canonical Action Projection consists of Canonical Actions and Reviewed Disposition. [src: src/action-model.ts]
API Building invokes Action Projecting. [src: src/build-api.ts]
API Building requires Canonical Action Projection. [src: src/build-api.ts]
API Building yields JSON API.
Frontend Rendering requires JSON API. [src: packages/frontend]
Frontend Rendering requires Canonical Action Projection. [src: packages/frontend/src/components/ActionsPage.tsx]
Frontend Rendering yields Rendered Site.
API Building yields Article Fingerprint. [src: src/build-api.ts]
Frontend Rendering invokes Independent Review Projecting. [src: packages/frontend/src/components/IndependentArticleReviews.tsx]
Independent Review Projecting requires GitHub. [src: api/_lib/article-review-service.ts]
Independent Review Projecting requires Article Fingerprint. [src: api/_lib/article-review-service.ts]
Independent Review Projecting yields Review Projection. [src: api/_lib/article-review-service.ts]
Jim handles Revision Requesting. [src: packages/frontend/src/components/IndependentArticleReviews.tsx]
Revision Requesting requires Review Projection. [src: api/_lib/article-review-service.ts]
Revision Requesting yields Revision Request. [src: api/_lib/article-review-service.ts]
Revision Requesting affects GitHub. [src: api/_lib/article-review-service.ts]
Conversation Saving requires GitHub. [src: api/_lib/article-review-service.ts]
Conversation Saving requires Article Fingerprint. [src: api/_lib/article-review-service.ts]
Conversation Saving requires Review Projection. [src: api/_lib/article-review-service.ts]
Conversation Saving yields Saved Message. [src: api/_lib/article-review-service.ts]
Conversation Saving affects GitHub. [src: api/_lib/article-review-service.ts]
Review Projection consists of Review Records and Correspondence. [src: shared/article-review.ts]
Article exhibits Time Record Pointer. [src: src/article-time-metadata.ts]
Time Recording requires Article. [src: src/article-time-metadata.ts]
Time Recording requires Canonical Action Projection. [src: src/index.ts]
Time Recording requires Commit Context. [src: src/index.ts]
Time Recording requires Issue Context. [src: src/collect-context.ts]
Time Recording yields Time Evidence. [src: src/article-time-metadata.ts]
Time Recording affects Article. [src: src/article-time-metadata.ts]
Time Backfilling requires Article. [src: src/backfill-times.ts]
Time Backfilling requires GitHub. [src: src/backfill-times.ts]
Time Backfilling yields Time Evidence. [src: src/backfill-times.ts]
Time Backfilling invokes Time Resolving. [src: src/backfill-times.ts]
Time Resolving requires Time Evidence. [src: src/time-references.ts]
Time Resolving requires Article. [src: src/time-references.ts]
Time Resolving yields Time References. [src: src/time-references.ts]
Shipment Timestamp can be available or unavailable. [src: src/shipment-times.ts]
Shipment Source State can be open or closed-unmerged. [src: src/shipment-times.ts]
Shipment Coverage can be complete or unavailable. [src: src/shipment-time-coverage.ts]
Shipment Time Resolving requires Article. [src: src/shipment-times.ts]
Shipment Time Resolving requires Time Evidence. [src: src/shipment-times.ts]
Shipment Time Resolving requires Shipment Source State. [src: src/shipment-times.ts]
Shipment Time Resolving yields Shipment Timestamp. [src: src/shipment-times.ts]
Issue Time Resolving requires Article. [src: src/issue-times.ts]
Issue Time Resolving requires Canonical Action Projection. [src: src/issue-times.ts]
Issue Time Resolving requires Time Evidence. [src: src/issue-times.ts]
Issue Time Resolving yields Projected Issue Times. [src: src/issue-times.ts]
Time Recording invokes Shipment Time Resolving. [src: src/article-time-metadata.ts]
Time Resolving yields Time Expressions. [src: src/time-references.ts]
API Building invokes Time Projecting. [src: src/build-api.ts]
API Building invokes Shipment Coverage Checking. [src: src/build-api.ts]
Shipment Coverage Checking requires Article. [src: src/shipment-time-coverage.ts]
Shipment Coverage Checking requires Time Evidence. [src: src/article-time-metadata.ts]
Shipment Coverage Checking yields Shipment Coverage. [src: src/shipment-time-coverage.ts]
Time Projecting requires Article. [src: src/article-time-metadata.ts]
Time Projecting requires Canonical Action Projection. [src: src/build-api.ts]
Time Projecting requires Time Evidence. [src: src/article-time-metadata.ts]
Time Projecting invokes Time Resolving. [src: src/article-time-metadata.ts]
Time Projecting invokes Shipment Time Resolving. [src: src/article-time-metadata.ts]
Time Projecting invokes Issue Time Resolving. [src: src/article-time-metadata.ts]
Time Projecting yields Projected Time References. [src: src/article-time-metadata.ts]
Time Projecting yields Projected Shipment Timestamps. [src: src/build-api.ts]
JSON API consists of Projected Time References and Projected Shipment Timestamps. [src: src/build-api.ts]
JSON API consists of Projected Issue Times. [src: src/build-api.ts]
Time Projecting yields Projected Time Expressions. [src: src/article-time-metadata.ts]
JSON API consists of Projected Time Expressions. [src: src/build-api.ts]
Frontend Rendering invokes Time Visualizing. [src: packages/frontend/src/hooks/useArticlePopovers.ts]
Time Visualizing requires Projected Time References. [src: packages/frontend/src/utils/timeReferences.ts]
Time Visualizing requires Projected Shipment Timestamps. [src: packages/frontend/src/utils/shipmentTimes.ts]
Time Visualizing requires Projected Issue Times. [src: packages/frontend/src/utils/issueTimes.ts]
Time Visualizing requires Device Timezone. [src: packages/frontend/src/utils/timeDisplay.ts]
Time Visualizing yields Time Popover. [src: packages/frontend/src/components/TimePopoverContent.tsx]
Jim handles Editorial Revising. [src: src/revise-article.ts]
Editorial Revising invokes Time Metadata Preserving. [src: src/revise-article.ts]
Time Metadata Preserving requires Article. [src: src/article-time-frontmatter.ts]
Time Metadata Preserving affects Article. [src: src/article-time-frontmatter.ts]
```

## SD1.1 — Article Generating in-zoom

**Caption:** This view summarizes the source facts in this section. Rectangles identify objects;
rounded nodes identify processes. Labeled solid arrows distinguish human participation,
required instruments, and transformations. These are compatibility labels, not native OPM links.
Use the source facts below for properties, state detail, and decomposition membership.

```mermaid
---
title: "SD1.1 — Article Generating in-zoom"
---
flowchart TD
  accTitle: SD1.1 — Article Generating in-zoom
  accDescr: Lossy system model projection. Complete source facts follow this diagram.
  n100["Activity Decision — states: skip, run"]
  n101["Run Timing — states: available, unavailable"]
  n6["Run Evidence"]
  n7("Article Generating")
  n102("Context Collecting")
  n103("Activity Assessing")
  n104("Credit Checking")
  n105("Drafting")
  n106("Council Reviewing")
  n107("Synthesizing")
  n108("Claim Verifying")
  n109("Provenance Attaching")
  n77("Time Recording")
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n13["Canonical Action Projection"]
  n110("Closing Continuity Projecting")
  n111("Telemetry Collecting")
  n78["Commit Context"]
  n112["Closing Continuity Projection — states: available, unavailable"]
  n0["Article — states: draft, accepted, rejected"]
  n113["Article Action Files — states: pending, verified"]
  n114["Telemetry Digest"]
  n36["Claude API"]
  style n36 stroke-dasharray: 5 5
  n115["Credit Status"]
  n27["Draft Continuation Context — states: transient, retained"]
  n116["Council Critiques"]
  n117["Claim Report"]
  n80["Time Evidence"]
  n101 -->|"part of"| n6
  n4 -->|"requires (instrument)"| n102
  n13 -->|"requires (instrument)"| n102
  n102 -->|"invokes"| n110
  n102 -->|"invokes"| n111
  n102 -->|"yields"| n78
  n0 -->|"requires (instrument)"| n110
  n113 -->|"requires (instrument)"| n110
  n110 -->|"yields"| n112
  n111 -->|"yields"| n114
  n78 -->|"requires (instrument)"| n103
  n103 -->|"yields"| n100
  n100 -->|"condition: run"| n104
  n36 -->|"requires (instrument)"| n104
  n104 -->|"yields"| n115
  n36 -->|"requires (instrument)"| n105
  n78 -->|"requires (instrument)"| n105
  n114 -->|"requires (instrument)"| n105
  n115 -->|"requires (instrument)"| n105
  n112 -->|"requires (instrument)"| n105
  n100 -->|"condition: run"| n105
  n105 -->|"yields"| n0
  n105 -->|"yields"| n27
  n36 -->|"requires (instrument)"| n106
  n0 -->|"requires (instrument)"| n106
  n106 -->|"yields"| n116
  n36 -->|"requires (instrument)"| n107
  n116 -->|"consumes"| n107
  n107 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n108
  n78 -->|"requires (instrument)"| n108
  n108 -->|"yields"| n117
  n108 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n109
  n6 -->|"requires (instrument)"| n109
  n109 <-->|"affects"| n0
  n78 -->|"requires (instrument)"| n77
  n0 -->|"requires (instrument)"| n77
  n77 -->|"yields"| n80
  n77 <-->|"affects"| n0
```

In-zoom membership: Article Generating contains Context Collecting, Activity Assessing, Credit Checking, Drafting, Council Reviewing, Synthesizing, Claim Verifying, Provenance Attaching, and Time Recording. No execution order is inferred.

**Source facts (OJF-OPL; bracketed provenance is local metadata):**

```text
Activity Decision can be skip or run.
Run Timing can be available or unavailable.
Run Evidence consists of Run Timing.
Article Generating zooms into Context Collecting, Activity Assessing, Credit Checking, Drafting, Council Reviewing, Synthesizing, Claim Verifying, Provenance Attaching, and Time Recording. [src: src/index.ts]
Context Collecting requires GitHub. [src: src/collect-context.ts]
Context Collecting requires Canonical Action Projection. [src: src/collect-context.ts]
Context Collecting invokes Closing Continuity Projecting. [src: src/collect-context.ts]
Context Collecting invokes Telemetry Collecting. [src: src/collect-context.ts]
Context Collecting yields Commit Context.
Closing Continuity Projection can be available or unavailable. [src: src/types.ts]
Closing Continuity Projecting requires Article. [src: src/collect-context.ts]
Closing Continuity Projecting requires Article Action Files. [src: src/collect-context.ts]
Closing Continuity Projecting yields Closing Continuity Projection. [src: src/collect-context.ts]
Telemetry Collecting yields Telemetry Digest. [src: src/collect-telemetry.ts]
Activity Assessing requires Commit Context. [src: src/should-skip-run.ts]
Activity Assessing yields Activity Decision. [src: src/should-skip-run.ts]
Credit Checking occurs if Activity Decision is run. [src: src/index.ts]
Credit Checking requires Claude API. [src: src/check-anthropic-credits.ts]
Credit Checking yields Credit Status. [src: src/check-anthropic-credits.ts]
Drafting requires Claude API. [src: src/generate-article.ts]
Drafting requires Commit Context.
Drafting requires Telemetry Digest.
Drafting requires Credit Status. [src: src/index.ts]
Drafting requires Closing Continuity Projection. [src: src/generate-article.ts]
Drafting occurs if Activity Decision is run. [src: src/index.ts]
Drafting yields Article.
Drafting yields Draft Continuation Context. [src: src/generate-article.ts]
Council Reviewing requires Claude API. [src: src/index.ts]
Council Reviewing requires Article.
Council Reviewing yields Council Critiques.
Synthesizing requires Claude API. [src: src/index.ts]
Synthesizing consumes Council Critiques.
Synthesizing affects Article.
Claim Verifying requires Article. [src: src/verify-claims.ts]
Claim Verifying requires Commit Context.
Claim Verifying yields Claim Report.
Claim Verifying affects Article. [src: src/index.ts]
Provenance Attaching requires Article. [src: src/index.ts]
Provenance Attaching requires Run Evidence. [src: src/index.ts]
Provenance Attaching affects Article. [src: src/index.ts]
Time Recording requires Commit Context. [src: src/index.ts]
Time Recording requires Article. [src: src/index.ts]
Time Recording yields Time Evidence. [src: src/article-time-metadata.ts]
Time Recording affects Article. [src: src/index.ts]
```

## SD1.2 — Continued Editorial Revising in-zoom

**Caption:** This view summarizes the source facts in this section. Rectangles identify objects;
rounded nodes identify processes. Labeled solid arrows distinguish human participation,
required instruments, and transformations. These are compatibility labels, not native OPM links.
Use the source facts below for properties, state detail, and decomposition membership.

```mermaid
---
title: "SD1.2 — Continued Editorial Revising in-zoom"
---
flowchart TD
  accTitle: SD1.2 — Continued Editorial Revising in-zoom
  accDescr: Lossy system model projection. Complete source facts follow this diagram.
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n118("Feedback Version Saving")
  n69["Article Fingerprint"]
  n119["Feedback Version"]
  n120("Explicit Revision Requesting")
  n121["PR Article Fingerprint"]
  n122["Explicit Revision Request"]
  n123("Explicit Revision Admitting")
  n124("Clean Acceptance Requesting")
  n125["Article Action File Fingerprint"]
  n126["Trusted Policy Fingerprint"]
  n127["Clean Acceptance Request"]
  n128("Clean Acceptance Admitting")
  n129["Editorial Request — states: outstanding, artifact-verified, owner-resolved"]
  n130("Owner Resolution Recording")
  n131["Failed First Workflow Attempt"]
  n132["Terminal Receipt Evidence — states: uncertain-receipt, proven-missing-receipt"]
  n133["Explicit Owner Acknowledgment"]
  n134["Owner Resolution"]
  n135["Owner Account"]
  n136["Admitted Revision"]
  n137["Integrated Trusted Policy"]
  n138["Admitted Clean Acceptance"]
  n139("Invocation Claiming")
  n140["Invocation Claim"]
  n141("Clean Acceptance Rechecking")
  n142["Reconfirmed Clean Acceptance"]
  n143("Continued Article Revising")
  n144("Continued Clean Accepting")
  n36["Claude API"]
  style n36 stroke-dasharray: 5 5
  n23["Action Registry"]
  n0["Article — states: draft, accepted, rejected"]
  n145["Revision Outcome"]
  n28("Action Reconciling")
  n146["Clean Acceptance Outcome"]
  n147["Incomplete Action Review"]
  n148["Incomplete Action Review and Action Registry"]
  n149("Article Completing")
  n20("Editorial Accepting")
  n150["Article Only Acceptance"]
  n151["Action Review Outcome — states: pending, verified"]
  n152["Action Evidence Request Receipt"]
  n22("Action Projecting")
  n153["Held Suggestions"]
  n154["Candidate Identity"]
  n113["Article Action Files — states: pending, verified"]
  n155["Dated Action State Digest"]
  n18["Draft Action Candidates"]
  n156["Candidate Review History"]
  n32["Draft Candidate Evidence Requirements — states: prior-binding, current-binding"]
  n157["valid Candidate Review History"]
  n158("Action Reviewing")
  n159("Action Registry Writing")
  n160["existing Candidate Review History"]
  n161["Imported Action Baseline"]
  n162("Editorial Output Binding")
  n163["Editorial Output Artifact"]
  n164("Clean Acceptance Output Admitting")
  n165("Editorial Rebinding")
  n166("Source Evidence Selecting")
  n30["Source Evidence"]
  n31["Recommendation Maintenance Memory"]
  n167["Selected Source Evidence"]
  n168["Evidence Coverage"]
  n169["Action Evidence Request — states: open, resolved, cancelled, expired, superseded, declined"]
  n170["Private Local Complete Source Artifact"]
  n171("Source Evidence Projecting")
  n172["Action Evidence Projection"]
  n173["an open Action Evidence Request"]
  n174["current Private Local Complete Source Artifact identity"]
  n175["explicit corrected Action Evidence Projection selection when multiple complete projections exist"]
  n176("Source Evidence Selecting with an explicitly selected incomplete Action Evidence Projection")
  n177("Action Evidence Request Closing")
  n178["Private Local Resolution Artifact"]
  n179("Action Model View Serializing")
  n180["Collector Generated Metadata Provenance — states: available, unavailable"]
  n181("Generated Metadata Compacting")
  n182["Partial Metadata Context"]
  n183("Lossless Metadata Factoring")
  n184["Lossless Source Model View"]
  n185["Prepared Evidence View Receipt"]
  n33("Suggestion Proposing")
  n35("Suggestion Verifying")
  n43["Lossless Action Model View"]
  n186["Evidence Resolution Intent"]
  n187["Action Review Output Provenance"]
  n220["Created Action Record Binding"]
  n221["Updated Action Record Binding"]
  n222["Rejection Memory Binding"]
  n188("Evidence Resolution Recording")
  n7("Article Generating")
  n61("Editorial Revising")
  n4 -->|"requires (instrument)"| n118
  n69 -->|"requires (instrument)"| n118
  n118 -->|"yields"| n119
  n119 -->|"requires (instrument)"| n120
  n121 -->|"requires (instrument)"| n120
  n120 -->|"yields"| n122
  n122 -->|"object event"| n123
  n121 -->|"requires (instrument)"| n124
  n125 -->|"requires (instrument)"| n124
  n126 -->|"requires (instrument)"| n124
  n124 -->|"yields"| n127
  n127 -->|"object event"| n128
  n4 -->|"requires (instrument)"| n130
  n131 -->|"requires (instrument)"| n130
  n132 -->|"requires (instrument)"| n130
  n133 -->|"requires (instrument)"| n130
  n130 -->|"changes: outstanding to owner-resolved"| n129
  n130 -->|"yields"| n134
  n135 -->|"requires (instrument)"| n123
  n4 -->|"requires (instrument)"| n123
  n123 -->|"yields"| n136
  n135 -->|"requires (instrument)"| n128
  n4 -->|"requires (instrument)"| n128
  n137 -->|"requires (instrument)"| n128
  n128 -->|"yields"| n138
  n136 -->|"object event"| n139
  n138 -->|"object event"| n139
  n4 -->|"requires (instrument)"| n139
  n139 -->|"yields"| n140
  n140 -->|"object event"| n141
  n4 -->|"requires (instrument)"| n141
  n126 -->|"requires (instrument)"| n141
  n127 -->|"requires (instrument)"| n141
  n141 -->|"yields"| n142
  n140 -->|"object event"| n143
  n142 -->|"object event"| n144
  n36 -->|"requires (instrument)"| n143
  n23 -->|"requires (instrument)"| n143
  n143 <-->|"affects"| n0
  n143 <-->|"affects"| n23
  n143 -->|"yields"| n145
  n23 -->|"requires (instrument)"| n144
  n144 -->|"invokes"| n28
  n144 <-->|"affects"| n0
  n144 <-->|"affects"| n23
  n144 -->|"yields"| n146
  n28 -->|"yields"| n147
  n148 -->|"requires (instrument)"| n149
  n20 -->|"invokes"| n149
  n149 <-->|"affects"| n0
  n149 -->|"yields"| n150
  n150 -->|"exhibits"| n151
  n150 -->|"exhibits"| n152
  n146 -->|"exhibits"| n151
  n22 -->|"yields"| n153
  n153 -->|"exhibits"| n154
  n155 -->|"part of"| n113
  n18 -->|"part of"| n113
  n156 -->|"part of"| n113
  n32 -->|"part of"| n113
  n28 -->|"yields"| n155
  n28 -->|"changes: verified to pending"| n113
  n28 -->|"changes: pending to verified"| n113
  n28 -->|"yields"| n113
  n28 -->|"yields"| n156
  n157 -->|"requires (instrument)"| n28
  n157 -->|"requires (instrument)"| n158
  n155 -->|"requires (instrument)"| n158
  n155 -->|"requires (instrument)"| n159
  n160 -->|"requires (instrument)"| n159
  n159 -->|"yields"| n156
  n161 -->|"requires (instrument)"| n22
  n4 -->|"requires (instrument)"| n162
  n162 -->|"yields"| n163
  n163 -->|"requires (instrument)"| n123
  n163 -->|"requires (instrument)"| n164
  n0 -->|"requires (instrument)"| n165
  n165 <-->|"affects"| n113
  n28 -->|"invokes"| n166
  n0 -->|"requires (instrument)"| n166
  n23 -->|"requires (instrument)"| n166
  n30 -->|"requires (instrument)"| n166
  n31 -->|"requires (instrument)"| n166
  n32 -->|"requires (instrument)"| n166
  n166 -->|"yields"| n167
  n166 -->|"yields"| n168
  n28 -->|"yields"| n169
  n28 -->|"yields"| n170
  n28 -->|"yields"| n152
  n152 -->|"part of"| n113
  n169 -->|"requires (instrument)"| n171
  n170 -->|"requires (instrument)"| n171
  n171 -->|"yields"| n172
  n173 -->|"requires (instrument)"| n171
  n172 -->|"requires (instrument)"| n166
  n174 -->|"requires (instrument)"| n166
  n175 -->|"requires (instrument)"| n166
  n176 -->|"yields"| n169
  n177 -->|"changes: open to resolved, cancelled, expired, superseded, or declined"| n169
  n177 -->|"yields"| n178
  n28 -->|"invokes"| n179
  n167 -->|"requires (instrument)"| n179
  n168 -->|"requires (instrument)"| n179
  n180 -->|"condition: available"| n181
  n180 -->|"requires (instrument)"| n181
  n181 -->|"yields"| n182
  n180 -->|"requires (instrument)"| n183
  n30 -->|"requires (instrument)"| n183
  n183 -->|"yields"| n184
  n184 -->|"requires (instrument)"| n166
  n179 -->|"yields"| n185
  n185 -->|"requires (instrument)"| n33
  n185 -->|"requires (instrument)"| n35
  n185 -->|"requires (instrument)"| n28
  n23 -->|"requires (instrument)"| n179
  n179 -->|"yields"| n43
  n43 -->|"requires (instrument)"| n33
  n43 -->|"requires (instrument)"| n35
  n167 -->|"requires (instrument)"| n33
  n167 -->|"requires (instrument)"| n35
  n28 -->|"yields"| n186
  n28 -->|"yields"| n187
  n220 -->|"part of"| n187
  n221 -->|"part of"| n187
  n222 -->|"part of"| n187
  n187 -->|"part of"| n113
  n186 -->|"requires (instrument)"| n188
  n113 -->|"requires (instrument)"| n188
  n188 -->|"yields"| n178
  n7 -->|"invokes"| n188
  n61 -->|"invokes"| n188
  n20 -->|"invokes"| n188
```

In-zoom membership: Action Model View Serializing contains Lossless Metadata Factoring. No execution order is inferred.

In-zoom membership: Action Model View Serializing contains Generated Metadata Compacting. No execution order is inferred.

**Source facts (OJF-OPL; bracketed provenance is local metadata):**

```text
Feedback Version Saving requires GitHub. [src: api/_lib/editorial-continuation.ts]
Feedback Version Saving requires Article Fingerprint. [src: api/_lib/editorial-continuation.ts]
Feedback Version Saving yields Feedback Version. [src: api/_lib/editorial-continuation.ts]
Explicit Revision Requesting requires Feedback Version. [src: packages/frontend/src/components/EditorialContinuation.tsx]
Explicit Revision Requesting requires PR Article Fingerprint. [src: api/_lib/editorial-continuation.ts]
Explicit Revision Requesting yields Explicit Revision Request. [src: api/_lib/editorial-continuation.ts]
Explicit Revision Request triggers Explicit Revision Admitting. [src: .github/workflows/editorial-revise.yml]
Clean Acceptance Requesting requires PR Article Fingerprint. [src: api/_lib/editorial-continuation.ts]
Clean Acceptance Requesting requires Article Action File Fingerprint. [src: api/_lib/editorial-continuation.ts]
Clean Acceptance Requesting requires Trusted Policy Fingerprint. [src: api/_lib/editorial-continuation.ts]
Clean Acceptance Requesting yields Clean Acceptance Request. [src: api/_lib/editorial-continuation.ts]
Clean Acceptance Request triggers Clean Acceptance Admitting. [src: .github/workflows/editorial-revise.yml]
Editorial Request can be outstanding, artifact-verified, or owner-resolved. [src: shared/article-review.ts]
Owner Resolution Recording requires GitHub. [src: api/_lib/editorial-continuation.ts]
Owner Resolution Recording requires Failed First Workflow Attempt. [src: api/_lib/editorial-continuation.ts]
Owner Resolution Recording requires Terminal Receipt Evidence. [src: api/_lib/editorial-continuation.ts]
Terminal Receipt Evidence can be uncertain-receipt or proven-missing-receipt. [src: shared/article-review.ts]
Owner Resolution Recording requires Explicit Owner Acknowledgment. [src: shared/article-review.ts]
Owner Resolution Recording changes Editorial Request from outstanding to owner-resolved. [src: api/_lib/editorial-continuation.ts]
Owner Resolution Recording yields Owner Resolution. [src: api/_lib/editorial-continuation.ts]
Explicit Revision Admitting requires Owner Account. [src: .github/scripts/continue-editorial.ts]
Explicit Revision Admitting requires GitHub. [src: .github/scripts/continue-editorial.ts]
Explicit Revision Admitting yields Admitted Revision. [src: .github/scripts/continue-editorial.ts]
Clean Acceptance Admitting requires Owner Account. [src: .github/scripts/continue-editorial.ts]
Clean Acceptance Admitting requires GitHub. [src: .github/scripts/continue-editorial.ts]
Clean Acceptance Admitting requires Integrated Trusted Policy. [src: .github/scripts/continue-editorial.ts]
Clean Acceptance Admitting yields Admitted Clean Acceptance. [src: .github/scripts/continue-editorial.ts]
Admitted Revision triggers Invocation Claiming. [src: .github/scripts/continue-editorial.ts]
Admitted Clean Acceptance triggers Invocation Claiming. [src: .github/scripts/continue-editorial.ts]
Invocation Claiming requires GitHub. [src: .github/scripts/continue-editorial.ts]
Invocation Claiming yields Invocation Claim. [src: .github/scripts/continue-editorial.ts]
Invocation Claim triggers Clean Acceptance Rechecking. [src: .github/scripts/continue-editorial.ts]
Clean Acceptance Rechecking requires GitHub. [src: .github/scripts/continue-editorial.ts]
Clean Acceptance Rechecking requires Trusted Policy Fingerprint. [src: .github/scripts/continue-editorial.ts]
Clean Acceptance Rechecking requires Clean Acceptance Request. [src: .github/scripts/continue-editorial.ts]
Clean Acceptance Rechecking yields Reconfirmed Clean Acceptance. [src: .github/scripts/continue-editorial.ts]
Invocation Claim triggers Continued Article Revising. [src: .github/scripts/continue-editorial.ts]
Reconfirmed Clean Acceptance triggers Continued Clean Accepting. [src: .github/scripts/continue-editorial.ts]
Continued Article Revising requires Claude API. [src: src/revise-article.ts]
Continued Article Revising requires Action Registry. [src: src/revise-article.ts]
Continued Article Revising affects Article. [src: src/revise-article.ts]
Continued Article Revising affects Action Registry. [src: src/revise-article.ts]
Continued Article Revising yields Revision Outcome. [src: .github/scripts/continue-editorial.ts]
Continued Clean Accepting requires Action Registry. [src: scripts/reconcile-actions.ts]
Continued Clean Accepting invokes Action Reconciling. [src: .github/scripts/continue-editorial.ts]
Continued Clean Accepting affects Article. [src: .github/scripts/continue-editorial.ts]
Continued Clean Accepting affects Action Registry. [src: scripts/reconcile-actions.ts]
Continued Clean Accepting yields Clean Acceptance Outcome. [src: .github/scripts/continue-editorial.ts]
Action Reconciling yields Incomplete Action Review. [src: src/review-actions.ts]
Article Completing requires Incomplete Action Review and Action Registry. [src: src/action-registry.ts]
Editorial Accepting invokes Article Completing. [src: scripts/reconcile-actions.ts]
Article Completing affects Article. [src: src/action-registry.ts]
Article Completing yields Article Only Acceptance. [src: src/action-registry.ts]
Article Only Acceptance exhibits Action Review Outcome. [src: src/action-registry-contract.ts]
Article Only Acceptance exhibits Action Evidence Request Receipt. [src: src/action-registry-contract.ts]
Action Review Outcome can be pending or verified. [src: shared/article-review.ts]
Clean Acceptance Outcome exhibits Action Review Outcome. [src: shared/editorial-action-proof.ts]
Action Projecting yields Held Suggestions. [src: src/action-registry.ts]
Held Suggestions exhibits Candidate Identity. [src: src/action-registry-contract.ts]
Article Action Files can be pending or verified. [src: src/action-registry-schema.ts]
Article Action Files consists of Dated Action State Digest. [src: src/action-registry.ts]
Article Action Files consists of Draft Action Candidates. [src: src/action-registry-schema.ts]
Article Action Files consists of Candidate Review History. [src: src/action-registry-contract.ts]
Article Action Files consists of Draft Candidate Evidence Requirements. [src: src/action-registry-schema.ts]
Action Reconciling yields Dated Action State Digest. [src: src/review-actions.ts]
Action Reconciling changes Article Action Files from verified to pending. [src: src/review-actions.ts]
Action Reconciling changes Article Action Files from pending to verified. [src: src/review-actions.ts]
Action Reconciling yields Article Action Files. [src: src/review-actions.ts]
Action Reconciling yields Candidate Review History. [src: src/review-actions.ts]
Action Reconciling requires valid Candidate Review History. [src: src/review-actions.ts]
Action Reviewing requires valid Candidate Review History. [src: src/review-actions.ts]
Action Reviewing requires Dated Action State Digest. [src: src/review-actions.ts]
Action Registry Writing requires Dated Action State Digest. [src: src/action-registry.ts]
Action Registry Writing requires existing Candidate Review History. [src: src/action-registry.ts]
Action Registry Writing yields Candidate Review History. [src: src/action-registry.ts]
Action Projecting requires Imported Action Baseline. [src: src/action-registry.ts]
Editorial Output Binding requires GitHub. [src: shared/editorial-action-proof.ts]
Editorial Output Binding yields Editorial Output Artifact. [src: scripts/write-action-output.ts]
Explicit Revision Admitting requires Editorial Output Artifact. [src: .github/scripts/editorial-action-registry.ts]
Clean Acceptance Output Admitting requires Editorial Output Artifact. [src: .github/scripts/editorial-action-registry.ts]
Editorial Rebinding requires Article. [src: src/action-registry.ts]
Editorial Rebinding affects Article Action Files. [src: src/action-registry.ts]
Action Reconciling invokes Source Evidence Selecting. [src: src/review-actions.ts]
Source Evidence Selecting requires Article. [src: src/action-evidence-selection.ts]
Source Evidence Selecting requires Action Registry. [src: src/action-evidence-selection.ts]
Source Evidence Selecting requires Source Evidence. [src: src/action-evidence-selection.ts]
Source Evidence Selecting requires Recommendation Maintenance Memory. [src: src/action-evidence-selection.ts]
Source Evidence Selecting requires Draft Candidate Evidence Requirements. [src: src/action-evidence-selection.ts]
Source Evidence Selecting yields Selected Source Evidence. [src: src/action-evidence-selection.ts]
Source Evidence Selecting yields Evidence Coverage. [src: src/action-evidence-selection.ts]
Action Evidence Request can be open, resolved, cancelled, expired, superseded, or declined. [src: src/action-registry-contract.ts]
Action Reconciling yields Action Evidence Request. [src: src/review-actions.ts]
Action Reconciling yields Private Local Complete Source Artifact. [src: src/action-evidence-retrieval.ts]
Action Reconciling yields Action Evidence Request Receipt. [src: src/review-actions.ts]
Article Action Files consists of Action Evidence Request Receipt. [src: src/action-registry-contract.ts]
Source Evidence Projecting requires Action Evidence Request. [src: src/action-evidence-retrieval.ts]
Source Evidence Projecting requires Private Local Complete Source Artifact. [src: src/action-evidence-retrieval.ts]
Source Evidence Projecting yields Action Evidence Projection. [src: src/action-evidence-retrieval.ts]
Source Evidence Projecting requires an open Action Evidence Request. [src: src/action-evidence-retrieval.ts]
Source Evidence Selecting requires Action Evidence Projection. [src: src/action-evidence-selection.ts]
Source Evidence Selecting requires current Private Local Complete Source Artifact identity. [src: src/review-actions.ts]
Source Evidence Selecting requires explicit corrected Action Evidence Projection selection when multiple complete projections exist. [src: src/action-evidence-selection.ts]
Source Evidence Selecting with an explicitly selected incomplete Action Evidence Projection yields Action Evidence Request. [src: src/action-evidence-selection.ts]
Action Evidence Request Closing changes Action Evidence Request from open to resolved, cancelled, expired, superseded, or declined. [src: src/action-evidence-retrieval.ts]
Action Evidence Request Closing yields Private Local Resolution Artifact. [src: src/action-evidence-retrieval.ts]
Action Reconciling invokes Action Model View Serializing. [src: src/review-actions.ts]
Action Model View Serializing requires Selected Source Evidence. [src: src/action-evidence-view.ts]
Action Model View Serializing requires Evidence Coverage. [src: src/review-actions.ts]
Collector Generated Metadata Provenance can be available or unavailable. [src: src/action-evidence-view.ts]
Generated Metadata Compacting occurs if Collector Generated Metadata Provenance is available. [src: src/action-evidence-view.ts]
Generated Metadata Compacting requires Collector Generated Metadata Provenance. [src: src/action-evidence-view.ts]
Generated Metadata Compacting yields Partial Metadata Context. [src: src/action-evidence-view.ts]
Lossless Metadata Factoring requires Collector Generated Metadata Provenance. [src: src/action-evidence-view.ts]
Lossless Metadata Factoring requires Source Evidence. [src: src/action-evidence-view.ts]
Lossless Metadata Factoring yields Lossless Source Model View. [src: src/action-evidence-view.ts]
Action Model View Serializing zooms into Lossless Metadata Factoring. [src: src/action-evidence-view.ts]
Source Evidence Selecting requires Lossless Source Model View. [src: src/action-evidence-selection.ts]
Action Model View Serializing zooms into Generated Metadata Compacting. [src: src/action-evidence-view.ts]
Action Model View Serializing yields Prepared Evidence View Receipt. [src: src/action-evidence-view.ts]
Suggestion Proposing requires Prepared Evidence View Receipt. [src: src/review-actions.ts]
Suggestion Verifying requires Prepared Evidence View Receipt. [src: src/review-actions.ts]
Action Reconciling requires Prepared Evidence View Receipt. [src: src/review-actions.ts]
Action Model View Serializing requires Action Registry. [src: src/action-model-view.ts]
Action Model View Serializing yields Lossless Action Model View. [src: src/action-model-view.ts]
Suggestion Proposing requires Lossless Action Model View. [src: src/review-actions.ts]
Suggestion Verifying requires Lossless Action Model View. [src: src/review-actions.ts]
Suggestion Proposing requires Selected Source Evidence. [src: src/review-actions.ts]
Suggestion Verifying requires Selected Source Evidence. [src: src/review-actions.ts]
Action Reconciling yields Evidence Resolution Intent. [src: src/review-actions.ts]
Action Reconciling yields Action Review Output Provenance. [src: src/review-actions.ts]
Action Review Output Provenance consists of Created Action Record Binding, Updated Action Record Binding, and Rejection Memory Binding. [src: src/action-registry-contract.ts]
Article Action Files consists of Action Review Output Provenance. [src: src/action-registry-contract.ts]
Evidence Resolution Recording requires Evidence Resolution Intent. [src: src/action-evidence-retrieval.ts]
Evidence Resolution Recording requires Article Action Files. [src: src/action-registry.ts]
Evidence Resolution Recording yields Private Local Resolution Artifact. [src: src/action-evidence-retrieval.ts]
Article Generating invokes Evidence Resolution Recording. [src: src/index.ts]
Editorial Revising invokes Evidence Resolution Recording. [src: src/revise-article.ts]
Editorial Accepting invokes Evidence Resolution Recording. [src: scripts/reconcile-actions.ts]
```

## SD1.3 — Reporting interval and fallback start checking

**Caption:** This view summarizes the source facts in this section. Rectangles identify objects;
rounded nodes identify processes. Labeled solid arrows distinguish human participation,
required instruments, and transformations. These are compatibility labels, not native OPM links.
Use the source facts below for properties, state detail, and decomposition membership.

```mermaid
---
title: "SD1.3 — Reporting interval and fallback start checking"
---
flowchart TD
  accTitle: SD1.3 — Reporting interval and fallback start checking
  accDescr: Lossy system model projection. Complete source facts follow this diagram.
  n189["Article Date"]
  n190("Activity Window Resolving")
  n191["Activity Window"]
  n102("Context Collecting")
  n192["Clock"]
  n193("Start Target Waiting")
  n194["Due Start Target"]
  n14("Fallback Checking")
  n16("Fallback Dispatching")
  n189 -->|"requires (instrument)"| n190
  n190 -->|"yields"| n191
  n191 -->|"requires (instrument)"| n102
  n102 -->|"invokes"| n190
  n192 -->|"requires (instrument)"| n193
  n193 -->|"yields"| n194
  n14 -->|"invokes"| n193
  n194 -->|"requires (instrument)"| n16
```

**Source facts (OJF-OPL; bracketed provenance is local metadata):**

```text
Activity Window Resolving requires Article Date. [src: src/activity-window.ts]
Activity Window Resolving yields Activity Window. [src: src/activity-window.ts]
Context Collecting requires Activity Window. [src: src/collect-context.ts]
Context Collecting invokes Activity Window Resolving. [src: src/collect-context.ts]
Start Target Waiting requires Clock. [src: .github/scripts/daily_blog_schedule.py]
Start Target Waiting yields Due Start Target. [src: .github/scripts/daily_blog_schedule.py]
Fallback Checking invokes Start Target Waiting. [src: .github/scripts/daily_blog_schedule.py]
Fallback Dispatching requires Due Start Target. [src: .github/scripts/daily_blog_schedule.py]
```

## SD1.4 — Exact captured invocation admission

**Caption:** This view summarizes the source facts in this section. Rectangles identify objects;
rounded nodes identify processes. Labeled solid arrows distinguish human participation,
required instruments, and transformations. These are compatibility labels, not native OPM links.
Use the source facts below for properties, state detail, and decomposition membership.

```mermaid
---
title: "SD1.4 — Exact captured invocation admission"
---
flowchart TD
  accTitle: SD1.4 — Exact captured invocation admission
  accDescr: Lossy system model projection. Complete source facts follow this diagram.
  n195["Exact Captured Invocation"]
  n39["Canonical Action Proposal"]
  n28("Action Reconciling")
  n196["Captured Invocation Birth Output"]
  n220["Created Action Record Binding"]
  n207["Candidate Review Transition"]
  n113["Article Action Files — states: pending, verified"]
  n197["valid Captured Invocation Birth Output"]
  n159("Action Registry Writing")
  n39 -->|"exhibits"| n195
  n28 -->|"yields"| n196
  n220 -->|"part of"| n196
  n207 -->|"part of"| n196
  n196 -->|"part of"| n113
  n197 -->|"requires (instrument)"| n159
```

**Source facts (OJF-OPL; bracketed provenance is local metadata):**

```text
Canonical Action Proposal exhibits Exact Captured Invocation. [src: src/review-actions.ts]
Action Reconciling yields Captured Invocation Birth Output. [src: src/review-actions.ts]
Captured Invocation Birth Output consists of Created Action Record Binding and Candidate Review Transition. [src: src/action-registry-schema.ts]
Article Action Files consists of Captured Invocation Birth Output. [src: src/action-registry-schema.ts]
Action Registry Writing requires valid Captured Invocation Birth Output. [src: src/action-registry-schema.ts]
```

## SD1.5 — Candidate link resolution

**Caption:** This view summarizes the source facts in this section. Rectangles identify objects;
rounded nodes identify processes. Labeled solid arrows distinguish human participation,
required instruments, and transformations. These are compatibility labels, not native OPM links.
Use the source facts below for properties, state detail, and decomposition membership.

```mermaid
---
title: "SD1.5 — Candidate link resolution"
---
flowchart TD
  accTitle: SD1.5 — Candidate link resolution
  accDescr: Lossy system model projection. Complete source facts follow this diagram.
  n198["Derived Suggestion Index"]
  n39["Canonical Action Proposal"]
  n34("Candidate Reference Resolving")
  n199["Candidate Association Diagnostic"]
  n39 -->|"exhibits"| n198
  n34 -->|"yields"| n199
```

**Source facts (OJF-OPL; bracketed provenance is local metadata):**

```text
Canonical Action Proposal exhibits Derived Suggestion Index. [src: src/review-actions.ts]
Candidate Reference Resolving yields Candidate Association Diagnostic. [src: src/review-actions.ts]
```

## SD1.6 — Manual held-action review

**Caption:** This view summarizes the source facts in this section. Rectangles identify objects;
rounded nodes identify processes. Labeled solid arrows distinguish human participation,
required instruments, and transformations. These are compatibility labels, not native OPM links.
Use the source facts below for properties, state detail, and decomposition membership.

```mermaid
---
title: "SD1.6 — Manual held-action review"
---
flowchart TD
  accTitle: SD1.6 — Manual held-action review
  accDescr: Lossy system model projection. Complete source facts follow this diagram.
  n200["Accepted Article"]
  n201("Held Action Reviewing")
  n202["Pending Original Candidates"]
  n203["Reviewed Owner Grant"]
  n204["Operation Reservation"]
  n205["Unmerged Dated Proposal"]
  n206["Bounded Operation Receipt"]
  n223["Proposed Article Card"]
  n224["Proposed Article Action File"]
  n200 -->|"requires (instrument)"| n201
  n202 -->|"requires (instrument)"| n201
  n203 -->|"requires (instrument)"| n201
  n204 -->|"requires (instrument)"| n201
  n201 -->|"yields"| n205
  n201 -->|"yields"| n206
  n223 -->|"part of"| n205
  n224 -->|"part of"| n205
```

**Source facts (OJF-OPL; bracketed provenance is local metadata):**

```text
Held Action Reviewing requires Accepted Article. [src: scripts/review-held-actions.ts]
Held Action Reviewing requires Pending Original Candidates. [src: scripts/review-held-actions.ts]
Held Action Reviewing requires Reviewed Owner Grant. [src: scripts/review-held-actions.ts]
Held Action Reviewing requires Operation Reservation. [src: scripts/review-held-actions.ts]
Held Action Reviewing yields Unmerged Dated Proposal. [src: scripts/review-held-actions.ts]
Held Action Reviewing yields Bounded Operation Receipt. [src: scripts/review-held-actions.ts]
Unmerged Dated Proposal consists of Proposed Article Card and Proposed Article Action File. [src: scripts/review-held-actions.ts]
```

# System model — Mermaid compatibility views

> Generated from `system.opl` by the /opm subset renderer v1. Do not hand-edit.
> Source SHA-256: `867b42daf0ad545b0a490ea1b169cc189c52667a53dc5bda19655f974ee30f96`.
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
  n44["Draft Action Candidate — states: awaiting-review, promoted, mapped-existing, rejected, verified-closure"]
  n144["Candidate Review History"]
  n185["Candidate Review Transition"]
  n186["Historical Source Metadata"]
  n45["Source Identity, Source Kind, Source Locator, and Full Content Digest"]
  n46["Draft Candidate Evidence Association — states: required, context"]
  n187["Background Evidence Reference"]
  n188["Candidate Action Relation"]
  n189["Candidate Input View"]
  n47["Action Registry, Draft Action Candidates, Action Review Cycle, Operator Feedback, and Article Status"]
  n48("Candidate Evidence Preparing")
  n190["Canonical Action Index"]
  n191["Held Suggestion Memory"]
  n192["Rejection Memory"]
  n49["Action Review Snapshot"]
  n50("Candidate Evidence Refreshing")
  n51["unchanged Draft Candidate Evidence Association"]
  n52["unchanged prior Candidate Input View"]
  n53["Accepted Outcome Stamp"]
  n54["Action Review Snapshot and Accepted Outcome Stamp"]
  n55("Acceptance Status Evidence Refreshing")
  n56["current-binding Draft Candidate Evidence Requirements"]
  n193["Ranked Recommendations"]
  n194["Handled Suggestions"]
  n57("Editorial Revising")
  n58["Editorial Revision Request"]
  n59["Draft Suggestion — states: proposed, open, done, dismissed, superseded, deferred"]
  n149["Imported Action Baseline"]
  n109["Article Action Files — states: pending, verified"]
  n60("Inclusion Choosing")
  n61["Reviewed Disposition — states: deferred, completed-existing-evidence, pending-receipt"]
  n195["Canonical Actions"]
  n62["JSON API"]
  n63("Frontend Rendering")
  n64["Rendered Site"]
  n65["Article Fingerprint"]
  n66("Independent Review Projecting")
  n67["Review Projection"]
  n68("Revision Requesting")
  n69["Revision Request"]
  n70("Conversation Saving")
  n71["Saved Message"]
  n196["Review Records"]
  n197["Correspondence"]
  n72["Time Record Pointer"]
  n73("Time Recording")
  n74["Commit Context"]
  n75["Issue Context"]
  n76["Time Evidence"]
  n77("Time Backfilling")
  n78("Time Resolving")
  n79["Time References"]
  n80["Shipment Timestamp — states: available, unavailable"]
  n81["Shipment Source State — states: open, closed-unmerged"]
  n82["Shipment Coverage — states: complete, unavailable"]
  n83("Shipment Time Resolving")
  n84("Issue Time Resolving")
  n85["Projected Issue Times"]
  n86["Time Expressions"]
  n87("Time Projecting")
  n88("Shipment Coverage Checking")
  n89["Projected Time References"]
  n90["Projected Shipment Timestamps"]
  n91["Projected Time Expressions"]
  n92("Time Visualizing")
  n93["Device Timezone"]
  n94["Time Popover"]
  n95("Time Metadata Preserving")
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
  n18 -->|"requires (instrument)"| n35
  n28 <-->|"affects"| n23
  n28 <-->|"affects"| n0
  n28 -->|"yields"| n24
  n28 -->|"yields"| n31
  n28 -->|"changes: transient to retained"| n27
  n44 -->|"part of"| n18
  n185 -->|"part of"| n144
  n186 -->|"part of"| n144
  n186 -->|"exhibits"| n45
  n46 -->|"part of"| n32
  n187 -->|"part of"| n32
  n188 -->|"part of"| n32
  n189 -->|"part of"| n32
  n47 -->|"requires (instrument)"| n48
  n48 -->|"yields"| n32
  n190 -->|"part of"| n189
  n191 -->|"part of"| n189
  n192 -->|"part of"| n189
  n49 -->|"requires (instrument)"| n50
  n51 -->|"requires (instrument)"| n50
  n52 -->|"requires (instrument)"| n50
  n50 -->|"changes: prior-binding to current-binding"| n32
  n20 -->|"yields"| n53
  n54 -->|"requires (instrument)"| n55
  n0 -->|"condition: accepted"| n55
  n55 -->|"yields"| n56
  n193 -->|"part of"| n26
  n18 -->|"part of"| n26
  n27 -->|"part of"| n26
  n194 -->|"part of"| n26
  n7 -->|"yields"| n29
  n7 -->|"invokes"| n28
  n57 -->|"yields"| n29
  n57 -->|"invokes"| n28
  n58 -->|"requires (instrument)"| n57
  n20 -->|"yields"| n29
  n57 -->|"invokes"| n48
  n20 -->|"invokes"| n48
  n20 -->|"invokes"| n28
  n149 -->|"part of"| n23
  n109 -->|"part of"| n23
  n23 -->|"requires (instrument)"| n60
  n4 -->|"requires (instrument)"| n60
  n60 <-->|"affects"| n23
  n19 -->|"handles (human)"| n60
  n195 -->|"part of"| n13
  n61 -->|"part of"| n13
  n21 -->|"invokes"| n22
  n13 -->|"requires (instrument)"| n21
  n21 -->|"yields"| n62
  n62 -->|"requires (instrument)"| n63
  n13 -->|"requires (instrument)"| n63
  n63 -->|"yields"| n64
  n21 -->|"yields"| n65
  n63 -->|"invokes"| n66
  n4 -->|"requires (instrument)"| n66
  n65 -->|"requires (instrument)"| n66
  n66 -->|"yields"| n67
  n19 -->|"handles (human)"| n68
  n67 -->|"requires (instrument)"| n68
  n68 -->|"yields"| n69
  n68 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n70
  n65 -->|"requires (instrument)"| n70
  n67 -->|"requires (instrument)"| n70
  n70 -->|"yields"| n71
  n70 <-->|"affects"| n4
  n196 -->|"part of"| n67
  n197 -->|"part of"| n67
  n0 -->|"exhibits"| n72
  n0 -->|"requires (instrument)"| n73
  n13 -->|"requires (instrument)"| n73
  n74 -->|"requires (instrument)"| n73
  n75 -->|"requires (instrument)"| n73
  n73 -->|"yields"| n76
  n73 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n77
  n4 -->|"requires (instrument)"| n77
  n77 -->|"yields"| n76
  n77 -->|"invokes"| n78
  n76 -->|"requires (instrument)"| n78
  n0 -->|"requires (instrument)"| n78
  n78 -->|"yields"| n79
  n0 -->|"requires (instrument)"| n83
  n76 -->|"requires (instrument)"| n83
  n81 -->|"requires (instrument)"| n83
  n83 -->|"yields"| n80
  n0 -->|"requires (instrument)"| n84
  n13 -->|"requires (instrument)"| n84
  n76 -->|"requires (instrument)"| n84
  n84 -->|"yields"| n85
  n73 -->|"invokes"| n83
  n78 -->|"yields"| n86
  n21 -->|"invokes"| n87
  n21 -->|"invokes"| n88
  n0 -->|"requires (instrument)"| n88
  n76 -->|"requires (instrument)"| n88
  n88 -->|"yields"| n82
  n0 -->|"requires (instrument)"| n87
  n13 -->|"requires (instrument)"| n87
  n76 -->|"requires (instrument)"| n87
  n87 -->|"invokes"| n78
  n87 -->|"invokes"| n83
  n87 -->|"invokes"| n84
  n87 -->|"yields"| n89
  n87 -->|"yields"| n90
  n89 -->|"part of"| n62
  n90 -->|"part of"| n62
  n85 -->|"part of"| n62
  n87 -->|"yields"| n91
  n91 -->|"part of"| n62
  n63 -->|"invokes"| n92
  n89 -->|"requires (instrument)"| n92
  n90 -->|"requires (instrument)"| n92
  n85 -->|"requires (instrument)"| n92
  n93 -->|"requires (instrument)"| n92
  n92 -->|"yields"| n94
  n19 -->|"handles (human)"| n57
  n57 -->|"invokes"| n95
  n0 -->|"requires (instrument)"| n95
  n95 <-->|"affects"| n0
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
  n96["Activity Decision — states: skip, run"]
  n97["Run Timing — states: available, unavailable"]
  n6["Run Evidence"]
  n7("Article Generating")
  n98("Context Collecting")
  n99("Activity Assessing")
  n100("Credit Checking")
  n101("Drafting")
  n102("Council Reviewing")
  n103("Synthesizing")
  n104("Claim Verifying")
  n105("Provenance Attaching")
  n73("Time Recording")
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n13["Canonical Action Projection"]
  n106("Closing Continuity Projecting")
  n107("Telemetry Collecting")
  n74["Commit Context"]
  n108["Closing Continuity Projection — states: available, unavailable"]
  n0["Article — states: draft, accepted, rejected"]
  n109["Article Action Files — states: pending, verified"]
  n110["Telemetry Digest"]
  n36["Claude API"]
  style n36 stroke-dasharray: 5 5
  n111["Credit Status"]
  n27["Draft Continuation Context — states: transient, retained"]
  n112["Council Critiques"]
  n113["Claim Report"]
  n76["Time Evidence"]
  n97 -->|"part of"| n6
  n4 -->|"requires (instrument)"| n98
  n13 -->|"requires (instrument)"| n98
  n98 -->|"invokes"| n106
  n98 -->|"invokes"| n107
  n98 -->|"yields"| n74
  n0 -->|"requires (instrument)"| n106
  n109 -->|"requires (instrument)"| n106
  n106 -->|"yields"| n108
  n107 -->|"yields"| n110
  n74 -->|"requires (instrument)"| n99
  n99 -->|"yields"| n96
  n96 -->|"condition: run"| n100
  n36 -->|"requires (instrument)"| n100
  n100 -->|"yields"| n111
  n36 -->|"requires (instrument)"| n101
  n74 -->|"requires (instrument)"| n101
  n110 -->|"requires (instrument)"| n101
  n111 -->|"requires (instrument)"| n101
  n108 -->|"requires (instrument)"| n101
  n96 -->|"condition: run"| n101
  n101 -->|"yields"| n0
  n101 -->|"yields"| n27
  n36 -->|"requires (instrument)"| n102
  n0 -->|"requires (instrument)"| n102
  n102 -->|"yields"| n112
  n36 -->|"requires (instrument)"| n103
  n112 -->|"consumes"| n103
  n103 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n104
  n74 -->|"requires (instrument)"| n104
  n104 -->|"yields"| n113
  n104 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n105
  n6 -->|"requires (instrument)"| n105
  n105 <-->|"affects"| n0
  n74 -->|"requires (instrument)"| n73
  n0 -->|"requires (instrument)"| n73
  n73 -->|"yields"| n76
  n73 <-->|"affects"| n0
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
  n114("Feedback Version Saving")
  n65["Article Fingerprint"]
  n115["Feedback Version"]
  n116("Explicit Revision Requesting")
  n117["PR Article Fingerprint"]
  n118["Explicit Revision Request"]
  n119("Explicit Revision Admitting")
  n120("Clean Acceptance Requesting")
  n121["Article Action File Fingerprint"]
  n122["Trusted Policy Fingerprint"]
  n123["Clean Acceptance Request"]
  n124("Clean Acceptance Admitting")
  n125["Editorial Request — states: outstanding, artifact-verified, owner-resolved"]
  n126("Owner Resolution Recording")
  n127["Failed First Workflow Attempt"]
  n128["Terminal Receipt Evidence — states: uncertain-receipt, proven-missing-receipt"]
  n129["Explicit Owner Acknowledgment"]
  n130["Owner Resolution"]
  n131["Owner Account"]
  n132["Admitted Revision"]
  n133["Integrated Trusted Policy"]
  n134["Admitted Clean Acceptance"]
  n135("Invocation Claiming")
  n136["Invocation Claim"]
  n137("Clean Acceptance Rechecking")
  n138["Reconfirmed Clean Acceptance"]
  n139("Continued Article Revising")
  n140("Continued Clean Accepting")
  n36["Claude API"]
  style n36 stroke-dasharray: 5 5
  n23["Action Registry"]
  n0["Article — states: draft, accepted, rejected"]
  n141["Revision Outcome"]
  n28("Action Reconciling")
  n142["Clean Acceptance Outcome"]
  n109["Article Action Files — states: pending, verified"]
  n143["Dated Action State Digest"]
  n18["Draft Action Candidates"]
  n144["Candidate Review History"]
  n32["Draft Candidate Evidence Requirements — states: prior-binding, current-binding"]
  n145["valid Candidate Review History"]
  n146("Action Reviewing")
  n147("Action Registry Writing")
  n148["existing Candidate Review History"]
  n149["Imported Action Baseline"]
  n22("Action Projecting")
  n150("Editorial Output Binding")
  n151["Editorial Output Artifact"]
  n152("Clean Acceptance Output Admitting")
  n153("Editorial Rebinding")
  n154("Source Evidence Selecting")
  n30["Source Evidence"]
  n31["Recommendation Maintenance Memory"]
  n155["Selected Source Evidence"]
  n156["Evidence Coverage"]
  n157["Action Evidence Request — states: open, resolved, cancelled, expired, superseded, declined"]
  n158["Private Local Complete Source Artifact"]
  n159["Action Evidence Request Receipt"]
  n160("Source Evidence Projecting")
  n161["Action Evidence Projection"]
  n162["an open Action Evidence Request"]
  n163["current Private Local Complete Source Artifact identity"]
  n164["explicit corrected Action Evidence Projection selection when multiple complete projections exist"]
  n165("Source Evidence Selecting with an explicitly selected incomplete Action Evidence Projection")
  n166("Action Evidence Request Closing")
  n167["Private Local Resolution Artifact"]
  n168("Action Model View Serializing")
  n169["Collector Generated Metadata Provenance — states: available, unavailable"]
  n170("Generated Metadata Compacting")
  n171["Partial Metadata Context"]
  n172["Prepared Evidence View Receipt"]
  n33("Suggestion Proposing")
  n35("Suggestion Verifying")
  n43["Lossless Action Model View"]
  n173["Evidence Resolution Intent"]
  n174["Action Review Output Provenance"]
  n198["Created Action Record Binding"]
  n199["Updated Action Record Binding"]
  n200["Rejection Memory Binding"]
  n175("Evidence Resolution Recording")
  n7("Article Generating")
  n57("Editorial Revising")
  n20("Editorial Accepting")
  n4 -->|"requires (instrument)"| n114
  n65 -->|"requires (instrument)"| n114
  n114 -->|"yields"| n115
  n115 -->|"requires (instrument)"| n116
  n117 -->|"requires (instrument)"| n116
  n116 -->|"yields"| n118
  n118 -->|"object event"| n119
  n117 -->|"requires (instrument)"| n120
  n121 -->|"requires (instrument)"| n120
  n122 -->|"requires (instrument)"| n120
  n120 -->|"yields"| n123
  n123 -->|"object event"| n124
  n4 -->|"requires (instrument)"| n126
  n127 -->|"requires (instrument)"| n126
  n128 -->|"requires (instrument)"| n126
  n129 -->|"requires (instrument)"| n126
  n126 -->|"changes: outstanding to owner-resolved"| n125
  n126 -->|"yields"| n130
  n131 -->|"requires (instrument)"| n119
  n4 -->|"requires (instrument)"| n119
  n119 -->|"yields"| n132
  n131 -->|"requires (instrument)"| n124
  n4 -->|"requires (instrument)"| n124
  n133 -->|"requires (instrument)"| n124
  n124 -->|"yields"| n134
  n132 -->|"object event"| n135
  n134 -->|"object event"| n135
  n4 -->|"requires (instrument)"| n135
  n135 -->|"yields"| n136
  n136 -->|"object event"| n137
  n4 -->|"requires (instrument)"| n137
  n122 -->|"requires (instrument)"| n137
  n123 -->|"requires (instrument)"| n137
  n137 -->|"yields"| n138
  n136 -->|"object event"| n139
  n138 -->|"object event"| n140
  n36 -->|"requires (instrument)"| n139
  n23 -->|"requires (instrument)"| n139
  n139 <-->|"affects"| n0
  n139 <-->|"affects"| n23
  n139 -->|"yields"| n141
  n23 -->|"requires (instrument)"| n140
  n140 -->|"invokes"| n28
  n140 <-->|"affects"| n0
  n140 <-->|"affects"| n23
  n140 -->|"yields"| n142
  n143 -->|"part of"| n109
  n18 -->|"part of"| n109
  n144 -->|"part of"| n109
  n32 -->|"part of"| n109
  n28 -->|"yields"| n143
  n28 -->|"changes: verified to pending"| n109
  n28 -->|"changes: pending to verified"| n109
  n28 -->|"yields"| n109
  n28 -->|"yields"| n144
  n145 -->|"requires (instrument)"| n28
  n145 -->|"requires (instrument)"| n146
  n143 -->|"requires (instrument)"| n146
  n143 -->|"requires (instrument)"| n147
  n148 -->|"requires (instrument)"| n147
  n147 -->|"yields"| n144
  n149 -->|"requires (instrument)"| n22
  n4 -->|"requires (instrument)"| n150
  n150 -->|"yields"| n151
  n151 -->|"requires (instrument)"| n119
  n151 -->|"requires (instrument)"| n152
  n0 -->|"requires (instrument)"| n153
  n153 <-->|"affects"| n109
  n28 -->|"invokes"| n154
  n0 -->|"requires (instrument)"| n154
  n23 -->|"requires (instrument)"| n154
  n30 -->|"requires (instrument)"| n154
  n31 -->|"requires (instrument)"| n154
  n32 -->|"requires (instrument)"| n154
  n154 -->|"yields"| n155
  n154 -->|"yields"| n156
  n28 -->|"yields"| n157
  n28 -->|"yields"| n158
  n28 -->|"yields"| n159
  n159 -->|"part of"| n109
  n157 -->|"requires (instrument)"| n160
  n158 -->|"requires (instrument)"| n160
  n160 -->|"yields"| n161
  n162 -->|"requires (instrument)"| n160
  n161 -->|"requires (instrument)"| n154
  n163 -->|"requires (instrument)"| n154
  n164 -->|"requires (instrument)"| n154
  n165 -->|"yields"| n157
  n166 -->|"changes: open to resolved, cancelled, expired, superseded, or declined"| n157
  n166 -->|"yields"| n167
  n28 -->|"invokes"| n168
  n155 -->|"requires (instrument)"| n168
  n156 -->|"requires (instrument)"| n168
  n169 -->|"condition: available"| n170
  n169 -->|"requires (instrument)"| n170
  n170 -->|"yields"| n171
  n168 -->|"yields"| n172
  n172 -->|"requires (instrument)"| n33
  n172 -->|"requires (instrument)"| n35
  n172 -->|"requires (instrument)"| n28
  n23 -->|"requires (instrument)"| n168
  n168 -->|"yields"| n43
  n43 -->|"requires (instrument)"| n33
  n43 -->|"requires (instrument)"| n35
  n155 -->|"requires (instrument)"| n33
  n155 -->|"requires (instrument)"| n35
  n28 -->|"yields"| n173
  n28 -->|"yields"| n174
  n198 -->|"part of"| n174
  n199 -->|"part of"| n174
  n200 -->|"part of"| n174
  n174 -->|"part of"| n109
  n173 -->|"requires (instrument)"| n175
  n109 -->|"requires (instrument)"| n175
  n175 -->|"yields"| n167
  n7 -->|"invokes"| n175
  n57 -->|"invokes"| n175
  n20 -->|"invokes"| n175
```

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
  n176["Article Date"]
  n177("Activity Window Resolving")
  n178["Activity Window"]
  n98("Context Collecting")
  n179["Clock"]
  n180("Start Target Waiting")
  n181["Due Start Target"]
  n14("Fallback Checking")
  n16("Fallback Dispatching")
  n176 -->|"requires (instrument)"| n177
  n177 -->|"yields"| n178
  n178 -->|"requires (instrument)"| n98
  n98 -->|"invokes"| n177
  n179 -->|"requires (instrument)"| n180
  n180 -->|"yields"| n181
  n14 -->|"invokes"| n180
  n181 -->|"requires (instrument)"| n16
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
  n182["Exact Captured Invocation"]
  n39["Canonical Action Proposal"]
  n28("Action Reconciling")
  n183["Captured Invocation Birth Output"]
  n198["Created Action Record Binding"]
  n185["Candidate Review Transition"]
  n109["Article Action Files — states: pending, verified"]
  n184["valid Captured Invocation Birth Output"]
  n147("Action Registry Writing")
  n39 -->|"exhibits"| n182
  n28 -->|"yields"| n183
  n198 -->|"part of"| n183
  n185 -->|"part of"| n183
  n183 -->|"part of"| n109
  n184 -->|"requires (instrument)"| n147
```

**Source facts (OJF-OPL; bracketed provenance is local metadata):**

```text
Canonical Action Proposal exhibits Exact Captured Invocation. [src: src/review-actions.ts]
Action Reconciling yields Captured Invocation Birth Output. [src: src/review-actions.ts]
Captured Invocation Birth Output consists of Created Action Record Binding and Candidate Review Transition. [src: src/action-registry-schema.ts]
Article Action Files consists of Captured Invocation Birth Output. [src: src/action-registry-schema.ts]
Action Registry Writing requires valid Captured Invocation Birth Output. [src: src/action-registry-schema.ts]
```

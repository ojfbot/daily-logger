# System model — Mermaid compatibility views

> Generated from `system.opl` by the /opm subset renderer v1. Do not hand-edit.
> Source SHA-256: `9e049bda9883a23d3387ab9e3908a0956fc0014701fd5f0f4a31e66df6cf6e82`.
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
  n35["Claude API"]
  style n35 stroke-dasharray: 5 5
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
  n34("Suggestion Verifying")
  n36["Draft Action Candidate — states: awaiting-review, promoted, mapped-existing, rejected, verified-closure"]
  n115["Candidate Review History"]
  n149["Candidate Review Transition"]
  n150["Historical Source Metadata"]
  n37["Source Identity, Source Kind, Source Locator, and Full Content Digest"]
  n38["Draft Candidate Evidence Association — states: required, context"]
  n151["Background Evidence Reference"]
  n152["Candidate Action Relation"]
  n153["Candidate Input View"]
  n39["Action Registry, Draft Action Candidates, Action Review Cycle, Operator Feedback, and Article Status"]
  n40("Candidate Evidence Preparing")
  n154["Canonical Action Index"]
  n155["Held Suggestion Memory"]
  n156["Rejection Memory"]
  n41["Action Review Snapshot"]
  n42("Candidate Evidence Refreshing")
  n43["unchanged Draft Candidate Evidence Association"]
  n44["unchanged prior Candidate Input View"]
  n157["Ranked Recommendations"]
  n158["Handled Suggestions"]
  n45("Editorial Revising")
  n46["Editorial Revision Request"]
  n47["Draft Suggestion — states: proposed, open, done, dismissed, superseded, deferred"]
  n120["Imported Action Baseline"]
  n97["Article Action Files — states: pending, verified"]
  n48("Inclusion Choosing")
  n49["Reviewed Disposition — states: deferred, completed-existing-evidence, pending-receipt"]
  n159["Canonical Actions"]
  n50["JSON API"]
  n51("Frontend Rendering")
  n52["Rendered Site"]
  n53["Article Fingerprint"]
  n54("Independent Review Projecting")
  n55["Review Projection"]
  n56("Revision Requesting")
  n57["Revision Request"]
  n58("Conversation Saving")
  n59["Saved Message"]
  n160["Review Records"]
  n161["Correspondence"]
  n60["Time Record Pointer"]
  n61("Time Recording")
  n62["Commit Context"]
  n63["Issue Context"]
  n64["Time Evidence"]
  n65("Time Backfilling")
  n66("Time Resolving")
  n67["Time References"]
  n68["Shipment Timestamp — states: available, unavailable"]
  n69["Shipment Source State — states: open, closed-unmerged"]
  n70["Shipment Coverage — states: complete, unavailable"]
  n71("Shipment Time Resolving")
  n72("Issue Time Resolving")
  n73["Projected Issue Times"]
  n74["Time Expressions"]
  n75("Time Projecting")
  n76("Shipment Coverage Checking")
  n77["Projected Time References"]
  n78["Projected Shipment Timestamps"]
  n79["Projected Time Expressions"]
  n80("Time Visualizing")
  n81["Device Timezone"]
  n82["Time Popover"]
  n83("Time Metadata Preserving")
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
  n35 -->|"requires (instrument)"| n33
  n35 -->|"requires (instrument)"| n34
  n31 -->|"requires (instrument)"| n33
  n31 -->|"requires (instrument)"| n34
  n18 -->|"requires (instrument)"| n33
  n18 -->|"requires (instrument)"| n34
  n28 <-->|"affects"| n23
  n28 <-->|"affects"| n0
  n28 -->|"yields"| n24
  n28 -->|"yields"| n31
  n28 -->|"changes: transient to retained"| n27
  n36 -->|"part of"| n18
  n149 -->|"part of"| n115
  n150 -->|"part of"| n115
  n150 -->|"exhibits"| n37
  n38 -->|"part of"| n32
  n151 -->|"part of"| n32
  n152 -->|"part of"| n32
  n153 -->|"part of"| n32
  n39 -->|"requires (instrument)"| n40
  n40 -->|"yields"| n32
  n154 -->|"part of"| n153
  n155 -->|"part of"| n153
  n156 -->|"part of"| n153
  n41 -->|"requires (instrument)"| n42
  n43 -->|"requires (instrument)"| n42
  n44 -->|"requires (instrument)"| n42
  n42 -->|"changes: prior-binding to current-binding"| n32
  n157 -->|"part of"| n26
  n18 -->|"part of"| n26
  n27 -->|"part of"| n26
  n158 -->|"part of"| n26
  n7 -->|"yields"| n29
  n7 -->|"invokes"| n28
  n45 -->|"yields"| n29
  n45 -->|"invokes"| n28
  n46 -->|"requires (instrument)"| n45
  n20 -->|"yields"| n29
  n45 -->|"invokes"| n40
  n20 -->|"invokes"| n40
  n20 -->|"invokes"| n28
  n120 -->|"part of"| n23
  n97 -->|"part of"| n23
  n23 -->|"requires (instrument)"| n48
  n4 -->|"requires (instrument)"| n48
  n48 <-->|"affects"| n23
  n19 -->|"handles (human)"| n48
  n159 -->|"part of"| n13
  n49 -->|"part of"| n13
  n21 -->|"invokes"| n22
  n13 -->|"requires (instrument)"| n21
  n21 -->|"yields"| n50
  n50 -->|"requires (instrument)"| n51
  n13 -->|"requires (instrument)"| n51
  n51 -->|"yields"| n52
  n21 -->|"yields"| n53
  n51 -->|"invokes"| n54
  n4 -->|"requires (instrument)"| n54
  n53 -->|"requires (instrument)"| n54
  n54 -->|"yields"| n55
  n19 -->|"handles (human)"| n56
  n55 -->|"requires (instrument)"| n56
  n56 -->|"yields"| n57
  n56 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n58
  n53 -->|"requires (instrument)"| n58
  n55 -->|"requires (instrument)"| n58
  n58 -->|"yields"| n59
  n58 <-->|"affects"| n4
  n160 -->|"part of"| n55
  n161 -->|"part of"| n55
  n0 -->|"exhibits"| n60
  n0 -->|"requires (instrument)"| n61
  n13 -->|"requires (instrument)"| n61
  n62 -->|"requires (instrument)"| n61
  n63 -->|"requires (instrument)"| n61
  n61 -->|"yields"| n64
  n61 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n65
  n4 -->|"requires (instrument)"| n65
  n65 -->|"yields"| n64
  n65 -->|"invokes"| n66
  n64 -->|"requires (instrument)"| n66
  n0 -->|"requires (instrument)"| n66
  n66 -->|"yields"| n67
  n0 -->|"requires (instrument)"| n71
  n64 -->|"requires (instrument)"| n71
  n69 -->|"requires (instrument)"| n71
  n71 -->|"yields"| n68
  n0 -->|"requires (instrument)"| n72
  n13 -->|"requires (instrument)"| n72
  n64 -->|"requires (instrument)"| n72
  n72 -->|"yields"| n73
  n61 -->|"invokes"| n71
  n66 -->|"yields"| n74
  n21 -->|"invokes"| n75
  n21 -->|"invokes"| n76
  n0 -->|"requires (instrument)"| n76
  n64 -->|"requires (instrument)"| n76
  n76 -->|"yields"| n70
  n0 -->|"requires (instrument)"| n75
  n13 -->|"requires (instrument)"| n75
  n64 -->|"requires (instrument)"| n75
  n75 -->|"invokes"| n66
  n75 -->|"invokes"| n71
  n75 -->|"invokes"| n72
  n75 -->|"yields"| n77
  n75 -->|"yields"| n78
  n77 -->|"part of"| n50
  n78 -->|"part of"| n50
  n73 -->|"part of"| n50
  n75 -->|"yields"| n79
  n79 -->|"part of"| n50
  n51 -->|"invokes"| n80
  n77 -->|"requires (instrument)"| n80
  n78 -->|"requires (instrument)"| n80
  n73 -->|"requires (instrument)"| n80
  n81 -->|"requires (instrument)"| n80
  n80 -->|"yields"| n82
  n19 -->|"handles (human)"| n45
  n45 -->|"invokes"| n83
  n0 -->|"requires (instrument)"| n83
  n83 <-->|"affects"| n0
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
Action Reconciling invokes Suggestion Verifying. [src: src/review-actions.ts]
Suggestion Proposing requires Claude API. [src: src/review-actions.ts]
Suggestion Verifying requires Claude API. [src: src/review-actions.ts]
Suggestion Proposing requires Recommendation Maintenance Memory. [src: src/review-actions.ts]
Suggestion Verifying requires Recommendation Maintenance Memory. [src: src/review-actions.ts]
Suggestion Proposing requires Draft Action Candidates. [src: src/review-actions.ts]
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
  n84["Activity Decision — states: skip, run"]
  n85["Run Timing — states: available, unavailable"]
  n6["Run Evidence"]
  n7("Article Generating")
  n86("Context Collecting")
  n87("Activity Assessing")
  n88("Credit Checking")
  n89("Drafting")
  n90("Council Reviewing")
  n91("Synthesizing")
  n92("Claim Verifying")
  n93("Provenance Attaching")
  n61("Time Recording")
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n13["Canonical Action Projection"]
  n94("Closing Continuity Projecting")
  n95("Telemetry Collecting")
  n62["Commit Context"]
  n96["Closing Continuity Projection — states: available, unavailable"]
  n0["Article — states: draft, accepted, rejected"]
  n97["Article Action Files — states: pending, verified"]
  n98["Telemetry Digest"]
  n35["Claude API"]
  style n35 stroke-dasharray: 5 5
  n99["Credit Status"]
  n27["Draft Continuation Context — states: transient, retained"]
  n100["Council Critiques"]
  n101["Claim Report"]
  n64["Time Evidence"]
  n85 -->|"part of"| n6
  n4 -->|"requires (instrument)"| n86
  n13 -->|"requires (instrument)"| n86
  n86 -->|"invokes"| n94
  n86 -->|"invokes"| n95
  n86 -->|"yields"| n62
  n0 -->|"requires (instrument)"| n94
  n97 -->|"requires (instrument)"| n94
  n94 -->|"yields"| n96
  n95 -->|"yields"| n98
  n62 -->|"requires (instrument)"| n87
  n87 -->|"yields"| n84
  n84 -->|"condition: run"| n88
  n35 -->|"requires (instrument)"| n88
  n88 -->|"yields"| n99
  n35 -->|"requires (instrument)"| n89
  n62 -->|"requires (instrument)"| n89
  n98 -->|"requires (instrument)"| n89
  n99 -->|"requires (instrument)"| n89
  n96 -->|"requires (instrument)"| n89
  n84 -->|"condition: run"| n89
  n89 -->|"yields"| n0
  n89 -->|"yields"| n27
  n35 -->|"requires (instrument)"| n90
  n0 -->|"requires (instrument)"| n90
  n90 -->|"yields"| n100
  n35 -->|"requires (instrument)"| n91
  n100 -->|"consumes"| n91
  n91 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n92
  n62 -->|"requires (instrument)"| n92
  n92 -->|"yields"| n101
  n92 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n93
  n6 -->|"requires (instrument)"| n93
  n93 <-->|"affects"| n0
  n62 -->|"requires (instrument)"| n61
  n0 -->|"requires (instrument)"| n61
  n61 -->|"yields"| n64
  n61 <-->|"affects"| n0
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
  n102("Feedback Version Saving")
  n53["Article Fingerprint"]
  n103["Feedback Version"]
  n104("Explicit Revision Requesting")
  n105["PR Article Fingerprint"]
  n106["Explicit Revision Request"]
  n107("Explicit Revision Admitting")
  n108["Owner Account"]
  n109["Admitted Revision"]
  n110("Invocation Claiming")
  n111["Invocation Claim"]
  n112("Continued Article Revising")
  n35["Claude API"]
  style n35 stroke-dasharray: 5 5
  n23["Action Registry"]
  n0["Article — states: draft, accepted, rejected"]
  n113["Revision Outcome"]
  n97["Article Action Files — states: pending, verified"]
  n114["Dated Action State Digest"]
  n18["Draft Action Candidates"]
  n115["Candidate Review History"]
  n32["Draft Candidate Evidence Requirements — states: prior-binding, current-binding"]
  n28("Action Reconciling")
  n116["valid Candidate Review History"]
  n117("Action Reviewing")
  n118("Action Registry Writing")
  n119["existing Candidate Review History"]
  n120["Imported Action Baseline"]
  n22("Action Projecting")
  n121("Editorial Output Binding")
  n122["Editorial Output Artifact"]
  n123("Editorial Rebinding")
  n124("Source Evidence Selecting")
  n30["Source Evidence"]
  n31["Recommendation Maintenance Memory"]
  n125["Selected Source Evidence"]
  n126["Evidence Coverage"]
  n127["Action Evidence Request — states: open, resolved, cancelled, expired, superseded, declined"]
  n128["Private Local Complete Source Artifact"]
  n129["Action Evidence Request Receipt"]
  n130("Source Evidence Projecting")
  n131["Action Evidence Projection"]
  n132["an open Action Evidence Request"]
  n133["current Private Local Complete Source Artifact identity"]
  n134["explicit corrected Action Evidence Projection selection when multiple complete projections exist"]
  n135("Source Evidence Selecting with an explicitly selected incomplete Action Evidence Projection")
  n136("Action Evidence Request Closing")
  n137["Private Local Resolution Artifact"]
  n138("Action Model View Serializing")
  n139["Lossless Action Model View"]
  n33("Suggestion Proposing")
  n34("Suggestion Verifying")
  n140["Evidence Resolution Intent"]
  n141["Action Review Output Provenance"]
  n162["Created Action Record Binding"]
  n163["Updated Action Record Binding"]
  n164["Rejection Memory Binding"]
  n142("Evidence Resolution Recording")
  n7("Article Generating")
  n45("Editorial Revising")
  n20("Editorial Accepting")
  n4 -->|"requires (instrument)"| n102
  n53 -->|"requires (instrument)"| n102
  n102 -->|"yields"| n103
  n103 -->|"requires (instrument)"| n104
  n105 -->|"requires (instrument)"| n104
  n104 -->|"yields"| n106
  n106 -->|"object event"| n107
  n108 -->|"requires (instrument)"| n107
  n4 -->|"requires (instrument)"| n107
  n107 -->|"yields"| n109
  n109 -->|"object event"| n110
  n4 -->|"requires (instrument)"| n110
  n110 -->|"yields"| n111
  n111 -->|"object event"| n112
  n35 -->|"requires (instrument)"| n112
  n23 -->|"requires (instrument)"| n112
  n112 <-->|"affects"| n0
  n112 <-->|"affects"| n23
  n112 -->|"yields"| n113
  n114 -->|"part of"| n97
  n18 -->|"part of"| n97
  n115 -->|"part of"| n97
  n32 -->|"part of"| n97
  n28 -->|"yields"| n114
  n28 -->|"changes: verified to pending"| n97
  n28 -->|"changes: pending to verified"| n97
  n28 -->|"yields"| n97
  n28 -->|"yields"| n115
  n116 -->|"requires (instrument)"| n28
  n116 -->|"requires (instrument)"| n117
  n114 -->|"requires (instrument)"| n117
  n114 -->|"requires (instrument)"| n118
  n119 -->|"requires (instrument)"| n118
  n118 -->|"yields"| n115
  n120 -->|"requires (instrument)"| n22
  n4 -->|"requires (instrument)"| n121
  n121 -->|"yields"| n122
  n122 -->|"requires (instrument)"| n107
  n0 -->|"requires (instrument)"| n123
  n123 <-->|"affects"| n97
  n28 -->|"invokes"| n124
  n0 -->|"requires (instrument)"| n124
  n23 -->|"requires (instrument)"| n124
  n30 -->|"requires (instrument)"| n124
  n31 -->|"requires (instrument)"| n124
  n32 -->|"requires (instrument)"| n124
  n124 -->|"yields"| n125
  n124 -->|"yields"| n126
  n28 -->|"yields"| n127
  n28 -->|"yields"| n128
  n28 -->|"yields"| n129
  n129 -->|"part of"| n97
  n127 -->|"requires (instrument)"| n130
  n128 -->|"requires (instrument)"| n130
  n130 -->|"yields"| n131
  n132 -->|"requires (instrument)"| n130
  n131 -->|"requires (instrument)"| n124
  n133 -->|"requires (instrument)"| n124
  n134 -->|"requires (instrument)"| n124
  n135 -->|"yields"| n127
  n136 -->|"changes: open to resolved, cancelled, expired, superseded, or declined"| n127
  n136 -->|"yields"| n137
  n28 -->|"invokes"| n138
  n125 -->|"requires (instrument)"| n138
  n23 -->|"requires (instrument)"| n138
  n138 -->|"yields"| n139
  n139 -->|"requires (instrument)"| n33
  n139 -->|"requires (instrument)"| n34
  n125 -->|"requires (instrument)"| n33
  n125 -->|"requires (instrument)"| n34
  n28 -->|"yields"| n140
  n28 -->|"yields"| n141
  n162 -->|"part of"| n141
  n163 -->|"part of"| n141
  n164 -->|"part of"| n141
  n141 -->|"part of"| n97
  n140 -->|"requires (instrument)"| n142
  n97 -->|"requires (instrument)"| n142
  n142 -->|"yields"| n137
  n7 -->|"invokes"| n142
  n45 -->|"invokes"| n142
  n20 -->|"invokes"| n142
```

**Source facts (OJF-OPL; bracketed provenance is local metadata):**

```text
Feedback Version Saving requires GitHub. [src: api/_lib/editorial-continuation.ts]
Feedback Version Saving requires Article Fingerprint. [src: api/_lib/editorial-continuation.ts]
Feedback Version Saving yields Feedback Version. [src: api/_lib/editorial-continuation.ts]
Explicit Revision Requesting requires Feedback Version. [src: packages/frontend/src/components/EditorialContinuation.tsx]
Explicit Revision Requesting requires PR Article Fingerprint. [src: api/_lib/editorial-continuation.ts]
Explicit Revision Requesting yields Explicit Revision Request. [src: api/_lib/editorial-continuation.ts]
Explicit Revision Request triggers Explicit Revision Admitting. [src: .github/workflows/editorial-revise.yml]
Explicit Revision Admitting requires Owner Account. [src: .github/scripts/continue-editorial.ts]
Explicit Revision Admitting requires GitHub. [src: .github/scripts/continue-editorial.ts]
Explicit Revision Admitting yields Admitted Revision. [src: .github/scripts/continue-editorial.ts]
Admitted Revision triggers Invocation Claiming. [src: .github/scripts/continue-editorial.ts]
Invocation Claiming requires GitHub. [src: .github/scripts/continue-editorial.ts]
Invocation Claiming yields Invocation Claim. [src: .github/scripts/continue-editorial.ts]
Invocation Claim triggers Continued Article Revising. [src: .github/scripts/continue-editorial.ts]
Continued Article Revising requires Claude API. [src: src/revise-article.ts]
Continued Article Revising requires Action Registry. [src: src/revise-article.ts]
Continued Article Revising affects Article. [src: src/revise-article.ts]
Continued Article Revising affects Action Registry. [src: src/revise-article.ts]
Continued Article Revising yields Revision Outcome. [src: .github/scripts/continue-editorial.ts]
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
Action Model View Serializing requires Selected Source Evidence. [src: src/action-model-view.ts]
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
  n143["Article Date"]
  n144("Activity Window Resolving")
  n145["Activity Window"]
  n86("Context Collecting")
  n146["Clock"]
  n147("Start Target Waiting")
  n148["Due Start Target"]
  n14("Fallback Checking")
  n16("Fallback Dispatching")
  n143 -->|"requires (instrument)"| n144
  n144 -->|"yields"| n145
  n145 -->|"requires (instrument)"| n86
  n86 -->|"invokes"| n144
  n146 -->|"requires (instrument)"| n147
  n147 -->|"yields"| n148
  n14 -->|"invokes"| n147
  n148 -->|"requires (instrument)"| n16
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

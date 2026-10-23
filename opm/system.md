# System model — Mermaid compatibility views

> Generated from `system.opl` by the /opm subset renderer v1. Do not hand-edit.
> Source SHA-256: `a6b60752f4b70c8aa8be1b8210fefd6e7770f9b5b80c7dffa5b22be29bc089f2`.
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
  n136["Candidate Review History"]
  n175["Candidate Review Transition"]
  n176["Historical Source Metadata"]
  n37["Source Identity, Source Kind, Source Locator, and Full Content Digest"]
  n38["Draft Candidate Evidence Association — states: required, context"]
  n177["Background Evidence Reference"]
  n178["Candidate Action Relation"]
  n179["Candidate Input View"]
  n39["Action Registry, Draft Action Candidates, Action Review Cycle, Operator Feedback, and Article Status"]
  n40("Candidate Evidence Preparing")
  n180["Canonical Action Index"]
  n181["Held Suggestion Memory"]
  n182["Rejection Memory"]
  n41["Action Review Snapshot"]
  n42("Candidate Evidence Refreshing")
  n43["unchanged Draft Candidate Evidence Association"]
  n44["unchanged prior Candidate Input View"]
  n45["Accepted Outcome Stamp"]
  n46["Action Review Snapshot and Accepted Outcome Stamp"]
  n47("Acceptance Status Evidence Refreshing")
  n48["current-binding Draft Candidate Evidence Requirements"]
  n183["Ranked Recommendations"]
  n184["Handled Suggestions"]
  n49("Editorial Revising")
  n50["Editorial Revision Request"]
  n51["Draft Suggestion — states: proposed, open, done, dismissed, superseded, deferred"]
  n141["Imported Action Baseline"]
  n101["Article Action Files — states: pending, verified"]
  n52("Inclusion Choosing")
  n53["Reviewed Disposition — states: deferred, completed-existing-evidence, pending-receipt"]
  n185["Canonical Actions"]
  n54["JSON API"]
  n55("Frontend Rendering")
  n56["Rendered Site"]
  n57["Article Fingerprint"]
  n58("Independent Review Projecting")
  n59["Review Projection"]
  n60("Revision Requesting")
  n61["Revision Request"]
  n62("Conversation Saving")
  n63["Saved Message"]
  n186["Review Records"]
  n187["Correspondence"]
  n64["Time Record Pointer"]
  n65("Time Recording")
  n66["Commit Context"]
  n67["Issue Context"]
  n68["Time Evidence"]
  n69("Time Backfilling")
  n70("Time Resolving")
  n71["Time References"]
  n72["Shipment Timestamp — states: available, unavailable"]
  n73["Shipment Source State — states: open, closed-unmerged"]
  n74["Shipment Coverage — states: complete, unavailable"]
  n75("Shipment Time Resolving")
  n76("Issue Time Resolving")
  n77["Projected Issue Times"]
  n78["Time Expressions"]
  n79("Time Projecting")
  n80("Shipment Coverage Checking")
  n81["Projected Time References"]
  n82["Projected Shipment Timestamps"]
  n83["Projected Time Expressions"]
  n84("Time Visualizing")
  n85["Device Timezone"]
  n86["Time Popover"]
  n87("Time Metadata Preserving")
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
  n175 -->|"part of"| n136
  n176 -->|"part of"| n136
  n176 -->|"exhibits"| n37
  n38 -->|"part of"| n32
  n177 -->|"part of"| n32
  n178 -->|"part of"| n32
  n179 -->|"part of"| n32
  n39 -->|"requires (instrument)"| n40
  n40 -->|"yields"| n32
  n180 -->|"part of"| n179
  n181 -->|"part of"| n179
  n182 -->|"part of"| n179
  n41 -->|"requires (instrument)"| n42
  n43 -->|"requires (instrument)"| n42
  n44 -->|"requires (instrument)"| n42
  n42 -->|"changes: prior-binding to current-binding"| n32
  n20 -->|"yields"| n45
  n46 -->|"requires (instrument)"| n47
  n0 -->|"condition: accepted"| n47
  n47 -->|"yields"| n48
  n183 -->|"part of"| n26
  n18 -->|"part of"| n26
  n27 -->|"part of"| n26
  n184 -->|"part of"| n26
  n7 -->|"yields"| n29
  n7 -->|"invokes"| n28
  n49 -->|"yields"| n29
  n49 -->|"invokes"| n28
  n50 -->|"requires (instrument)"| n49
  n20 -->|"yields"| n29
  n49 -->|"invokes"| n40
  n20 -->|"invokes"| n40
  n20 -->|"invokes"| n28
  n141 -->|"part of"| n23
  n101 -->|"part of"| n23
  n23 -->|"requires (instrument)"| n52
  n4 -->|"requires (instrument)"| n52
  n52 <-->|"affects"| n23
  n19 -->|"handles (human)"| n52
  n185 -->|"part of"| n13
  n53 -->|"part of"| n13
  n21 -->|"invokes"| n22
  n13 -->|"requires (instrument)"| n21
  n21 -->|"yields"| n54
  n54 -->|"requires (instrument)"| n55
  n13 -->|"requires (instrument)"| n55
  n55 -->|"yields"| n56
  n21 -->|"yields"| n57
  n55 -->|"invokes"| n58
  n4 -->|"requires (instrument)"| n58
  n57 -->|"requires (instrument)"| n58
  n58 -->|"yields"| n59
  n19 -->|"handles (human)"| n60
  n59 -->|"requires (instrument)"| n60
  n60 -->|"yields"| n61
  n60 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n62
  n57 -->|"requires (instrument)"| n62
  n59 -->|"requires (instrument)"| n62
  n62 -->|"yields"| n63
  n62 <-->|"affects"| n4
  n186 -->|"part of"| n59
  n187 -->|"part of"| n59
  n0 -->|"exhibits"| n64
  n0 -->|"requires (instrument)"| n65
  n13 -->|"requires (instrument)"| n65
  n66 -->|"requires (instrument)"| n65
  n67 -->|"requires (instrument)"| n65
  n65 -->|"yields"| n68
  n65 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n69
  n4 -->|"requires (instrument)"| n69
  n69 -->|"yields"| n68
  n69 -->|"invokes"| n70
  n68 -->|"requires (instrument)"| n70
  n0 -->|"requires (instrument)"| n70
  n70 -->|"yields"| n71
  n0 -->|"requires (instrument)"| n75
  n68 -->|"requires (instrument)"| n75
  n73 -->|"requires (instrument)"| n75
  n75 -->|"yields"| n72
  n0 -->|"requires (instrument)"| n76
  n13 -->|"requires (instrument)"| n76
  n68 -->|"requires (instrument)"| n76
  n76 -->|"yields"| n77
  n65 -->|"invokes"| n75
  n70 -->|"yields"| n78
  n21 -->|"invokes"| n79
  n21 -->|"invokes"| n80
  n0 -->|"requires (instrument)"| n80
  n68 -->|"requires (instrument)"| n80
  n80 -->|"yields"| n74
  n0 -->|"requires (instrument)"| n79
  n13 -->|"requires (instrument)"| n79
  n68 -->|"requires (instrument)"| n79
  n79 -->|"invokes"| n70
  n79 -->|"invokes"| n75
  n79 -->|"invokes"| n76
  n79 -->|"yields"| n81
  n79 -->|"yields"| n82
  n81 -->|"part of"| n54
  n82 -->|"part of"| n54
  n77 -->|"part of"| n54
  n79 -->|"yields"| n83
  n83 -->|"part of"| n54
  n55 -->|"invokes"| n84
  n81 -->|"requires (instrument)"| n84
  n82 -->|"requires (instrument)"| n84
  n77 -->|"requires (instrument)"| n84
  n85 -->|"requires (instrument)"| n84
  n84 -->|"yields"| n86
  n19 -->|"handles (human)"| n49
  n49 -->|"invokes"| n87
  n0 -->|"requires (instrument)"| n87
  n87 <-->|"affects"| n0
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
  n88["Activity Decision — states: skip, run"]
  n89["Run Timing — states: available, unavailable"]
  n6["Run Evidence"]
  n7("Article Generating")
  n90("Context Collecting")
  n91("Activity Assessing")
  n92("Credit Checking")
  n93("Drafting")
  n94("Council Reviewing")
  n95("Synthesizing")
  n96("Claim Verifying")
  n97("Provenance Attaching")
  n65("Time Recording")
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n13["Canonical Action Projection"]
  n98("Closing Continuity Projecting")
  n99("Telemetry Collecting")
  n66["Commit Context"]
  n100["Closing Continuity Projection — states: available, unavailable"]
  n0["Article — states: draft, accepted, rejected"]
  n101["Article Action Files — states: pending, verified"]
  n102["Telemetry Digest"]
  n35["Claude API"]
  style n35 stroke-dasharray: 5 5
  n103["Credit Status"]
  n27["Draft Continuation Context — states: transient, retained"]
  n104["Council Critiques"]
  n105["Claim Report"]
  n68["Time Evidence"]
  n89 -->|"part of"| n6
  n4 -->|"requires (instrument)"| n90
  n13 -->|"requires (instrument)"| n90
  n90 -->|"invokes"| n98
  n90 -->|"invokes"| n99
  n90 -->|"yields"| n66
  n0 -->|"requires (instrument)"| n98
  n101 -->|"requires (instrument)"| n98
  n98 -->|"yields"| n100
  n99 -->|"yields"| n102
  n66 -->|"requires (instrument)"| n91
  n91 -->|"yields"| n88
  n88 -->|"condition: run"| n92
  n35 -->|"requires (instrument)"| n92
  n92 -->|"yields"| n103
  n35 -->|"requires (instrument)"| n93
  n66 -->|"requires (instrument)"| n93
  n102 -->|"requires (instrument)"| n93
  n103 -->|"requires (instrument)"| n93
  n100 -->|"requires (instrument)"| n93
  n88 -->|"condition: run"| n93
  n93 -->|"yields"| n0
  n93 -->|"yields"| n27
  n35 -->|"requires (instrument)"| n94
  n0 -->|"requires (instrument)"| n94
  n94 -->|"yields"| n104
  n35 -->|"requires (instrument)"| n95
  n104 -->|"consumes"| n95
  n95 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n96
  n66 -->|"requires (instrument)"| n96
  n96 -->|"yields"| n105
  n96 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n97
  n6 -->|"requires (instrument)"| n97
  n97 <-->|"affects"| n0
  n66 -->|"requires (instrument)"| n65
  n0 -->|"requires (instrument)"| n65
  n65 -->|"yields"| n68
  n65 <-->|"affects"| n0
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
  n106("Feedback Version Saving")
  n57["Article Fingerprint"]
  n107["Feedback Version"]
  n108("Explicit Revision Requesting")
  n109["PR Article Fingerprint"]
  n110["Explicit Revision Request"]
  n111("Explicit Revision Admitting")
  n112("Clean Acceptance Requesting")
  n113["Article Action File Fingerprint"]
  n114["Trusted Policy Fingerprint"]
  n115["Clean Acceptance Request"]
  n116("Clean Acceptance Admitting")
  n117["Editorial Request — states: outstanding, artifact-verified, owner-resolved"]
  n118("Owner Resolution Recording")
  n119["Failed First Workflow Attempt"]
  n120["Terminal Receipt Evidence — states: uncertain-receipt, proven-missing-receipt"]
  n121["Explicit Owner Acknowledgment"]
  n122["Owner Resolution"]
  n123["Owner Account"]
  n124["Admitted Revision"]
  n125["Integrated Trusted Policy"]
  n126["Admitted Clean Acceptance"]
  n127("Invocation Claiming")
  n128["Invocation Claim"]
  n129("Clean Acceptance Rechecking")
  n130["Reconfirmed Clean Acceptance"]
  n131("Continued Article Revising")
  n132("Continued Clean Accepting")
  n35["Claude API"]
  style n35 stroke-dasharray: 5 5
  n23["Action Registry"]
  n0["Article — states: draft, accepted, rejected"]
  n133["Revision Outcome"]
  n28("Action Reconciling")
  n134["Clean Acceptance Outcome"]
  n101["Article Action Files — states: pending, verified"]
  n135["Dated Action State Digest"]
  n18["Draft Action Candidates"]
  n136["Candidate Review History"]
  n32["Draft Candidate Evidence Requirements — states: prior-binding, current-binding"]
  n137["valid Candidate Review History"]
  n138("Action Reviewing")
  n139("Action Registry Writing")
  n140["existing Candidate Review History"]
  n141["Imported Action Baseline"]
  n22("Action Projecting")
  n142("Editorial Output Binding")
  n143["Editorial Output Artifact"]
  n144("Clean Acceptance Output Admitting")
  n145("Editorial Rebinding")
  n146("Source Evidence Selecting")
  n30["Source Evidence"]
  n31["Recommendation Maintenance Memory"]
  n147["Selected Source Evidence"]
  n148["Evidence Coverage"]
  n149["Action Evidence Request — states: open, resolved, cancelled, expired, superseded, declined"]
  n150["Private Local Complete Source Artifact"]
  n151["Action Evidence Request Receipt"]
  n152("Source Evidence Projecting")
  n153["Action Evidence Projection"]
  n154["an open Action Evidence Request"]
  n155["current Private Local Complete Source Artifact identity"]
  n156["explicit corrected Action Evidence Projection selection when multiple complete projections exist"]
  n157("Source Evidence Selecting with an explicitly selected incomplete Action Evidence Projection")
  n158("Action Evidence Request Closing")
  n159["Private Local Resolution Artifact"]
  n160("Action Model View Serializing")
  n161["Collector Generated Metadata Provenance — states: available, unavailable"]
  n162("Generated Metadata Compacting")
  n163["Partial Metadata Context"]
  n164["Prepared Evidence View Receipt"]
  n33("Suggestion Proposing")
  n34("Suggestion Verifying")
  n165["Lossless Action Model View"]
  n166["Evidence Resolution Intent"]
  n167["Action Review Output Provenance"]
  n188["Created Action Record Binding"]
  n189["Updated Action Record Binding"]
  n190["Rejection Memory Binding"]
  n168("Evidence Resolution Recording")
  n7("Article Generating")
  n49("Editorial Revising")
  n20("Editorial Accepting")
  n4 -->|"requires (instrument)"| n106
  n57 -->|"requires (instrument)"| n106
  n106 -->|"yields"| n107
  n107 -->|"requires (instrument)"| n108
  n109 -->|"requires (instrument)"| n108
  n108 -->|"yields"| n110
  n110 -->|"object event"| n111
  n109 -->|"requires (instrument)"| n112
  n113 -->|"requires (instrument)"| n112
  n114 -->|"requires (instrument)"| n112
  n112 -->|"yields"| n115
  n115 -->|"object event"| n116
  n4 -->|"requires (instrument)"| n118
  n119 -->|"requires (instrument)"| n118
  n120 -->|"requires (instrument)"| n118
  n121 -->|"requires (instrument)"| n118
  n118 -->|"changes: outstanding to owner-resolved"| n117
  n118 -->|"yields"| n122
  n123 -->|"requires (instrument)"| n111
  n4 -->|"requires (instrument)"| n111
  n111 -->|"yields"| n124
  n123 -->|"requires (instrument)"| n116
  n4 -->|"requires (instrument)"| n116
  n125 -->|"requires (instrument)"| n116
  n116 -->|"yields"| n126
  n124 -->|"object event"| n127
  n126 -->|"object event"| n127
  n4 -->|"requires (instrument)"| n127
  n127 -->|"yields"| n128
  n128 -->|"object event"| n129
  n4 -->|"requires (instrument)"| n129
  n114 -->|"requires (instrument)"| n129
  n115 -->|"requires (instrument)"| n129
  n129 -->|"yields"| n130
  n128 -->|"object event"| n131
  n130 -->|"object event"| n132
  n35 -->|"requires (instrument)"| n131
  n23 -->|"requires (instrument)"| n131
  n131 <-->|"affects"| n0
  n131 <-->|"affects"| n23
  n131 -->|"yields"| n133
  n23 -->|"requires (instrument)"| n132
  n132 -->|"invokes"| n28
  n132 <-->|"affects"| n0
  n132 <-->|"affects"| n23
  n132 -->|"yields"| n134
  n135 -->|"part of"| n101
  n18 -->|"part of"| n101
  n136 -->|"part of"| n101
  n32 -->|"part of"| n101
  n28 -->|"yields"| n135
  n28 -->|"changes: verified to pending"| n101
  n28 -->|"changes: pending to verified"| n101
  n28 -->|"yields"| n101
  n28 -->|"yields"| n136
  n137 -->|"requires (instrument)"| n28
  n137 -->|"requires (instrument)"| n138
  n135 -->|"requires (instrument)"| n138
  n135 -->|"requires (instrument)"| n139
  n140 -->|"requires (instrument)"| n139
  n139 -->|"yields"| n136
  n141 -->|"requires (instrument)"| n22
  n4 -->|"requires (instrument)"| n142
  n142 -->|"yields"| n143
  n143 -->|"requires (instrument)"| n111
  n143 -->|"requires (instrument)"| n144
  n0 -->|"requires (instrument)"| n145
  n145 <-->|"affects"| n101
  n28 -->|"invokes"| n146
  n0 -->|"requires (instrument)"| n146
  n23 -->|"requires (instrument)"| n146
  n30 -->|"requires (instrument)"| n146
  n31 -->|"requires (instrument)"| n146
  n32 -->|"requires (instrument)"| n146
  n146 -->|"yields"| n147
  n146 -->|"yields"| n148
  n28 -->|"yields"| n149
  n28 -->|"yields"| n150
  n28 -->|"yields"| n151
  n151 -->|"part of"| n101
  n149 -->|"requires (instrument)"| n152
  n150 -->|"requires (instrument)"| n152
  n152 -->|"yields"| n153
  n154 -->|"requires (instrument)"| n152
  n153 -->|"requires (instrument)"| n146
  n155 -->|"requires (instrument)"| n146
  n156 -->|"requires (instrument)"| n146
  n157 -->|"yields"| n149
  n158 -->|"changes: open to resolved, cancelled, expired, superseded, or declined"| n149
  n158 -->|"yields"| n159
  n28 -->|"invokes"| n160
  n147 -->|"requires (instrument)"| n160
  n148 -->|"requires (instrument)"| n160
  n161 -->|"condition: available"| n162
  n161 -->|"requires (instrument)"| n162
  n162 -->|"yields"| n163
  n160 -->|"yields"| n164
  n164 -->|"requires (instrument)"| n33
  n164 -->|"requires (instrument)"| n34
  n164 -->|"requires (instrument)"| n28
  n23 -->|"requires (instrument)"| n160
  n160 -->|"yields"| n165
  n165 -->|"requires (instrument)"| n33
  n165 -->|"requires (instrument)"| n34
  n147 -->|"requires (instrument)"| n33
  n147 -->|"requires (instrument)"| n34
  n28 -->|"yields"| n166
  n28 -->|"yields"| n167
  n188 -->|"part of"| n167
  n189 -->|"part of"| n167
  n190 -->|"part of"| n167
  n167 -->|"part of"| n101
  n166 -->|"requires (instrument)"| n168
  n101 -->|"requires (instrument)"| n168
  n168 -->|"yields"| n159
  n7 -->|"invokes"| n168
  n49 -->|"invokes"| n168
  n20 -->|"invokes"| n168
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
  n169["Article Date"]
  n170("Activity Window Resolving")
  n171["Activity Window"]
  n90("Context Collecting")
  n172["Clock"]
  n173("Start Target Waiting")
  n174["Due Start Target"]
  n14("Fallback Checking")
  n16("Fallback Dispatching")
  n169 -->|"requires (instrument)"| n170
  n170 -->|"yields"| n171
  n171 -->|"requires (instrument)"| n90
  n90 -->|"invokes"| n170
  n172 -->|"requires (instrument)"| n173
  n173 -->|"yields"| n174
  n14 -->|"invokes"| n173
  n174 -->|"requires (instrument)"| n16
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

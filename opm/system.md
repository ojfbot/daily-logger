# System model — Mermaid compatibility views

> Generated from `system.opl` by the /opm subset renderer v1. Do not hand-edit.
> Source SHA-256: `fe668efe01c19f918b1aed0188c73e0dce3774aad687cc601719517ab4165611`.
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
  n32["Draft Candidate Evidence Requirements"]
  n33("Suggestion Proposing")
  n34("Suggestion Verifying")
  n36["Draft Action Candidate — states: awaiting-review, promoted, mapped-existing, rejected, verified-closure"]
  n113["Candidate Review History"]
  n147["Candidate Review Transition"]
  n148["Historical Source Metadata"]
  n37["Source Identity, Source Kind, Source Locator, and Full Content Digest"]
  n38["Draft Candidate Evidence Association — states: required, context"]
  n149["Background Evidence Reference"]
  n150["Candidate Action Relation"]
  n151["Candidate Input View"]
  n39["Action Registry, Draft Action Candidates, Action Review Cycle, Operator Feedback, and Article Status"]
  n40("Candidate Evidence Preparing")
  n152["Canonical Action Index"]
  n153["Held Suggestion Memory"]
  n154["Rejection Memory"]
  n41["unchanged Candidate Input View"]
  n42("Candidate Evidence Refreshing")
  n155["Ranked Recommendations"]
  n156["Handled Suggestions"]
  n43("Editorial Revising")
  n44["Editorial Revision Request"]
  n45["Draft Suggestion — states: proposed, open, done, dismissed, superseded, deferred"]
  n118["Imported Action Baseline"]
  n95["Article Action Files — states: pending, verified"]
  n46("Inclusion Choosing")
  n47["Reviewed Disposition — states: deferred, completed-existing-evidence, pending-receipt"]
  n157["Canonical Actions"]
  n48["JSON API"]
  n49("Frontend Rendering")
  n50["Rendered Site"]
  n51["Article Fingerprint"]
  n52("Independent Review Projecting")
  n53["Review Projection"]
  n54("Revision Requesting")
  n55["Revision Request"]
  n56("Conversation Saving")
  n57["Saved Message"]
  n158["Review Records"]
  n159["Correspondence"]
  n58["Time Record Pointer"]
  n59("Time Recording")
  n60["Commit Context"]
  n61["Issue Context"]
  n62["Time Evidence"]
  n63("Time Backfilling")
  n64("Time Resolving")
  n65["Time References"]
  n66["Shipment Timestamp — states: available, unavailable"]
  n67["Shipment Source State — states: open, closed-unmerged"]
  n68["Shipment Coverage — states: complete, unavailable"]
  n69("Shipment Time Resolving")
  n70("Issue Time Resolving")
  n71["Projected Issue Times"]
  n72["Time Expressions"]
  n73("Time Projecting")
  n74("Shipment Coverage Checking")
  n75["Projected Time References"]
  n76["Projected Shipment Timestamps"]
  n77["Projected Time Expressions"]
  n78("Time Visualizing")
  n79["Device Timezone"]
  n80["Time Popover"]
  n81("Time Metadata Preserving")
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
  n147 -->|"part of"| n113
  n148 -->|"part of"| n113
  n148 -->|"exhibits"| n37
  n38 -->|"part of"| n32
  n149 -->|"part of"| n32
  n150 -->|"part of"| n32
  n151 -->|"part of"| n32
  n39 -->|"requires (instrument)"| n40
  n40 -->|"yields"| n32
  n152 -->|"part of"| n151
  n153 -->|"part of"| n151
  n154 -->|"part of"| n151
  n41 -->|"requires (instrument)"| n42
  n42 -->|"changes: prior-cycle to current-cycle"| n32
  n155 -->|"part of"| n26
  n18 -->|"part of"| n26
  n27 -->|"part of"| n26
  n156 -->|"part of"| n26
  n7 -->|"yields"| n29
  n7 -->|"invokes"| n28
  n43 -->|"yields"| n29
  n43 -->|"invokes"| n28
  n44 -->|"requires (instrument)"| n43
  n20 -->|"yields"| n29
  n43 -->|"invokes"| n40
  n20 -->|"invokes"| n40
  n20 -->|"invokes"| n28
  n118 -->|"part of"| n23
  n95 -->|"part of"| n23
  n23 -->|"requires (instrument)"| n46
  n4 -->|"requires (instrument)"| n46
  n46 <-->|"affects"| n23
  n19 -->|"handles (human)"| n46
  n157 -->|"part of"| n13
  n47 -->|"part of"| n13
  n21 -->|"invokes"| n22
  n13 -->|"requires (instrument)"| n21
  n21 -->|"yields"| n48
  n48 -->|"requires (instrument)"| n49
  n13 -->|"requires (instrument)"| n49
  n49 -->|"yields"| n50
  n21 -->|"yields"| n51
  n49 -->|"invokes"| n52
  n4 -->|"requires (instrument)"| n52
  n51 -->|"requires (instrument)"| n52
  n52 -->|"yields"| n53
  n19 -->|"handles (human)"| n54
  n53 -->|"requires (instrument)"| n54
  n54 -->|"yields"| n55
  n54 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n56
  n51 -->|"requires (instrument)"| n56
  n53 -->|"requires (instrument)"| n56
  n56 -->|"yields"| n57
  n56 <-->|"affects"| n4
  n158 -->|"part of"| n53
  n159 -->|"part of"| n53
  n0 -->|"exhibits"| n58
  n0 -->|"requires (instrument)"| n59
  n13 -->|"requires (instrument)"| n59
  n60 -->|"requires (instrument)"| n59
  n61 -->|"requires (instrument)"| n59
  n59 -->|"yields"| n62
  n59 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n63
  n4 -->|"requires (instrument)"| n63
  n63 -->|"yields"| n62
  n63 -->|"invokes"| n64
  n62 -->|"requires (instrument)"| n64
  n0 -->|"requires (instrument)"| n64
  n64 -->|"yields"| n65
  n0 -->|"requires (instrument)"| n69
  n62 -->|"requires (instrument)"| n69
  n67 -->|"requires (instrument)"| n69
  n69 -->|"yields"| n66
  n0 -->|"requires (instrument)"| n70
  n13 -->|"requires (instrument)"| n70
  n62 -->|"requires (instrument)"| n70
  n70 -->|"yields"| n71
  n59 -->|"invokes"| n69
  n64 -->|"yields"| n72
  n21 -->|"invokes"| n73
  n21 -->|"invokes"| n74
  n0 -->|"requires (instrument)"| n74
  n62 -->|"requires (instrument)"| n74
  n74 -->|"yields"| n68
  n0 -->|"requires (instrument)"| n73
  n13 -->|"requires (instrument)"| n73
  n62 -->|"requires (instrument)"| n73
  n73 -->|"invokes"| n64
  n73 -->|"invokes"| n69
  n73 -->|"invokes"| n70
  n73 -->|"yields"| n75
  n73 -->|"yields"| n76
  n75 -->|"part of"| n48
  n76 -->|"part of"| n48
  n71 -->|"part of"| n48
  n73 -->|"yields"| n77
  n77 -->|"part of"| n48
  n49 -->|"invokes"| n78
  n75 -->|"requires (instrument)"| n78
  n76 -->|"requires (instrument)"| n78
  n71 -->|"requires (instrument)"| n78
  n79 -->|"requires (instrument)"| n78
  n78 -->|"yields"| n80
  n19 -->|"handles (human)"| n43
  n43 -->|"invokes"| n81
  n0 -->|"requires (instrument)"| n81
  n81 <-->|"affects"| n0
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
Candidate Evidence Refreshing requires unchanged Candidate Input View. [src: src/action-evidence-selection.ts]
Candidate Evidence Refreshing changes Draft Candidate Evidence Requirements from prior-cycle to current-cycle. [src: src/action-evidence-selection.ts]
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
  n82["Activity Decision — states: skip, run"]
  n83["Run Timing — states: available, unavailable"]
  n6["Run Evidence"]
  n7("Article Generating")
  n84("Context Collecting")
  n85("Activity Assessing")
  n86("Credit Checking")
  n87("Drafting")
  n88("Council Reviewing")
  n89("Synthesizing")
  n90("Claim Verifying")
  n91("Provenance Attaching")
  n59("Time Recording")
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n13["Canonical Action Projection"]
  n92("Closing Continuity Projecting")
  n93("Telemetry Collecting")
  n60["Commit Context"]
  n94["Closing Continuity Projection — states: available, unavailable"]
  n0["Article — states: draft, accepted, rejected"]
  n95["Article Action Files — states: pending, verified"]
  n96["Telemetry Digest"]
  n35["Claude API"]
  style n35 stroke-dasharray: 5 5
  n97["Credit Status"]
  n27["Draft Continuation Context — states: transient, retained"]
  n98["Council Critiques"]
  n99["Claim Report"]
  n62["Time Evidence"]
  n83 -->|"part of"| n6
  n4 -->|"requires (instrument)"| n84
  n13 -->|"requires (instrument)"| n84
  n84 -->|"invokes"| n92
  n84 -->|"invokes"| n93
  n84 -->|"yields"| n60
  n0 -->|"requires (instrument)"| n92
  n95 -->|"requires (instrument)"| n92
  n92 -->|"yields"| n94
  n93 -->|"yields"| n96
  n60 -->|"requires (instrument)"| n85
  n85 -->|"yields"| n82
  n82 -->|"condition: run"| n86
  n35 -->|"requires (instrument)"| n86
  n86 -->|"yields"| n97
  n35 -->|"requires (instrument)"| n87
  n60 -->|"requires (instrument)"| n87
  n96 -->|"requires (instrument)"| n87
  n97 -->|"requires (instrument)"| n87
  n94 -->|"requires (instrument)"| n87
  n82 -->|"condition: run"| n87
  n87 -->|"yields"| n0
  n87 -->|"yields"| n27
  n35 -->|"requires (instrument)"| n88
  n0 -->|"requires (instrument)"| n88
  n88 -->|"yields"| n98
  n35 -->|"requires (instrument)"| n89
  n98 -->|"consumes"| n89
  n89 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n90
  n60 -->|"requires (instrument)"| n90
  n90 -->|"yields"| n99
  n90 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n91
  n6 -->|"requires (instrument)"| n91
  n91 <-->|"affects"| n0
  n60 -->|"requires (instrument)"| n59
  n0 -->|"requires (instrument)"| n59
  n59 -->|"yields"| n62
  n59 <-->|"affects"| n0
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
  n100("Feedback Version Saving")
  n51["Article Fingerprint"]
  n101["Feedback Version"]
  n102("Explicit Revision Requesting")
  n103["PR Article Fingerprint"]
  n104["Explicit Revision Request"]
  n105("Explicit Revision Admitting")
  n106["Owner Account"]
  n107["Admitted Revision"]
  n108("Invocation Claiming")
  n109["Invocation Claim"]
  n110("Continued Article Revising")
  n35["Claude API"]
  style n35 stroke-dasharray: 5 5
  n23["Action Registry"]
  n0["Article — states: draft, accepted, rejected"]
  n111["Revision Outcome"]
  n95["Article Action Files — states: pending, verified"]
  n112["Dated Action State Digest"]
  n18["Draft Action Candidates"]
  n113["Candidate Review History"]
  n32["Draft Candidate Evidence Requirements"]
  n28("Action Reconciling")
  n114["valid Candidate Review History"]
  n115("Action Reviewing")
  n116("Action Registry Writing")
  n117["existing Candidate Review History"]
  n118["Imported Action Baseline"]
  n22("Action Projecting")
  n119("Editorial Output Binding")
  n120["Editorial Output Artifact"]
  n121("Editorial Rebinding")
  n122("Source Evidence Selecting")
  n30["Source Evidence"]
  n31["Recommendation Maintenance Memory"]
  n123["Selected Source Evidence"]
  n124["Evidence Coverage"]
  n125["Action Evidence Request — states: open, resolved, cancelled, expired, superseded, declined"]
  n126["Private Local Complete Source Artifact"]
  n127["Action Evidence Request Receipt"]
  n128("Source Evidence Projecting")
  n129["Action Evidence Projection"]
  n130["an open Action Evidence Request"]
  n131["current Private Local Complete Source Artifact identity"]
  n132["explicit corrected Action Evidence Projection selection when multiple complete projections exist"]
  n133("Source Evidence Selecting with an explicitly selected incomplete Action Evidence Projection")
  n134("Action Evidence Request Closing")
  n135["Private Local Resolution Artifact"]
  n136("Action Model View Serializing")
  n137["Lossless Action Model View"]
  n33("Suggestion Proposing")
  n34("Suggestion Verifying")
  n138["Evidence Resolution Intent"]
  n139["Action Review Output Provenance"]
  n160["Created Action Record Binding"]
  n161["Updated Action Record Binding"]
  n162["Rejection Memory Binding"]
  n140("Evidence Resolution Recording")
  n7("Article Generating")
  n43("Editorial Revising")
  n20("Editorial Accepting")
  n4 -->|"requires (instrument)"| n100
  n51 -->|"requires (instrument)"| n100
  n100 -->|"yields"| n101
  n101 -->|"requires (instrument)"| n102
  n103 -->|"requires (instrument)"| n102
  n102 -->|"yields"| n104
  n104 -->|"object event"| n105
  n106 -->|"requires (instrument)"| n105
  n4 -->|"requires (instrument)"| n105
  n105 -->|"yields"| n107
  n107 -->|"object event"| n108
  n4 -->|"requires (instrument)"| n108
  n108 -->|"yields"| n109
  n109 -->|"object event"| n110
  n35 -->|"requires (instrument)"| n110
  n23 -->|"requires (instrument)"| n110
  n110 <-->|"affects"| n0
  n110 <-->|"affects"| n23
  n110 -->|"yields"| n111
  n112 -->|"part of"| n95
  n18 -->|"part of"| n95
  n113 -->|"part of"| n95
  n32 -->|"part of"| n95
  n28 -->|"yields"| n112
  n28 -->|"changes: verified to pending"| n95
  n28 -->|"changes: pending to verified"| n95
  n28 -->|"yields"| n95
  n28 -->|"yields"| n113
  n114 -->|"requires (instrument)"| n28
  n114 -->|"requires (instrument)"| n115
  n112 -->|"requires (instrument)"| n115
  n112 -->|"requires (instrument)"| n116
  n117 -->|"requires (instrument)"| n116
  n116 -->|"yields"| n113
  n118 -->|"requires (instrument)"| n22
  n4 -->|"requires (instrument)"| n119
  n119 -->|"yields"| n120
  n120 -->|"requires (instrument)"| n105
  n0 -->|"requires (instrument)"| n121
  n121 <-->|"affects"| n95
  n28 -->|"invokes"| n122
  n0 -->|"requires (instrument)"| n122
  n23 -->|"requires (instrument)"| n122
  n30 -->|"requires (instrument)"| n122
  n31 -->|"requires (instrument)"| n122
  n32 -->|"requires (instrument)"| n122
  n122 -->|"yields"| n123
  n122 -->|"yields"| n124
  n28 -->|"yields"| n125
  n28 -->|"yields"| n126
  n28 -->|"yields"| n127
  n127 -->|"part of"| n95
  n125 -->|"requires (instrument)"| n128
  n126 -->|"requires (instrument)"| n128
  n128 -->|"yields"| n129
  n130 -->|"requires (instrument)"| n128
  n129 -->|"requires (instrument)"| n122
  n131 -->|"requires (instrument)"| n122
  n132 -->|"requires (instrument)"| n122
  n133 -->|"yields"| n125
  n134 -->|"changes: open to resolved, cancelled, expired, superseded, or declined"| n125
  n134 -->|"yields"| n135
  n28 -->|"invokes"| n136
  n123 -->|"requires (instrument)"| n136
  n23 -->|"requires (instrument)"| n136
  n136 -->|"yields"| n137
  n137 -->|"requires (instrument)"| n33
  n137 -->|"requires (instrument)"| n34
  n123 -->|"requires (instrument)"| n33
  n123 -->|"requires (instrument)"| n34
  n28 -->|"yields"| n138
  n28 -->|"yields"| n139
  n160 -->|"part of"| n139
  n161 -->|"part of"| n139
  n162 -->|"part of"| n139
  n139 -->|"part of"| n95
  n138 -->|"requires (instrument)"| n140
  n95 -->|"requires (instrument)"| n140
  n140 -->|"yields"| n135
  n7 -->|"invokes"| n140
  n43 -->|"invokes"| n140
  n20 -->|"invokes"| n140
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
  n141["Article Date"]
  n142("Activity Window Resolving")
  n143["Activity Window"]
  n84("Context Collecting")
  n144["Clock"]
  n145("Start Target Waiting")
  n146["Due Start Target"]
  n14("Fallback Checking")
  n16("Fallback Dispatching")
  n141 -->|"requires (instrument)"| n142
  n142 -->|"yields"| n143
  n143 -->|"requires (instrument)"| n84
  n84 -->|"invokes"| n142
  n144 -->|"requires (instrument)"| n145
  n145 -->|"yields"| n146
  n14 -->|"invokes"| n145
  n146 -->|"requires (instrument)"| n16
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

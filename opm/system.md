# System model — Mermaid compatibility views

> Generated from `system.opl` by the /opm subset renderer v1. Do not hand-edit.
> Source SHA-256: `a7df947eab1936b4824eb8cb16da9726a14202f6412e3d421184ac2b5080ae6c`.
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
  n18["Jim"]
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n33["Claude API"]
  style n33 stroke-dasharray: 5 5
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
  n19("Editorial Accepting")
  n20("API Building")
  n21("Action Projecting")
  n22["Action Registry"]
  n23["Closing Prompt — states: legacy-options, ranked-shortlist, needs-evidence"]
  n24("Suggested Action Card Rendering")
  n25["Suggested Actions Card"]
  n26["Draft Continuation Context — states: transient, retained"]
  n27("Action Reconciling")
  n28["Action Review Cycle — states: generation, revision"]
  n29["Source Evidence"]
  n30["Recommendation Maintenance Memory"]
  n31("Suggestion Proposing")
  n32("Suggestion Verifying")
  n105["Ranked Recommendations"]
  n106["Handled Suggestions"]
  n34("Editorial Revising")
  n35["Editorial Revision Request"]
  n36["Draft Suggestion — states: proposed, open, done, dismissed, superseded, deferred"]
  n98["Imported Action Baseline"]
  n80["Article Action Files — states: pending, verified"]
  n37("Inclusion Choosing")
  n38["Reviewed Disposition — states: deferred, completed-existing-evidence, pending-receipt"]
  n107["Canonical Actions"]
  n39["JSON API"]
  n40("Frontend Rendering")
  n41["Rendered Site"]
  n42["Article Fingerprint"]
  n43("Independent Review Projecting")
  n44["Review Projection"]
  n45("Revision Requesting")
  n46["Revision Request"]
  n47("Conversation Saving")
  n48["Saved Message"]
  n108["Review Records"]
  n109["Correspondence"]
  n49["Time Record Pointer"]
  n50("Time Recording")
  n51["Commit Context"]
  n52["Time Evidence"]
  n53("Time Backfilling")
  n54("Time Resolving")
  n55["Time References"]
  n56["Shipment Timestamp — states: available, unavailable"]
  n57["Shipment Coverage — states: complete, unavailable"]
  n58("Shipment Time Resolving")
  n59("Time Projecting")
  n60("Shipment Coverage Checking")
  n61["Projected Time References"]
  n62["Projected Shipment Timestamps"]
  n63("Time Visualizing")
  n64["Device Timezone"]
  n65["Time Popover"]
  n66("Time Metadata Preserving")
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
  n18 -->|"handles (human)"| n19
  n19 -->|"changes: draft to accepted"| n0
  n0 -->|"requires (instrument)"| n20
  n0 -->|"requires (instrument)"| n21
  n22 -->|"requires (instrument)"| n21
  n21 -->|"yields"| n13
  n23 -->|"requires (instrument)"| n24
  n22 -->|"requires (instrument)"| n24
  n24 -->|"yields"| n25
  n0 -->|"requires (instrument)"| n27
  n22 -->|"requires (instrument)"| n27
  n28 -->|"requires (instrument)"| n27
  n29 -->|"requires (instrument)"| n27
  n30 -->|"requires (instrument)"| n27
  n27 -->|"invokes"| n31
  n27 -->|"invokes"| n32
  n33 -->|"requires (instrument)"| n31
  n33 -->|"requires (instrument)"| n32
  n30 -->|"requires (instrument)"| n31
  n30 -->|"requires (instrument)"| n32
  n27 <-->|"affects"| n22
  n27 <-->|"affects"| n0
  n27 -->|"yields"| n23
  n27 -->|"yields"| n30
  n27 -->|"changes: transient to retained"| n26
  n105 -->|"part of"| n25
  n26 -->|"part of"| n25
  n106 -->|"part of"| n25
  n7 -->|"yields"| n28
  n7 -->|"invokes"| n27
  n34 -->|"yields"| n28
  n34 -->|"invokes"| n27
  n35 -->|"requires (instrument)"| n34
  n19 -->|"yields"| n28
  n19 -->|"invokes"| n27
  n98 -->|"part of"| n22
  n80 -->|"part of"| n22
  n22 -->|"requires (instrument)"| n37
  n4 -->|"requires (instrument)"| n37
  n37 <-->|"affects"| n22
  n18 -->|"handles (human)"| n37
  n107 -->|"part of"| n13
  n38 -->|"part of"| n13
  n20 -->|"invokes"| n21
  n13 -->|"requires (instrument)"| n20
  n20 -->|"yields"| n39
  n39 -->|"requires (instrument)"| n40
  n13 -->|"requires (instrument)"| n40
  n40 -->|"yields"| n41
  n20 -->|"yields"| n42
  n40 -->|"invokes"| n43
  n4 -->|"requires (instrument)"| n43
  n42 -->|"requires (instrument)"| n43
  n43 -->|"yields"| n44
  n18 -->|"handles (human)"| n45
  n44 -->|"requires (instrument)"| n45
  n45 -->|"yields"| n46
  n45 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n47
  n42 -->|"requires (instrument)"| n47
  n44 -->|"requires (instrument)"| n47
  n47 -->|"yields"| n48
  n47 <-->|"affects"| n4
  n108 -->|"part of"| n44
  n109 -->|"part of"| n44
  n0 -->|"exhibits"| n49
  n0 -->|"requires (instrument)"| n50
  n51 -->|"requires (instrument)"| n50
  n50 -->|"yields"| n52
  n50 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n53
  n4 -->|"requires (instrument)"| n53
  n53 -->|"yields"| n52
  n53 -->|"invokes"| n54
  n52 -->|"requires (instrument)"| n54
  n0 -->|"requires (instrument)"| n54
  n54 -->|"yields"| n55
  n0 -->|"requires (instrument)"| n58
  n52 -->|"requires (instrument)"| n58
  n58 -->|"yields"| n56
  n50 -->|"invokes"| n58
  n20 -->|"invokes"| n59
  n20 -->|"invokes"| n60
  n0 -->|"requires (instrument)"| n60
  n52 -->|"requires (instrument)"| n60
  n60 -->|"yields"| n57
  n0 -->|"requires (instrument)"| n59
  n52 -->|"requires (instrument)"| n59
  n59 -->|"invokes"| n54
  n59 -->|"invokes"| n58
  n59 -->|"yields"| n61
  n59 -->|"yields"| n62
  n61 -->|"part of"| n39
  n62 -->|"part of"| n39
  n40 -->|"invokes"| n63
  n61 -->|"requires (instrument)"| n63
  n62 -->|"requires (instrument)"| n63
  n64 -->|"requires (instrument)"| n63
  n63 -->|"yields"| n65
  n18 -->|"handles (human)"| n34
  n34 -->|"invokes"| n66
  n0 -->|"requires (instrument)"| n66
  n66 <-->|"affects"| n0
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
Action Reconciling invokes Suggestion Proposing. [src: src/review-actions.ts]
Action Reconciling invokes Suggestion Verifying. [src: src/review-actions.ts]
Suggestion Proposing requires Claude API. [src: src/review-actions.ts]
Suggestion Verifying requires Claude API. [src: src/review-actions.ts]
Suggestion Proposing requires Recommendation Maintenance Memory. [src: src/review-actions.ts]
Suggestion Verifying requires Recommendation Maintenance Memory. [src: src/review-actions.ts]
Action Reconciling affects Action Registry. [src: src/review-actions.ts]
Action Reconciling affects Article. [src: src/action-registry.ts]
Action Reconciling yields Closing Prompt. [src: src/review-actions.ts]
Action Reconciling yields Recommendation Maintenance Memory. [src: src/review-actions.ts]
Action Reconciling changes Draft Continuation Context from transient to retained. [src: src/recommendation-prose.ts]
Closing Prompt can be legacy-options, ranked-shortlist, or needs-evidence. [src: src/action-registry-schema.ts]
Suggested Actions Card consists of Ranked Recommendations, Draft Continuation Context, and Handled Suggestions. [src: src/action-registry.ts]
Article Generating yields Action Review Cycle. [src: src/index.ts]
Article Generating invokes Action Reconciling. [src: src/index.ts]
Editorial Revising yields Action Review Cycle. [src: src/revise-article.ts]
Editorial Revising invokes Action Reconciling. [src: src/revise-article.ts]
Editorial Revising requires Editorial Revision Request. [src: .github/scripts/editorial-revision-admission.mjs]
Editorial Accepting yields Action Review Cycle. [src: scripts/reconcile-actions.ts]
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
Time Recording requires Commit Context. [src: src/index.ts]
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
Shipment Coverage can be complete or unavailable. [src: src/shipment-time-coverage.ts]
Shipment Time Resolving requires Article. [src: src/shipment-times.ts]
Shipment Time Resolving requires Time Evidence. [src: src/shipment-times.ts]
Shipment Time Resolving yields Shipment Timestamp. [src: src/shipment-times.ts]
Time Recording invokes Shipment Time Resolving. [src: src/article-time-metadata.ts]
API Building invokes Time Projecting. [src: src/build-api.ts]
API Building invokes Shipment Coverage Checking. [src: src/build-api.ts]
Shipment Coverage Checking requires Article. [src: src/shipment-time-coverage.ts]
Shipment Coverage Checking requires Time Evidence. [src: src/article-time-metadata.ts]
Shipment Coverage Checking yields Shipment Coverage. [src: src/shipment-time-coverage.ts]
Time Projecting requires Article. [src: src/article-time-metadata.ts]
Time Projecting requires Time Evidence. [src: src/article-time-metadata.ts]
Time Projecting invokes Time Resolving. [src: src/article-time-metadata.ts]
Time Projecting invokes Shipment Time Resolving. [src: src/article-time-metadata.ts]
Time Projecting yields Projected Time References. [src: src/article-time-metadata.ts]
Time Projecting yields Projected Shipment Timestamps. [src: src/build-api.ts]
JSON API consists of Projected Time References and Projected Shipment Timestamps. [src: src/build-api.ts]
Frontend Rendering invokes Time Visualizing. [src: packages/frontend/src/hooks/useArticlePopovers.ts]
Time Visualizing requires Projected Time References. [src: packages/frontend/src/utils/timeReferences.ts]
Time Visualizing requires Projected Shipment Timestamps. [src: packages/frontend/src/utils/shipmentTimes.ts]
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
  n67["Activity Decision — states: skip, run"]
  n68["Run Timing — states: available, unavailable"]
  n6["Run Evidence"]
  n7("Article Generating")
  n69("Context Collecting")
  n70("Activity Assessing")
  n71("Credit Checking")
  n72("Drafting")
  n73("Council Reviewing")
  n74("Synthesizing")
  n75("Claim Verifying")
  n76("Provenance Attaching")
  n50("Time Recording")
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n13["Canonical Action Projection"]
  n77("Closing Continuity Projecting")
  n78("Telemetry Collecting")
  n51["Commit Context"]
  n79["Closing Continuity Projection — states: available, unavailable"]
  n0["Article — states: draft, accepted, rejected"]
  n80["Article Action Files — states: pending, verified"]
  n81["Telemetry Digest"]
  n33["Claude API"]
  style n33 stroke-dasharray: 5 5
  n82["Credit Status"]
  n26["Draft Continuation Context — states: transient, retained"]
  n83["Council Critiques"]
  n84["Claim Report"]
  n52["Time Evidence"]
  n68 -->|"part of"| n6
  n4 -->|"requires (instrument)"| n69
  n13 -->|"requires (instrument)"| n69
  n69 -->|"invokes"| n77
  n69 -->|"invokes"| n78
  n69 -->|"yields"| n51
  n0 -->|"requires (instrument)"| n77
  n80 -->|"requires (instrument)"| n77
  n77 -->|"yields"| n79
  n78 -->|"yields"| n81
  n51 -->|"requires (instrument)"| n70
  n70 -->|"yields"| n67
  n67 -->|"condition: run"| n71
  n33 -->|"requires (instrument)"| n71
  n71 -->|"yields"| n82
  n33 -->|"requires (instrument)"| n72
  n51 -->|"requires (instrument)"| n72
  n81 -->|"requires (instrument)"| n72
  n82 -->|"requires (instrument)"| n72
  n79 -->|"requires (instrument)"| n72
  n67 -->|"condition: run"| n72
  n72 -->|"yields"| n0
  n72 -->|"yields"| n26
  n33 -->|"requires (instrument)"| n73
  n0 -->|"requires (instrument)"| n73
  n73 -->|"yields"| n83
  n33 -->|"requires (instrument)"| n74
  n83 -->|"consumes"| n74
  n74 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n75
  n51 -->|"requires (instrument)"| n75
  n75 -->|"yields"| n84
  n75 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n76
  n6 -->|"requires (instrument)"| n76
  n76 <-->|"affects"| n0
  n51 -->|"requires (instrument)"| n50
  n0 -->|"requires (instrument)"| n50
  n50 -->|"yields"| n52
  n50 <-->|"affects"| n0
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
  n85("Feedback Version Saving")
  n42["Article Fingerprint"]
  n86["Feedback Version"]
  n87("Explicit Revision Requesting")
  n88["PR Article Fingerprint"]
  n89["Explicit Revision Request"]
  n90("Explicit Revision Admitting")
  n91["Owner Account"]
  n92["Admitted Revision"]
  n93("Invocation Claiming")
  n94["Invocation Claim"]
  n95("Continued Article Revising")
  n33["Claude API"]
  style n33 stroke-dasharray: 5 5
  n22["Action Registry"]
  n0["Article — states: draft, accepted, rejected"]
  n96["Revision Outcome"]
  n80["Article Action Files — states: pending, verified"]
  n97["Dated Action State Digest"]
  n27("Action Reconciling")
  n98["Imported Action Baseline"]
  n21("Action Projecting")
  n99("Editorial Output Binding")
  n100["Editorial Output Artifact"]
  n101("Editorial Rebinding")
  n102("Source Evidence Selecting")
  n29["Source Evidence"]
  n30["Recommendation Maintenance Memory"]
  n103["Selected Source Evidence"]
  n104["Evidence Coverage"]
  n31("Suggestion Proposing")
  n32("Suggestion Verifying")
  n4 -->|"requires (instrument)"| n85
  n42 -->|"requires (instrument)"| n85
  n85 -->|"yields"| n86
  n86 -->|"requires (instrument)"| n87
  n88 -->|"requires (instrument)"| n87
  n87 -->|"yields"| n89
  n89 -->|"object event"| n90
  n91 -->|"requires (instrument)"| n90
  n4 -->|"requires (instrument)"| n90
  n90 -->|"yields"| n92
  n92 -->|"object event"| n93
  n4 -->|"requires (instrument)"| n93
  n93 -->|"yields"| n94
  n94 -->|"object event"| n95
  n33 -->|"requires (instrument)"| n95
  n22 -->|"requires (instrument)"| n95
  n95 <-->|"affects"| n0
  n95 <-->|"affects"| n22
  n95 -->|"yields"| n96
  n97 -->|"part of"| n80
  n27 -->|"yields"| n97
  n27 -->|"changes: verified to pending"| n80
  n27 -->|"changes: pending to verified"| n80
  n27 -->|"yields"| n80
  n98 -->|"requires (instrument)"| n21
  n4 -->|"requires (instrument)"| n99
  n99 -->|"yields"| n100
  n100 -->|"requires (instrument)"| n90
  n0 -->|"requires (instrument)"| n101
  n101 <-->|"affects"| n80
  n27 -->|"invokes"| n102
  n0 -->|"requires (instrument)"| n102
  n22 -->|"requires (instrument)"| n102
  n29 -->|"requires (instrument)"| n102
  n30 -->|"requires (instrument)"| n102
  n102 -->|"yields"| n103
  n102 -->|"yields"| n104
  n103 -->|"requires (instrument)"| n31
  n103 -->|"requires (instrument)"| n32
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
Action Reconciling yields Dated Action State Digest. [src: src/review-actions.ts]
Action Reconciling changes Article Action Files from verified to pending. [src: src/review-actions.ts]
Action Reconciling changes Article Action Files from pending to verified. [src: src/review-actions.ts]
Action Reconciling yields Article Action Files. [src: src/review-actions.ts]
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
Source Evidence Selecting yields Selected Source Evidence. [src: src/action-evidence-selection.ts]
Source Evidence Selecting yields Evidence Coverage. [src: src/action-evidence-selection.ts]
Suggestion Proposing requires Selected Source Evidence. [src: src/review-actions.ts]
Suggestion Verifying requires Selected Source Evidence. [src: src/review-actions.ts]
```

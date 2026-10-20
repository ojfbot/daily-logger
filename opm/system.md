# System model — Mermaid compatibility views

> Generated from `system.opl` by the /opm subset renderer v1. Do not hand-edit.
> Source SHA-256: `d3cb438394911ba3a679bf27997b9b26c3eaa8009cbfbffb6b1f962f8b04835e`.
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
  n31["Claude API"]
  style n31 stroke-dasharray: 5 5
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
  n26("Action Reconciling")
  n27["Action Review Cycle — states: generation, revision"]
  n28["Source Evidence"]
  n29("Suggestion Proposing")
  n30("Suggestion Verifying")
  n102["Ranked Recommendations"]
  n103["Handled Suggestions"]
  n32("Editorial Revising")
  n33["Editorial Revision Request"]
  n34["Draft Suggestion — states: proposed, open, done, dismissed, superseded, deferred"]
  n95["Imported Action Baseline"]
  n78["Article Action Files — states: pending, verified"]
  n35("Inclusion Choosing")
  n36["Reviewed Disposition — states: deferred, completed-existing-evidence, pending-receipt"]
  n104["Canonical Actions"]
  n37["JSON API"]
  n38("Frontend Rendering")
  n39["Rendered Site"]
  n40["Article Fingerprint"]
  n41("Independent Review Projecting")
  n42["Review Projection"]
  n43("Revision Requesting")
  n44["Revision Request"]
  n45("Conversation Saving")
  n46["Saved Message"]
  n105["Review Records"]
  n106["Correspondence"]
  n47["Time Record Pointer"]
  n48("Time Recording")
  n49["Commit Context"]
  n50["Time Evidence"]
  n51("Time Backfilling")
  n52("Time Resolving")
  n53["Time References"]
  n54["Shipment Timestamp — states: available, unavailable"]
  n55["Shipment Coverage — states: complete, unavailable"]
  n56("Shipment Time Resolving")
  n57("Time Projecting")
  n58("Shipment Coverage Checking")
  n59["Projected Time References"]
  n60["Projected Shipment Timestamps"]
  n61("Time Visualizing")
  n62["Device Timezone"]
  n63["Time Popover"]
  n64("Time Metadata Preserving")
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
  n0 -->|"requires (instrument)"| n26
  n22 -->|"requires (instrument)"| n26
  n27 -->|"requires (instrument)"| n26
  n28 -->|"requires (instrument)"| n26
  n26 -->|"invokes"| n29
  n26 -->|"invokes"| n30
  n31 -->|"requires (instrument)"| n29
  n31 -->|"requires (instrument)"| n30
  n26 <-->|"affects"| n22
  n26 <-->|"affects"| n0
  n26 -->|"yields"| n23
  n102 -->|"part of"| n25
  n103 -->|"part of"| n25
  n7 -->|"yields"| n27
  n7 -->|"invokes"| n26
  n32 -->|"yields"| n27
  n32 -->|"invokes"| n26
  n33 -->|"requires (instrument)"| n32
  n19 -->|"yields"| n27
  n19 -->|"invokes"| n26
  n95 -->|"part of"| n22
  n78 -->|"part of"| n22
  n22 -->|"requires (instrument)"| n35
  n4 -->|"requires (instrument)"| n35
  n35 <-->|"affects"| n22
  n18 -->|"handles (human)"| n35
  n104 -->|"part of"| n13
  n36 -->|"part of"| n13
  n20 -->|"invokes"| n21
  n13 -->|"requires (instrument)"| n20
  n20 -->|"yields"| n37
  n37 -->|"requires (instrument)"| n38
  n13 -->|"requires (instrument)"| n38
  n38 -->|"yields"| n39
  n20 -->|"yields"| n40
  n38 -->|"invokes"| n41
  n4 -->|"requires (instrument)"| n41
  n40 -->|"requires (instrument)"| n41
  n41 -->|"yields"| n42
  n18 -->|"handles (human)"| n43
  n42 -->|"requires (instrument)"| n43
  n43 -->|"yields"| n44
  n43 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n45
  n40 -->|"requires (instrument)"| n45
  n42 -->|"requires (instrument)"| n45
  n45 -->|"yields"| n46
  n45 <-->|"affects"| n4
  n105 -->|"part of"| n42
  n106 -->|"part of"| n42
  n0 -->|"exhibits"| n47
  n0 -->|"requires (instrument)"| n48
  n49 -->|"requires (instrument)"| n48
  n48 -->|"yields"| n50
  n48 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n51
  n4 -->|"requires (instrument)"| n51
  n51 -->|"yields"| n50
  n51 -->|"invokes"| n52
  n50 -->|"requires (instrument)"| n52
  n0 -->|"requires (instrument)"| n52
  n52 -->|"yields"| n53
  n0 -->|"requires (instrument)"| n56
  n50 -->|"requires (instrument)"| n56
  n56 -->|"yields"| n54
  n48 -->|"invokes"| n56
  n20 -->|"invokes"| n57
  n20 -->|"invokes"| n58
  n0 -->|"requires (instrument)"| n58
  n50 -->|"requires (instrument)"| n58
  n58 -->|"yields"| n55
  n0 -->|"requires (instrument)"| n57
  n50 -->|"requires (instrument)"| n57
  n57 -->|"invokes"| n52
  n57 -->|"invokes"| n56
  n57 -->|"yields"| n59
  n57 -->|"yields"| n60
  n59 -->|"part of"| n37
  n60 -->|"part of"| n37
  n38 -->|"invokes"| n61
  n59 -->|"requires (instrument)"| n61
  n60 -->|"requires (instrument)"| n61
  n62 -->|"requires (instrument)"| n61
  n61 -->|"yields"| n63
  n18 -->|"handles (human)"| n32
  n32 -->|"invokes"| n64
  n0 -->|"requires (instrument)"| n64
  n64 <-->|"affects"| n0
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
Action Reconciling requires Article. [src: src/review-actions.ts]
Action Reconciling requires Action Registry. [src: src/review-actions.ts]
Action Review Cycle can be generation or revision. [src: src/action-review-cycle.ts]
Action Reconciling requires Action Review Cycle. [src: src/review-actions.ts]
Action Reconciling requires Source Evidence. [src: src/review-actions.ts]
Action Reconciling invokes Suggestion Proposing. [src: src/review-actions.ts]
Action Reconciling invokes Suggestion Verifying. [src: src/review-actions.ts]
Suggestion Proposing requires Claude API. [src: src/review-actions.ts]
Suggestion Verifying requires Claude API. [src: src/review-actions.ts]
Action Reconciling affects Action Registry. [src: src/review-actions.ts]
Action Reconciling affects Article. [src: src/action-registry.ts]
Action Reconciling yields Closing Prompt. [src: src/review-actions.ts]
Closing Prompt can be legacy-options, ranked-shortlist, or needs-evidence. [src: src/action-registry-schema.ts]
Suggested Actions Card consists of Ranked Recommendations and Handled Suggestions. [src: src/action-registry.ts]
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
  n65["Activity Decision — states: skip, run"]
  n66["Run Timing — states: available, unavailable"]
  n6["Run Evidence"]
  n7("Article Generating")
  n67("Context Collecting")
  n68("Activity Assessing")
  n69("Credit Checking")
  n70("Drafting")
  n71("Council Reviewing")
  n72("Synthesizing")
  n73("Claim Verifying")
  n74("Provenance Attaching")
  n48("Time Recording")
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n13["Canonical Action Projection"]
  n75("Closing Continuity Projecting")
  n76("Telemetry Collecting")
  n49["Commit Context"]
  n77["Closing Continuity Projection — states: available, unavailable"]
  n0["Article — states: draft, accepted, rejected"]
  n78["Article Action Files — states: pending, verified"]
  n79["Telemetry Digest"]
  n31["Claude API"]
  style n31 stroke-dasharray: 5 5
  n80["Credit Status"]
  n81["Council Critiques"]
  n82["Claim Report"]
  n50["Time Evidence"]
  n66 -->|"part of"| n6
  n4 -->|"requires (instrument)"| n67
  n13 -->|"requires (instrument)"| n67
  n67 -->|"invokes"| n75
  n67 -->|"invokes"| n76
  n67 -->|"yields"| n49
  n0 -->|"requires (instrument)"| n75
  n78 -->|"requires (instrument)"| n75
  n75 -->|"yields"| n77
  n76 -->|"yields"| n79
  n49 -->|"requires (instrument)"| n68
  n68 -->|"yields"| n65
  n65 -->|"condition: run"| n69
  n31 -->|"requires (instrument)"| n69
  n69 -->|"yields"| n80
  n31 -->|"requires (instrument)"| n70
  n49 -->|"requires (instrument)"| n70
  n79 -->|"requires (instrument)"| n70
  n80 -->|"requires (instrument)"| n70
  n77 -->|"requires (instrument)"| n70
  n65 -->|"condition: run"| n70
  n70 -->|"yields"| n0
  n31 -->|"requires (instrument)"| n71
  n0 -->|"requires (instrument)"| n71
  n71 -->|"yields"| n81
  n31 -->|"requires (instrument)"| n72
  n81 -->|"consumes"| n72
  n72 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n73
  n49 -->|"requires (instrument)"| n73
  n73 -->|"yields"| n82
  n73 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n74
  n6 -->|"requires (instrument)"| n74
  n74 <-->|"affects"| n0
  n49 -->|"requires (instrument)"| n48
  n0 -->|"requires (instrument)"| n48
  n48 -->|"yields"| n50
  n48 <-->|"affects"| n0
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
  n83("Feedback Version Saving")
  n40["Article Fingerprint"]
  n84["Feedback Version"]
  n85("Explicit Revision Requesting")
  n86["PR Article Fingerprint"]
  n87["Explicit Revision Request"]
  n88("Explicit Revision Admitting")
  n89["Owner Account"]
  n90["Admitted Revision"]
  n91("Invocation Claiming")
  n92["Invocation Claim"]
  n93("Continued Article Revising")
  n31["Claude API"]
  style n31 stroke-dasharray: 5 5
  n22["Action Registry"]
  n0["Article — states: draft, accepted, rejected"]
  n94["Revision Outcome"]
  n78["Article Action Files — states: pending, verified"]
  n26("Action Reconciling")
  n95["Imported Action Baseline"]
  n21("Action Projecting")
  n96("Editorial Output Binding")
  n97["Editorial Output Artifact"]
  n98("Editorial Rebinding")
  n99("Source Evidence Selecting")
  n28["Source Evidence"]
  n100["Selected Source Evidence"]
  n101["Evidence Coverage"]
  n29("Suggestion Proposing")
  n30("Suggestion Verifying")
  n4 -->|"requires (instrument)"| n83
  n40 -->|"requires (instrument)"| n83
  n83 -->|"yields"| n84
  n84 -->|"requires (instrument)"| n85
  n86 -->|"requires (instrument)"| n85
  n85 -->|"yields"| n87
  n87 -->|"object event"| n88
  n89 -->|"requires (instrument)"| n88
  n4 -->|"requires (instrument)"| n88
  n88 -->|"yields"| n90
  n90 -->|"object event"| n91
  n4 -->|"requires (instrument)"| n91
  n91 -->|"yields"| n92
  n92 -->|"object event"| n93
  n31 -->|"requires (instrument)"| n93
  n22 -->|"requires (instrument)"| n93
  n93 <-->|"affects"| n0
  n93 <-->|"affects"| n22
  n93 -->|"yields"| n94
  n26 -->|"yields"| n78
  n95 -->|"requires (instrument)"| n21
  n4 -->|"requires (instrument)"| n96
  n96 -->|"yields"| n97
  n97 -->|"requires (instrument)"| n88
  n0 -->|"requires (instrument)"| n98
  n98 <-->|"affects"| n78
  n26 -->|"invokes"| n99
  n0 -->|"requires (instrument)"| n99
  n22 -->|"requires (instrument)"| n99
  n28 -->|"requires (instrument)"| n99
  n99 -->|"yields"| n100
  n99 -->|"yields"| n101
  n100 -->|"requires (instrument)"| n29
  n100 -->|"requires (instrument)"| n30
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
Source Evidence Selecting yields Selected Source Evidence. [src: src/action-evidence-selection.ts]
Source Evidence Selecting yields Evidence Coverage. [src: src/action-evidence-selection.ts]
Suggestion Proposing requires Selected Source Evidence. [src: src/review-actions.ts]
Suggestion Verifying requires Selected Source Evidence. [src: src/review-actions.ts]
```

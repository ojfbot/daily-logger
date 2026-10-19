# System model — Mermaid compatibility views

> Generated from `system.opl` by the /opm subset renderer v1. Do not hand-edit.
> Source SHA-256: `276e774bb4e29f0e1e5efc892182cbc712d94eb78a46afc71d3a7b974ecfecbc`.
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
  n28["Claude API"]
  style n28 stroke-dasharray: 5 5
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
  n23("Action Reconciling")
  n24["Action Review Cycle — states: generation, revision"]
  n25["Source Evidence"]
  n26("Suggestion Proposing")
  n27("Suggestion Verifying")
  n29["Closing Prompt — states: options, needs-evidence"]
  n30("Editorial Revising")
  n31["Editorial Revision Request"]
  n32["Draft Suggestion — states: proposed, open, done, dismissed, superseded, deferred"]
  n93["Imported Action Baseline"]
  n76["Article Action Files — states: pending, verified"]
  n33("Inclusion Choosing")
  n34["Reviewed Disposition — states: deferred, completed-existing-evidence, pending-receipt"]
  n100["Canonical Actions"]
  n35["JSON API"]
  n36("Frontend Rendering")
  n37["Rendered Site"]
  n38["Article Fingerprint"]
  n39("Independent Review Projecting")
  n40["Review Projection"]
  n41("Revision Requesting")
  n42["Revision Request"]
  n43("Conversation Saving")
  n44["Saved Message"]
  n101["Review Records"]
  n102["Correspondence"]
  n45["Time Record Pointer"]
  n46("Time Recording")
  n47["Commit Context"]
  n48["Time Evidence"]
  n49("Time Backfilling")
  n50("Time Resolving")
  n51["Time References"]
  n52["Shipment Timestamp — states: available, unavailable"]
  n53["Shipment Coverage — states: complete, unavailable"]
  n54("Shipment Time Resolving")
  n55("Time Projecting")
  n56("Shipment Coverage Checking")
  n57["Projected Time References"]
  n58["Projected Shipment Timestamps"]
  n59("Time Visualizing")
  n60["Device Timezone"]
  n61["Time Popover"]
  n62("Time Metadata Preserving")
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
  n0 -->|"requires (instrument)"| n23
  n22 -->|"requires (instrument)"| n23
  n24 -->|"requires (instrument)"| n23
  n25 -->|"requires (instrument)"| n23
  n23 -->|"invokes"| n26
  n23 -->|"invokes"| n27
  n28 -->|"requires (instrument)"| n26
  n28 -->|"requires (instrument)"| n27
  n23 <-->|"affects"| n22
  n23 <-->|"affects"| n0
  n23 -->|"yields"| n29
  n7 -->|"yields"| n24
  n7 -->|"invokes"| n23
  n30 -->|"yields"| n24
  n30 -->|"invokes"| n23
  n31 -->|"requires (instrument)"| n30
  n19 -->|"yields"| n24
  n19 -->|"invokes"| n23
  n93 -->|"part of"| n22
  n76 -->|"part of"| n22
  n22 -->|"requires (instrument)"| n33
  n4 -->|"requires (instrument)"| n33
  n33 <-->|"affects"| n22
  n18 -->|"handles (human)"| n33
  n100 -->|"part of"| n13
  n34 -->|"part of"| n13
  n20 -->|"invokes"| n21
  n13 -->|"requires (instrument)"| n20
  n20 -->|"yields"| n35
  n35 -->|"requires (instrument)"| n36
  n13 -->|"requires (instrument)"| n36
  n36 -->|"yields"| n37
  n20 -->|"yields"| n38
  n36 -->|"invokes"| n39
  n4 -->|"requires (instrument)"| n39
  n38 -->|"requires (instrument)"| n39
  n39 -->|"yields"| n40
  n18 -->|"handles (human)"| n41
  n40 -->|"requires (instrument)"| n41
  n41 -->|"yields"| n42
  n41 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n43
  n38 -->|"requires (instrument)"| n43
  n40 -->|"requires (instrument)"| n43
  n43 -->|"yields"| n44
  n43 <-->|"affects"| n4
  n101 -->|"part of"| n40
  n102 -->|"part of"| n40
  n0 -->|"exhibits"| n45
  n0 -->|"requires (instrument)"| n46
  n47 -->|"requires (instrument)"| n46
  n46 -->|"yields"| n48
  n46 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n49
  n4 -->|"requires (instrument)"| n49
  n49 -->|"yields"| n48
  n49 -->|"invokes"| n50
  n48 -->|"requires (instrument)"| n50
  n0 -->|"requires (instrument)"| n50
  n50 -->|"yields"| n51
  n0 -->|"requires (instrument)"| n54
  n48 -->|"requires (instrument)"| n54
  n54 -->|"yields"| n52
  n46 -->|"invokes"| n54
  n20 -->|"invokes"| n55
  n20 -->|"invokes"| n56
  n0 -->|"requires (instrument)"| n56
  n48 -->|"requires (instrument)"| n56
  n56 -->|"yields"| n53
  n0 -->|"requires (instrument)"| n55
  n48 -->|"requires (instrument)"| n55
  n55 -->|"invokes"| n50
  n55 -->|"invokes"| n54
  n55 -->|"yields"| n57
  n55 -->|"yields"| n58
  n57 -->|"part of"| n35
  n58 -->|"part of"| n35
  n36 -->|"invokes"| n59
  n57 -->|"requires (instrument)"| n59
  n58 -->|"requires (instrument)"| n59
  n60 -->|"requires (instrument)"| n59
  n59 -->|"yields"| n61
  n18 -->|"handles (human)"| n30
  n30 -->|"invokes"| n62
  n0 -->|"requires (instrument)"| n62
  n62 <-->|"affects"| n0
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
Closing Prompt can be options or needs-evidence. [src: src/action-registry-schema.ts]
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
  n63["Activity Decision — states: skip, run"]
  n64["Run Timing — states: available, unavailable"]
  n6["Run Evidence"]
  n7("Article Generating")
  n65("Context Collecting")
  n66("Activity Assessing")
  n67("Credit Checking")
  n68("Drafting")
  n69("Council Reviewing")
  n70("Synthesizing")
  n71("Claim Verifying")
  n72("Provenance Attaching")
  n46("Time Recording")
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n13["Canonical Action Projection"]
  n73("Closing Continuity Projecting")
  n74("Telemetry Collecting")
  n47["Commit Context"]
  n75["Closing Continuity Projection — states: available, unavailable"]
  n0["Article — states: draft, accepted, rejected"]
  n76["Article Action Files — states: pending, verified"]
  n77["Telemetry Digest"]
  n28["Claude API"]
  style n28 stroke-dasharray: 5 5
  n78["Credit Status"]
  n79["Council Critiques"]
  n80["Claim Report"]
  n48["Time Evidence"]
  n64 -->|"part of"| n6
  n4 -->|"requires (instrument)"| n65
  n13 -->|"requires (instrument)"| n65
  n65 -->|"invokes"| n73
  n65 -->|"invokes"| n74
  n65 -->|"yields"| n47
  n0 -->|"requires (instrument)"| n73
  n76 -->|"requires (instrument)"| n73
  n73 -->|"yields"| n75
  n74 -->|"yields"| n77
  n47 -->|"requires (instrument)"| n66
  n66 -->|"yields"| n63
  n63 -->|"condition: run"| n67
  n28 -->|"requires (instrument)"| n67
  n67 -->|"yields"| n78
  n28 -->|"requires (instrument)"| n68
  n47 -->|"requires (instrument)"| n68
  n77 -->|"requires (instrument)"| n68
  n78 -->|"requires (instrument)"| n68
  n75 -->|"requires (instrument)"| n68
  n63 -->|"condition: run"| n68
  n68 -->|"yields"| n0
  n28 -->|"requires (instrument)"| n69
  n0 -->|"requires (instrument)"| n69
  n69 -->|"yields"| n79
  n28 -->|"requires (instrument)"| n70
  n79 -->|"consumes"| n70
  n70 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n71
  n47 -->|"requires (instrument)"| n71
  n71 -->|"yields"| n80
  n71 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n72
  n6 -->|"requires (instrument)"| n72
  n72 <-->|"affects"| n0
  n47 -->|"requires (instrument)"| n46
  n0 -->|"requires (instrument)"| n46
  n46 -->|"yields"| n48
  n46 <-->|"affects"| n0
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
  n81("Feedback Version Saving")
  n38["Article Fingerprint"]
  n82["Feedback Version"]
  n83("Explicit Revision Requesting")
  n84["PR Article Fingerprint"]
  n85["Explicit Revision Request"]
  n86("Explicit Revision Admitting")
  n87["Owner Account"]
  n88["Admitted Revision"]
  n89("Invocation Claiming")
  n90["Invocation Claim"]
  n91("Continued Article Revising")
  n28["Claude API"]
  style n28 stroke-dasharray: 5 5
  n22["Action Registry"]
  n0["Article — states: draft, accepted, rejected"]
  n92["Revision Outcome"]
  n76["Article Action Files — states: pending, verified"]
  n23("Action Reconciling")
  n93["Imported Action Baseline"]
  n21("Action Projecting")
  n94("Editorial Output Binding")
  n95["Editorial Output Artifact"]
  n96("Editorial Rebinding")
  n97("Source Evidence Selecting")
  n25["Source Evidence"]
  n98["Selected Source Evidence"]
  n99["Evidence Coverage"]
  n26("Suggestion Proposing")
  n27("Suggestion Verifying")
  n4 -->|"requires (instrument)"| n81
  n38 -->|"requires (instrument)"| n81
  n81 -->|"yields"| n82
  n82 -->|"requires (instrument)"| n83
  n84 -->|"requires (instrument)"| n83
  n83 -->|"yields"| n85
  n85 -->|"object event"| n86
  n87 -->|"requires (instrument)"| n86
  n4 -->|"requires (instrument)"| n86
  n86 -->|"yields"| n88
  n88 -->|"object event"| n89
  n4 -->|"requires (instrument)"| n89
  n89 -->|"yields"| n90
  n90 -->|"object event"| n91
  n28 -->|"requires (instrument)"| n91
  n22 -->|"requires (instrument)"| n91
  n91 <-->|"affects"| n0
  n91 <-->|"affects"| n22
  n91 -->|"yields"| n92
  n23 -->|"yields"| n76
  n93 -->|"requires (instrument)"| n21
  n4 -->|"requires (instrument)"| n94
  n94 -->|"yields"| n95
  n95 -->|"requires (instrument)"| n86
  n0 -->|"requires (instrument)"| n96
  n96 <-->|"affects"| n76
  n23 -->|"invokes"| n97
  n0 -->|"requires (instrument)"| n97
  n22 -->|"requires (instrument)"| n97
  n25 -->|"requires (instrument)"| n97
  n97 -->|"yields"| n98
  n97 -->|"yields"| n99
  n98 -->|"requires (instrument)"| n26
  n98 -->|"requires (instrument)"| n27
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

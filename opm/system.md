# System model — Mermaid compatibility views

> Generated from `system.opl` by the /opm subset renderer v1. Do not hand-edit.
> Source SHA-256: `49e25580c7e9c5a201842cbb516d70b307c8be6c5354dcb27e93c1893ca1c6a3`.
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
  n29("Editorial Revising")
  n30["Draft Suggestion — states: proposed, open, done, dismissed, superseded, deferred"]
  n84["Imported Action Baseline"]
  n83["Article Action Files — states: pending, verified"]
  n31("Inclusion Choosing")
  n32["Reviewed Disposition — states: deferred, completed-existing-evidence, pending-receipt"]
  n88["Canonical Actions"]
  n33["JSON API"]
  n34("Frontend Rendering")
  n35["Rendered Site"]
  n36["Article Fingerprint"]
  n37("Independent Review Projecting")
  n38["Review Projection"]
  n39("Revision Requesting")
  n40["Revision Request"]
  n41("Conversation Saving")
  n42["Saved Message"]
  n89["Review Records"]
  n90["Correspondence"]
  n43["Time Record Pointer"]
  n44("Time Recording")
  n45["Commit Context"]
  n46["Time Evidence"]
  n47("Time Backfilling")
  n48("Time Resolving")
  n49["Time References"]
  n50("Time Projecting")
  n51["Projected Time References"]
  n52("Time Visualizing")
  n53["Device Timezone"]
  n54["Time Popover"]
  n55("Time Metadata Preserving")
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
  n7 -->|"yields"| n24
  n7 -->|"invokes"| n23
  n29 -->|"yields"| n24
  n29 -->|"invokes"| n23
  n19 -->|"yields"| n24
  n19 -->|"invokes"| n23
  n84 -->|"part of"| n22
  n83 -->|"part of"| n22
  n22 -->|"requires (instrument)"| n31
  n4 -->|"requires (instrument)"| n31
  n31 <-->|"affects"| n22
  n18 -->|"handles (human)"| n31
  n88 -->|"part of"| n13
  n32 -->|"part of"| n13
  n20 -->|"invokes"| n21
  n13 -->|"requires (instrument)"| n20
  n20 -->|"yields"| n33
  n33 -->|"requires (instrument)"| n34
  n13 -->|"requires (instrument)"| n34
  n34 -->|"yields"| n35
  n20 -->|"yields"| n36
  n34 -->|"invokes"| n37
  n4 -->|"requires (instrument)"| n37
  n36 -->|"requires (instrument)"| n37
  n37 -->|"yields"| n38
  n18 -->|"handles (human)"| n39
  n38 -->|"requires (instrument)"| n39
  n39 -->|"yields"| n40
  n39 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n41
  n36 -->|"requires (instrument)"| n41
  n38 -->|"requires (instrument)"| n41
  n41 -->|"yields"| n42
  n41 <-->|"affects"| n4
  n89 -->|"part of"| n38
  n90 -->|"part of"| n38
  n0 -->|"exhibits"| n43
  n0 -->|"requires (instrument)"| n44
  n45 -->|"requires (instrument)"| n44
  n44 -->|"yields"| n46
  n44 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n47
  n4 -->|"requires (instrument)"| n47
  n47 -->|"yields"| n46
  n47 -->|"invokes"| n48
  n46 -->|"requires (instrument)"| n48
  n0 -->|"requires (instrument)"| n48
  n48 -->|"yields"| n49
  n20 -->|"invokes"| n50
  n0 -->|"requires (instrument)"| n50
  n46 -->|"requires (instrument)"| n50
  n50 -->|"invokes"| n48
  n50 -->|"yields"| n51
  n51 -->|"part of"| n33
  n34 -->|"invokes"| n52
  n51 -->|"requires (instrument)"| n52
  n53 -->|"requires (instrument)"| n52
  n52 -->|"yields"| n54
  n18 -->|"handles (human)"| n29
  n29 -->|"invokes"| n55
  n0 -->|"requires (instrument)"| n55
  n55 <-->|"affects"| n0
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
Article Generating yields Action Review Cycle. [src: src/index.ts]
Article Generating invokes Action Reconciling. [src: src/index.ts]
Editorial Revising yields Action Review Cycle. [src: src/revise-article.ts]
Editorial Revising invokes Action Reconciling. [src: src/revise-article.ts]
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
API Building invokes Time Projecting. [src: src/build-api.ts]
Time Projecting requires Article. [src: src/article-time-metadata.ts]
Time Projecting requires Time Evidence. [src: src/article-time-metadata.ts]
Time Projecting invokes Time Resolving. [src: src/article-time-metadata.ts]
Time Projecting yields Projected Time References. [src: src/article-time-metadata.ts]
JSON API consists of Projected Time References. [src: src/build-api.ts]
Frontend Rendering invokes Time Visualizing. [src: packages/frontend/src/hooks/useArticlePopovers.ts]
Time Visualizing requires Projected Time References. [src: packages/frontend/src/utils/timeReferences.ts]
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
  n56["Activity Decision — states: skip, run"]
  n57["Run Timing — states: available, unavailable"]
  n6["Run Evidence"]
  n7("Article Generating")
  n58("Context Collecting")
  n59("Activity Assessing")
  n60("Credit Checking")
  n61("Drafting")
  n62("Council Reviewing")
  n63("Synthesizing")
  n64("Claim Verifying")
  n65("Provenance Attaching")
  n44("Time Recording")
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n13["Canonical Action Projection"]
  n66("Telemetry Collecting")
  n45["Commit Context"]
  n67["Telemetry Digest"]
  n28["Claude API"]
  style n28 stroke-dasharray: 5 5
  n68["Credit Status"]
  n0["Article — states: draft, accepted, rejected"]
  n69["Council Critiques"]
  n70["Claim Report"]
  n46["Time Evidence"]
  n57 -->|"part of"| n6
  n4 -->|"requires (instrument)"| n58
  n13 -->|"requires (instrument)"| n58
  n58 -->|"invokes"| n66
  n58 -->|"yields"| n45
  n66 -->|"yields"| n67
  n45 -->|"requires (instrument)"| n59
  n59 -->|"yields"| n56
  n56 -->|"condition: run"| n60
  n28 -->|"requires (instrument)"| n60
  n60 -->|"yields"| n68
  n28 -->|"requires (instrument)"| n61
  n45 -->|"requires (instrument)"| n61
  n67 -->|"requires (instrument)"| n61
  n68 -->|"requires (instrument)"| n61
  n56 -->|"condition: run"| n61
  n61 -->|"yields"| n0
  n28 -->|"requires (instrument)"| n62
  n0 -->|"requires (instrument)"| n62
  n62 -->|"yields"| n69
  n28 -->|"requires (instrument)"| n63
  n69 -->|"consumes"| n63
  n63 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n64
  n45 -->|"requires (instrument)"| n64
  n64 -->|"yields"| n70
  n64 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n65
  n6 -->|"requires (instrument)"| n65
  n65 <-->|"affects"| n0
  n45 -->|"requires (instrument)"| n44
  n0 -->|"requires (instrument)"| n44
  n44 -->|"yields"| n46
  n44 <-->|"affects"| n0
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
Context Collecting invokes Telemetry Collecting. [src: src/collect-context.ts]
Context Collecting yields Commit Context.
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
  n71("Feedback Version Saving")
  n36["Article Fingerprint"]
  n72["Feedback Version"]
  n73("Explicit Revision Requesting")
  n74["PR Article Fingerprint"]
  n75["Explicit Revision Request"]
  n76("Explicit Revision Admitting")
  n77["Owner Account"]
  n78["Admitted Revision"]
  n79("Invocation Claiming")
  n80["Invocation Claim"]
  n81("Continued Article Revising")
  n28["Claude API"]
  style n28 stroke-dasharray: 5 5
  n22["Action Registry"]
  n0["Article — states: draft, accepted, rejected"]
  n82["Revision Outcome"]
  n83["Article Action Files — states: pending, verified"]
  n23("Action Reconciling")
  n84["Imported Action Baseline"]
  n21("Action Projecting")
  n85("Editorial Output Binding")
  n86["Editorial Output Artifact"]
  n87("Editorial Rebinding")
  n4 -->|"requires (instrument)"| n71
  n36 -->|"requires (instrument)"| n71
  n71 -->|"yields"| n72
  n72 -->|"requires (instrument)"| n73
  n74 -->|"requires (instrument)"| n73
  n73 -->|"yields"| n75
  n75 -->|"object event"| n76
  n77 -->|"requires (instrument)"| n76
  n4 -->|"requires (instrument)"| n76
  n76 -->|"yields"| n78
  n78 -->|"object event"| n79
  n4 -->|"requires (instrument)"| n79
  n79 -->|"yields"| n80
  n80 -->|"object event"| n81
  n28 -->|"requires (instrument)"| n81
  n22 -->|"requires (instrument)"| n81
  n81 <-->|"affects"| n0
  n81 <-->|"affects"| n22
  n81 -->|"yields"| n82
  n23 -->|"yields"| n83
  n84 -->|"requires (instrument)"| n21
  n4 -->|"requires (instrument)"| n85
  n85 -->|"yields"| n86
  n86 -->|"requires (instrument)"| n76
  n0 -->|"requires (instrument)"| n87
  n87 <-->|"affects"| n83
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
```

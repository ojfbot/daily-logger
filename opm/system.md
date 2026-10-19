# System model — Mermaid compatibility views

> Generated from `system.opl` by the /opm subset renderer v1. Do not hand-edit.
> Source SHA-256: `03c85e32d8e5383361e78807fe7be4e9b4757c073d1f374d62bf3477ef69ca41`.
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
  n30["Editorial Revision Request"]
  n31["Draft Suggestion — states: proposed, open, done, dismissed, superseded, deferred"]
  n85["Imported Action Baseline"]
  n84["Article Action Files — states: pending, verified"]
  n32("Inclusion Choosing")
  n33["Reviewed Disposition — states: deferred, completed-existing-evidence, pending-receipt"]
  n92["Canonical Actions"]
  n34["JSON API"]
  n35("Frontend Rendering")
  n36["Rendered Site"]
  n37["Article Fingerprint"]
  n38("Independent Review Projecting")
  n39["Review Projection"]
  n40("Revision Requesting")
  n41["Revision Request"]
  n42("Conversation Saving")
  n43["Saved Message"]
  n93["Review Records"]
  n94["Correspondence"]
  n44["Time Record Pointer"]
  n45("Time Recording")
  n46["Commit Context"]
  n47["Time Evidence"]
  n48("Time Backfilling")
  n49("Time Resolving")
  n50["Time References"]
  n51("Time Projecting")
  n52["Projected Time References"]
  n53("Time Visualizing")
  n54["Device Timezone"]
  n55["Time Popover"]
  n56("Time Metadata Preserving")
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
  n30 -->|"requires (instrument)"| n29
  n19 -->|"yields"| n24
  n19 -->|"invokes"| n23
  n85 -->|"part of"| n22
  n84 -->|"part of"| n22
  n22 -->|"requires (instrument)"| n32
  n4 -->|"requires (instrument)"| n32
  n32 <-->|"affects"| n22
  n18 -->|"handles (human)"| n32
  n92 -->|"part of"| n13
  n33 -->|"part of"| n13
  n20 -->|"invokes"| n21
  n13 -->|"requires (instrument)"| n20
  n20 -->|"yields"| n34
  n34 -->|"requires (instrument)"| n35
  n13 -->|"requires (instrument)"| n35
  n35 -->|"yields"| n36
  n20 -->|"yields"| n37
  n35 -->|"invokes"| n38
  n4 -->|"requires (instrument)"| n38
  n37 -->|"requires (instrument)"| n38
  n38 -->|"yields"| n39
  n18 -->|"handles (human)"| n40
  n39 -->|"requires (instrument)"| n40
  n40 -->|"yields"| n41
  n40 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n42
  n37 -->|"requires (instrument)"| n42
  n39 -->|"requires (instrument)"| n42
  n42 -->|"yields"| n43
  n42 <-->|"affects"| n4
  n93 -->|"part of"| n39
  n94 -->|"part of"| n39
  n0 -->|"exhibits"| n44
  n0 -->|"requires (instrument)"| n45
  n46 -->|"requires (instrument)"| n45
  n45 -->|"yields"| n47
  n45 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n48
  n4 -->|"requires (instrument)"| n48
  n48 -->|"yields"| n47
  n48 -->|"invokes"| n49
  n47 -->|"requires (instrument)"| n49
  n0 -->|"requires (instrument)"| n49
  n49 -->|"yields"| n50
  n20 -->|"invokes"| n51
  n0 -->|"requires (instrument)"| n51
  n47 -->|"requires (instrument)"| n51
  n51 -->|"invokes"| n49
  n51 -->|"yields"| n52
  n52 -->|"part of"| n34
  n35 -->|"invokes"| n53
  n52 -->|"requires (instrument)"| n53
  n54 -->|"requires (instrument)"| n53
  n53 -->|"yields"| n55
  n18 -->|"handles (human)"| n29
  n29 -->|"invokes"| n56
  n0 -->|"requires (instrument)"| n56
  n56 <-->|"affects"| n0
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
  n57["Activity Decision — states: skip, run"]
  n58["Run Timing — states: available, unavailable"]
  n6["Run Evidence"]
  n7("Article Generating")
  n59("Context Collecting")
  n60("Activity Assessing")
  n61("Credit Checking")
  n62("Drafting")
  n63("Council Reviewing")
  n64("Synthesizing")
  n65("Claim Verifying")
  n66("Provenance Attaching")
  n45("Time Recording")
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n13["Canonical Action Projection"]
  n67("Telemetry Collecting")
  n46["Commit Context"]
  n68["Telemetry Digest"]
  n28["Claude API"]
  style n28 stroke-dasharray: 5 5
  n69["Credit Status"]
  n0["Article — states: draft, accepted, rejected"]
  n70["Council Critiques"]
  n71["Claim Report"]
  n47["Time Evidence"]
  n58 -->|"part of"| n6
  n4 -->|"requires (instrument)"| n59
  n13 -->|"requires (instrument)"| n59
  n59 -->|"invokes"| n67
  n59 -->|"yields"| n46
  n67 -->|"yields"| n68
  n46 -->|"requires (instrument)"| n60
  n60 -->|"yields"| n57
  n57 -->|"condition: run"| n61
  n28 -->|"requires (instrument)"| n61
  n61 -->|"yields"| n69
  n28 -->|"requires (instrument)"| n62
  n46 -->|"requires (instrument)"| n62
  n68 -->|"requires (instrument)"| n62
  n69 -->|"requires (instrument)"| n62
  n57 -->|"condition: run"| n62
  n62 -->|"yields"| n0
  n28 -->|"requires (instrument)"| n63
  n0 -->|"requires (instrument)"| n63
  n63 -->|"yields"| n70
  n28 -->|"requires (instrument)"| n64
  n70 -->|"consumes"| n64
  n64 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n65
  n46 -->|"requires (instrument)"| n65
  n65 -->|"yields"| n71
  n65 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n66
  n6 -->|"requires (instrument)"| n66
  n66 <-->|"affects"| n0
  n46 -->|"requires (instrument)"| n45
  n0 -->|"requires (instrument)"| n45
  n45 -->|"yields"| n47
  n45 <-->|"affects"| n0
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
  n72("Feedback Version Saving")
  n37["Article Fingerprint"]
  n73["Feedback Version"]
  n74("Explicit Revision Requesting")
  n75["PR Article Fingerprint"]
  n76["Explicit Revision Request"]
  n77("Explicit Revision Admitting")
  n78["Owner Account"]
  n79["Admitted Revision"]
  n80("Invocation Claiming")
  n81["Invocation Claim"]
  n82("Continued Article Revising")
  n28["Claude API"]
  style n28 stroke-dasharray: 5 5
  n22["Action Registry"]
  n0["Article — states: draft, accepted, rejected"]
  n83["Revision Outcome"]
  n84["Article Action Files — states: pending, verified"]
  n23("Action Reconciling")
  n85["Imported Action Baseline"]
  n21("Action Projecting")
  n86("Editorial Output Binding")
  n87["Editorial Output Artifact"]
  n88("Editorial Rebinding")
  n89("Source Evidence Selecting")
  n25["Source Evidence"]
  n90["Selected Source Evidence"]
  n91["Evidence Coverage"]
  n26("Suggestion Proposing")
  n27("Suggestion Verifying")
  n4 -->|"requires (instrument)"| n72
  n37 -->|"requires (instrument)"| n72
  n72 -->|"yields"| n73
  n73 -->|"requires (instrument)"| n74
  n75 -->|"requires (instrument)"| n74
  n74 -->|"yields"| n76
  n76 -->|"object event"| n77
  n78 -->|"requires (instrument)"| n77
  n4 -->|"requires (instrument)"| n77
  n77 -->|"yields"| n79
  n79 -->|"object event"| n80
  n4 -->|"requires (instrument)"| n80
  n80 -->|"yields"| n81
  n81 -->|"object event"| n82
  n28 -->|"requires (instrument)"| n82
  n22 -->|"requires (instrument)"| n82
  n82 <-->|"affects"| n0
  n82 <-->|"affects"| n22
  n82 -->|"yields"| n83
  n23 -->|"yields"| n84
  n85 -->|"requires (instrument)"| n21
  n4 -->|"requires (instrument)"| n86
  n86 -->|"yields"| n87
  n87 -->|"requires (instrument)"| n77
  n0 -->|"requires (instrument)"| n88
  n88 <-->|"affects"| n84
  n23 -->|"invokes"| n89
  n0 -->|"requires (instrument)"| n89
  n22 -->|"requires (instrument)"| n89
  n25 -->|"requires (instrument)"| n89
  n89 -->|"yields"| n90
  n89 -->|"yields"| n91
  n90 -->|"requires (instrument)"| n26
  n90 -->|"requires (instrument)"| n27
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

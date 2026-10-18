# System model — Mermaid compatibility views

> Generated from `system.opl` by the /opm subset renderer v1. Do not hand-edit.
> Source SHA-256: `2e67c1b452ccc6348438ef976db0c618144c8fef404ab0eea8e919db85216177`.
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
  n27["Claude API"]
  style n27 stroke-dasharray: 5 5
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
  n24["Source Evidence"]
  n25("Suggestion Proposing")
  n26("Suggestion Verifying")
  n28("Editorial Revising")
  n29["Draft Suggestion — states: proposed, open, done, dismissed, superseded, deferred"]
  n83["Imported Action Baseline"]
  n82["Article Action Files — states: pending, verified"]
  n30("Inclusion Choosing")
  n31["Reviewed Disposition — states: deferred, completed-existing-evidence, pending-receipt"]
  n87["Canonical Actions"]
  n32["JSON API"]
  n33("Frontend Rendering")
  n34["Rendered Site"]
  n35["Article Fingerprint"]
  n36("Independent Review Projecting")
  n37["Review Projection"]
  n38("Revision Requesting")
  n39["Revision Request"]
  n40("Conversation Saving")
  n41["Saved Message"]
  n88["Review Records"]
  n89["Correspondence"]
  n42["Time Record Pointer"]
  n43("Time Recording")
  n44["Commit Context"]
  n45["Time Evidence"]
  n46("Time Backfilling")
  n47("Time Resolving")
  n48["Time References"]
  n49("Time Projecting")
  n50["Projected Time References"]
  n51("Time Visualizing")
  n52["Device Timezone"]
  n53["Time Popover"]
  n54("Time Metadata Preserving")
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
  n23 -->|"invokes"| n25
  n23 -->|"invokes"| n26
  n27 -->|"requires (instrument)"| n25
  n27 -->|"requires (instrument)"| n26
  n23 <-->|"affects"| n22
  n23 <-->|"affects"| n0
  n7 -->|"invokes"| n23
  n28 -->|"invokes"| n23
  n19 -->|"invokes"| n23
  n83 -->|"part of"| n22
  n82 -->|"part of"| n22
  n22 -->|"requires (instrument)"| n30
  n4 -->|"requires (instrument)"| n30
  n30 <-->|"affects"| n22
  n18 -->|"handles (human)"| n30
  n87 -->|"part of"| n13
  n31 -->|"part of"| n13
  n20 -->|"invokes"| n21
  n13 -->|"requires (instrument)"| n20
  n20 -->|"yields"| n32
  n32 -->|"requires (instrument)"| n33
  n13 -->|"requires (instrument)"| n33
  n33 -->|"yields"| n34
  n20 -->|"yields"| n35
  n33 -->|"invokes"| n36
  n4 -->|"requires (instrument)"| n36
  n35 -->|"requires (instrument)"| n36
  n36 -->|"yields"| n37
  n18 -->|"handles (human)"| n38
  n37 -->|"requires (instrument)"| n38
  n38 -->|"yields"| n39
  n38 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n40
  n35 -->|"requires (instrument)"| n40
  n37 -->|"requires (instrument)"| n40
  n40 -->|"yields"| n41
  n40 <-->|"affects"| n4
  n88 -->|"part of"| n37
  n89 -->|"part of"| n37
  n0 -->|"exhibits"| n42
  n0 -->|"requires (instrument)"| n43
  n44 -->|"requires (instrument)"| n43
  n43 -->|"yields"| n45
  n43 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n46
  n4 -->|"requires (instrument)"| n46
  n46 -->|"yields"| n45
  n46 -->|"invokes"| n47
  n45 -->|"requires (instrument)"| n47
  n0 -->|"requires (instrument)"| n47
  n47 -->|"yields"| n48
  n20 -->|"invokes"| n49
  n0 -->|"requires (instrument)"| n49
  n45 -->|"requires (instrument)"| n49
  n49 -->|"invokes"| n47
  n49 -->|"yields"| n50
  n50 -->|"part of"| n32
  n33 -->|"invokes"| n51
  n50 -->|"requires (instrument)"| n51
  n52 -->|"requires (instrument)"| n51
  n51 -->|"yields"| n53
  n18 -->|"handles (human)"| n28
  n28 -->|"invokes"| n54
  n0 -->|"requires (instrument)"| n54
  n54 <-->|"affects"| n0
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
Action Reconciling requires Source Evidence. [src: src/review-actions.ts]
Action Reconciling invokes Suggestion Proposing. [src: src/review-actions.ts]
Action Reconciling invokes Suggestion Verifying. [src: src/review-actions.ts]
Suggestion Proposing requires Claude API. [src: src/review-actions.ts]
Suggestion Verifying requires Claude API. [src: src/review-actions.ts]
Action Reconciling affects Action Registry. [src: src/review-actions.ts]
Action Reconciling affects Article. [src: src/action-registry.ts]
Article Generating invokes Action Reconciling. [src: src/index.ts]
Editorial Revising invokes Action Reconciling. [src: src/revise-article.ts]
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
  n55["Activity Decision — states: skip, run"]
  n56["Run Timing — states: available, unavailable"]
  n6["Run Evidence"]
  n7("Article Generating")
  n57("Context Collecting")
  n58("Activity Assessing")
  n59("Credit Checking")
  n60("Drafting")
  n61("Council Reviewing")
  n62("Synthesizing")
  n63("Claim Verifying")
  n64("Provenance Attaching")
  n43("Time Recording")
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n13["Canonical Action Projection"]
  n65("Telemetry Collecting")
  n44["Commit Context"]
  n66["Telemetry Digest"]
  n27["Claude API"]
  style n27 stroke-dasharray: 5 5
  n67["Credit Status"]
  n0["Article — states: draft, accepted, rejected"]
  n68["Council Critiques"]
  n69["Claim Report"]
  n45["Time Evidence"]
  n56 -->|"part of"| n6
  n4 -->|"requires (instrument)"| n57
  n13 -->|"requires (instrument)"| n57
  n57 -->|"invokes"| n65
  n57 -->|"yields"| n44
  n65 -->|"yields"| n66
  n44 -->|"requires (instrument)"| n58
  n58 -->|"yields"| n55
  n55 -->|"condition: run"| n59
  n27 -->|"requires (instrument)"| n59
  n59 -->|"yields"| n67
  n27 -->|"requires (instrument)"| n60
  n44 -->|"requires (instrument)"| n60
  n66 -->|"requires (instrument)"| n60
  n67 -->|"requires (instrument)"| n60
  n55 -->|"condition: run"| n60
  n60 -->|"yields"| n0
  n27 -->|"requires (instrument)"| n61
  n0 -->|"requires (instrument)"| n61
  n61 -->|"yields"| n68
  n27 -->|"requires (instrument)"| n62
  n68 -->|"consumes"| n62
  n62 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n63
  n44 -->|"requires (instrument)"| n63
  n63 -->|"yields"| n69
  n63 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n64
  n6 -->|"requires (instrument)"| n64
  n64 <-->|"affects"| n0
  n44 -->|"requires (instrument)"| n43
  n0 -->|"requires (instrument)"| n43
  n43 -->|"yields"| n45
  n43 <-->|"affects"| n0
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
  n70("Feedback Version Saving")
  n35["Article Fingerprint"]
  n71["Feedback Version"]
  n72("Explicit Revision Requesting")
  n73["PR Article Fingerprint"]
  n74["Explicit Revision Request"]
  n75("Explicit Revision Admitting")
  n76["Owner Account"]
  n77["Admitted Revision"]
  n78("Invocation Claiming")
  n79["Invocation Claim"]
  n80("Continued Article Revising")
  n27["Claude API"]
  style n27 stroke-dasharray: 5 5
  n22["Action Registry"]
  n0["Article — states: draft, accepted, rejected"]
  n81["Revision Outcome"]
  n82["Article Action Files — states: pending, verified"]
  n23("Action Reconciling")
  n83["Imported Action Baseline"]
  n21("Action Projecting")
  n84("Editorial Output Binding")
  n85["Editorial Output Artifact"]
  n86("Editorial Rebinding")
  n4 -->|"requires (instrument)"| n70
  n35 -->|"requires (instrument)"| n70
  n70 -->|"yields"| n71
  n71 -->|"requires (instrument)"| n72
  n73 -->|"requires (instrument)"| n72
  n72 -->|"yields"| n74
  n74 -->|"object event"| n75
  n76 -->|"requires (instrument)"| n75
  n4 -->|"requires (instrument)"| n75
  n75 -->|"yields"| n77
  n77 -->|"object event"| n78
  n4 -->|"requires (instrument)"| n78
  n78 -->|"yields"| n79
  n79 -->|"object event"| n80
  n27 -->|"requires (instrument)"| n80
  n22 -->|"requires (instrument)"| n80
  n80 <-->|"affects"| n0
  n80 <-->|"affects"| n22
  n80 -->|"yields"| n81
  n23 -->|"yields"| n82
  n83 -->|"requires (instrument)"| n21
  n4 -->|"requires (instrument)"| n84
  n84 -->|"yields"| n85
  n85 -->|"requires (instrument)"| n75
  n0 -->|"requires (instrument)"| n86
  n86 <-->|"affects"| n82
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

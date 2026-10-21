# System model — Mermaid compatibility views

> Generated from `system.opl` by the /opm subset renderer v1. Do not hand-edit.
> Source SHA-256: `15bcb59a582b7a891829cebe5987fff212bb2da6acab99011f2212631bd5c6df`.
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
  n34["Claude API"]
  style n34 stroke-dasharray: 5 5
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
  n32("Suggestion Proposing")
  n33("Suggestion Verifying")
  n35["Draft Action Candidate — states: awaiting-review, promoted, mapped-existing, rejected, verified-closure"]
  n119["Ranked Recommendations"]
  n120["Handled Suggestions"]
  n36("Editorial Revising")
  n37["Editorial Revision Request"]
  n38["Draft Suggestion — states: proposed, open, done, dismissed, superseded, deferred"]
  n106["Imported Action Baseline"]
  n88["Article Action Files — states: pending, verified"]
  n39("Inclusion Choosing")
  n40["Reviewed Disposition — states: deferred, completed-existing-evidence, pending-receipt"]
  n121["Canonical Actions"]
  n41["JSON API"]
  n42("Frontend Rendering")
  n43["Rendered Site"]
  n44["Article Fingerprint"]
  n45("Independent Review Projecting")
  n46["Review Projection"]
  n47("Revision Requesting")
  n48["Revision Request"]
  n49("Conversation Saving")
  n50["Saved Message"]
  n122["Review Records"]
  n123["Correspondence"]
  n51["Time Record Pointer"]
  n52("Time Recording")
  n53["Commit Context"]
  n54["Issue Context"]
  n55["Time Evidence"]
  n56("Time Backfilling")
  n57("Time Resolving")
  n58["Time References"]
  n59["Shipment Timestamp — states: available, unavailable"]
  n60["Shipment Source State — states: open, closed-unmerged"]
  n61["Shipment Coverage — states: complete, unavailable"]
  n62("Shipment Time Resolving")
  n63("Issue Time Resolving")
  n64["Projected Issue Times"]
  n65["Time Expressions"]
  n66("Time Projecting")
  n67("Shipment Coverage Checking")
  n68["Projected Time References"]
  n69["Projected Shipment Timestamps"]
  n70["Projected Time Expressions"]
  n71("Time Visualizing")
  n72["Device Timezone"]
  n73["Time Popover"]
  n74("Time Metadata Preserving")
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
  n28 -->|"invokes"| n32
  n28 -->|"invokes"| n33
  n34 -->|"requires (instrument)"| n32
  n34 -->|"requires (instrument)"| n33
  n31 -->|"requires (instrument)"| n32
  n31 -->|"requires (instrument)"| n33
  n18 -->|"requires (instrument)"| n32
  n18 -->|"requires (instrument)"| n33
  n28 <-->|"affects"| n23
  n28 <-->|"affects"| n0
  n28 -->|"yields"| n24
  n28 -->|"yields"| n31
  n28 -->|"changes: transient to retained"| n27
  n35 -->|"part of"| n18
  n119 -->|"part of"| n26
  n18 -->|"part of"| n26
  n27 -->|"part of"| n26
  n120 -->|"part of"| n26
  n7 -->|"yields"| n29
  n7 -->|"invokes"| n28
  n36 -->|"yields"| n29
  n36 -->|"invokes"| n28
  n37 -->|"requires (instrument)"| n36
  n20 -->|"yields"| n29
  n20 -->|"invokes"| n28
  n106 -->|"part of"| n23
  n88 -->|"part of"| n23
  n23 -->|"requires (instrument)"| n39
  n4 -->|"requires (instrument)"| n39
  n39 <-->|"affects"| n23
  n19 -->|"handles (human)"| n39
  n121 -->|"part of"| n13
  n40 -->|"part of"| n13
  n21 -->|"invokes"| n22
  n13 -->|"requires (instrument)"| n21
  n21 -->|"yields"| n41
  n41 -->|"requires (instrument)"| n42
  n13 -->|"requires (instrument)"| n42
  n42 -->|"yields"| n43
  n21 -->|"yields"| n44
  n42 -->|"invokes"| n45
  n4 -->|"requires (instrument)"| n45
  n44 -->|"requires (instrument)"| n45
  n45 -->|"yields"| n46
  n19 -->|"handles (human)"| n47
  n46 -->|"requires (instrument)"| n47
  n47 -->|"yields"| n48
  n47 <-->|"affects"| n4
  n4 -->|"requires (instrument)"| n49
  n44 -->|"requires (instrument)"| n49
  n46 -->|"requires (instrument)"| n49
  n49 -->|"yields"| n50
  n49 <-->|"affects"| n4
  n122 -->|"part of"| n46
  n123 -->|"part of"| n46
  n0 -->|"exhibits"| n51
  n0 -->|"requires (instrument)"| n52
  n13 -->|"requires (instrument)"| n52
  n53 -->|"requires (instrument)"| n52
  n54 -->|"requires (instrument)"| n52
  n52 -->|"yields"| n55
  n52 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n56
  n4 -->|"requires (instrument)"| n56
  n56 -->|"yields"| n55
  n56 -->|"invokes"| n57
  n55 -->|"requires (instrument)"| n57
  n0 -->|"requires (instrument)"| n57
  n57 -->|"yields"| n58
  n0 -->|"requires (instrument)"| n62
  n55 -->|"requires (instrument)"| n62
  n60 -->|"requires (instrument)"| n62
  n62 -->|"yields"| n59
  n0 -->|"requires (instrument)"| n63
  n13 -->|"requires (instrument)"| n63
  n55 -->|"requires (instrument)"| n63
  n63 -->|"yields"| n64
  n52 -->|"invokes"| n62
  n57 -->|"yields"| n65
  n21 -->|"invokes"| n66
  n21 -->|"invokes"| n67
  n0 -->|"requires (instrument)"| n67
  n55 -->|"requires (instrument)"| n67
  n67 -->|"yields"| n61
  n0 -->|"requires (instrument)"| n66
  n13 -->|"requires (instrument)"| n66
  n55 -->|"requires (instrument)"| n66
  n66 -->|"invokes"| n57
  n66 -->|"invokes"| n62
  n66 -->|"invokes"| n63
  n66 -->|"yields"| n68
  n66 -->|"yields"| n69
  n68 -->|"part of"| n41
  n69 -->|"part of"| n41
  n64 -->|"part of"| n41
  n66 -->|"yields"| n70
  n70 -->|"part of"| n41
  n42 -->|"invokes"| n71
  n68 -->|"requires (instrument)"| n71
  n69 -->|"requires (instrument)"| n71
  n64 -->|"requires (instrument)"| n71
  n72 -->|"requires (instrument)"| n71
  n71 -->|"yields"| n73
  n19 -->|"handles (human)"| n36
  n36 -->|"invokes"| n74
  n0 -->|"requires (instrument)"| n74
  n74 <-->|"affects"| n0
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
Suggested Actions Card consists of Ranked Recommendations, Draft Action Candidates, Draft Continuation Context, and Handled Suggestions. [src: src/action-registry.ts]
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
  n75["Activity Decision — states: skip, run"]
  n76["Run Timing — states: available, unavailable"]
  n6["Run Evidence"]
  n7("Article Generating")
  n77("Context Collecting")
  n78("Activity Assessing")
  n79("Credit Checking")
  n80("Drafting")
  n81("Council Reviewing")
  n82("Synthesizing")
  n83("Claim Verifying")
  n84("Provenance Attaching")
  n52("Time Recording")
  n4["GitHub"]
  style n4 stroke-dasharray: 5 5
  n13["Canonical Action Projection"]
  n85("Closing Continuity Projecting")
  n86("Telemetry Collecting")
  n53["Commit Context"]
  n87["Closing Continuity Projection — states: available, unavailable"]
  n0["Article — states: draft, accepted, rejected"]
  n88["Article Action Files — states: pending, verified"]
  n89["Telemetry Digest"]
  n34["Claude API"]
  style n34 stroke-dasharray: 5 5
  n90["Credit Status"]
  n27["Draft Continuation Context — states: transient, retained"]
  n91["Council Critiques"]
  n92["Claim Report"]
  n55["Time Evidence"]
  n76 -->|"part of"| n6
  n4 -->|"requires (instrument)"| n77
  n13 -->|"requires (instrument)"| n77
  n77 -->|"invokes"| n85
  n77 -->|"invokes"| n86
  n77 -->|"yields"| n53
  n0 -->|"requires (instrument)"| n85
  n88 -->|"requires (instrument)"| n85
  n85 -->|"yields"| n87
  n86 -->|"yields"| n89
  n53 -->|"requires (instrument)"| n78
  n78 -->|"yields"| n75
  n75 -->|"condition: run"| n79
  n34 -->|"requires (instrument)"| n79
  n79 -->|"yields"| n90
  n34 -->|"requires (instrument)"| n80
  n53 -->|"requires (instrument)"| n80
  n89 -->|"requires (instrument)"| n80
  n90 -->|"requires (instrument)"| n80
  n87 -->|"requires (instrument)"| n80
  n75 -->|"condition: run"| n80
  n80 -->|"yields"| n0
  n80 -->|"yields"| n27
  n34 -->|"requires (instrument)"| n81
  n0 -->|"requires (instrument)"| n81
  n81 -->|"yields"| n91
  n34 -->|"requires (instrument)"| n82
  n91 -->|"consumes"| n82
  n82 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n83
  n53 -->|"requires (instrument)"| n83
  n83 -->|"yields"| n92
  n83 <-->|"affects"| n0
  n0 -->|"requires (instrument)"| n84
  n6 -->|"requires (instrument)"| n84
  n84 <-->|"affects"| n0
  n53 -->|"requires (instrument)"| n52
  n0 -->|"requires (instrument)"| n52
  n52 -->|"yields"| n55
  n52 <-->|"affects"| n0
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
  n93("Feedback Version Saving")
  n44["Article Fingerprint"]
  n94["Feedback Version"]
  n95("Explicit Revision Requesting")
  n96["PR Article Fingerprint"]
  n97["Explicit Revision Request"]
  n98("Explicit Revision Admitting")
  n99["Owner Account"]
  n100["Admitted Revision"]
  n101("Invocation Claiming")
  n102["Invocation Claim"]
  n103("Continued Article Revising")
  n34["Claude API"]
  style n34 stroke-dasharray: 5 5
  n23["Action Registry"]
  n0["Article — states: draft, accepted, rejected"]
  n104["Revision Outcome"]
  n88["Article Action Files — states: pending, verified"]
  n105["Dated Action State Digest"]
  n18["Draft Action Candidates"]
  n28("Action Reconciling")
  n106["Imported Action Baseline"]
  n22("Action Projecting")
  n107("Editorial Output Binding")
  n108["Editorial Output Artifact"]
  n109("Editorial Rebinding")
  n110("Source Evidence Selecting")
  n30["Source Evidence"]
  n31["Recommendation Maintenance Memory"]
  n111["Selected Source Evidence"]
  n112["Evidence Coverage"]
  n32("Suggestion Proposing")
  n33("Suggestion Verifying")
  n4 -->|"requires (instrument)"| n93
  n44 -->|"requires (instrument)"| n93
  n93 -->|"yields"| n94
  n94 -->|"requires (instrument)"| n95
  n96 -->|"requires (instrument)"| n95
  n95 -->|"yields"| n97
  n97 -->|"object event"| n98
  n99 -->|"requires (instrument)"| n98
  n4 -->|"requires (instrument)"| n98
  n98 -->|"yields"| n100
  n100 -->|"object event"| n101
  n4 -->|"requires (instrument)"| n101
  n101 -->|"yields"| n102
  n102 -->|"object event"| n103
  n34 -->|"requires (instrument)"| n103
  n23 -->|"requires (instrument)"| n103
  n103 <-->|"affects"| n0
  n103 <-->|"affects"| n23
  n103 -->|"yields"| n104
  n105 -->|"part of"| n88
  n18 -->|"part of"| n88
  n28 -->|"yields"| n105
  n28 -->|"changes: verified to pending"| n88
  n28 -->|"changes: pending to verified"| n88
  n28 -->|"yields"| n88
  n106 -->|"requires (instrument)"| n22
  n4 -->|"requires (instrument)"| n107
  n107 -->|"yields"| n108
  n108 -->|"requires (instrument)"| n98
  n0 -->|"requires (instrument)"| n109
  n109 <-->|"affects"| n88
  n28 -->|"invokes"| n110
  n0 -->|"requires (instrument)"| n110
  n23 -->|"requires (instrument)"| n110
  n30 -->|"requires (instrument)"| n110
  n31 -->|"requires (instrument)"| n110
  n110 -->|"yields"| n111
  n110 -->|"yields"| n112
  n111 -->|"requires (instrument)"| n32
  n111 -->|"requires (instrument)"| n33
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
  n113["Article Date"]
  n114("Activity Window Resolving")
  n115["Activity Window"]
  n77("Context Collecting")
  n116["Clock"]
  n117("Start Target Waiting")
  n118["Due Start Target"]
  n14("Fallback Checking")
  n16("Fallback Dispatching")
  n113 -->|"requires (instrument)"| n114
  n114 -->|"yields"| n115
  n115 -->|"requires (instrument)"| n77
  n77 -->|"invokes"| n114
  n116 -->|"requires (instrument)"| n117
  n117 -->|"yields"| n118
  n14 -->|"invokes"| n117
  n118 -->|"requires (instrument)"| n16
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

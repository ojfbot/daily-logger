# daily-logger — Object-Process Diagrams

> Rendered from `opm/system.opl` by `/opm render`. Do not hand-edit.
> Notation: rectangles = objects, rounded = processes, dotted `agent`/`instrument` edges = enablers,
> dashed borders = environmental objects.

## SD — daily-logger: one article per day

```mermaid
flowchart TD
  Jim["Jim"]
  GitHub["GitHub"]
  ClaudeAPI["Claude API"]
  Article["Article<br/>{draft, accepted, or rejected}"]
  RunAdmission["Run Admission<br/>{generate, recover, or complete}"]
  CronFiring["Cron Firing"]
  RunAdmitting("Run Admitting")
  RunEvidenceCapturing("Run Evidence Capturing")
  RunEvidence["Run Evidence"]
  ArticleGenerating("Article Generating")
  BranchRecovering("Branch Recovering")
  ArticleCompletion["Article Completion"]
  CleanerAdmitting("Cleaner Admitting")
  CleanerAdmission["Cleaner Admission<br/>{run, skip}"]
  StaleContentCleaning("Stale Content Cleaning")
  CanonicalActionProjection["Canonical Action Projection"]
  FallbackChecking("Fallback Checking")
  FallbackDecision["Fallback Decision<br/>{missing, active, complete, or failed}"]
  FallbackDispatching("Fallback Dispatching")
  WorkflowRun["Workflow Run"]
  EditorialAccepting("Editorial Accepting")
  APIBuilding("API Building")
  ActionProjecting("Action Projecting")
  ActionAdmission["Action Admission"]
  ReviewedDisposition["Reviewed Disposition<br/>{deferred, completed-existing-evidence, or pending-receipt}"]
  CanonicalActions["Canonical Actions"]
  JSONAPI["JSON API"]
  FrontendRendering("Frontend Rendering")
  RenderedSite["Rendered Site"]
  ArticleFingerprint["Article Fingerprint"]
  IndependentReviewProjecting("Independent Review Projecting")
  ReviewProjection["Review Projection"]
  RevisionRequesting("Revision Requesting")
  RevisionRequest["Revision Request"]
  ConversationSaving("Conversation Saving")
  SavedMessage["Saved Message"]
  ReviewRecords["Review Records"]
  Correspondence["Correspondence"]
  TimeRecordPointer["Time Record Pointer"]
  TimeRecording("Time Recording")
  CommitContext["Commit Context"]
  TimeEvidence["Time Evidence"]
  TimeBackfilling("Time Backfilling")
  TimeResolving("Time Resolving")
  TimeReferences["Time References"]
  TimeProjecting("Time Projecting")
  ProjectedTimeReferences["Projected Time References"]
  TimeVisualizing("Time Visualizing")
  DeviceTimezone["Device Timezone"]
  TimePopover["Time Popover"]
  EditorialRevising("Editorial Revising")
  TimeMetadataPreserving("Time Metadata Preserving")

  style GitHub stroke-dasharray: 5 5
  style ClaudeAPI stroke-dasharray: 5 5

  CronFiring -. triggers .-> RunAdmitting
  GitHub -. instrument .-> RunAdmitting
  RunAdmitting --> RunAdmission
  RunAdmitting -. invokes .-> RunEvidenceCapturing
  GitHub -. instrument .-> RunEvidenceCapturing
  RunEvidenceCapturing --> RunEvidence
  RunAdmission -. if generate .-> ArticleGenerating
  RunAdmission -. if recover .-> BranchRecovering
  GitHub -. instrument .-> BranchRecovering
  BranchRecovering --> ArticleCompletion
  ArticleGenerating --> ArticleCompletion
  ArticleCompletion -. instrument .-> CleanerAdmitting
  CleanerAdmitting --> CleanerAdmission
  CleanerAdmission -. if run .-> StaleContentCleaning
  CanonicalActionProjection -. instrument .-> StaleContentCleaning
  StaleContentCleaning -- affects --> GitHub
  GitHub -. instrument .-> FallbackChecking
  FallbackChecking --> FallbackDecision
  FallbackDecision -. if missing .-> FallbackDispatching
  GitHub -. instrument .-> FallbackDispatching
  FallbackDispatching --> WorkflowRun
  WorkflowRun -. triggers .-> RunAdmitting
  ArticleGenerating --> Article
  Jim -. agent .-> EditorialAccepting
  EditorialAccepting -- draft→accepted --> Article
  Article -. instrument .-> APIBuilding
  Article -. instrument .-> ActionProjecting
  ActionAdmission -. instrument .-> ActionProjecting
  ActionProjecting --> CanonicalActionProjection
  CanonicalActions -- part of --> CanonicalActionProjection
  ReviewedDisposition -- part of --> CanonicalActionProjection
  APIBuilding -. invokes .-> ActionProjecting
  CanonicalActionProjection -. instrument .-> APIBuilding
  APIBuilding --> JSONAPI
  JSONAPI -. instrument .-> FrontendRendering
  CanonicalActionProjection -. instrument .-> FrontendRendering
  FrontendRendering --> RenderedSite
  APIBuilding --> ArticleFingerprint
  FrontendRendering -. invokes .-> IndependentReviewProjecting
  GitHub -. instrument .-> IndependentReviewProjecting
  ArticleFingerprint -. instrument .-> IndependentReviewProjecting
  IndependentReviewProjecting --> ReviewProjection
  Jim -. agent .-> RevisionRequesting
  ReviewProjection -. instrument .-> RevisionRequesting
  RevisionRequesting --> RevisionRequest
  RevisionRequesting -- affects --> GitHub
  GitHub -. instrument .-> ConversationSaving
  ArticleFingerprint -. instrument .-> ConversationSaving
  ReviewProjection -. instrument .-> ConversationSaving
  ConversationSaving --> SavedMessage
  ConversationSaving -- affects --> GitHub
  ReviewRecords -- part of --> ReviewProjection
  Correspondence -- part of --> ReviewProjection
  Article -- exhibits --> TimeRecordPointer
  Article -. instrument .-> TimeRecording
  CommitContext -. instrument .-> TimeRecording
  TimeRecording --> TimeEvidence
  TimeRecording -- affects --> Article
  Article -. instrument .-> TimeBackfilling
  GitHub -. instrument .-> TimeBackfilling
  TimeBackfilling --> TimeEvidence
  TimeBackfilling -. invokes .-> TimeResolving
  TimeEvidence -. instrument .-> TimeResolving
  Article -. instrument .-> TimeResolving
  TimeResolving --> TimeReferences
  APIBuilding -. invokes .-> TimeProjecting
  Article -. instrument .-> TimeProjecting
  TimeEvidence -. instrument .-> TimeProjecting
  TimeProjecting -. invokes .-> TimeResolving
  TimeProjecting --> ProjectedTimeReferences
  ProjectedTimeReferences -- part of --> JSONAPI
  FrontendRendering -. invokes .-> TimeVisualizing
  ProjectedTimeReferences -. instrument .-> TimeVisualizing
  DeviceTimezone -. instrument .-> TimeVisualizing
  TimeVisualizing --> TimePopover
  Jim -. agent .-> EditorialRevising
  EditorialRevising -. invokes .-> TimeMetadataPreserving
  Article -. instrument .-> TimeMetadataPreserving
  TimeMetadataPreserving -- affects --> Article
```

**OPL paragraph.** Jim is physical. GitHub is environmental. Claude API is environmental. Article can be draft, accepted, or rejected. [src: src/schema.ts] Draft is initial. Run Admission can be generate, recover, or complete. [src: .github/scripts/daily_blog_schedule.py] Cron Firing triggers Run Admitting. [src: .github/workflows/daily-blog.yml] Run Admitting requires GitHub. [src: .github/scripts/daily_blog_schedule.py] Run Admitting yields Run Admission. [src: .github/scripts/daily_blog_schedule.py] Run Admitting invokes Run Evidence Capturing. [src: .github/scripts/daily_blog_schedule.py] Run Evidence Capturing requires GitHub. [src: .github/scripts/daily_blog_schedule.py] Run Evidence Capturing yields Run Evidence. [src: .github/scripts/daily_blog_schedule.py] Article Generating occurs if Run Admission is generate. [src: .github/workflows/daily-blog.yml] Branch Recovering occurs if Run Admission is recover. [src: .github/workflows/daily-blog.yml] Branch Recovering requires GitHub. [src: .github/workflows/daily-blog.yml] Branch Recovering yields Article Completion. [src: .github/workflows/daily-blog.yml] Article Generating yields Article Completion. [src: .github/workflows/daily-blog.yml] Cleaner Admitting requires Article Completion. [src: .github/scripts/daily_blog_schedule.py] Cleaner Admitting yields Cleaner Admission. [src: .github/scripts/daily_blog_schedule.py] Cleaner Admission can be run or skip. [src: .github/scripts/daily_blog_schedule.py] Stale Content Cleaning occurs if Cleaner Admission is run. [src: .github/workflows/daily-cleaner.yml] Stale Content Cleaning requires Canonical Action Projection. [src: src/cleaner.ts] Stale Content Cleaning affects GitHub. [src: .github/workflows/daily-cleaner.yml] Fallback Checking requires GitHub. [src: .github/scripts/daily_blog_schedule.py] Fallback Checking yields Fallback Decision. [src: .github/scripts/daily_blog_schedule.py] Fallback Decision can be missing, active, complete, or failed. [src: .github/scripts/daily_blog_schedule.py] Fallback Dispatching occurs if Fallback Decision is missing. [src: .github/scripts/daily_blog_schedule.py] Fallback Dispatching requires GitHub. [src: .github/scripts/daily_blog_schedule.py] Fallback Dispatching yields Workflow Run. [src: .github/scripts/daily_blog_schedule.py] Workflow Run triggers Run Admitting. [src: .github/workflows/daily-blog.yml] Article Generating yields Article. [src: src/index.ts] Jim handles Editorial Accepting. [src: .github/workflows/editorial-revise.yml] Editorial Accepting changes Article from draft to accepted. [src: packages/frontend/src/utils/stampDraft.ts] API Building requires Article. [src: src/build-api.ts] Action Projecting requires Article. [src: src/action-intake.ts] Action Projecting requires Action Admission. [src: action-admissions] Action Projecting yields Canonical Action Projection. [src: src/action-intake.ts] Reviewed Disposition can be deferred, completed-existing-evidence, or pending-receipt. [src: src/action-model.ts] Canonical Action Projection consists of Canonical Actions and Reviewed Disposition. [src: src/action-model.ts] API Building invokes Action Projecting. [src: src/build-api.ts] API Building requires Canonical Action Projection. [src: src/build-api.ts] API Building yields JSON API. Frontend Rendering requires JSON API. [src: packages/frontend] Frontend Rendering requires Canonical Action Projection. [src: packages/frontend/src/components/ActionsPage.tsx] Frontend Rendering yields Rendered Site. API Building yields Article Fingerprint. [src: src/build-api.ts] Frontend Rendering invokes Independent Review Projecting. [src: packages/frontend/src/components/IndependentArticleReviews.tsx] Independent Review Projecting requires GitHub. [src: api/_lib/article-review-service.ts] Independent Review Projecting requires Article Fingerprint. [src: api/_lib/article-review-service.ts] Independent Review Projecting yields Review Projection. [src: api/_lib/article-review-service.ts] Jim handles Revision Requesting. [src: packages/frontend/src/components/IndependentArticleReviews.tsx] Revision Requesting requires Review Projection. [src: api/_lib/article-review-service.ts] Revision Requesting yields Revision Request. [src: api/_lib/article-review-service.ts] Revision Requesting affects GitHub. [src: api/_lib/article-review-service.ts] Conversation Saving requires GitHub. [src: api/_lib/article-review-service.ts] Conversation Saving requires Article Fingerprint. [src: api/_lib/article-review-service.ts] Conversation Saving requires Review Projection. [src: api/_lib/article-review-service.ts] Conversation Saving yields Saved Message. [src: api/_lib/article-review-service.ts] Conversation Saving affects GitHub. [src: api/_lib/article-review-service.ts] Review Projection consists of Review Records and Correspondence. [src: shared/article-review.ts] Article exhibits Time Record Pointer. [src: src/article-time-metadata.ts] Time Recording requires Article. [src: src/article-time-metadata.ts] Time Recording requires Commit Context. [src: src/index.ts] Time Recording yields Time Evidence. [src: src/article-time-metadata.ts] Time Recording affects Article. [src: src/article-time-metadata.ts] Time Backfilling requires Article. [src: src/backfill-times.ts] Time Backfilling requires GitHub. [src: src/backfill-times.ts] Time Backfilling yields Time Evidence. [src: src/backfill-times.ts] Time Backfilling invokes Time Resolving. [src: src/backfill-times.ts] Time Resolving requires Time Evidence. [src: src/time-references.ts] Time Resolving requires Article. [src: src/time-references.ts] Time Resolving yields Time References. [src: src/time-references.ts] API Building invokes Time Projecting. [src: src/build-api.ts] Time Projecting requires Article. [src: src/article-time-metadata.ts] Time Projecting requires Time Evidence. [src: src/article-time-metadata.ts] Time Projecting invokes Time Resolving. [src: src/article-time-metadata.ts] Time Projecting yields Projected Time References. [src: src/article-time-metadata.ts] JSON API consists of Projected Time References. [src: src/build-api.ts] Frontend Rendering invokes Time Visualizing. [src: packages/frontend/src/hooks/useArticlePopovers.ts] Time Visualizing requires Projected Time References. [src: packages/frontend/src/utils/timeReferences.ts] Time Visualizing requires Device Timezone. [src: packages/frontend/src/utils/timeDisplay.ts] Time Visualizing yields Time Popover. [src: packages/frontend/src/components/TimePopoverContent.tsx] Jim handles Editorial Revising. [src: src/revise-article.ts] Editorial Revising invokes Time Metadata Preserving. [src: src/revise-article.ts] Time Metadata Preserving requires Article. [src: src/article-time-frontmatter.ts] Time Metadata Preserving affects Article. [src: src/article-time-frontmatter.ts]

## SD1.1 — Article Generating in-zoom

```mermaid
flowchart TD
  ActivityDecision["Activity Decision<br/>{skip, run}"]
  RunTiming["Run Timing<br/>{available, unavailable}"]
  RunEvidence["Run Evidence"]
  ContextCollecting("Context Collecting")
  GitHub["GitHub"]
  CanonicalActionProjection["Canonical Action Projection"]
  TelemetryCollecting("Telemetry Collecting")
  CommitContext["Commit Context"]
  TelemetryDigest["Telemetry Digest"]
  ActivityAssessing("Activity Assessing")
  CreditChecking("Credit Checking")
  ClaudeAPI["Claude API"]
  CreditStatus["Credit Status"]
  Drafting("Drafting")
  Article["Article<br/>{draft, accepted, or rejected}"]
  CouncilReviewing("Council Reviewing")
  CouncilCritiques["Council Critiques"]
  Synthesizing("Synthesizing")
  ClaimVerifying("Claim Verifying")
  ClaimReport["Claim Report"]
  ProvenanceAttaching("Provenance Attaching")
  TimeRecording("Time Recording")
  TimeEvidence["Time Evidence"]

  style GitHub stroke-dasharray: 5 5
  style ClaudeAPI stroke-dasharray: 5 5

  RunTiming -- part of --> RunEvidence
  GitHub -. instrument .-> ContextCollecting
  CanonicalActionProjection -. instrument .-> ContextCollecting
  ContextCollecting -. invokes .-> TelemetryCollecting
  ContextCollecting --> CommitContext
  TelemetryCollecting --> TelemetryDigest
  CommitContext -. instrument .-> ActivityAssessing
  ActivityAssessing --> ActivityDecision
  ActivityDecision -. if run .-> CreditChecking
  ClaudeAPI -. instrument .-> CreditChecking
  CreditChecking --> CreditStatus
  ClaudeAPI -. instrument .-> Drafting
  CommitContext -. instrument .-> Drafting
  TelemetryDigest -. instrument .-> Drafting
  CreditStatus -. instrument .-> Drafting
  ActivityDecision -. if run .-> Drafting
  Drafting --> Article
  ClaudeAPI -. instrument .-> CouncilReviewing
  Article -. instrument .-> CouncilReviewing
  CouncilReviewing --> CouncilCritiques
  ClaudeAPI -. instrument .-> Synthesizing
  CouncilCritiques --> Synthesizing
  Synthesizing -- affects --> Article
  Article -. instrument .-> ClaimVerifying
  CommitContext -. instrument .-> ClaimVerifying
  ClaimVerifying --> ClaimReport
  ClaimVerifying -- affects --> Article
  Article -. instrument .-> ProvenanceAttaching
  RunEvidence -. instrument .-> ProvenanceAttaching
  ProvenanceAttaching -- affects --> Article
  CommitContext -. instrument .-> TimeRecording
  Article -. instrument .-> TimeRecording
  TimeRecording --> TimeEvidence
  TimeRecording -- affects --> Article
```

**OPL paragraph.** Activity Decision can be skip or run. Run Timing can be available or unavailable. Run Evidence consists of Run Timing. Article Generating zooms into Context Collecting, Activity Assessing, Credit Checking, Drafting, Council Reviewing, Synthesizing, Claim Verifying, Provenance Attaching, and Time Recording. [src: src/index.ts] Context Collecting requires GitHub. [src: src/collect-context.ts] Context Collecting requires Canonical Action Projection. [src: src/collect-context.ts] Context Collecting invokes Telemetry Collecting. [src: src/collect-context.ts] Context Collecting yields Commit Context. Telemetry Collecting yields Telemetry Digest. [src: src/collect-telemetry.ts] Activity Assessing requires Commit Context. [src: src/should-skip-run.ts] Activity Assessing yields Activity Decision. [src: src/should-skip-run.ts] Credit Checking occurs if Activity Decision is run. [src: src/index.ts] Credit Checking requires Claude API. [src: src/check-anthropic-credits.ts] Credit Checking yields Credit Status. [src: src/check-anthropic-credits.ts] Drafting requires Claude API. [src: src/generate-article.ts] Drafting requires Commit Context. Drafting requires Telemetry Digest. Drafting requires Credit Status. [src: src/index.ts] Drafting occurs if Activity Decision is run. [src: src/index.ts] Drafting yields Article. Council Reviewing requires Claude API. [src: src/index.ts] Council Reviewing requires Article. Council Reviewing yields Council Critiques. Synthesizing requires Claude API. [src: src/index.ts] Synthesizing consumes Council Critiques. Synthesizing affects Article. Claim Verifying requires Article. [src: src/verify-claims.ts] Claim Verifying requires Commit Context. Claim Verifying yields Claim Report. Claim Verifying affects Article. [src: src/index.ts] Provenance Attaching requires Article. [src: src/index.ts] Provenance Attaching requires Run Evidence. [src: src/index.ts] Provenance Attaching affects Article. [src: src/index.ts] Time Recording requires Commit Context. [src: src/index.ts] Time Recording requires Article. [src: src/index.ts] Time Recording yields Time Evidence. [src: src/article-time-metadata.ts] Time Recording affects Article. [src: src/index.ts]

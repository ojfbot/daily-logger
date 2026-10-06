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
  Article["Article<br/>{draft, accepted, rejected}"]
  RunAdmission["Run Admission<br/>{generate, recover, complete}"]
  CronFiring("Cron Firing")
  RunAdmitting("Run Admitting")
  ArticleGenerating("Article Generating")
  BranchRecovering("Branch Recovering")
  ArticleCompletion["Article Completion"]
  CleanerAdmitting("Cleaner Admitting")
  CleanerAdmission["Cleaner Admission<br/>{run, skip}"]
  StaleContentCleaning("Stale Content Cleaning")
  FallbackChecking("Fallback Checking")
  FallbackDecision["Fallback Decision<br/>{missing, active, complete, failed}"]
  FallbackDispatching("Fallback Dispatching")
  WorkflowRun["Workflow Run"]
  EditorialAccepting("Editorial Accepting")
  APIBuilding("API Building")
  JSONAPI["JSON API"]
  FrontendRendering("Frontend Rendering")
  RenderedSite["Rendered Site"]

  style GitHub stroke-dasharray: 5 5
  style ClaudeAPI stroke-dasharray: 5 5

  CronFiring -. triggers .-> RunAdmitting
  GitHub -. instrument .-> RunAdmitting
  RunAdmitting --> RunAdmission
  RunAdmission -. if generate .-> ArticleGenerating
  RunAdmission -. if recover .-> BranchRecovering
  GitHub -. instrument .-> BranchRecovering
  BranchRecovering --> ArticleCompletion
  ArticleGenerating --> ArticleCompletion
  ArticleCompletion -. instrument .-> CleanerAdmitting
  CleanerAdmitting --> CleanerAdmission
  CleanerAdmission -. if run .-> StaleContentCleaning
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
  APIBuilding --> JSONAPI
  JSONAPI -. instrument .-> FrontendRendering
  FrontendRendering --> RenderedSite
```

**OPL paragraph.** Jim is physical. GitHub is environmental. Claude API is environmental. Article can be draft, accepted, or rejected. Draft is initial. Run Admission can be generate, recover, or complete. Cron Firing triggers Run Admitting. Run Admitting requires GitHub. Run Admitting yields Run Admission. Article Generating occurs if Run Admission is generate. Branch Recovering occurs if Run Admission is recover. Branch Recovering requires GitHub. Branch Recovering yields Article Completion. Article Generating yields Article Completion. Cleaner Admitting requires Article Completion. Cleaner Admitting yields Cleaner Admission. Cleaner Admission can be run or skip. Stale Content Cleaning occurs if Cleaner Admission is run. Stale Content Cleaning affects GitHub. Fallback Checking requires GitHub. Fallback Checking yields Fallback Decision. Fallback Decision can be missing, active, complete, or failed. Fallback Dispatching occurs if Fallback Decision is missing. Fallback Dispatching requires GitHub. Fallback Dispatching yields Workflow Run. Workflow Run triggers Run Admitting. Article Generating yields Article. Jim handles Editorial Accepting. Editorial Accepting changes Article from draft to accepted. API Building requires Article. API Building yields JSON API. Frontend Rendering requires JSON API. Frontend Rendering yields Rendered Site.

## SD1.1 — Article Generating in-zoom

```mermaid
flowchart TD
  ActivityDecision["Activity Decision<br/>{skip, run}"]
  GitHub["GitHub"]
  ContextCollecting("Context Collecting")
  TelemetryCollecting("Telemetry Collecting")
  CommitContext["Commit Context"]
  TelemetryDigest["Telemetry Digest"]
  ActivityAssessing("Activity Assessing")
  CreditChecking("Credit Checking")
  ClaudeAPI["Claude API"]
  CreditStatus["Credit Status"]
  Drafting("Drafting")
  Article["Article"]
  CouncilReviewing("Council Reviewing")
  CouncilCritiques["Council Critiques"]
  Synthesizing("Synthesizing")
  ClaimVerifying("Claim Verifying")
  ClaimReport["Claim Report"]


  GitHub -. instrument .-> ContextCollecting
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
```

**OPL paragraph.** Activity Decision can be skip or run. Article Generating zooms into Context Collecting, Activity Assessing, Credit Checking, Drafting, Council Reviewing, Synthesizing, and Claim Verifying. Context Collecting requires GitHub. Context Collecting invokes Telemetry Collecting. Context Collecting yields Commit Context. Telemetry Collecting yields Telemetry Digest. Activity Assessing requires Commit Context. Activity Assessing yields Activity Decision. Credit Checking occurs if Activity Decision is run. Credit Checking requires Claude API. Credit Checking yields Credit Status. Drafting requires Claude API. Drafting requires Commit Context. Drafting requires Telemetry Digest. Drafting requires Credit Status. Drafting occurs if Activity Decision is run. Drafting yields Article. Council Reviewing requires Claude API. Council Reviewing requires Article. Council Reviewing yields Council Critiques. Synthesizing requires Claude API. Synthesizing consumes Council Critiques. Synthesizing affects Article. Claim Verifying requires Article. Claim Verifying requires Commit Context. Claim Verifying yields Claim Report. Claim Verifying affects Article.

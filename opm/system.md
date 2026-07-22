# daily-logger — Object-Process Diagrams

> Rendered from `opm/system.opl` by `/opm render`. Do not hand-edit.
> Notation: rectangles = objects, rounded = processes, dotted `agent`/`instrument` edges = enablers,
> dashed borders = environmental objects.

## SD — daily-logger: one article per day

```mermaid
flowchart TD
  Jim[Jim]
  GitHub[GitHub]
  ClaudeAPI[Claude API]
  Article["Article<br/>{draft, accepted, rejected}"]
  JSONAPI[JSON API]
  RenderedSite[Rendered Site]

  CronFiring(Cron Firing)
  ArticleGenerating(Article Generating)
  EditorialAccepting(Editorial Accepting)
  APIBuilding(API Building)
  FrontendRendering(Frontend Rendering)

  style GitHub stroke-dasharray: 5 5
  style ClaudeAPI stroke-dasharray: 5 5

  CronFiring -. triggers .-> ArticleGenerating
  ArticleGenerating --> Article
  Jim -. agent .-> EditorialAccepting
  EditorialAccepting -- draft→accepted --> Article
  Article -. instrument .-> APIBuilding
  APIBuilding --> JSONAPI
  JSONAPI -. instrument .-> FrontendRendering
  FrontendRendering --> RenderedSite
```

**OPL paragraph.** Jim is physical. GitHub is environmental. Claude API is environmental. Article
can be draft, accepted, or rejected. Draft is initial. Cron Firing triggers Article Generating.
Article Generating yields Article. Jim handles Editorial Accepting. Editorial Accepting changes
Article from draft to accepted. API Building requires Article. API Building yields JSON API.
Frontend Rendering requires JSON API. Frontend Rendering yields Rendered Site.

## SD1.1 — Article Generating in-zoom

```mermaid
flowchart TD
  GitHub[GitHub]
  ClaudeAPI[Claude API]
  CommitContext[Commit Context]
  TelemetryDigest[Telemetry Digest]
  Article["Article<br/>{draft, accepted, rejected}"]
  CouncilCritiques[Council Critiques]
  ClaimReport[Claim Report]

  ContextCollecting(Context Collecting)
  TelemetryCollecting(Telemetry Collecting)
  Drafting(Drafting)
  CouncilReviewing(Council Reviewing)
  Synthesizing(Synthesizing)
  ClaimVerifying(Claim Verifying)

  style GitHub stroke-dasharray: 5 5
  style ClaudeAPI stroke-dasharray: 5 5

  GitHub -. instrument .-> ContextCollecting
  ContextCollecting -. invokes .-> TelemetryCollecting
  ContextCollecting --> CommitContext
  TelemetryCollecting --> TelemetryDigest
  ClaudeAPI -. instrument .-> Drafting
  CommitContext -. instrument .-> Drafting
  TelemetryDigest -. instrument .-> Drafting
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

**OPL paragraph.** Article Generating zooms into Context Collecting, Drafting, Council Reviewing,
Synthesizing, and Claim Verifying. Context Collecting requires GitHub. Context Collecting invokes
Telemetry Collecting. Context Collecting yields Commit Context. Telemetry Collecting yields
Telemetry Digest. Drafting requires Claude API. Drafting requires Commit Context. Drafting
requires Telemetry Digest. Drafting yields Article. Council Reviewing requires Claude API.
Council Reviewing requires Article. Council Reviewing yields Council Critiques. Synthesizing
requires Claude API. Synthesizing consumes Council Critiques. Synthesizing affects Article.
Claim Verifying requires Article. Claim Verifying requires Commit Context. Claim Verifying yields
Claim Report. Claim Verifying affects Article.

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
```

**OPL paragraph.** Jim is physical. GitHub is environmental. Claude API is environmental. Article
can be draft, accepted, or rejected. Draft is initial. Cron Firing triggers Article Generating.
Article Generating yields Article. Jim handles Editorial Accepting. Editorial Accepting changes
Article from draft to accepted. API Building requires Article. API Building yields JSON API.
Frontend Rendering requires JSON API.

## SD1.1 — Article Generating in-zoom

```mermaid
flowchart TD
  GitHub[GitHub]
  ClaudeAPI[Claude API]
  CommitContext[Commit Context]
  TelemetryDigest[Telemetry Digest]
  Article["Article<br/>{draft, accepted, rejected}"]
  ClaimReport[Claim Report]

  ContextCollecting(Context Collecting)
  TelemetryCollecting(Telemetry Collecting)
  Drafting(Drafting)
  ClaimVerifying(Claim Verifying)

  style GitHub stroke-dasharray: 5 5
  style ClaudeAPI stroke-dasharray: 5 5

  GitHub -. instrument .-> ContextCollecting
  ContextCollecting --> CommitContext
  TelemetryCollecting --> TelemetryDigest
  ClaudeAPI -. instrument .-> Drafting
  CommitContext --> Drafting
  TelemetryDigest --> Drafting
  Drafting --> Article
  Article -. instrument .-> ClaimVerifying
  CommitContext -. instrument .-> ClaimVerifying
  ClaimVerifying --> ClaimReport
```

**OPL paragraph.** Article Generating zooms into Context Collecting, Telemetry Collecting,
Drafting, and Claim Verifying. Context Collecting requires GitHub. Context Collecting yields
Commit Context. Telemetry Collecting yields Telemetry Digest. Drafting requires Claude API.
Drafting consumes Commit Context. Drafting consumes Telemetry Digest. Drafting yields Article.
Claim Verifying requires Article. Claim Verifying requires Commit Context. Claim Verifying yields
Claim Report.

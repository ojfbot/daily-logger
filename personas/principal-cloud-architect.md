---
slug: principal-cloud-architect
role: Principal Cloud Architect, Enterprise IT (25yr career — oil & gas, chemicals, energy, financial services)
---

# Principal Cloud Architect

## Background

Master class in building things that didn't exist yet inside large organizations. The pattern repeats every 2-3 years: identify a gap nobody else saw → build the thing → prove it works → hand it off → move to the next gap.

Key signature moves: first IT person in a new country operation (built from zero), delivered company's first BYOD network, built two innovation labs at two different companies — physical showrooms of prototype technology where non-technical executives could walk in and immediately understand future technology. First Microsoft Teams Rooms deployment, first private cloud, first SCADA network blueprint.

Also: managed $1.5M capex budgets, evaluated and managed outsourced partners, made explicit build-vs-buy decisions at scale. Worked with HoloLens and spatial computing — has been pitching paradigm shifts to conservative executives his entire career.

His most-cited accomplishments are all physical and immediately demoable. You walk in and see it working. That is the standard.

## Their lens

**Architecture defensibility.** Every design choice needs a written rationale. His professional currency is HLDs, blueprints, design documents. Will probe: why Module Federation over iframes, why single gateway vs per-app APIs, why K8s vs serverless, why Carbon Design System. Zero tolerance for "we just decided that."

**Tangibility wins.** "localhost:4000" is not a demo. Frame must be live at a real URL before any application conversation happens, not after.

**Cost story.** Managed $1.5M capex budgets, made vendor consolidation decisions. Will immediately ask: what does this cost to run and what does it save? The single frame-agent gateway is a cost-control decision — he needs to hear it framed that way explicitly, not discover it buried in a YAML comment.

**Lead with the problem, not the technology.** He won't be skeptical of the concept — he's been pitching paradigm shifts his whole career. He'll be skeptical of weak problem framing.

**Innovation lab lesson.** Don't show products that exist. Show what products can become when composed differently. The 5-minute live demo must make the viewer immediately understand what they're looking at.

## What they typically challenge

- "Where are your ADRs?" — expects written Architecture Decision Records before any design review conversation. Will name specific decisions to probe: Module Federation, single gateway, K8s choice, Carbon.
- "What does this cost at 100 users? At 1000?" — needs the economic argument surfaced, not assumed.
- "Is this live?" — will ask for a URL. If the answer is localhost, the demo isn't ready.
- "What's the handoff plan?" — thinks in phases: build → prove → hand off → next gap. Wants to know what Phase N+1 looks like.
- Will draw analogies from physical infrastructure (datacenters, SCADA, BYOD rollouts) to assess whether the architecture is sound under real load.

## What lands for them

- Honest acknowledgment of what isn't done yet.
- Concrete numbers (commit counts, run numbers, line counts, cost estimates).
- Analogies to enterprise IT patterns they recognize — consolidation, standardization, observable systems.
- Evidence that the demo is live and demoable, not just described.

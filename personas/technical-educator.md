---
slug: technical-educator
role: Staff Engineer & Technical Lead, Platform Infrastructure (10yr career spanning distributed systems, developer tooling, and internal knowledge management at companies from Stripe to mid-stage startups)
---

# Technical Educator

## Background

A technical lead who built their career at the intersection of deep systems knowledge and the ability to make that knowledge transferable. At Stripe they were the person engineers called when they needed to understand how a system worked — not the person who built it, the person who could *explain* it after reading the source. At two startups they were the first platform hire: the person who both built the infrastructure and wrote the runbook, who understood that "undocumented infrastructure is a time bomb set to go off whenever you take a week off."

Deeply believes that architectural decisions only have value if the people maintaining the system understand WHY they were made. Has seen too many codebases where brilliant decisions rotted into unmaintainable debt because the rationale lived only in the original author's head. The antidote is didactic writing — not documentation for its own sake, but explanation that makes the code legible to someone returning cold.

Has taught engineering courses, written technical blog posts that hit the Hacker News front page, and built internal knowledge systems at two companies. Reads technical articles the way a teacher marks student work: watching for the moment where the author skips the step they found obvious.

## Their lens

**The "returning cold" test.** Every explanation gets measured against: "could someone who last touched this code two weeks ago follow this?" Not a junior — a capable engineer who just doesn't have this specific context loaded. If the article would leave them confused, it fails, regardless of how accurate it is.

**Commands over descriptions.** "We added a script to do X" is useless to someone who needs to do X. "Run `pnpm generate:dry` to see what the pipeline produces without writing a file" is actionable. He will flag every description that could have been a command.

**The skipped step.** Technical writers have blind spots — they skip the step they found obvious. He watches specifically for this: the moment where the article jumps from "here's what we decided" to "here's what it does" without explaining the mechanical connection between them. Module Federation is a perfect example — what does "the remote exposes a chunk" actually mean for the person who has to debug a failed load?

**Why/How/When triad.** For every decision in the article: *why* was this chosen? *How* does it actually work mechanically? *When* does this tradeoff become a problem? If any of the three is missing, the decision isn't documented — it's just noted.

**Living documentation.** Articles that describe shipped work are not documentation. Documentation is what you'd hand to someone joining the codebase. This article should be both — a record of what shipped AND a reference someone could use to understand the codebase better.

## What they typically challenge

- "What does this actually mean for someone debugging it?" — will push for the mechanical explanation, not just the design intent.
- "What command do I run?" — will flag every paragraph that describes a runnable action without giving the command.
- "Why not X?" — will probe the alternative that was implicitly rejected. If you chose tool_use over JSON prompting, you need to explain what was wrong with JSON prompting — not just that tool_use is better.
- "What breaks if this assumption is wrong?" — will push for explicit failure mode documentation on every architectural constraint.
- "What's the fastest way to get oriented if I haven't touched this in two weeks?" — will look for the "re-entry path" and flag if it doesn't exist.

## What lands for them

- Specific file paths and line numbers, not just "the config file."
- When the article explains WHY a decision was made in terms of what would have broken with the alternative.
- `> **Why X?**` callout blockquotes that answer the question before the reader has to ask it.
- Suggested actions that are immediately runnable, not just vague directions.
- Honest "gap acknowledged" statements — knowing what's not documented yet is as valuable as the documentation itself.

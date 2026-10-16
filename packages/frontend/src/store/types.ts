// Shared types for the React frontend — mirrors the static JSON API shape
import type { CanonicalAction, ReviewedCanonicalAction } from '../../../../src/action-model.ts'

export interface TypedTag {
  name: string
  type: string
}

export interface CodeReference {
  text: string
  type: 'commit' | 'component' | 'file' | 'package' | 'command' | 'config' | 'env' | 'endpoint' | 'directory'
  repo?: string
  path?: string
  url?: string
  meta?: Record<string, string>
}

export interface DecisionEntry {
  title: string
  summary: string
  repo: string
  pillar?: string
  relatedTags: string[]
}

export type ActionItem = CanonicalAction
export type ReviewedActionItem = ReviewedCanonicalAction

export interface ArticleProvenance {
  schemaVersion: 1
  run:
    | { kind: 'local'; capturedAt: string }
    | {
        kind: 'github-actions'
        capturedAt: string
        runId: string
        runNumber: number
        runAttempt: number
        event: string
        url: string
        workflowRef: string
        sourceSha: string
        actor: string
        scheduleExpression?: string
        timezone?: string
        timing:
          | {
              status: 'available'
              createdAt: string
              startedAt?: string
              expectedAt?: string
              dispatchDelaySeconds?: number
              startDelaySeconds?: number
            }
          | { status: 'unavailable'; reason: string }
      }
  authoring: Array<{
    role: 'draft' | 'synthesis' | 'revision'
    model: string
    promptVersion: string
    promptSha256: string
  }>
  runtime: {
    nodeVersion: string
    packageVersion: string
    runnerOs?: string
    runnerArch?: string
    job?: string
  }
}

export interface EntryData {
  date: string
  title: string
  summary: string
  tags: TypedTag[]
  reposActive: string[]
  commitCount: number
  activityType: string
  schemaVersion: number
  status?: 'draft' | 'accepted' | 'rejected'
  decisions?: DecisionEntry[]
  actions?: ActionItem[]
  codeReferences?: CodeReference[]
  provenance?: ArticleProvenance
}

export interface TagCount {
  name: string
  type: string
  count: number
}

export interface RepoStats {
  name: string
  articleCount: number
  totalCommits: number
  relatedTags: string[]
}

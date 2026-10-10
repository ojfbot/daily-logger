import type { ArticleProvenance } from '../store/types.ts'
import type { ReactNode } from 'react'

interface ArticleProvenanceDetailsProps {
  provenance?: ArticleProvenance
  viewerLogin: string
}

function formatDelay(seconds: number | undefined): string {
  if (seconds === undefined) return 'Not captured'
  const sign = seconds < 0 ? '-' : ''
  const absolute = Math.abs(seconds)
  const hours = Math.floor(absolute / 3600)
  const minutes = Math.floor((absolute % 3600) / 60)
  const remainder = absolute % 60
  return `${sign}${hours}h ${minutes}m ${remainder}s`
}

function EvidenceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="provenance-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export function ArticleProvenanceDetails({
  provenance,
  viewerLogin,
}: ArticleProvenanceDetailsProps) {
  if (!provenance) return null

  const responsible = provenance.authoring.at(-1)
  const run = provenance.run

  return (
    <details className="article-provenance">
      <summary>
        <span>Run evidence</span>
        <span className="provenance-access">authenticated as @{viewerLogin}</span>
      </summary>
      <dl>
        {run.kind === 'github-actions' ? (
          <>
            <EvidenceRow label="Source run">
              <a href={run.url} target="_blank" rel="noreferrer">
                GitHub Actions #{run.runNumber}, attempt {run.runAttempt}
              </a>
            </EvidenceRow>
            <EvidenceRow label="Event"><code>{run.event}</code></EvidenceRow>
            <EvidenceRow label="Source commit"><code>{run.sourceSha.slice(0, 12)}</code></EvidenceRow>
            <EvidenceRow label="Actor"><code>{run.actor}</code></EvidenceRow>
            {run.scheduleExpression && run.timezone && (
              <EvidenceRow label="Target schedule">
                <code>{run.scheduleExpression}</code> in <code>{run.timezone}</code>
              </EvidenceRow>
            )}
            {run.timing.status === 'available' ? (
              <>
                {run.timing.expectedAt && (
                  <EvidenceRow label="Expected dispatch"><time dateTime={run.timing.expectedAt}>{run.timing.expectedAt}</time></EvidenceRow>
                )}
                <EvidenceRow label="Run created"><time dateTime={run.timing.createdAt}>{run.timing.createdAt}</time></EvidenceRow>
                {run.timing.startedAt && (
                  <EvidenceRow label="Run started"><time dateTime={run.timing.startedAt}>{run.timing.startedAt}</time></EvidenceRow>
                )}
                <EvidenceRow label="Dispatch delay">{formatDelay(run.timing.dispatchDelaySeconds)}</EvidenceRow>
                <EvidenceRow label="Run start delay">{formatDelay(run.timing.startDelaySeconds)}</EvidenceRow>
              </>
            ) : (
              <EvidenceRow label="Timing capture">Partial: <code>{run.timing.reason}</code></EvidenceRow>
            )}
          </>
        ) : (
          <EvidenceRow label="Source run">Local capture at <time dateTime={run.capturedAt}>{run.capturedAt}</time></EvidenceRow>
        )}
        {responsible && (
          <>
            <EvidenceRow label="Responsible stage"><code>{responsible.role}</code></EvidenceRow>
            <EvidenceRow label="Authoring model"><code>{responsible.model}</code></EvidenceRow>
            <EvidenceRow label="Prompt version"><code>{responsible.promptVersion}</code></EvidenceRow>
            <EvidenceRow label="Prompt SHA-256"><code>{responsible.promptSha256}</code></EvidenceRow>
          </>
        )}
        <EvidenceRow label="Runtime">
          <code>daily-logger@{provenance.runtime.packageVersion}</code> on <code>{provenance.runtime.nodeVersion}</code>
          {provenance.runtime.runnerOs && <> · <code>{provenance.runtime.runnerOs}</code></>}
          {provenance.runtime.runnerArch && <>/<code>{provenance.runtime.runnerArch}</code></>}
          {provenance.runtime.job && <> · job <code>{provenance.runtime.job}</code></>}
        </EvidenceRow>
      </dl>
    </details>
  )
}

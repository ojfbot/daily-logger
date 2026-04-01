import { useRef, useState, useCallback } from 'react'
import { useMetrics } from '../hooks/useMetrics.ts'
import { MetricPopover } from './MetricPopover.tsx'
import type { MetricCardData } from '../hooks/useMetrics.ts'
import type { EntryData, RepoStats, ActionItem } from '../store/types.ts'

function MetricCard({ data }: { data: MetricCardData }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onEnter = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current)
    setHovered(true)
  }, [])

  const onLeave = useCallback(() => {
    timeout.current = setTimeout(() => setHovered(false), 100)
  }, [])

  return (
    <div
      ref={ref}
      className="metric-cell"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="metric-value">{data.value}</div>
      <div className="metric-label">{data.label}</div>
      <MetricPopover
        visible={hovered}
        anchor={ref.current}
        sections={data.popover}
      />
    </div>
  )
}

interface Props {
  entries: EntryData[]
  repos: RepoStats[]
  actions: ActionItem[]
  doneActions: ActionItem[]
}

export function MetricsBar({ entries, repos, actions, doneActions }: Props) {
  const metrics = useMetrics(entries, repos, actions, doneActions)

  return (
    <div className="metrics-bar">
      {metrics.map((m) => (
        <MetricCard key={m.label} data={m} />
      ))}
    </div>
  )
}

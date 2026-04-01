import { useRef, useState, useCallback } from 'react'
import { useMetrics } from '../hooks/useMetrics.ts'
import { MetricPopover } from './MetricPopover.tsx'
import type { MetricCardData } from '../hooks/useMetrics.ts'
import type { EntryData, RepoStats, ActionItem } from '../store/types.ts'

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const w = 100
  const h = 28
  const max = Math.max(...points, 1)
  const coords = points
    .map((v, i) => `${(i / (points.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ')

  return (
    <svg className="metric-sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function MetricCard({ data }: { data: MetricCardData }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout>>(null)

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

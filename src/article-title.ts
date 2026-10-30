/** The dated article closes at 03:30 Chicago; its workday is the preceding calendar date. */
export function reportingWorkdayWeekday(articleDate: string): string {
  const endDate = new Date(`${articleDate}T12:00:00Z`)
  if (Number.isNaN(endDate.getTime()) || endDate.toISOString().slice(0, 10) !== articleDate) {
    throw new Error(`Invalid article date: ${articleDate}`)
  }
  endDate.setUTCDate(endDate.getUTCDate() - 1)
  return endDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
}

/** Replace only explicit weekday labels; prose about another day retains its meaning. */
export function titleWithReportingWeekday(articleDate: string, title: string): string {
  const weekday = reportingWorkdayWeekday(articleDate)
  const [, year, , day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(articleDate)!
  const monthName = new Date(`${articleDate}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  const runDatePrefix = new RegExp(`^(?:${articleDate}|${monthName}\\s+${Number(day)}(?:st|nd|rd|th)?(?:,?\\s+${year})?)\\s*[:—–-]\\s*`, 'i')
  const trimmed = title.trim().replace(runDatePrefix, '').trim()
  const existingLabel = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?=\s*[:—–-]\s+)/i.exec(trimmed)
  if (existingLabel) return weekday + trimmed.slice(existingLabel[0].length)
  if (trimmed.startsWith(`${weekday}'s `) || trimmed.startsWith(`${weekday}’s `)) return trimmed
  return `${weekday} — ${trimmed}`
}

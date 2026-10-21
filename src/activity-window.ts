const HOUR_MS = 60 * 60 * 1000
const chicagoHour = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', hour: '2-digit', hourCycle: 'h23',
})
const chicagoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function currentArticleDate(now = new Date()): string {
  return chicagoDate.format(now)
}

export interface ActivityWindow {
  start: number
  end: number
}

function calendarDay(date: string): Date {
  const day = new Date(`${date}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) {
    throw new Error('Article date must be a valid YYYY-MM-DD calendar date')
  }
  return day
}

function cutoff(day: Date): number {
  // Chicago's 03:30 is after either DST transition. The offset at noon UTC
  // therefore also applies to that day's cutoff, including 23/25-hour days.
  const offsetHours = Number(chicagoHour.format(day)) - 12
  return Date.parse(`${day.toISOString().slice(0, 10)}T03:30:00Z`) - offsetHours * HOUR_MS
}

export function activityWindow(date: string, days = 1): ActivityWindow {
  if (!Number.isInteger(days) || days < 1) throw new Error('Reporting periods must be a positive integer')
  const day = calendarDay(date)
  const end = cutoff(day)
  day.setUTCDate(day.getUTCDate() - days)
  return { start: cutoff(day), end }
}

export function occurredInWindow(timestamp: string | null | undefined, window: ActivityWindow): boolean {
  if (!timestamp) return false
  const time = Date.parse(timestamp)
  return Number.isFinite(time) && time >= window.start && time < window.end
}

export function describeActivityWindow(date: string): string {
  const window = activityWindow(date)
  const hours = (window.end - window.start) / HOUR_MS
  return `Reporting interval: ${new Date(window.start).toISOString()} inclusive to ${new Date(window.end).toISOString()} exclusive. Consecutive 03:30 America/Chicago cutoffs; ${hours} elapsed hours. This is not a calendar day.`
}

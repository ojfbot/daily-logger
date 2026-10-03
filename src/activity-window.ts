const DAY_MS = 24 * 60 * 60 * 1000

export function activityWindow(date: string): { start: number; end: number } {
  const end = new Date(`${date}T09:00:00Z`).getTime()
  return { start: end - DAY_MS, end }
}

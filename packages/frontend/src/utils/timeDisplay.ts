export interface ClockDisplay {
  date: string
  clock: string
  zone: string
  offsetMinutes: number
  source: 'iana' | 'device-offset' | 'utc'
}

export function utcClock(at: Date, precision: 'minute' | 'second'): ClockDisplay {
  const iso = at.toISOString()
  return { date: iso.slice(0, 10), clock: iso.slice(11, precision === 'minute' ? 16 : 19), zone: 'UTC', offsetMinutes: 0, source: 'utc' }
}

/** ECMA-402 resolves the device's IANA zone locally; evaluate its rules at the event, not today. */
export function viewerClock(at: Date, precision: 'minute' | 'second', timeZone?: string): ClockDisplay {
  try {
    const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!zone) throw new RangeError('No IANA time zone')
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, calendar: 'gregory', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(at)
    const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === name)?.value ?? ''
    const date = `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`
    const seconds = `${part('hour')}:${part('minute')}:${part('second')}`
    const wallClock = Date.parse(`${date}T${seconds}Z`)
    if (!Number.isFinite(wallClock)) throw new RangeError('Unavailable time zone formatting')
    const offsetMinutes = Math.round((wallClock - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
    return { date, clock: seconds.slice(0, precision === 'minute' ? 5 : 8), zone, offsetMinutes, source: 'iana' }
  } catch {
    const offsetMinutes = -at.getTimezoneOffset()
    if (!Number.isFinite(offsetMinutes)) return utcClock(at, precision)
    const shifted = utcClock(new Date(at.getTime() + offsetMinutes * 60_000), precision)
    return { ...shifted, zone: 'Device time zone', offsetMinutes, source: 'device-offset' }
  }
}

export function offsetLabel(minutes: number): string {
  const absolute = Math.abs(minutes)
  return `UTC${minutes < 0 ? '−' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}

export function offsetLongitude(minutes: number): number {
  return ((minutes / 4 + 180) % 360 + 360) % 360 - 180
}

const RAD = Math.PI / 180

/** NOAA General Solar Position Calculations, fractional-year approximation (geometric horizon).
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 * UTC inputs avoid browser-zone dependence. This illustration omits refraction and twilight.
 */
export function solarPosition(at: Date): { declination: number; longitude: number } {
  const year = at.getUTCFullYear()
  const day = Math.floor((at.getTime() - Date.UTC(year, 0, 1)) / 86_400_000) + 1
  const daysInYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365
  const hour = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600
  const gamma = 2 * Math.PI / daysInYear * (day - 1 + (hour - 12) / 24)
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma))
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma)
  const longitude = ((180 - hour * 15 - equationOfTime / 4 + 180) % 360 + 360) % 360 - 180
  return { declination, longitude }
}

export function solarAltitude(latitude: number, longitude: number, sun: ReturnType<typeof solarPosition>): number {
  return Math.asin(Math.sin(latitude * RAD) * Math.sin(sun.declination)
    + Math.cos(latitude * RAD) * Math.cos(sun.declination) * Math.cos((longitude - sun.longitude) * RAD)) / RAD
}

/** Equirectangular 360×180 projection. Solve surface-normal · sun = 0 at each meridian. */
export function nightPath(sun: ReturnType<typeof solarPosition>): string {
  if (Math.abs(Math.sin(sun.declination)) < 1e-10) {
    // At exact equinox the boundary is vertical; split at the map seam.
    return Array.from({ length: 360 }, (_, x) => solarAltitude(0, x - 179.5, sun) < 0 ? `M${x},0h1v180h-1Z` : '').join('')
  }
  const boundary: string[] = []
  for (let longitude = -180; longitude <= 180; longitude += 1) {
    const latitude = Math.atan(-Math.cos(sun.declination) * Math.cos((longitude - sun.longitude) * RAD) / Math.sin(sun.declination)) / RAD
    boundary.push(`${longitude + 180},${(90 - latitude).toFixed(3)}`)
  }
  const poleY = sun.declination > 0 ? 180 : 0
  return `M${boundary.join('L')}L360,${poleY}L0,${poleY}Z`
}

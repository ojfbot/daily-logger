import type { TimeReference } from '../../../../src/time-reference-schema.ts'
import { nightPath, offsetLabel, offsetLongitude, solarPosition, utcClock, type ClockDisplay } from '../utils/timeDisplay.ts'
import { WORLD_LAND_PATH } from '../utils/worldLand.ts'

export function TimePopoverContent({ reference, viewer }: { reference: TimeReference; viewer: ClockDisplay }) {
  const at = new Date(reference.at)
  const utc = utcClock(at, reference.precision)
  const sun = solarPosition(at)
  const sameMeridian = viewer.offsetMinutes === 0
  const utcX = sameMeridian ? 178 : 180
  const viewerX = sameMeridian ? 182 : offsetLongitude(viewer.offsetMinutes) + 180

  return <>
    <div className="time-popover-heading">The same moment, two clocks</div>
    <svg className="time-world-map" viewBox="0 0 360 180" role="img" aria-label={`World day and night at ${viewer.date} ${viewer.clock} in ${viewer.zone} (${offsetLabel(viewer.offsetMinutes)}). Solid blue marks your time zone's UTC offset; dashed amber marks Greenwich (UTC).`}>
      <rect width="360" height="180" className="time-map-ocean" />
      <path d={WORLD_LAND_PATH} className="time-map-land" />
      <path d="M0,45H360M0,90H360M0,135H360M90,0V180M180,0V180M270,0V180" className="time-map-grid" />
      <path d={nightPath(sun)} className="time-map-night" />
      <line x1={utcX} x2={utcX} y1="0" y2="180" className="time-map-utc" />
      <line x1={viewerX} x2={viewerX} y1="0" y2="180" className="time-map-viewer" />
      {viewerX === 0 && <line x1="360" x2="360" y1="0" y2="180" className="time-map-viewer" />}
      <circle cx={sun.longitude + 180} cy={90 - sun.declination * 180 / Math.PI} r="3" className="time-map-sun" />
      <text x="8" y="172" className="time-map-label">180°W</text>
      <text x="180" y="172" textAnchor="middle" className="time-map-label">0°</text>
      <text x="352" y="172" textAnchor="end" className="time-map-label">180°E</text>
    </svg>
    <div className="time-clock time-clock-viewer">
      <span className="time-clock-label"><i aria-hidden="true" />{viewer.source === 'utc' ? 'UTC fallback' : 'Your time'} <span>{offsetLabel(viewer.offsetMinutes)}</span></span>
      <span className="time-clock-value"><time dateTime={reference.at}>{viewer.clock}</time><span>{viewer.date}</span></span>
      <span className="time-clock-zone">{viewer.source === 'iana' ? `Device time zone: ${viewer.zone}` : viewer.zone}</span>
    </div>
    <div className="time-clock time-clock-utc">
      <span className="time-clock-label"><i aria-hidden="true" />Zulu / UTC <span>{offsetLabel(0)}</span></span>
      <span className="time-clock-value"><time dateTime={reference.at}>{utc.clock}</time><span>{utc.date}</span></span>
    </div>
    <p className="time-popover-note">{sameMeridian ? 'Both clocks share Greenwich; the lines are separated for clarity. ' : ''}Blue shows your clock’s UTC offset, not your location. Shading shows approximate night.</p>
    {viewer.source === 'device-offset' && <p className="time-popover-note">Using the device’s offset at this moment; its time zone name is unavailable.</p>}
    {viewer.source === 'utc' && <p className="time-popover-note">The device’s time zone and offset are unavailable. Showing UTC.</p>}
  </>
}

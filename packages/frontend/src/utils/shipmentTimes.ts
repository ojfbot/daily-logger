import type { ShipmentTime } from '../../../../src/shipment-times.ts'
import type { TimeReference } from '../../../../src/time-reference-schema.ts'

function shipmentLinks(root: HTMLElement): HTMLAnchorElement[] {
  const links: HTMLAnchorElement[] = []
  const headings = [...root.querySelectorAll('h2')].filter((item) => item.textContent?.trim().toLowerCase() === 'what shipped')
  for (const heading of headings) {
    for (let node = heading.nextElementSibling; node && node.tagName !== 'H2'; node = node.nextElementSibling) {
      if (node instanceof HTMLAnchorElement) links.push(node)
      links.push(...node.querySelectorAll<HTMLAnchorElement>('a[href]'))
    }
  }
  return links
}

function canonicalPullUrl(value: string): string | undefined {
  let parsed: URL
  try { parsed = new URL(value) } catch { return undefined }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com' || parsed.port || parsed.username || parsed.password) return undefined
  const [owner, name, kind, ref] = parsed.pathname.split('/').filter(Boolean)
  if (!owner || !name || kind?.toLowerCase() !== 'pull' || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name) || !/^[1-9]\d*$/.test(ref ?? '')) return undefined
  return `https://github.com/${owner}/${name}/pull/${ref}`
}

export function shipmentTimeReference(time: Extract<ShipmentTime, { status: 'available' }>): TimeReference {
  const text = `${time.at.slice(11, 16)}Z`
  return {
    text,
    occurrence: 0,
    at: time.at,
    precision: 'minute',
    evidence: { kind: 'github-pull-request', repo: time.source.repo, ref: time.source.ref, event: 'merged', url: time.source.url },
  }
}

/** Attach code-owned merge-time states beside the first occurrence across every What shipped section. */
export function attachShipmentTimes(root: HTMLElement, shipmentTimes: ShipmentTime[]) {
  const byUrl = new Map(shipmentTimes.map((time) => [time.source.url, time]))
  const seen = new Set<string>()
  const inserted: HTMLElement[] = []
  const attached: Array<{ element: HTMLButtonElement; reference: TimeReference }> = []
  const unavailable: HTMLElement[] = []
  for (const link of shipmentLinks(root)) {
    const url = canonicalPullUrl(link.href)
    if (!url) continue
    const shipment = byUrl.get(url)
    if (!shipment || seen.has(url)) continue
    seen.add(url)
    const existing = link.nextElementSibling
    if (existing instanceof HTMLElement && existing.classList.contains('shipment-time-state') && existing.dataset.shipmentUrl === url) {
      if (shipment.status === 'available') {
        const button = existing.querySelector<HTMLButtonElement>('.shipment-time-ref')
        if (button) attached.push({ element: button, reference: shipmentTimeReference(shipment) })
      } else unavailable.push(existing)
      continue
    }
    const state = document.createElement('span')
    state.className = 'shipment-time-state'
    state.dataset.articleDecoration = 'shipment-time'
    state.dataset.shipmentUrl = url
    state.append(' · ')
    if (shipment.status === 'available') {
      const timeReference = shipmentTimeReference(shipment)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'time-ref shipment-time-ref'
      button.setAttribute('aria-label', `Merged at ${timeReference.text}; show UTC and your local time`)
      button.setAttribute('aria-expanded', 'false')
      button.append('merged ')
      const time = document.createElement('time')
      time.dateTime = shipment.at
      time.textContent = timeReference.text
      button.append(time)
      state.append(button)
      attached.push({ element: button, reference: timeReference })
    } else {
      state.classList.add('shipment-time-unavailable')
      state.dataset.reason = shipment.reason
      state.textContent += 'timestamp unavailable'
      state.setAttribute('aria-label', `Merge timestamp unavailable for ${shipment.source.repo} pull request ${shipment.source.ref}`)
      unavailable.push(state)
    }
    link.insertAdjacentElement('afterend', state)
    inserted.push(state)
  }
  return { attached, unavailable, restore: () => inserted.forEach((element) => element.remove()) }
}

/** Produce stable article HTML so React rerenders cannot discard code-owned shipment controls. */
export function decorateShipmentTimesHtml(bodyHtml: string, shipmentTimes: ShipmentTime[]): string {
  if (!shipmentTimes.length) return bodyHtml
  const root = document.createElement('div')
  root.innerHTML = bodyHtml
  attachShipmentTimes(root, shipmentTimes)
  return root.innerHTML
}

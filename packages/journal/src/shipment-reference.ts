const REPO = /^[A-Za-z0-9_.-]+$/

/** Model shipment references may be a number, #number, or that repo's canonical PR URL. */
export function shipmentPrNumber(value: string, repo: string): string | undefined {
  if (!REPO.test(repo)) return undefined
  const bare = /^#?([1-9]\d*)$/.exec(value)
  if (bare) return bare[1]
  const url = /^https:\/\/github\.com\/ojfbot\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)$/.exec(value)
  return url?.[1].toLowerCase() === repo.toLowerCase() ? url[2] : undefined
}


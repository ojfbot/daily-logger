import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from './hooks.ts'
import { setFiltersFromHash } from './filterSlice.ts'

export function parseFilterHash(hash: string): Record<string, string[]> {
  if (!hash || hash === '#') return {}
  const result: Record<string, string[]> = {}
  const params = hash.replace(/^#/, '').split('&').filter(Boolean)
  for (const param of params) {
    const [type, valuesStr] = param.split('=')
    if (!type || !valuesStr) continue
    const values = valuesStr.split(',').map(decodeURIComponent).filter(Boolean)
    if (values.length > 0) result[type] = values
  }
  return result
}

export function serializeFilterHash(active: Record<string, string[]>): string {
  const parts = Object.entries(active)
    .filter(([, values]) => values.length > 0)
    .map(([type, values]) => `${type}=${values.map(encodeURIComponent).join(',')}`)
  return parts.length > 0 ? `#${parts.join('&')}` : ''
}

export function useFilterHashSync() {
  const dispatch = useAppDispatch()
  const active = useAppSelector((s) => s.filters.active)
  const isInternalUpdate = useRef(false)

  // Load from hash on mount
  useEffect(() => {
    const parsed = parseFilterHash(window.location.hash)
    if (Object.keys(parsed).length > 0) {
      isInternalUpdate.current = true
      dispatch(setFiltersFromHash(parsed))
    }
  }, [dispatch])

  // Sync state → hash
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false
      return
    }
    const hash = serializeFilterHash(active)
    if (hash) {
      history.replaceState(null, '', hash)
    } else if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [active])

  // Listen for external hash changes
  useEffect(() => {
    function onHashChange() {
      isInternalUpdate.current = true
      dispatch(setFiltersFromHash(parseFilterHash(window.location.hash)))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [dispatch])
}

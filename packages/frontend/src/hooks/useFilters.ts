import { useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { toggleFilter as toggleFilterAction, clearFilters as clearFiltersAction } from '../store/filterSlice.ts'
import type { EntryData } from '../store/types.ts'

export function useFilters() {
  const dispatch = useAppDispatch()
  const active = useAppSelector((s) => s.filters.active)

  const toggleFilter = useCallback((type: string, name: string) => {
    dispatch(toggleFilterAction({ type, name }))
  }, [dispatch])

  const clearFilters = useCallback(() => {
    dispatch(clearFiltersAction())
  }, [dispatch])

  const isFilterActive = useCallback((type: string, name: string) => {
    return active[type]?.includes(name) ?? false
  }, [active])

  const hasActiveFilters = useCallback(() => {
    return Object.keys(active).length > 0
  }, [active])

  const matchesFilters = useCallback((entry: EntryData) => {
    if (Object.keys(active).length === 0) return true
    return Object.entries(active).every(([type, values]) => {
      // For repo-type filters, also check reposActive
      if (type === 'repo') {
        const entryRepoNames = [
          ...entry.tags.filter((t) => t.type === 'repo').map((t) => t.name),
          ...(entry.reposActive ?? []),
        ]
        return values.some((v) => entryRepoNames.includes(v))
      }
      return values.some((v) => entry.tags.some((t) => t.type === type && t.name === v))
    })
  }, [active])

  return { active, toggleFilter, clearFilters, isFilterActive, hasActiveFilters, matchesFilters }
}

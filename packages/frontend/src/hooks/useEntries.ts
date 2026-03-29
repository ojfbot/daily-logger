import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { fetchEntries, fetchTags, fetchRepos, fetchActions, fetchDoneActions } from '../store/articlesSlice.ts'

export function useEntries() {
  const dispatch = useAppDispatch()
  const { entries, tags, repos, actions, doneActions, loading, error } = useAppSelector((s) => s.articles)

  useEffect(() => {
    if (entries.length === 0 && !loading) {
      dispatch(fetchEntries())
      dispatch(fetchTags())
      dispatch(fetchRepos())
      dispatch(fetchActions())
      dispatch(fetchDoneActions())
    }
  }, [dispatch, entries.length, loading])

  return { entries, tags, repos, actions, doneActions, loading, error }
}

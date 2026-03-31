import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useTheme } from './hooks/useTheme.ts'
import { useFilterHashSync } from './store/filterHashSync.ts'
import { useAppDispatch } from './store/hooks.ts'
import { checkAuth } from './store/authSlice.ts'
import { Layout } from './components/Layout.tsx'
import { IndexPage } from './components/IndexPage.tsx'
import { ArticlePage } from './components/ArticlePage.tsx'
import { DecisionsPage } from './components/DecisionsPage.tsx'
import { ActionsPage } from './components/ActionsPage.tsx'
import { RepoDetailPage } from './components/RepoDetailPage.tsx'

export function App() {
  const dispatch = useAppDispatch()
  useTheme()
  useFilterHashSync()

  // Check authentication state on mount
  useEffect(() => { dispatch(checkAuth()) }, [dispatch])

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route path="/articles/:date" element={<ArticlePage />} />
        <Route path="/decisions" element={<DecisionsPage />} />
        <Route path="/actions" element={<ActionsPage />} />
        <Route path="/repo/:name" element={<RepoDetailPage />} />
      </Routes>
    </Layout>
  )
}

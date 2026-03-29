import { type ReactNode, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { toggleTheme } from '../store/themeSlice.ts'
import { SearchOverlay } from './SearchOverlay.tsx'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const dispatch = useAppDispatch()
  const theme = useAppSelector((s) => s.theme.mode)
  const [searchOpen, setSearchOpen] = useState(false)

  const closeSearch = useCallback(() => setSearchOpen(false), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="dashboard-layout">
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="site-title">daily-logger</Link>
          <nav className="header-nav">
            <Link to="/">Index</Link>
            <Link to="/decisions">Decisions</Link>
            <Link to="/actions">Actions</Link>
            <button
              className="search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
            >
              Search
            </button>
            <button
              className="theme-toggle"
              onClick={() => dispatch(toggleTheme())}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </nav>
        </div>
      </header>
      <main className="site-main">
        {children}
      </main>
      <SearchOverlay open={searchOpen} onClose={closeSearch} />
    </div>
  )
}

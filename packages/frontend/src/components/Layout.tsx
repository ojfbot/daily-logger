import { type ReactNode, useState, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
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
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  const closeSearch = useCallback(() => setSearchOpen(false), [])

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

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

  const isActive = (path: string) => location.pathname === path || location.pathname === path + '/'

  return (
    <>
      <header className="site-header">
        <Link to="/" className="site-title">ojfbot/dev-log</Link>
        <button
          className="nav-toggle"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? '\u2715' : '\u2630'}
        </button>
        <nav className={menuOpen ? 'site-nav open' : 'site-nav'}>
          <Link to="/" className={isActive('/') ? 'active' : ''}>Index</Link>
          <Link to="/decisions" className={isActive('/decisions') ? 'active' : ''}>Decisions</Link>
          <Link to="/actions" className={isActive('/actions') ? 'active' : ''}>Actions</Link>
          <button
            className="theme-toggle"
            onClick={() => dispatch(toggleTheme())}
          >
            {theme === 'dark' ? 'LIGHT' : 'DARK'}
          </button>
        </nav>
      </header>
      <div className="container">
        {children}
      </div>
      <footer className="site-footer">
        <a href="https://github.com/ojfbot/daily-logger">ojfbot/daily-logger</a> — self-documenting development system
      </footer>
      <SearchOverlay open={searchOpen} onClose={closeSearch} />
    </>
  )
}

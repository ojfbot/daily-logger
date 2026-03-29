import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEntries } from '../hooks/useEntries.ts'
import type { EntryData } from '../store/types.ts'

function searchEntries(entries: EntryData[], query: string): EntryData[] {
  if (!query.trim()) return entries.slice(0, 5)
  const terms = query.toLowerCase().split(/\s+/)
  return entries.filter((e) => {
    const haystack = `${e.title} ${e.summary} ${e.tags.map((t) => t.name).join(' ')} ${e.reposActive.join(' ')} ${(e.decisions ?? []).map(d => d.title).join(' ')}`.toLowerCase()
    return terms.every((t) => haystack.includes(t))
  }).slice(0, 10)
}

interface Props {
  open: boolean
  onClose: () => void
}

export function SearchOverlay({ open, onClose }: Props) {
  const { entries } = useEntries()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const results = useMemo(() => searchEntries(entries, query), [entries, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function handleSelect(date: string) {
    onClose()
    navigate(`/articles/${date}`)
  }

  return (
    <div className="search-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="search-box">
        <input
          ref={inputRef}
          type="search"
          className="search-input"
          placeholder="Search articles..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="search-results">
          {results.length === 0 && query.trim() && (
            <div className="search-empty">No results found.</div>
          )}
          {results.map((e) => (
            <button
              key={e.date}
              className="search-result"
              onClick={() => handleSelect(e.date)}
            >
              <span className="search-result-date">{e.date}</span>
              <span className="search-result-title">{e.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useEntries } from '../hooks/useEntries.ts'
import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { fetchArticle } from '../store/articlesSlice.ts'
import { useArticlePopovers } from '../hooks/useArticlePopovers.ts'
import { Popover } from './Popover.tsx'

export function ArticlePage() {
  const { date } = useParams<{ date: string }>()
  const { entries } = useEntries()
  const dispatch = useAppDispatch()
  const { articleCache, articleLoading } = useAppSelector((s) => s.articles)
  const contentRef = useRef<HTMLDivElement>(null)

  const entry = entries.find((e) => e.date === date)
  const article = date ? articleCache[date] : undefined

  useEffect(() => {
    if (date && !articleCache[date]) {
      dispatch(fetchArticle(date))
    }
  }, [date, articleCache, dispatch])

  const codeReferences = article?.codeReferences ?? entry?.codeReferences ?? []
  const reposActive = article?.reposActive ?? entry?.reposActive ?? []

  const popoverState = useArticlePopovers(contentRef, codeReferences, reposActive)

  const displayEntry = article ?? entry

  // Related articles (share 2+ tags)
  const related = useMemo(() => {
    if (!displayEntry) return []
    const tagNames = new Set(displayEntry.tags.map((t) => t.name))
    return entries
      .filter((e) => e.date !== date)
      .map((e) => ({
        ...e,
        overlap: e.tags.filter((t) => tagNames.has(t.name)).length,
      }))
      .filter((e) => e.overlap >= 2)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 5)
  }, [displayEntry, entries, date])

  if (articleLoading && !article) return <div className="loading">Loading article...</div>

  return (
    <>
      {displayEntry && (
        <div className="article-header">
          <div className="entry-date">{displayEntry.date}</div>
          <h1 className="article-title">{displayEntry.title}</h1>
          <div className="article-meta">
            <div className="entry-tags">
              {displayEntry.tags.map((t) => (
                <span key={t.name} className="tag">{t.name}</span>
              ))}
            </div>
          </div>
          <p className="entry-summary">{displayEntry.summary}</p>
        </div>
      )}

      {article?.bodyHtml ? (
        <article
          ref={contentRef}
          className="article-content"
          dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
        />
      ) : (
        !articleLoading && <article className="article-content"><p>Article not found.</p></article>
      )}

      <Popover state={popoverState} />

      {related.length > 0 && (
        <div className="related-articles related-section">
          <div className="related-heading">RELATED ARTICLES</div>
          {related.map((e) => (
            <div key={e.date} className="related-item">
              <Link to={`/articles/${e.date}`}>{e.date} — {e.title}</Link>
              <span className="entry-stat">{e.overlap} shared tags</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

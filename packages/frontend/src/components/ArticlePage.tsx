import { useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useParams, Link } from 'react-router-dom'
import { useEntries } from '../hooks/useEntries.ts'
import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { fetchArticle } from '../store/articlesSlice.ts'
import { useArticlePopovers } from '../hooks/useArticlePopovers.ts'
import { useSectionContent } from '../hooks/useSectionContent.ts'
import { Popover } from './Popover.tsx'
import { ChatSidebar } from './ChatSidebar.tsx'
import { SectionChatButton } from './SectionChatButton.tsx'

export function ArticlePage() {
  const { date } = useParams<{ date: string }>()
  const { entries } = useEntries()
  const dispatch = useAppDispatch()
  const { articleCache, articleLoading } = useAppSelector((s) => s.articles)
  const activeSection = useAppSelector((s) => s.chat.activeSection)
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
  const { extractSection } = useSectionContent(contentRef)

  const displayEntry = article ?? entry

  // Inject chat buttons next to h2 headings after article renders
  useEffect(() => {
    const container = contentRef.current
    if (!container || !date) return

    const h2s = container.querySelectorAll('h2')
    const wrappers: HTMLSpanElement[] = []

    for (const h2 of h2s) {
      // Skip if already has a chat button wrapper
      if (h2.querySelector('.section-chat-wrapper')) continue

      const wrapper = document.createElement('span')
      wrapper.className = 'section-chat-wrapper'
      h2.style.position = 'relative'
      h2.appendChild(wrapper)
      wrappers.push(wrapper)
    }

    return () => {
      for (const w of wrappers) w.remove()
    }
  }, [article?.bodyHtml, date])

  // Render chat buttons into the wrapper spans via portals
  const chatButtonPortals = useMemo(() => {
    const container = contentRef.current
    if (!container || !date) return null

    const wrappers = container.querySelectorAll('.section-chat-wrapper')
    const portals: React.ReactPortal[] = []

    for (const wrapper of wrappers) {
      const h2 = wrapper.parentElement
      const heading = h2?.textContent?.replace('›', '').trim()
      if (!heading) continue

      portals.push(
        createPortal(
          <SectionChatButton section={heading} date={date} />,
          wrapper,
          `chat-btn-${heading}`,
        ),
      )
    }

    return portals
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.bodyHtml, date, activeSection])

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

  const handleExtractSection = useCallback(
    (heading: string) => extractSection(heading),
    [extractSection],
  )

  if (articleLoading && !article) return <div className="loading">Loading article...</div>

  return (
    <>
      {displayEntry && (
        <div className="article-header">
          <div className="entry-date">
            {displayEntry.date}
            {displayEntry.status && displayEntry.status !== 'accepted' && (
              <span className={`article-status status-${displayEntry.status}`}>
                {displayEntry.status.toUpperCase()}
              </span>
            )}
          </div>
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

      <div className={`article-layout ${activeSection ? 'chat-open' : ''}`}>
        <div className="article-main">
          {article?.bodyHtml ? (
            <article
              ref={contentRef}
              className="article-content"
              dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
            />
          ) : (
            !articleLoading && <article className="article-content"><p>Article not found.</p></article>
          )}

          {chatButtonPortals}

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
        </div>

        <ChatSidebar
          articleTitle={displayEntry?.title ?? ''}
          extractSection={handleExtractSection}
        />
      </div>
    </>
  )
}

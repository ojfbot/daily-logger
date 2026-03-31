import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, Link } from 'react-router-dom'
import { useEntries } from '../hooks/useEntries.ts'
import { useIsMobile } from '../hooks/useIsMobile.ts'
import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { fetchArticle } from '../store/articlesSlice.ts'
import { useArticlePopovers } from '../hooks/useArticlePopovers.ts'
import { useSectionContent } from '../hooks/useSectionContent.ts'
import { Popover } from './Popover.tsx'
import { SectionChatButton } from './SectionChatButton.tsx'
import { SectionChatZone } from './SectionChatZone.tsx'
import { EditorialSidebar } from './EditorialSidebar.tsx'
import { SubmitAllFeedback } from './SubmitAllFeedback.tsx'

export function ArticlePage() {
  const { date } = useParams<{ date: string }>()
  const { entries } = useEntries()
  const dispatch = useAppDispatch()
  const { articleCache, articleLoading } = useAppSelector((s) => s.articles)
  const { threads, threadOrder } = useAppSelector((s) => s.chat)
  const contentRef = useRef<HTMLDivElement>(null)
  const [sectionHeadings, setSectionHeadings] = useState<string[]>([])
  const isMobile = useIsMobile()

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

  // Inject chat buttons into h2 headings + section-end portal targets for inline threads
  useEffect(() => {
    const container = contentRef.current
    if (!container || !date) return

    const h2s = Array.from(container.querySelectorAll('h2'))
    const injected: HTMLElement[] = []
    const headings: string[] = []

    for (let i = 0; i < h2s.length; i++) {
      const h2 = h2s[i]
      if (h2.querySelector('.section-chat-wrapper')) continue

      // Button wrapper inside h2
      const btnWrapper = document.createElement('span')
      btnWrapper.className = 'section-chat-wrapper'
      h2.appendChild(btnWrapper)
      injected.push(btnWrapper)

      const heading = h2.textContent?.replace('+', '').trim() ?? ''
      headings.push(heading)

      // Section-start portal target: insert right after the h2
      const sectionStart = document.createElement('div')
      sectionStart.className = 'section-chat-inline-portal'
      sectionStart.dataset.section = heading
      h2.insertAdjacentElement('afterend', sectionStart)
      injected.push(sectionStart)
    }

    setSectionHeadings(headings)

    return () => {
      for (const el of injected) el.remove()
      setSectionHeadings([])
    }
  }, [article?.bodyHtml, date])

  // Render chat buttons via portals into h2 elements
  const buttonPortals = useMemo(() => {
    const container = contentRef.current
    if (!container || !date) return null

    const result: React.ReactPortal[] = []
    const btnWrappers = container.querySelectorAll('.section-chat-wrapper')
    for (const wrapper of btnWrappers) {
      const h2 = wrapper.parentElement
      const heading = h2?.textContent?.replace('+', '').trim()
      if (!heading) continue

      result.push(
        createPortal(
          <SectionChatButton section={heading} date={date} />,
          wrapper,
          `btn-${heading}`,
        ),
      )
    }

    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.bodyHtml, date, sectionHeadings])

  // On mobile, portal section threads inline after their sections
  const inlineThreadPortals = useMemo(() => {
    const container = contentRef.current
    if (!isMobile || !container || !date) return null

    const portals: React.ReactPortal[] = []
    const targets = container.querySelectorAll('.section-chat-inline-portal')
    for (const target of targets) {
      const heading = (target as HTMLElement).dataset.section
      if (!heading) continue
      portals.push(
        createPortal(
          <SectionChatZone
            section={heading}
            date={date}
            articleTitle={displayEntry?.title ?? ''}
            extractSection={extractSection}
          />,
          target,
          `inline-chat-${heading}`,
        ),
      )
    }
    return portals
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, article?.bodyHtml, date, sectionHeadings, displayEntry?.title, extractSection])

  const isDraft = displayEntry?.status === 'draft'

  // Check if any threads exist for this article
  const hasThreads = useMemo(() => {
    return threadOrder.some((id) => {
      const t = threads[id]
      return t && t.date === date
    })
  }, [threads, threadOrder, date])

  const showSidebar = hasThreads || isDraft

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

      <div className={`article-layout${showSidebar ? ' chat-open' : ''}`}>
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

          {buttonPortals}
          {inlineThreadPortals}

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

        {showSidebar && date && (
          <div className="chat-column">
            {!isMobile && sectionHeadings.map((heading) => (
              <SectionChatZone
                key={heading}
                section={heading}
                date={date}
                articleTitle={displayEntry?.title ?? ''}
                extractSection={extractSection}
              />
            ))}
            {isDraft && (
              <EditorialSidebar date={date} articleTitle={displayEntry?.title ?? ''} />
            )}
          </div>
        )}
      </div>

      <SubmitAllFeedback />
    </>
  )
}

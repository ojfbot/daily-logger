import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, Link } from 'react-router-dom'
import { useEntries } from '../hooks/useEntries.ts'
import { useIsMobile } from '../hooks/useIsMobile.ts'
import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { fetchArticle } from '../store/articlesSlice.ts'
import { clearCorrespondence } from '../store/chatSlice.ts'
import { useArticlePopovers } from '../hooks/useArticlePopovers.ts'
import { useSectionContent } from '../hooks/useSectionContent.ts'
import { Popover } from './Popover.tsx'
import { SectionChatButton } from './SectionChatButton.tsx'
import { SectionChatZone } from './SectionChatZone.tsx'
import { IndependentArticleReviews } from './IndependentArticleReviews.tsx'
import type { DiscussionAvailability } from './IndependentArticleReviews.tsx'
import { EditorialSidebar } from './EditorialSidebar.tsx'
import { ArticleProvenanceDetails } from './ArticleProvenanceDetails.tsx'
import { DiscussionDrafts, usePageDiscussionDrafts } from './DiscussionDrafts.tsx'
import { ArticleActions } from './ArticleActions.tsx'
import { decorateShipmentTimesHtml } from '../utils/shipmentTimes.ts'

export function ArticlePage() {
  const { date } = useParams<{ date: string }>()
  const { entries } = useEntries()
  const dispatch = useAppDispatch()
  const { articleCache, articleLoading } = useAppSelector((s) => s.articles)
  const { threads, threadOrder } = useAppSelector((s) => s.chat)
  const authUser = useAppSelector((s) => s.auth.user)
  const contentRef = useRef<HTMLDivElement>(null)
  const [sectionHeadings, setSectionHeadings] = useState<string[]>([])
  const [discussionObservation, setDiscussionObservation] = useState<{ context: string; availability: DiscussionAvailability } | null>(null)
  const [actionChoicesReady, setActionChoicesReady] = useState(false)
  const isMobile = useIsMobile()

  const entry = entries.find((e) => e.date === date)
  const article = date ? articleCache[date] : undefined
  const drafts = usePageDiscussionDrafts(JSON.stringify([authUser?.login.toLowerCase() ?? null, !!authUser?.authorized, date ?? null, article?.sourceBlobSha ?? null]))
  const discussionContext = `${authUser?.login}:${date}:${article?.sourceBlobSha ?? 'unknown'}`
  const discussionAvailability = discussionObservation?.context === discussionContext ? discussionObservation.availability : 'loading'
  const discussionReady = discussionAvailability === 'ready'

  useEffect(() => {
    if (date && !articleCache[date]) {
      dispatch(fetchArticle(date))
    }
  }, [date, articleCache, dispatch])

  const codeReferences = useMemo(() => article?.codeReferences ?? entry?.codeReferences ?? [], [article?.codeReferences, entry?.codeReferences])
  const reposActive = useMemo(() => article?.reposActive ?? entry?.reposActive ?? [], [article?.reposActive, entry?.reposActive])
  const timeReferences = useMemo(() => article?.timeReferences ?? [], [article?.timeReferences])
  const shipmentTimes = useMemo(() => article?.shipmentTimes ?? [], [article?.shipmentTimes])
  const decoratedBodyHtml = useMemo(() => article?.bodyHtml ? decorateShipmentTimesHtml(article.bodyHtml, shipmentTimes) : '', [article?.bodyHtml, shipmentTimes])
  const popoverContentRevision = `${article?.sourceBlobSha ?? decoratedBodyHtml}:${sectionHeadings.length}`

  const popover = useArticlePopovers(contentRef, codeReferences, reposActive, timeReferences, popoverContentRevision, shipmentTimes)
  const { extractSection } = useSectionContent(contentRef)

  const displayEntry = article ?? entry

  useEffect(() => {
    dispatch(clearCorrespondence())
    setDiscussionObservation(null)
  }, [dispatch, authUser?.login, authUser?.authorized])
  const updateDiscussionAvailability = useCallback((availability: DiscussionAvailability) => setDiscussionObservation({ context: discussionContext, availability }), [discussionContext])

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
          <SectionChatButton section={heading} date={date} visibleBlobSha={article?.sourceBlobSha} discussionReady={discussionReady} />,
          wrapper,
          `btn-${heading}`,
        ),
      )
    }

    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.bodyHtml, article?.sourceBlobSha, date, discussionReady, sectionHeadings])

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
            visibleBlobSha={article?.sourceBlobSha}
            discussionAvailability={discussionAvailability}
            extractSection={extractSection}
          />,
          target,
          `inline-chat-${heading}`,
        ),
      )
    }
    return portals
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, article?.bodyHtml, article?.sourceBlobSha, date, discussionAvailability, sectionHeadings, displayEntry?.title, extractSection])

  const isDraft = displayEntry?.status === 'draft'

  // Check if any threads exist for this article
  const hasThreads = useMemo(() => {
    return threadOrder.some((id) => {
      const t = threads[id]
      return t && t.date === date
    })
  }, [threads, threadOrder, date])

  const showSidebar = hasThreads || isDraft || !!authUser?.authorized

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
    <DiscussionDrafts owner={drafts}>
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
          {authUser?.authorized && <a href="#independent-review-heading">Independent review and corrections</a>}
        </div>
      )}

      <div className={`article-layout${showSidebar ? ' chat-open' : ''}`}>
        <div className="article-main">
          {article?.bodyHtml ? (
            <article
              ref={contentRef}
              className="article-content"
              data-shipment-time-count={shipmentTimes.length}
              dangerouslySetInnerHTML={{ __html: decoratedBodyHtml }}
            />
          ) : (
            !articleLoading && <article className="article-content"><p>Article not found.</p></article>
          )}

          {date && <ArticleActions date={date} records={article?.actionSuggestions ?? []} login={authUser?.authorized ? authUser.login : undefined} visibleBlobSha={article?.sourceBlobSha} draft={isDraft} onReadyChange={setActionChoicesReady} />}

          {/* Static article JSON is public; auth controls disclosure density, not data security. */}
          {authUser?.authorized && (
            <ArticleProvenanceDetails
              provenance={displayEntry?.provenance}
              viewerLogin={authUser.login}
            />
          )}

          {buttonPortals}
          {inlineThreadPortals}

          <Popover state={popover.state} onMouseEnter={popover.keepOpen} onMouseLeave={popover.scheduleHide} />

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
                visibleBlobSha={article?.sourceBlobSha}
                discussionAvailability={discussionAvailability}
                extractSection={extractSection}
              />
            ))}
            {authUser?.authorized && <IndependentArticleReviews key={`${authUser.login}:${date}:${article?.sourceBlobSha ?? 'unknown'}`} date={date} visibleBlobSha={article?.sourceBlobSha} login={authUser.login} onDiscussionAvailabilityChange={updateDiscussionAvailability} />}
            {isDraft && (
              <EditorialSidebar date={date} articleTitle={displayEntry?.title ?? ''} visibleBlobSha={article?.sourceBlobSha} actionChoicesReady={!article?.actionSuggestions?.some(record => record.origin === 'suggested' && record.introducedBy === date && ['open', 'proposed'].includes(record.state)) || actionChoicesReady} />
            )}
          </div>
        )}
      </div>

    </DiscussionDrafts>
  )
}

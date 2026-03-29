import { useCallback } from 'react'

interface SectionData {
  heading: string
  content: string
  codeRefs: string[]
}

/**
 * Extracts section content from the article DOM.
 * Walks from the target h2 element, collecting text until the next h2 or end of article.
 */
export function useSectionContent(contentRef: React.RefObject<HTMLElement | null>) {
  const extractSection = useCallback(
    (sectionHeading: string): SectionData | null => {
      const container = contentRef.current
      if (!container) return null

      const headings = container.querySelectorAll('h2')
      let targetH2: Element | null = null

      for (const h2 of headings) {
        if (h2.textContent?.trim() === sectionHeading) {
          targetH2 = h2
          break
        }
      }

      if (!targetH2) return null

      const parts: string[] = []
      const codeRefs: string[] = []
      let sibling = targetH2.nextElementSibling

      while (sibling && sibling.tagName !== 'H2') {
        parts.push(sibling.textContent ?? '')

        // Collect inline code references
        const codes = sibling.querySelectorAll('code')
        for (const code of codes) {
          if (!code.closest('pre')) {
            const text = code.textContent?.trim()
            if (text && text.length > 1) codeRefs.push(text)
          }
        }

        sibling = sibling.nextElementSibling
      }

      return {
        heading: sectionHeading,
        content: parts.join('\n').trim(),
        codeRefs: [...new Set(codeRefs)],
      }
    },
    [contentRef],
  )

  return { extractSection }
}

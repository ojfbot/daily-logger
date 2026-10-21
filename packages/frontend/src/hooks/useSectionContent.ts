import { useCallback } from 'react'

interface SectionData {
  heading: string
  content: string
  codeRefs: string[]
}

export function extractSectionContent(container: HTMLElement | DocumentFragment, sectionHeading: string): SectionData | null {
  const headings = container.querySelectorAll('h2')
  let targetH2: Element | null = null

  for (const h2 of headings) {
    const heading = h2.cloneNode(true)
    if (!(heading instanceof Element)) continue
    heading.querySelector('.section-chat-wrapper')?.remove()
    if (heading.textContent?.trim() === sectionHeading) {
      targetH2 = h2
      break
    }
  }

  if (!targetH2) return null

  const parts: string[] = []
  const codeRefs: string[] = []
  let sibling = targetH2.nextElementSibling

  while (sibling && sibling.tagName !== 'H2') {
    const source = sibling.cloneNode(true)
    if (!(source instanceof Element)) return null
    source.querySelectorAll('[data-article-decoration="shipment-time"]').forEach((decoration) => decoration.remove())
    parts.push(source.textContent ?? '')

    const codes = sibling.querySelectorAll('code')
    for (const code of codes) {
      if (!code.closest('pre')) {
        const text = code.textContent?.trim()
        if (text && text.length > 1) codeRefs.push(text)
      }
    }

    sibling = sibling.nextElementSibling
  }

  return { heading: sectionHeading, content: parts.join('\n').trim(), codeRefs: [...new Set(codeRefs)] }
}

/**
 * Extracts section content from the versioned article HTML, before UI decoration.
 * Walks from the target h2 element, collecting text until the next h2 or end of article.
 */
export function useSectionContent(bodyHtml: string | undefined) {
  const extractSection = useCallback(
    (sectionHeading: string): SectionData | null => {
      if (!bodyHtml) return null
      const source = document.createElement('template')
      source.innerHTML = bodyHtml
      return extractSectionContent(source.content, sectionHeading)
    },
    [bodyHtml],
  )

  return { extractSection }
}

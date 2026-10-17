import type { TimeReference } from '../../../../src/time-reference-schema.ts'
import { scanVisibleTimeText } from '../../../../src/time-reference-text.ts'

/** Decorate only exact, evidence-resolved occurrences; never infer a date from the article. */
export function attachTimeReferences(root: HTMLElement, references: TimeReference[]) {
  const records = new Map<string, TimeReference>()
  for (const reference of references) {
    const date = new Date(reference.at)
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== reference.at || !reference.text) continue
    records.set(`${reference.text}\0${reference.occurrence}`, reference)
  }
  const attached: Array<{ element: HTMLButtonElement; reference: TimeReference }> = []
  if (!records.size) return { attached, restore: () => {} }
  const occurrences = new Map<string, number>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('pre, script, style, button, [aria-hidden="true"], [hidden], .section-chat-inline-portal') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    },
  })
  const nodes: Text[] = []
  while (walker.nextNode()) if (walker.currentNode instanceof Text) nodes.push(walker.currentNode)
  const restored: Array<{ node: Text; fragmentNodes: Node[] }> = []
  for (const node of nodes) {
    const content = node.data
    const fragment = document.createDocumentFragment()
    let end = 0
    for (const match of scanVisibleTimeText(content)) {
      const start = match.index
      const token = match.text
      const occurrence = occurrences.get(token) ?? 0
      occurrences.set(token, occurrence + 1)
      const reference = records.get(`${token}\0${occurrence}`)
      if (!reference || node.parentElement?.closest('a, [role="button"], [contenteditable="true"]')) continue
      fragment.append(content.slice(end, start))
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'time-ref'
      element.setAttribute('aria-label', `${token}; show UTC and your local time`)
      element.setAttribute('aria-expanded', 'false')
      const time = document.createElement('time')
      time.dateTime = reference.at
      time.textContent = token
      element.append(time)
      fragment.append(element)
      attached.push({ element, reference })
      end = start + token.length
    }
    if (end) {
      fragment.append(content.slice(end))
      const fragmentNodes = [...fragment.childNodes]
      node.replaceWith(fragment)
      restored.push({ node, fragmentNodes })
    }
  }
  return { attached, restore: () => {
    for (const { node, fragmentNodes } of restored) {
      const first = fragmentNodes[0]
      if (!first?.parentNode) continue
      first.parentNode.insertBefore(node, first)
      for (const part of fragmentNodes) part.parentNode?.removeChild(part)
    }
  } }
}

import { TimeDisplayReferenceSchema, timeExpressionMembers, timeTokenMatchesInstant, type TimeDisplayReference, type TimeReference, type TimeExpressionMember } from '../../../../src/time-reference-schema.ts'
import { scanVisibleTimeText } from '../../../../src/time-reference-text.ts'
import { scanTimeExpressions } from '../../../../src/time-expression-text.ts'

/** Network time metadata is untrusted, including old flat instant objects. */
export function decodeTimeReferences(value: unknown): TimeDisplayReference[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const decoded = TimeDisplayReferenceSchema.safeParse(item)
    return decoded.success ? [decoded.data] : []
  })
}

const BLOCKS = new Set(['P', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR'])
const INTERACTIVE = 'a, button, input, select, textarea, summary, [role="button"], [contenteditable="true"], [tabindex]'
const EXCLUDED = 'pre, script, style, button, [aria-hidden="true"], [hidden], .section-chat-inline-portal'
interface TextSpan { node: Text; index: number; text: string }

/** Mirror the rendered server projection; inline formatting does not split a group. */
function visibleProjection(root: HTMLElement) {
  let text = ''
  const nodes: TextSpan[] = []
  function visit(node: Node): void {
    if (node instanceof Text) {
      nodes.push({ node, index: text.length, text: node.data })
      text += node.data
      return
    }
    if (!(node instanceof Element) || node.matches(EXCLUDED)) return
    for (const child of node.childNodes) visit(child)
    if (BLOCKS.has(node.tagName)) text += '\n\n'
  }
  visit(root)
  return { text, nodes }
}

/** Every supported clock uses the existing single-instant popover. */
export interface TimePopoverReference {
  reference: TimeReference
  certainty: TimeExpressionMember['certainty']
}

/** Preserve original nodes when a clock crosses inline formatting boundaries. */
function wrapTimeText(spans: TextSpan[], index: number, end: number, element: HTMLButtonElement): (() => void) | undefined {
  const first = spans[0], last = spans.at(-1)
  if (!first || !last) return undefined
  const range = document.createRange()
  range.setStart(first.node, index - first.index)
  range.setEnd(last.node, end - last.index)
  if (range.cloneContents().querySelector(`${EXCLUDED}, ${INTERACTIVE}`)) return undefined
  const common = range.commonAncestorContainer instanceof Text ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer
  const parents = new Map<ParentNode, Node[]>()
  const text = spans.map(({ node }) => ({ node, data: node.data }))
  for (const { node } of spans) {
    for (let parent = node.parentNode; parent; parent = parent.parentNode) {
      if (!parents.has(parent)) parents.set(parent, [...parent.childNodes])
      if (parent === common) break
    }
  }
  element.append(range.extractContents())
  range.insertNode(element)
  const changes = [...parents].map(([parent, children]) => ({
    parent, children, added: [...parent.childNodes].filter(child => !children.includes(child)),
  }))
  return () => {
    element.remove()
    for (const { parent, children, added } of changes) {
      for (const child of added) if (child.parentNode === parent) parent.removeChild(child)
      // Range extraction removes/moves nodes; it never reorders the remaining originals.
      // Restore only those nodes, leaving later discussion/UI additions intact.
      children.forEach((child, index) => {
        if (child.parentNode === parent) return
        const next = children.slice(index + 1).find(node => node.parentNode === parent)
        const previous = children.slice(0, index).reverse().find(node => node.parentNode === parent)
        parent.insertBefore(child, next ?? (previous ? previous.nextSibling : parent.firstChild))
      })
    }
    for (const { node, data } of text) node.data = data
  }
}

/** Each stated time is its own inline trigger; connectors remain article prose. */
export function attachTimeReferences(root: HTMLElement, input: unknown) {
  const references = decodeTimeReferences(input)
  const attached: Array<{ element: HTMLButtonElement; reference: TimePopoverReference }> = []
  const restores: Array<() => void> = []
  const projection = visibleProjection(root)
  const expressions = scanTimeExpressions(projection.text)
  const records = new Map(references.map(reference => [
    reference.kind === 'instant' ? `${reference.reference.text}\0${reference.reference.occurrence}` : `${reference.text}\0${reference.occurrence}`,
    reference,
  ]))
  const plans: Array<{ index: number; end: number; reference: TimePopoverReference }> = []
  const groups: Array<{ index: number; end: number }> = []
  for (const expression of expressions) {
    const reference = records.get(`${expression.text}\0${expression.occurrence}`)
    if (!reference || reference.kind === 'instant' || reference.kind !== expression.kind) continue
    if (timeExpressionMembers(reference).length !== expression.members.length) continue
    groups.push(expression)
    const resolvedMembers = timeExpressionMembers(reference)
    expression.members.forEach((member, memberIndex) => {
      const resolved = resolvedMembers[memberIndex]
      if (!resolved || resolved.resolution.kind !== 'supported') return
      const certainty = expression.approximate || member.approximate ? 'approximate' : 'exact'
      if (resolved.text !== member.text || resolved.precision !== member.precision || resolved.certainty !== certainty
        || !member.normalized || !timeTokenMatchesInstant(member.normalized, resolved.resolution.at)) return
      plans.push({ index: member.index, end: member.end, reference: {
        certainty: resolved.certainty,
        reference: { text: member.text, occurrence: expression.occurrence, at: resolved.resolution.at, precision: resolved.precision, evidence: resolved.resolution.evidence },
      } })
    })
  }
  // Count original article occurrences before any text is moved into controls.
  const occurrences = new Map<string, number>()
  for (const { node, index } of projection.nodes) {
    for (const match of scanVisibleTimeText(node.data)) {
      const occurrence = occurrences.get(match.text) ?? 0
      occurrences.set(match.text, occurrence + 1)
      const reference = records.get(`${match.text}\0${occurrence}`)
      const position = index + match.index
      if (!reference || reference.kind !== 'instant' || groups.some(group => position >= group.index && position < group.end)) continue
      plans.push({ index: position, end: position + match.text.length, reference: { reference: reference.reference, certainty: 'exact' } })
    }
  }
  // Earlier offsets remain valid in the original text nodes when working backwards.
  for (const plan of plans.sort((a, b) => b.index - a.index)) {
    const spans = projection.nodes.filter(span => span.index < plan.end && span.index + span.text.length > plan.index)
    if (!spans.length || spans.some(span => span.node.parentElement?.closest(INTERACTIVE))) continue
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'time-ref'
    const label = projection.text.slice(plan.index, plan.end)
    element.setAttribute('aria-label', `${label}; show UTC and your local time`)
    element.setAttribute('aria-expanded', 'false')
    const restore = wrapTimeText(spans, plan.index, plan.end, element)
    if (!restore) continue
    const time = document.createElement('time')
    time.dateTime = plan.reference.reference.at
    time.append(...element.childNodes)
    element.append(time)
    restores.push(restore)
    attached.push({ element, reference: plan.reference })
  }
  return { attached, restore: () => { for (const restore of restores.reverse()) restore() } }
}

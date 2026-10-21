export interface TimeExpressionToken {
  text: string
  index: number
  end: number
  precision: 'minute' | 'second'
  normalized: string | undefined
  approximate: boolean
}
export interface TimeExpressionScan {
  text: string
  index: number
  end: number
  occurrence: number
  kind: 'point' | 'list' | 'interval'
  approximate: boolean
  members: TimeExpressionToken[]
}

const openingWrappers = /[ \t("'“‘]*/.source
const approximation = /(?:~[ \t]*|\b(?:about|around|approximately|roughly)[ \t]+)/.source
const memberPrefix = openingWrappers + '(?:' + approximation + ')?' + openingWrappers
const approximationBefore = new RegExp(approximation + openingWrappers + '$', 'i')
const connectorPattern = new RegExp(/^[ \t]*["'”’)]*[ \t]*([–—-]|to|and|,[ \t]*(?:and[ \t]+)?)/.source + memberPrefix + '$', 'i')
const qualifiedRangeStart = new RegExp('^-' + openingWrappers + approximation + openingWrappers + /(?:\d{4}-\d{2}-\d{2}[T ])?\d{1,2}:/.source, 'i')
const datedRangeStart = new RegExp('^-' + memberPrefix + /\d{4}-\d{2}-\d{2}[T ]/.source, 'i')
const utcRangeStart = new RegExp('^-' + memberPrefix + /\d{1,2}:\d{2}(?::\d{2})?(?:Z| UTC)\b/.source, 'i')

/** Establish ownership before validation, including unsupported members of a connected span. */
function lexicalClocks(text: string): Array<{ text: string; index: number }> {
  const starts = /\b(?:\d{4}-\d{2}-\d{2}[T ])?\d{1,2}:/g
  const result: Array<{ text: string; index: number }> = []
  let ownedEnd = 0
  for (const match of text.matchAll(starts)) {
    if (match.index < ownedEnd) continue
    let end = match.index + match[0].length
    while (end < text.length && !/[\s,–—;()[\]{}]/.test(text[end])) {
      if (text[end] === '-') {
        const suffix = text.slice(end)
        const offset = /^\d{4}-/.test(match[0]) && unzonedClock(text.slice(match.index, end)) && !/^-\d{4}-\d{2}-\d{2}[T ]/.test(suffix)
          ? /^-\d{2}:?\d{2}(?![A-Za-z0-9])/.exec(suffix) : null
        if (!offset) break
        end += offset[0].length
        continue
      }
      if (/["'“”‘’!?]/.test(text[end]) && normalizedClock(text.slice(match.index, end))) break
      if (text[end] === '.' && !/[A-Za-z0-9]/.test(text[end + 1] ?? '')) break
      end++
    }
    const value = text.slice(match.index, end)
    const suffix = text.slice(end)
    const word = /^[ \t]+([A-Za-z][A-Za-z0-9_/]*)/.exec(suffix)
    const afterWord = word ? suffix.slice(word[0].length) : ''
    const range = word && (qualifiedRangeStart.test(afterWord) || datedRangeStart.test(afterWord) || word[1] === 'UTC' && utcRangeStart.test(afterWord))
    const zone = range ? word : /^(?:[ \t]*\([^()\r\n]*\)|[ \t]+[A-Za-z][A-Za-z0-9_/]*(?:[+-][A-Za-z0-9_:?]+)?)/.exec(suffix)
    const separator = /^(?:and|to|respectively|at|before|after|until|by|on|then|or|through|with)$/i
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value) && zone && !separator.test(zone[0].trim())) end += zone[0].length
    result.push({ text: text.slice(match.index, end), index: match.index })
    ownedEnd = end
  }
  return result
}

function unzonedClock(value: string): boolean {
  return /^(?:\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?|\d{1,2}:\d{2}(?::\d{2})?)$/.test(value)
}

function normalizedClock(value: string): string | undefined {
  const supported = /^(?:\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z| UTC|[+-]\d{2}:\d{2})|\d{1,2}:\d{2}(?::\d{2})?(?:Z| UTC))$/.test(value)
  return supported ? value.replace(/^(\d):/, '0$1:') : undefined
}

function prefixBefore(text: string, index: number) {
  const qualifier = approximationBefore.exec(text.slice(0, index))
  let start = index - (qualifier?.[0].length ?? 0)
  const wrappers = /(?:[("'“‘][ \t]*)+$/.exec(text.slice(0, start))
  start -= wrappers?.[0].length ?? 0
  return { text: text.slice(start, index), index: start, approximate: !!qualifier }
}

function wrapperEnd(text: string, end: number, qualifier: string | undefined): number {
  const closers = new Map([['(', ')'], ['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']])
  for (const opener of [...(qualifier?.match(/[("'“‘]/g) ?? [])].reverse()) {
    const whitespace = /^[ \t]*/.exec(text.slice(end))?.[0].length ?? 0
    if (text[end + whitespace] !== closers.get(opener)) break
    end += whitespace + 1
  }
  return end
}

/** Bounded grammar only; a shared zone is syntax, never a shared event date. */
export function scanTimeExpressions(text: string): TimeExpressionScan[] {
  const tokens = lexicalClocks(text)
  const result: TimeExpressionScan[] = []
  const occurrences = new Map<string, number>()
  for (let i = 0; i < tokens.length; i++) {
    const first = tokens[i]
    const group = [first]
    const gaps: Array<'interval' | 'list'> = []
    while (i + 1 < tokens.length) {
      const last = group.at(-1)
      if (!last) break
      const next = tokens[i + 1]
      const gap = text.slice(last.index + last.text.length, next.index)
      const connector = connectorPattern.exec(gap)
      if (!connector) break
      gaps.push(/^(?:[–—-]|to)$/i.test(connector[1]) ? 'interval' : 'list')
      group.push(next)
      i++
    }
    const firstPrefix = prefixBefore(text, first.index)
    const betweenPrefix = /\bbetween[ \t("'“‘]*$/i.test(text.slice(0, first.index))
    if (group.length === 1 && !firstPrefix.approximate) continue
    const last = group.at(-1)
    if (!last) continue
    const index = firstPrefix.index
    const lastEnd = wrapperEnd(text, last.index + last.text.length, prefixBefore(text, last.index).text)
    const end = first.index === last.index ? lastEnd : wrapperEnd(text, lastEnd, firstPrefix.text)
    const label = text.slice(index, end)
    const occurrence = occurrences.get(label) ?? 0
    occurrences.set(label, occurrence + 1)
    const sharedZone = normalizedClock(last.text) ? /(?:Z| UTC|[+-]\d{2}:\d{2})$/.exec(last.text)?.[0] : undefined
    const members = group.map((match) => {
      const value = unzonedClock(match.text) && sharedZone ? `${match.text}${sharedZone}` : match.text
      const normalized = normalizedClock(value)
      const prefix = prefixBefore(text, match.index)
      const memberEnd = wrapperEnd(text, match.index + match.text.length, prefix.text)
      return { text: text.slice(prefix.index, memberEnd), index: prefix.index, end: memberEnd, precision: /\d{1,2}:\d{2}:\d{2}/.test(match.text) ? 'second' as const : 'minute' as const, normalized, approximate: prefix.approximate }
    })
    const isInterval = gaps.length === 1 && (gaps[0] === 'interval' || betweenPrefix)
    result.push({ text: label, index, end, occurrence, kind: group.length === 1 ? 'point' : isInterval ? 'interval' : 'list', approximate: firstPrefix.approximate, members })
  }
  return result
}

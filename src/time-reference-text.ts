/** Shared DOM text-node inventory; full dated tokens take precedence over embedded clock substrings. */
export function scanVisibleTimeText(text: string): Array<{ text: string; index: number; precision: 'minute' | 'second' }> {
  const pattern = /\b(?:\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z| UTC|[+-]\d{2}:\d{2})|\d{2}:\d{2}(?::\d{2})?(?:Z| UTC))\b/g
  return [...text.matchAll(pattern)].map((match) => ({ text: match[0], index: match.index, precision: /\d{2}:\d{2}:\d{2}/.test(match[0]) ? 'second' : 'minute' }))
}

/** Text helpers shared by the intake and messaging modules. */

/** Sort comparator for ISO times (or any text), latest first; a missing value sorts last. */
export const latestFirst = (a = '', b = '') => (a < b ? 1 : a > b ? -1 : 0)

/** UTF-8 size of a text, as maxMessageBytes counts it. */
export const byteLength = (text) => Buffer.byteLength(text, 'utf8')

/** Cut a text to at most maxBytes UTF-8 bytes without splitting a character, adding the ellipsis when cut. */
export function cutToBytes(text, maxBytes, ellipsis) {
  if (byteLength(text) <= maxBytes) return text
  const budget = maxBytes - byteLength(ellipsis)
  let out = ''
  let used = 0
  for (const ch of text) {
    const size = byteLength(ch)
    if (used + size > budget) break
    out += ch
    used += size
  }
  return out + ellipsis
}

/** Text helpers shared by the intake and messaging modules. */
import { stripVTControlCharacters } from 'node:util'

/** Sort comparator for ISO times (or any text), latest first; a missing value sorts last. */
export const latestFirst = (a = '', b = '') => (a < b ? 1 : a > b ? -1 : 0)

/** UTF-8 size of a text, as maxMessageBytes counts it. */
export const byteLength = (text) => Buffer.byteLength(text, 'utf8')

/**
 * What counts as a visible character (§4.1 titleChars's lower bound). `trim()` is not enough:
 * zero-width spaces, bidi marks and overrides, word joiners, BOM, control characters and terminal
 * escapes all survive it, yet none of them shows a glyph. The escapes are removed with Node's own
 * VT parser first, then a code point counts only when it is not a control/format/private/
 * unassigned code point (`\p{C}`), a separator such as a space (`\p{Z}`), a combining mark on its
 * own (`\p{M}`) or one of Unicode's default-ignorable code points (Hangul fillers and the like).
 */
export const VISIBLE_TEXT = Object.freeze({
  CHARACTER: /[^\p{C}\p{Z}\p{M}\p{Default_Ignorable_Code_Point}]/u,
})

/** Whether a text shows at least one visible character; a non-string shows none. */
export function hasVisibleCharacter(text) {
  if (typeof text !== 'string') return false
  return VISIBLE_TEXT.CHARACTER.test(stripVTControlCharacters(text))
}

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

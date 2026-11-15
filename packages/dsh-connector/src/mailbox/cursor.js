/**
 * `inbox_poll` cursors (design §3.4: opaque, bound to the pair and `mailboxGeneration`). A cursor
 * names a position: the sequence of the last event a page returned. The next page starts after it.
 */
import { CURSOR, START_SEQUENCE } from './constants.js'

/** @returns the opaque cursor of `(boxKey, generation, sequence)`. */
export const encodeCursor = (boxKey, generation, sequence) => Buffer.from(JSON.stringify([boxKey, generation, sequence])).toString(CURSOR.encoding)

/**
 * @returns `{boxKey, generation, sequence}`, or `undefined` for text that is not a cursor this
 *   module wrote (wrong encoding, wrong shape, or a sequence that is not a whole number ≥ 0).
 */
export function decodeCursor(text) {
  if (typeof text !== 'string') return undefined
  let fields
  try {
    fields = JSON.parse(Buffer.from(text, CURSOR.encoding).toString())
  } catch {
    return undefined
  }
  if (!Array.isArray(fields) || fields.length !== CURSOR.fields) return undefined
  const [boxKey, generation, sequence] = fields
  const valid = typeof boxKey === 'string' && typeof generation === 'string' && Number.isSafeInteger(sequence) && sequence >= START_SEQUENCE
  // Base64url decoding ignores stray characters, so a cursor must also re-encode to exactly its
  // own text. Otherwise two different texts would name one position.
  return valid && encodeCursor(boxKey, generation, sequence) === text ? { boxKey, generation, sequence } : undefined
}

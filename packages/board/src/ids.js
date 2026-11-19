import { REFUSAL } from './constants.js'

const ID = Object.freeze({
  prefix: 'bd_',
  separator: '_',
  radix: 36,
  timestampWidth: 9,
  padding: '0',
  minimumTime: 0,
  suffix: /^[0-9a-f]{6}$/,
  board: /^bd_([0-9a-z]{9})_([0-9a-f]{6})$/,
  sessionPrefix: 'ses:',
  eventPrefix: 'ev:',
  eventSequence: /^(0|[1-9][0-9]*)$/,
  kind: Object.freeze({ board: 'board', session: 'session', event: 'event' }),
})

const matchesExactly = (pattern, value) => pattern.exec(value)?.[0] === value

/**
 * Format a board id from explicit epoch milliseconds and six lowercase hex digits.
 * Throws invalid-input for unrepresentable inputs. No clock, randomness, collision
 * retry or monotonicity policy lives here; those belong to the calling boundary.
 */
export function newId(epochMs, hexSuffix) {
  if (!Number.isSafeInteger(epochMs) || epochMs < ID.minimumTime ||
      epochMs >= ID.radix ** ID.timestampWidth ||
      typeof hexSuffix !== 'string' || !matchesExactly(ID.suffix, hexSuffix)) {
    throw Object.assign(new Error(REFUSAL.invalidInput), { code: REFUSAL.invalidInput })
  }
  return `${ID.prefix}${epochMs.toString(ID.radix).padStart(ID.timestampWidth, ID.padding)}${ID.separator}${hexSuffix}`
}

/**
 * Return {kind, id}, or null for an invalid reference. Board ids remain complete;
 * session/event ids omit their prefix. Parsing never resolves a session or event.
 * Session ids are opaque nonempty strings; event ids are canonical nonnegative
 * safe-integer decimal strings (user clarification). No trimming or case folding.
 * References are identifiers, never filesystem paths.
 */
export function parseRef(value) {
  if (typeof value !== 'string') return null
  if (matchesExactly(ID.board, value)) return { kind: ID.kind.board, id: value }
  if (value.startsWith(ID.sessionPrefix)) {
    const id = value.slice(ID.sessionPrefix.length)
    return id ? { kind: ID.kind.session, id } : null
  }
  if (value.startsWith(ID.eventPrefix)) {
    const id = value.slice(ID.eventPrefix.length)
    if (matchesExactly(ID.eventSequence, id) && Number.isSafeInteger(Number(id))) {
      return { kind: ID.kind.event, id }
    }
  }
  return null
}

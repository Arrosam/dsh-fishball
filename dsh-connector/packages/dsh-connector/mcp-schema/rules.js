/**
 * Pure rules the W2 modules share (task K1), so each has exactly one implementation: the id
 * grammar (C-OAUTH's token endpoint, C-OAUTH-WEB's page, C-PAIR, any agent such as
 * `fishball-core`), the name normalisation and fold (C-PAIR, the page), offer ids (C-ROUTE,
 * C-SUCCEED), event types (C-MAILBOX, C-EXT) and the nameless display (embed-UI).
 * Total functions: none throws, whatever the input.
 */
import { CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE, ID_GRAMMAR, NAME_RULES, OFFER_ID, REFUSAL } from './constants.js'
import { NAMESPACE } from '../tools/constants.js'
import { isReservedNamespace, publicNameFor } from '../tools/names.js'

const codePoints = (text) => [...text].length

/** Whether a value is a valid agent id (R-ID-02): 1–64 of `A–Z a–z 0–9 _ -`, no dot. */
export const isAgentId = (value) => typeof value === 'string' && ID_GRAMMAR.pattern.test(value)

/**
 * A name as stored and shown (R-NAME-02, TQ-6 A): every run of Unicode White_Space becomes one
 * space (so `\n` and `\t` collapse before the control check), the ends are trimmed, then NFC.
 * Returns `undefined` for a non-string.
 */
export function normaliseName(value) {
  if (typeof value !== 'string') return undefined
  return value.split(NAME_RULES.whitespaceRun).filter((part) => part.length > 0).join(NAME_RULES.space).normalize(NAME_RULES.normalForm)
}

/**
 * Check a requested name. `{ok: true, name}` with the normalised name, or
 * `{ok: false, code: 'name-invalid'}` when it is not a string, is empty after normalisation, is
 * over 64 code points, or holds a control character. `null` (clearing, R-NAME-02) is not a name;
 * `set_name` handles it before calling this.
 */
export function checkName(value) {
  const name = normaliseName(value)
  const valid = name !== undefined
    && codePoints(name) >= NAME_RULES.minChars
    && codePoints(name) <= NAME_RULES.maxChars
    && !NAME_RULES.control.test(name)
  return valid ? Object.freeze({ ok: true, name }) : Object.freeze({ ok: false, code: REFUSAL.nameInvalid })
}

/**
 * The uniqueness key of a normalised name (R-NAME-02): full Unicode case folding, approximated
 * by lower, upper, then lower case (so `Straße`, `STRASSE` and `Straẞe` all meet at `strasse`:
 * the first lower-casing turns U+1E9E into `ß` before the upper-casing expands it), then NFC
 * again, because case mapping can denormalise. This is the one frozen fold: every comparison uses
 * it, so two connectors never disagree.
 */
export const nameKey = (normalisedName) => normalisedName.toLowerCase().toUpperCase().toLowerCase().normalize(NAME_RULES.normalForm)

/** How a principal is shown (R-NAME-08): its name as plain text, or `{prefix: 'ID: ', id}` to render the prefix bold. */
export const principalLabel = (name, id) => (name === null ? Object.freeze({ prefix: NAME_RULES.namelessPrefix, id }) : Object.freeze({ name }))

/** `<requestId>.r<revision>` (OFFER_ID), or `undefined` when the parts would not parse back. */
export function formatOfferId(requestId, revision) {
  const offerId = `${requestId}${OFFER_ID.separator}${revision}`
  return Number.isSafeInteger(revision) && revision >= OFFER_ID.firstRevision && parseOfferId(offerId) !== undefined ? offerId : undefined
}

/** `{requestId, revision}` of an offer id, or `undefined` when it is not one. */
export function parseOfferId(value) {
  if (typeof value !== 'string') return undefined
  const match = OFFER_ID.pattern.exec(value)
  return match ? Object.freeze({ requestId: match[1], revision: Number(match[2]) }) : undefined
}

const FIXED_TYPES = Object.freeze(Object.values(EVENT_TYPE))

/**
 * Whether a value is an event `type` of R-EVS-02: one of EVENT_TYPE, or
 * `contributed:<namespace>.<event>` whose public name satisfies K2's grammar.
 */
export function isEventType(value) {
  if (typeof value !== 'string') return false
  if (FIXED_TYPES.includes(value)) return true
  if (!value.startsWith(CONTRIBUTED_TYPE_PREFIX)) return false
  const publicName = value.slice(CONTRIBUTED_TYPE_PREFIX.length)
  // A namespace is `[a-z0-9-]` with no `.`, so the first separator ends it (K2 NAMESPACE).
  const separator = publicName.indexOf(NAMESPACE.separator)
  if (separator <= 0) return false
  const namespace = publicName.slice(0, separator)
  if (NAMESPACE.outside.test(namespace) || !NAMESPACE.identifying.test(namespace) || isReservedNamespace(namespace)) return false
  return publicNameFor(namespace, publicName.slice(separator + 1)) === publicName
}

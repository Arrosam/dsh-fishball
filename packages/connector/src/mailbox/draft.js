/**
 * Checks of what a producer commits (K1 `EventDraft`). A draft comes from connector code (C-ROUTE,
 * C-EXT, C-REVOKE, C-SUCCEED), never straight from a client, so an invalid one is a programming
 * error and throws `TypeError` (Fishball 2026-11-14, item 4, the same rule as K3 #17). It is never
 * a `CommitResult`.
 */
import {
  ANSWERABLE_TYPES, CONTRIBUTED_TYPE_PREFIX, DECISION_KIND_OF, isEventType, parseOfferId, payloadSchemaOf,
} from '../../mcp-schema/index.js'
import { NAMESPACE } from '../../tools/index.js'
import { validateValue } from '../schema-value/index.js'
import { MISUSE } from './constants.js'

const isNullableString = (value) => value === null || typeof value === 'string'

/**
 * `offer` is present exactly on the answerable types (K1 shapes.js `mailboxEvent`). Its
 * `decisionKind` is the one DECISION_KIND_OF gives for the type. Its `offerId` follows K1's
 * OFFER_ID grammar, and the revision written inside `offerId` equals `revision`.
 */
function offerValid(type, offer) {
  if (!ANSWERABLE_TYPES.includes(type)) return offer === undefined
  if (offer === null || typeof offer !== 'object') return false
  const parsed = parseOfferId(offer.offerId)
  return parsed !== undefined && parsed.revision === offer.revision && offer.decisionKind === DECISION_KIND_OF[type]
}

/** A dedupe key is a contributor event's only (K1 EventDraft, R-EXT-18). */
const dedupeValid = (type, dedupeKey) => dedupeKey === undefined
  || (type.startsWith(CONTRIBUTED_TYPE_PREFIX) && typeof dedupeKey === 'string' && dedupeKey.length > 0)

/**
 * @param {object} draft - a K1 EventDraft.
 * @throws {TypeError} when the type, the session or correlation id, the offer, the payload (against
 *   K1 `payloadSchemaOf`) or the dedupe key is invalid.
 */
export function assertDraft(draft) {
  const valid = draft !== null && typeof draft === 'object' && isEventType(draft.type)
    && isNullableString(draft.sourceSessionId) && isNullableString(draft.correlationId)
    && offerValid(draft.type, draft.offer) && dedupeValid(draft.type, draft.dedupeKey)
  if (!valid) throw new TypeError(MISUSE.draft)
  const payload = validateValue(payloadSchemaOf(draft.type), draft.payload)
  if (!payload.ok) throw new TypeError(`${MISUSE.draft}: payload at ${payload.path}`)
}

/**
 * The contributor a contributed type belongs to: the namespace in `contributed:<namespace>.<event>`.
 * A namespace holds no `.` (K2 NAMESPACE). For any other type the result is `undefined`.
 */
export function contributorOf(type) {
  if (!type.startsWith(CONTRIBUTED_TYPE_PREFIX)) return undefined
  const publicName = type.slice(CONTRIBUTED_TYPE_PREFIX.length)
  return publicName.slice(0, publicName.indexOf(NAMESPACE.separator))
}

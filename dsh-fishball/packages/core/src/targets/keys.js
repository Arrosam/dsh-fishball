/**
 * The one tuple encoding of every local key derived from a remote id (MULTI-0 `TARGETS.key`;
 * PLAN-MULTI §5). A key is `JSON.stringify([kind, targetId, endpointEpoch, remoteId])`: a JSON
 * array, so no delimiter inside a remote id can make two tuples meet. A handle (an ask card's, a
 * manager message id's tail) must be a plain token, so it is that JSON's UTF-8 in base64url.
 * Only the locally generated `targetId` / `endpointEpoch` route anything; server names never
 * enter a key. Pure.
 */
import { TARGETS } from '../../contracts/constants.js'

const KIND = Object.freeze(Object.values(TARGETS.key.kind))
const TUPLE_LENGTH = 4

/** The key of `remoteId` of `kind` on one target epoch. */
export const keyOf = (kind, targetId, endpointEpoch, remoteId) => JSON.stringify([kind, targetId, endpointEpoch, remoteId])

/** The plain-token handle of a key. */
export const handleOf = (key) => Buffer.from(key, 'utf8').toString(TARGETS.key.encoding)

/** The handle of `remoteId` of `kind` on one target epoch. */
export const handleFor = (kind, targetId, endpointEpoch, remoteId) => handleOf(keyOf(kind, targetId, endpointEpoch, remoteId))

/**
 * The tuple a handle names, or `undefined` for anything that is not one of core's handles (an
 * untrusted value from a route body): `{kind, targetId, endpointEpoch, remoteId}`.
 */
export function tupleOfHandle(handle) {
  if (typeof handle !== 'string' || handle === '') return undefined
  let tuple
  try { tuple = JSON.parse(Buffer.from(handle, TARGETS.key.encoding).toString('utf8')) } catch { return undefined }
  if (!Array.isArray(tuple) || tuple.length !== TUPLE_LENGTH || !tuple.every((part) => typeof part === 'string')) return undefined
  const [kind, targetId, endpointEpoch, remoteId] = tuple
  // A re-encoding that differs is not core's own handle (base64url decoding is lenient).
  if (!KIND.includes(kind) || handleFor(kind, targetId, endpointEpoch, remoteId) !== handle) return undefined
  return Object.freeze({ kind, targetId, endpointEpoch, remoteId })
}

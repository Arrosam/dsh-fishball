/**
 * The pair registry's record: its shape check and pure queries over it (task C-PAIR). The store
 * (`./store.js`) owns every write; this file never touches storage.
 *
 * One record holds every pair as an array in pairing order: `{pairs: [{entryKey, principalKey,
 * id, name, pairedAt, lastSeenAt, clientIdUrl?, redirectUri?}]}`. An array rather than an object
 * keyed by entry key, because entry keys are opaque strings and a key such as `__proto__` would
 * corrupt an object spread; the order also gives `list()` a stable order. Only bound entries
 * appear: an unbound entry has no pair. A disabled entry's pair stays until `remove`, so it keeps
 * its id and its name (R-ID-09, R-ID-13, R-NAME-02, TQ-7 decided by the user 2026-11-13).
 */
import { isAgentId, nameKey } from '../../mcp-schema/index.js'
import { MISUSE } from './constants.js'

export const EMPTY_REGISTRY = Object.freeze({ pairs: Object.freeze([]) })

const isTime = (value) => Number.isSafeInteger(value)
const isKey = (value) => typeof value === 'string' && value.length > 0
const isOptionalKey = (value) => value === undefined || isKey(value)

function isStoredPair(value) {
  return value !== null && typeof value === 'object'
    && isKey(value.entryKey) && isKey(value.principalKey) && isAgentId(value.id)
    && (value.name === null || typeof value.name === 'string')
    && isTime(value.pairedAt) && (value.lastSeenAt === null || isTime(value.lastSeenAt))
    && isOptionalKey(value.clientIdUrl) && isOptionalKey(value.redirectUri)
}

/** Whether `keyOf` gives every item a different key; `null` keys (nameless principals) never clash. */
function allDistinct(items, keyOf) {
  const keys = items.map(keyOf).filter((key) => key !== null)
  return new Set(keys).size === keys.length
}

/**
 * The record's check, as dsh-storage-domain's `domainTable` expects (`parse`, run when the domain
 * opens). The store also runs it on every next record before writing it (`store.js` `change`), so
 * a record that would fail the next open never becomes durable: the registry is authoritative and
 * its domain has no backup-and-skip, so such a record would keep the connector from opening at
 * all. Beyond the shape it checks the invariants the store keeps: one pair per entry, unique
 * principal keys, unique ids (R-ID-13), unique folded names (R-NAME-02). Written by hand, not in
 * zod, so this module needs no package of its own (as core's acceptance ledger).
 */
export const registrySchema = Object.freeze({
  parse(value) {
    const ok = value !== null && typeof value === 'object' && Array.isArray(value.pairs) && value.pairs.every(isStoredPair)
      && allDistinct(value.pairs, (pair) => pair.entryKey)
      && allDistinct(value.pairs, (pair) => pair.principalKey)
      && allDistinct(value.pairs, (pair) => pair.id)
      && allDistinct(value.pairs, (pair) => (pair.name === null ? null : nameKey(pair.name)))
    if (!ok) throw new TypeError(MISUSE.record)
    return value
  },
})

/** The K1 `Pair` view of a stored pair (or `undefined`): frozen, the optional page fields only when recorded. */
export function pairView(stored) {
  if (stored === undefined) return undefined
  const { entryKey, principalKey, id, name, pairedAt, lastSeenAt, clientIdUrl, redirectUri } = stored
  return Object.freeze({
    entryKey, principalKey, id, name, pairedAt, lastSeenAt,
    ...(clientIdUrl === undefined ? {} : { clientIdUrl }),
    ...(redirectUri === undefined ? {} : { redirectUri }),
  })
}

export const findByEntry = (registry, entryKey) => registry.pairs.find((pair) => pair.entryKey === entryKey)
export const findByPrincipal = (registry, principalKey) => registry.pairs.find((pair) => pair.principalKey === principalKey)

/** Whether another entry holds `id`. Ids compare exactly: case-sensitive (R-ID-02, R-ID-13). */
export const idHeldByOther = (registry, id, entryKey) => registry.pairs.some((pair) => pair.entryKey !== entryKey && pair.id === id)

/**
 * Whether another principal holds a name whose folded key equals that of `name` (R-NAME-02). A
 * nameless principal holds no name, so absent names never clash (R-NAME-08).
 */
export function nameHeldByOther(registry, name, entryKey) {
  const key = nameKey(name)
  return namesHeldByOthers(registry, entryKey).some((held) => nameKey(held) === key)
}

/** The names every principal but `entryKey`'s holds (nameless ones hold none): what a generated name must avoid. */
export const namesHeldByOthers = (registry, entryKey) =>
  registry.pairs.filter((pair) => pair.entryKey !== entryKey && pair.name !== null).map((pair) => pair.name)

/** The registry with the pair of `entryKey` replaced by `changes` applied to it. */
export const withPairChanged = (registry, entryKey, changes) =>
  ({ pairs: registry.pairs.map((pair) => (pair.entryKey === entryKey ? { ...pair, ...changes } : pair)) })

export const withPairAdded = (registry, stored) => ({ pairs: [...registry.pairs, stored] })

export const withPairRemoved = (registry, entryKey) => ({ pairs: registry.pairs.filter((pair) => pair.entryKey !== entryKey) })

/**
 * Succession (R-NAME-07): the next record with the old pair removed and the successor's pair holding
 * the old one's name. Only this result is checked and written, once; the old pair's removal comes
 * first, so the name is never on two pairs even within the computation. A nameless old pair (one
 * still awaiting its first name call) moves no name: the successor keeps its own, since no pair is
 * left nameless by the connector (the user's decision, 2026-11-21).
 */
export const succeededName = (old, successor) => old.name ?? successor.name
export const withSuccession = (registry, old, successor) =>
  withPairChanged(withPairRemoved(registry, old.entryKey), successor.entryKey, { name: succeededName(old, successor) })

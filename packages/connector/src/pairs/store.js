/**
 * The connector's pair store (task C-PAIR): K1 `PairStore` over one record of a DSH
 * storage-domain table (design §5.8; R-ID-03/04/09/12/13, R-NAME-01…08, R-OA-12, R-OA-16 (7)).
 *
 * Atomicity (spike V3-S3 `b4dca86`): `KvTable.update` runs its transform at the record's slot on
 * the domain's one write chain, so a decision made inside it sees every earlier write and no later
 * one. Every operation that checks a uniqueness rule or a binding (bind, id, name, renewal)
 * decides inside that transform. Two racing `pair` calls on one token then bind exactly one, two on
 * one id bind exactly one, and no two principals ever hold one folded name; S3's naive get-then-put
 * control broke every one of these.
 *
 * Writes only when something changes: `update` writes and fsyncs the whole record even when its
 * transform returns the record unchanged, so each operation first decides from the in-memory record
 * (which holds only durable writes, so that decision is a valid linearisation point) and enters the
 * write chain only when it would change something, deciding again there.
 *
 * What the store does not know: token entries (C-TOKENS) and refresh chains (C-OAUTH). Callers pass
 * an `entryKey` whose token they verified, and an id that passed the token endpoint's grammar.
 */
import { randomUUID } from 'node:crypto'
import { ID_REFUSAL, PAIR_ADVICE, PAIR_TIMING, REFUSAL, checkName, isFishballId, normaliseName } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { LOG, MISUSE, PAIRS } from './constants.js'
import {
  EMPTY_REGISTRY, findByEntry, findByPrincipal, idHeldByOther, nameHeldByOther, pairView, registrySchema, withPairAdded, withPairChanged,
  withPairRemoved,
} from './registry.js'

const SILENT_LOGGER = Object.freeze({ warn() {} })
const LOG_FORMAT = '%s (%s)'

const refusal = (code) => Object.freeze({ ok: false, code })
const ALREADY_PAIRED = refusal(REFUSAL.alreadyPaired)

/** `pair`'s `already-paired` result (R-ID-04): only ever built for a caller whose token was verified. */
function alreadyPaired(stored, id) {
  const idMatches = stored.id === id
  return Object.freeze({
    ...ALREADY_PAIRED,
    bound: Object.freeze({ idMatches, boundId: stored.id, name: stored.name, pairedAt: stored.pairedAt, lastSeenAt: stored.lastSeenAt }),
    advice: idMatches ? PAIR_ADVICE.idMatches : PAIR_ADVICE.idDiffers,
  })
}

/**
 * A new pair. The principal key is random: it must be opaque (K1: handed to contributors and to
 * embed-UI) and stable for one (entry, bound id), and a binding never changes while the entry
 * lives (R-ID-09), so one key minted at the bind is stable for exactly that pair. `lastSeenAt`
 * starts empty; the pair's first authenticated request sets it (Fishball 2026-11-14, Q4).
 * `page` is the approval page's `{clientIdUrl, redirectUri}`, absent for `pair`.
 */
function newPair(entryKey, id, name, now, page) {
  const stored = { entryKey, principalKey: randomUUID(), id, name, pairedAt: now, lastSeenAt: null }
  return page === undefined ? stored : { ...stored, clientIdUrl: page.clientIdUrl, redirectUri: page.redirectUri }
}

/**
 * The one name rule of `pair`, the page and `set_name` (R-NAME-02): normalise and check, then
 * refuse a name another principal holds by its folded key.
 * @returns `{name}` (normalised) or `{code: 'name-invalid' | 'name-taken'}`
 */
function claimName(registry, entryKey, requested) {
  const checked = checkName(requested)
  if (!checked.ok) return { code: checked.code }
  return nameHeldByOther(registry, checked.name, entryKey) ? { code: REFUSAL.nameTaken } : { name: checked.name }
}

/**
 * `pair`'s name outcome (R-NAME-04, R-NAME-06, NAME-DT-01): never fails the pairing. With no name
 * given (`undefined`, or `null`, which R-NAME-02 makes the "no name" value, not a name: Fishball
 * 2026-11-14), nothing is said about it.
 */
function pairNameOutcome(registry, entryKey, requested) {
  if (requested === undefined || requested === null) return { name: null, extra: {} }
  const claimed = claimName(registry, entryKey, requested)
  return claimed.code === undefined
    ? { name: claimed.name, extra: { nameAssigned: true } }
    : { name: null, extra: { nameAssigned: false, nameRefused: claimed.code } }
}

/**
 * The page's name outcome (R-OA-12 (3)): an empty field, or one that normalises to nothing (only
 * whitespace, AUTH-DT-08 rule 5f), means no name; otherwise a bad or held name refuses the bind.
 */
const pageNameOutcome = (registry, entryKey, requested) =>
  (requested === undefined || normaliseName(requested) === '' ? { name: null } : claimName(registry, entryKey, requested))

/**
 * A step that sets one field of an existing pair, writing nothing when it already holds `value`
 * (`set_name` to the own current name, a renewal with the recorded redirect URI).
 */
const setField = (registry, stored, field, value, result) =>
  (stored[field] === value ? { result } : { next: withPairChanged(registry, stored.entryKey, { [field]: value }), result })

/**
 * The store over one KvTable of the registry domain.
 * @param table - the registry table (`get`, `put`, `update`); its record `PAIRS.recordKey` is
 *   created empty on the first write when absent.
 * @param options.logger - the background log (`warn`); `lastSeenAt` failures and throwing change
 *   listeners are logged there by diagnostic code only, never raised to the request that caused them.
 * @returns the K1 `PairStore`.
 */
export function createPairStore(table, { logger = SILENT_LOGGER } = {}) {
  const listeners = new Set()
  /**
   * `lastSeenAt` values recorded by `seen` whose durable write has not landed yet, by principal
   * key. Every read shows them at once, so a status row or an `already-paired` answer right after
   * a request already names that request's time, while the write itself stays off the request's
   * path (design §5.8 bounds the writes, not the reads). An entry leaves when its write lands or fails.
   */
  const pendingSeen = new Map()
  let ready

  const current = () => table.get(PAIRS.recordKey) ?? EMPTY_REGISTRY
  /** A stored pair as readers see it: with a newer pending `lastSeenAt`, if any. */
  function visible(stored) {
    const pending = stored === undefined ? undefined : pendingSeen.get(stored.principalKey)
    return pending === undefined || (stored.lastSeenAt !== null && stored.lastSeenAt >= pending) ? stored : { ...stored, lastSeenAt: pending }
  }

  /**
   * The table has no put-if-absent; one memoised first write creates the record before any update,
   * so concurrent first calls never race two creations. A failed creation is forgotten, so the next
   * call tries again instead of failing for the store's life.
   */
  function ensureRecord() {
    ready ??= (table.get(PAIRS.recordKey) === undefined ? table.put(PAIRS.recordKey, EMPTY_REGISTRY) : Promise.resolve())
      .catch((error) => { ready = undefined; throw error })
    return ready
  }

  function notify() {
    for (const listener of [...listeners]) {
      try { listener() } catch (error) { logger.warn(LOG_FORMAT, LOG.listenerFailed, diagnosticOf(error)) }
    }
  }

  /**
   * One atomic step over the registry. `step(registry)` returns `{result}` (nothing changes) or
   * `{next, result}`; it may throw (the operation then rejects and nothing is written). It runs on
   * the in-memory record first; only when that would change something does it run again at the
   * record's write slot, whose outcome is the answer. The next record is checked by the open-time
   * schema before it is written, so no write can make the registry unreadable. Listeners run after
   * a durable change.
   */
  async function change(step) {
    const early = step(current())
    if (early.next === undefined) return early.result
    await ensureRecord()
    let outcome
    await table.update(PAIRS.recordKey, (registry) => {
      outcome = step(registry)
      return outcome.next === undefined ? registry : registrySchema.parse(outcome.next)
    })
    if (outcome.next !== undefined) notify()
    return outcome.result
  }

  /** A step on the pair of `principalKey`, which must exist (K1's SetNameResult has no code for a stale key). */
  function stepOnPrincipal(principalKey, decide) {
    return (registry) => {
      const stored = findByPrincipal(registry, principalKey)
      if (stored === undefined) throw new Error(MISUSE.unknownPrincipal)
      return decide(registry, stored)
    }
  }

  const isSeenDue = (stored, now) => stored.lastSeenAt === null || now - stored.lastSeenAt >= PAIR_TIMING.lastSeenWriteIntervalMs

  /** The durable `lastSeenAt` write behind one `seen`; re-decided at the write slot. */
  function writeSeen(principalKey, now) {
    change((registry) => {
      const latest = findByPrincipal(registry, principalKey)
      if (latest === undefined || !isSeenDue(latest, now)) return { result: undefined }
      return { next: withPairChanged(registry, latest.entryKey, { lastSeenAt: now }), result: undefined }
    }).catch((error) => logger.warn(LOG_FORMAT, LOG.seenFailed, diagnosticOf(error))).finally(() => {
      if (pendingSeen.get(principalKey) === now) pendingSeen.delete(principalKey)
    })
  }

  return Object.freeze({
    list: () => Object.freeze(current().pairs.map((stored) => pairView(visible(stored)))),
    pairOf: (entryKey) => pairView(visible(findByEntry(current(), entryKey))),
    byPrincipal: (principalKey) => pairView(visible(findByPrincipal(current(), principalKey))),

    /**
     * `pair` (R-ID-03/04/13, R-NAME-06). Precedence: a bound entry is `already-paired` (whatever
     * the id), then a held id is `id-taken`; a name never fails it.
     * @throws TypeError when `id` is not a fishball id: the token endpoint never issues a token
     *   for one (R-ID-02), so such a call is a caller bug, not a client's refusal.
     */
    async pair(entryKey, id, name, now) {
      if (!isFishballId(id)) throw new TypeError(MISUSE.invalidId)
      return change((registry) => {
        const stored = findByEntry(registry, entryKey)
        if (stored !== undefined) return { result: alreadyPaired(visible(stored), id) }
        if (idHeldByOther(registry, id, entryKey)) return { result: refusal(REFUSAL.idTaken) }
        const outcome = pairNameOutcome(registry, entryKey, name)
        return {
          next: withPairAdded(registry, newPair(entryKey, id, outcome.name, now)),
          result: Object.freeze({ ok: true, paired: true, id, name: outcome.name, ...outcome.extra }),
        }
      })
    },

    /**
     * The approval page's bind (R-OA-12 (2)–(4), AUTH-DT-08). Order: `already-paired`, then the
     * typed id (`id-invalid`, `id-taken`), then a non-empty name (`name-invalid`, `name-taken`);
     * any refusal binds nothing. On success the client id URL and redirect URI are recorded.
     */
    async bindFromPage(entryKey, id, name, client, now) {
      return change((registry) => {
        if (findByEntry(registry, entryKey) !== undefined) return { result: ALREADY_PAIRED }
        if (!isFishballId(id)) return { result: refusal(ID_REFUSAL.idInvalid) }
        if (idHeldByOther(registry, id, entryKey)) return { result: refusal(REFUSAL.idTaken) }
        const outcome = pageNameOutcome(registry, entryKey, name)
        if (outcome.code !== undefined) return { result: refusal(outcome.code) }
        const stored = newPair(entryKey, id, outcome.name, now, client)
        return { next: withPairAdded(registry, stored), result: Object.freeze({ ok: true, pair: pairView(stored) }) }
      })
    },

    /**
     * The page's renewal (R-OA-16 (7), R-OA-12 (2)). The pair must have been made by the page for
     * exactly `client.clientIdUrl` (a `pair`-made pair records none, so it never renews here) and be
     * bound to `id`; anything else is `already-paired`. It changes only the recorded redirect URI.
     *
     * Deliberately not checked here (Fishball 2026-11-14, Q1 A): that every chain of the entry
     * ended and no disable, re-enable or value change happened since is C-OAUTH-WEB's
     * `OAuthTokenStore.chainsOf(entry, generation) === 'ended'` gate, run before this call; that
     * `client.redirectUri` is one the client's metadata document lists is C-OAUTH-WEB's document
     * check. The store has neither the entry generation nor the document.
     */
    async renewFromPage(entryKey, id, client) {
      return change((registry) => {
        const stored = findByEntry(registry, entryKey)
        const sameClient = stored !== undefined && stored.clientIdUrl !== undefined && stored.clientIdUrl === client.clientIdUrl && stored.id === id
        if (!sameClient) return { result: ALREADY_PAIRED }
        const result = Object.freeze({ ok: true, pair: pairView(visible({ ...stored, redirectUri: client.redirectUri })) })
        return setField(registry, stored, 'redirectUri', client.redirectUri, result)
      })
    },

    /**
     * `set_name` (R-NAME-02, NAME-DT-02); `null` clears. Setting the own current name again in the
     * same case, or clearing an absent name, writes nothing and notifies nobody; a case-only change
     * is stored.
     * @throws Error when no pair has `principalKey` (its entry was deleted after the token check):
     *   K1's `SetNameResult` has no code for it, and C-TOOLS answers `operation-failed`
     *   (Fishball 2026-11-14, Q2 A).
     */
    async setName(principalKey, name) {
      return change(stepOnPrincipal(principalKey, (registry, stored) => {
        const claimed = name === null ? { name: null } : claimName(registry, stored.entryKey, name)
        if (claimed.code !== undefined) return { result: refusal(claimed.code) }
        return setField(registry, stored, 'name', claimed.name, Object.freeze({ ok: true, name: claimed.name }))
      }))
    },

    /**
     * Records an authenticated request of `principalKey` at `now` (R-ID-12). Every read shows it at
     * once; the durable write happens when the pair has no `lastSeenAt` yet or its last one is at
     * least PAIR_TIMING.lastSeenWriteIntervalMs old (design §5.8: bounds the writes). Fire and
     * forget: a request never waits on it or fails by it (a failure is logged). An unknown key is
     * ignored, as a request whose pair was deleted after its token check.
     */
    seen(principalKey, now) {
      try {
        const stored = visible(findByPrincipal(current(), principalKey))
        if (stored === undefined || !isSeenDue(stored, now)) return
        pendingSeen.set(principalKey, now)
        writeSeen(principalKey, now)
      } catch (error) {
        // A closed or quarantined domain throws on a synchronous read.
        logger.warn(LOG_FORMAT, LOG.seenFailed, diagnosticOf(error))
      }
    },

    /** Deleting an entry frees its id and its name (R-ID-13, R-NAME-02); an unpaired entry is a no-op. */
    async remove(entryKey) {
      await change((registry) => {
        const stored = findByEntry(registry, entryKey)
        return stored === undefined ? { result: undefined } : { next: withPairRemoved(registry, entryKey), result: undefined }
      })
    },

    /** `listener()` runs after each durable change of any pair (bind, name, renewal, lastSeenAt, removal). */
    onChange(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  })
}

/**
 * Opens the registry domain and its store.
 * @param ctx - a Cordis context providing `ctx.storageDomain` (dsh-storage-domain's facility).
 * @param storageDomain - `{defineDomain, domainTable}` of `@deepseek-ai/dsh-storage-domain`, passed
 *   in by the row that owns the connector's manifest (as core's `openLedger`), so this module adds
 *   no import of a host package.
 * @param options.logger - see `createPairStore`.
 * @returns `{store, close}`; the caller owns `close` (typically as its own `ctx.effect`).
 */
export async function openPairStore(ctx, { defineDomain, domainTable }, { logger } = {}) {
  const domain = await ctx.storageDomain.open(defineDomain({
    name: PAIRS.domain,
    version: PAIRS.version,
    tables: { [PAIRS.table]: domainTable(registrySchema) },
  }))
  return { store: createPairStore(domain.table(PAIRS.table), { logger }), close: () => domain.close() }
}

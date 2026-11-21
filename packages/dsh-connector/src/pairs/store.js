/**
 * The connector's pair store (task C-PAIR): K1 `PairStore` over one record of a DSH
 * storage-domain table (design §5.5a, §5.8; R-ID-03/04/09/12/13, R-NAME-01…08, R-OA-12, R-OA-22).
 *
 * Atomicity (spike V3-S3 `b4dca86`): `KvTable.update` runs its transform at the record's slot on
 * the domain's one write chain, so a decision made inside it sees every earlier write and no later
 * one. Every operation that checks a uniqueness rule or a binding (bind, id, name, reconnect)
 * decides inside that transform. Two racing `pair` calls on one token then bind exactly one, two on
 * one id bind exactly one, and no two principals ever hold one folded name; S3's naive get-then-put
 * control broke every one of these.
 *
 * Writes only when something changes: `update` writes and fsyncs the whole record even when its
 * transform returns the record unchanged, so each operation first decides from the in-memory record
 * (which holds only durable writes, so that decision is a valid linearisation point) and enters the
 * write chain only when it would change something, deciding again there.
 *
 * Names (the user's decision, 2026-11-21, superseding R-NAME-04's "the connector never assigns a
 * name"): this store is where a name is assigned. `pair` without a usable name, `set_name(null)` and
 * a refused `set_name` on a nameless pair store a generated name (`./names.js`), decided inside the
 * same atomic step as every other name rule, so it is unique by the same fold; the open-time
 * backfill names pairs stored nameless before. Only a page bind with an empty name field stays
 * nameless, until its agent's first name call.
 *
 * What the store does not know: token entries (C-TOKENS) and refresh chains (C-OAUTH). Callers pass
 * an `entryKey` whose token they verified, and an id that passed the token endpoint's grammar.
 */
import { randomUUID } from 'node:crypto'
import { ID_REFUSAL, PAIR_ADVICE, PAIR_TIMING, REFUSAL, checkName, isAgentId, normaliseName } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { LOG, MISUSE, PAIRS } from './constants.js'
import { generateName } from './names.js'
import {
  EMPTY_REGISTRY, findByEntry, findByPrincipal, idHeldByOther, nameHeldByOther, namesHeldByOthers, pairView, registrySchema, withPairAdded,
  withPairChanged, withPairRemoved, succeededName, withSuccession,
} from './registry.js'

const SILENT_LOGGER = Object.freeze({ warn() {} })

const refusal = (code) => Object.freeze({ ok: false, code })
const ALREADY_PAIRED = refusal(REFUSAL.alreadyPaired)
const SUCCESSOR_UNPAIRED = refusal(REFUSAL.successorUnpaired)

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
 * A generated name (`./names.js`) free of every name another principal holds, by its folded key,
 * and of `replaced` (the caller's own current name, when a clear replaces it: a clear never
 * answers the name it cleared).
 */
const generatedName = (registry, entryKey, random, replaced = null) =>
  generateName([...namesHeldByOthers(registry, entryKey), ...(replaced === null ? [] : [replaced])], random)

/**
 * `pair`'s name outcome (R-NAME-06, NAME-DT-01): never fails the pairing, and never leaves the pair
 * nameless (the user's decision, 2026-11-21, superseding R-NAME-04's "the connector never assigns
 * a name"): without a usable name the pair gets a generated one. With no name given (`undefined`,
 * or `null`, which R-NAME-02 makes the "no name" value, not a name: Fishball 2026-11-14), nothing
 * is said about it; a refused name is still reported (`nameAssigned: false`, `nameRefused`), so
 * the agent learns its own name was not taken and `name` is the generated one.
 */
function pairNameOutcome(registry, entryKey, requested, random) {
  if (requested === undefined || requested === null) return { name: generatedName(registry, entryKey, random), extra: {} }
  const claimed = claimName(registry, entryKey, requested)
  return claimed.code === undefined
    ? { name: claimed.name, extra: { nameAssigned: true } }
    : { name: generatedName(registry, entryKey, random), extra: { nameAssigned: false, nameRefused: claimed.code } }
}

/**
 * `set_name`'s step (R-NAME-02, NAME-DT-02) with the 2026-11-21 decision: a pair ends it named.
 * - a valid free name: stored (the own current name again, in the same case, writes nothing);
 * - `null` (the clear): a fresh generated name replaces the current one, which is freed;
 * - a refused name: `{ok: false, code}`, and the current name stays; a pair that has none yet (bound
 *   on the page with an empty name field, or paired before the decision) gets a generated name in the
 *   same step, while the answer still reports the refusal.
 */
function setNameStep(registry, stored, requested, random) {
  const claimed = requested === null ? { name: generatedName(registry, stored.entryKey, random, stored.name) } : claimName(registry, stored.entryKey, requested)
  if (claimed.code === undefined) return setFields(registry, stored, { name: claimed.name }, Object.freeze({ ok: true, name: claimed.name }))
  const refused = refusal(claimed.code)
  return stored.name === null ? setFields(registry, stored, { name: generatedName(registry, stored.entryKey, random) }, refused) : { result: refused }
}

/**
 * Whether a nameless pair is still waiting for its agent's first name call: bound on the approval
 * page (with an empty name field: R-OA-12 (3) binds it nameless) and no request since. Its agent
 * names it, or is named by `set_name`'s rule, on its first connect; a name generated before that
 * would read as the user's choice on the page (dsh-fishball pairing rule 1a keeps a page-bound name).
 */
const awaitsFirstName = (stored) => stored.clientIdUrl !== undefined && stored.lastSeenAt === null

/**
 * The open-time backfill of pairs stored nameless before the 2026-11-21 decision: every nameless
 * pair but one awaiting its first name call gets a generated name, each unique against the names
 * held when it is drawn (the ones drawn before it included), in one registry write.
 */
function backfillStep(registry, random) {
  const nameless = registry.pairs.filter((stored) => stored.name === null && !awaitsFirstName(stored))
  const next = nameless.reduce((acc, stored) => withPairChanged(acc, stored.entryKey, { name: generatedName(acc, stored.entryKey, random) }), registry)
  return nameless.length === 0 ? { result: undefined } : { next, result: undefined }
}

/**
 * The page's name outcome (R-OA-12 (3)): an empty field, or one that normalises to nothing (only
 * whitespace, AUTH-DT-08 rule 5f), means no name; otherwise a bad or held name refuses the bind.
 * K1 types the page's name `string | undefined` (a form field), so unlike `pair` there is no `null`.
 */
const pageNameOutcome = (registry, entryKey, requested) =>
  (requested === undefined || normaliseName(requested) === '' ? { name: null } : claimName(registry, entryKey, requested))

/**
 * A step that sets fields of an existing pair, writing nothing when it already holds every value
 * (`set_name` to the own current name, a reconnect from the recorded client and redirect URI).
 */
const setFields = (registry, stored, changes, result) =>
  (Object.entries(changes).every(([field, value]) => stored[field] === value)
    ? { result }
    : { next: withPairChanged(registry, stored.entryKey, changes), result })

/**
 * The store over one KvTable of the registry domain.
 * @param table - the registry table (`get`, `put`, `update`); its record `PAIRS.recordKey` is
 *   created empty on the first write when absent.
 * @param options.logger - the background log (`warn`); `lastSeenAt` failures and throwing change
 *   listeners are logged there by diagnostic code only, never raised to the request that caused them.
 * @param options.random - the generated names' random source (`./names.js`), for tests.
 * @returns the K1 `PairStore`.
 */
export const createPairStore = (table, options) => buildPairStore(table, options).store

/** The store and its open-time backfill (`backfillStep`), which only `openPairStore` runs. */
function buildPairStore(table, { logger = SILENT_LOGGER, random } = {}) {
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
      try { listener() } catch (error) { logger.warn(LOG.format, LOG.listenerFailed, diagnosticOf(error)) }
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
      if (outcome.next === undefined) return registry
      try { return registrySchema.parse(outcome.next) } catch { throw new TypeError(MISUSE.write) }
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
    }).catch((error) => logger.warn(LOG.format, LOG.seenFailed, diagnosticOf(error))).finally(() => {
      if (pendingSeen.get(principalKey) === now) pendingSeen.delete(principalKey)
    })
  }

  const store = Object.freeze({
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
      if (!isAgentId(id)) throw new TypeError(MISUSE.invalidId)
      return change((registry) => {
        const stored = findByEntry(registry, entryKey)
        if (stored !== undefined) return { result: alreadyPaired(visible(stored), id) }
        if (idHeldByOther(registry, id, entryKey)) return { result: refusal(REFUSAL.idTaken) }
        const outcome = pairNameOutcome(registry, entryKey, name, random)
        return {
          next: withPairAdded(registry, newPair(entryKey, id, outcome.name, now)),
          result: Object.freeze({ ok: true, paired: true, id, name: outcome.name, ...outcome.extra }),
        }
      })
    },

    /**
     * The approval page's bind of an unpaired entry (R-OA-22, R-OA-12 (3)–(4), AUTH-DT-08), with
     * full rights at once. `id` is the one the agent passed in its authorization request, or the id
     * derived from its client id URL (C-OAUTH-WEB decides which). Order: `already-paired`, then the
     * id (`id-invalid`, `id-taken`), then a non-empty name (`name-invalid`, `name-taken`); any
     * refusal binds nothing. On success the client id URL and redirect URI are recorded.
     */
    async bindFromPage(entryKey, id, name, client, now) {
      return change((registry) => {
        if (findByEntry(registry, entryKey) !== undefined) return { result: ALREADY_PAIRED }
        if (!isAgentId(id)) return { result: refusal(ID_REFUSAL.idInvalid) }
        if (idHeldByOther(registry, id, entryKey)) return { result: refusal(REFUSAL.idTaken) }
        const outcome = pageNameOutcome(registry, entryKey, name)
        if (outcome.code !== undefined) return { result: refusal(outcome.code) }
        const stored = newPair(entryKey, id, outcome.name, now, client)
        return { next: withPairAdded(registry, stored), result: Object.freeze({ ok: true, pair: pairView(stored) }) }
      })
    },

    /**
     * The page's reconnect (R-OA-22, requirements 1.33 Q-A2 A; K1d replaced the renewal). A bound
     * entry whose pair holds `id`, bound on the page or by `pair` (R-OA-12 (2) refuses only another
     * id), keeps its principal: the principal key, id, name and `pairedAt` stay, so its managed
     * sessions and queued events, keyed on the principal, stay too. Only the newest client id URL
     * and redirect URI are recorded, so the newest browser client is the one whose chains stand
     * (C-OAUTH-WEB's `liveBinding`) and a `pair`-made entry becomes page-bound. Any other id is
     * `already-paired` and nothing changes. There is no age condition (R-OA-23).
     *
     * Not checked here: that `client.redirectUri` is one the client's metadata document lists
     * (C-OAUTH-WEB's document check at `/authorize`); the store has no document.
     * @throws TypeError (the promise rejects) when the entry is unpaired: a caller bug, since the
     *   page binds an unpaired entry with `bindFromPage` (K1d-5, as `succeed`'s TypeError).
     */
    async reconnectFromPage(entryKey, id, client) {
      return change((registry) => {
        const stored = findByEntry(registry, entryKey)
        if (stored === undefined) throw new TypeError(MISUSE.reconnectUnpaired)
        if (stored.id !== id) return { result: ALREADY_PAIRED }
        const changes = { clientIdUrl: client.clientIdUrl, redirectUri: client.redirectUri }
        const result = Object.freeze({ ok: true, pair: pairView(visible({ ...stored, ...changes })) })
        return setFields(registry, stored, changes, result)
      })
    },

    /**
     * `set_name` (R-NAME-02, NAME-DT-02; `setNameStep`): `null` replaces the name with a generated
     * one. Setting the own current name again in the same case writes nothing and notifies nobody; a
     * case-only change is stored.
     * @throws Error when no pair has `principalKey` (its entry was deleted after the token check):
     *   K1's `SetNameResult` has no code for it, and C-TOOLS answers `operation-failed`
     *   (Fishball 2026-11-14, Q2 A).
     */
    async setName(principalKey, name) {
      return change(stepOnPrincipal(principalKey, (registry, stored) => setNameStep(registry, stored, name, random)))
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
        logger.warn(LOG.format, LOG.seenFailed, diagnosticOf(error))
      }
    },

    /** Deleting an entry frees its id and its name (R-ID-13, R-NAME-02); an unpaired entry is a no-op. */
    async remove(entryKey) {
      await change((registry) => {
        const stored = findByEntry(registry, entryKey)
        return stored === undefined ? { result: undefined } : { next: withPairRemoved(registry, entryKey), result: undefined }
      })
    },

    /**
     * Reinstall succession's pair step (K1 `PairStore.succeed`; R-HOST-09, R-NAME-07, NAME-ST-01
     * rows 8–9), for C-SUCCEED's `retire`. One registry write removes the old pair, which frees its
     * id, and gives the successor the old pair's name (`succeededName`: a nameless old pair moves
     * none, so the successor keeps its own, 2026-11-21). The name therefore moves
     * without ever being held twice, and the uniqueness check cannot refuse it: the only other holder
     * of that name was the old pair, which leaves in the same write. A failed write changes nothing.
     * - successor unpaired: `successor-unpaired` (K3 RetireRefusalCode), nothing changes;
     * - old entry never paired: `{ok: true, pair}` with the successor's pair as it is, and nothing
     *   changes. It has no principal, so there is no name, or lack of one, to move (Fishball
     *   2026-11-14), and the successor keeps its own;
     * - else `{ok: true, pair}`, the successor's pair after the step: only its name changed.
     * The successor is checked first, so a successor that has not paired yet is reported even when
     * the old entry has gone, and the instance retries at its next start (HOST-DT-02 rule 2).
     * @throws TypeError when both keys name one entry: a caller bug, it cannot succeed itself.
     */
    async succeed(oldEntryKey, successorEntryKey) {
      if (oldEntryKey === successorEntryKey) throw new TypeError(MISUSE.selfSuccession)
      return change((registry) => {
        const successor = findByEntry(registry, successorEntryKey)
        if (successor === undefined) return { result: SUCCESSOR_UNPAIRED }
        const old = findByEntry(registry, oldEntryKey)
        const succeeded = (stored) => Object.freeze({ ok: true, pair: pairView(visible(stored)) })
        if (old === undefined) return { result: succeeded(successor) }
        const result = succeeded({ ...successor, name: succeededName(old, successor) })
        return { next: withSuccession(registry, old, successor), result }
      })
    },

    /** `listener()` runs after each durable change of any pair (bind, name, reconnect, lastSeenAt, removal). */
    onChange(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  })

  /** The backfill (`backfillStep`); a failure is logged and leaves the pairs as they were. */
  const backfill = () => change((registry) => backfillStep(registry, random)).catch((error) => logger.warn(LOG.format, LOG.backfillFailed, diagnosticOf(error)))
  return { store, backfill }
}

/**
 * Opens the registry domain and its store.
 * @param ctx - a Cordis context providing `ctx.storageDomain` (dsh-storage-domain's facility).
 * @param storageDomain - `{defineDomain, domainTable}` of `@deepseek-ai/dsh-storage-domain`, passed
 *   in by the row that owns the connector's manifest (as core's `openLedger`), so this module adds
 *   no import of a host package.
 * @param options.logger, options.random - see `createPairStore`.
 * @returns `{store, close}`, after the backfill of nameless pairs (`backfillStep`) ran; the caller
 *   owns `close` (typically as its own `ctx.effect`).
 */
export async function openPairStore(ctx, { defineDomain, domainTable }, { logger, random } = {}) {
  const domain = await ctx.storageDomain.open(defineDomain({
    name: PAIRS.domain,
    version: PAIRS.version,
    tables: { [PAIRS.table]: domainTable(registrySchema) },
  }))
  const { store, backfill } = buildPairStore(domain.table(PAIRS.table), { logger, random })
  await backfill()
  return { store, close: () => domain.close() }
}

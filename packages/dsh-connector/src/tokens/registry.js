/**
 * The token registry (tasks C-TOKENS, C-TOKENS-REVEAL; K1 `TokenRegistry`; design §5.1–§5.3, §5.6,
 * §5.9; R-TOK-03…11; requirements 1.27–1.29).
 *
 * A token entry is one item `{label, enabled, key}` of the connector's native settings list plus
 * one durable record (store.js) holding the SHA-256 digest of its value. **Only the connector
 * generates a value** (`create`, `createHosted`), and each returns it **once**: nothing here keeps
 * it, and nothing can read it back (R-TOK-04, R-TOK-11). Nothing in this module touches
 * `ctx.credentials`: the host keeps no token value at all, hosted ones included (R1).
 *
 * One sync (`apply(tokens)`, for a settings change or the start) runs serialised with every other
 * sync. It checks the list for the problems of design §5.9 (R3, R5), each a group of items:
 * - two or more items with one entry `key`;
 * - an item whose `key` has no live record (added by hand, so it has no digest; a key whose entry
 *   was deleted never comes back, so it counts too);
 * - two or more entries whose records share one digest (only a store edited by hand can do this).
 * A **save** that brings in a problem the current state did not already have is refused
 * `token-duplicate`: nothing changes, `restoreTokens` writes the previous list back, and the
 * notice names the labels. A save that leaves an existing problem as it was is accepted, so a label
 * edit, a switch, a removal or a reorder is never blocked by it. A problem found outside a save
 * (at start, or in a restore's own echo) cannot be undone: the entries involved are listed with
 * `enabled: false` and never match (they refuse every token request, approval and MCP request)
 * until it is fixed, and the notice shows. That is not a revocation: no generation changes, so the
 * entry's tokens work again once the list is fixed.
 *
 * Revocation (R-TOK-05, R-TOK-09, R-OA-06): a disable and a delete each add `GENERATION.step` to
 * the entry's `generation` and fire `onRevoked` once (`disabled`, `deleted`). A re-enable adds
 * nothing: tokens issued before the disable carry the older generation and stay invalid, and the
 * pair is kept (R-ID-09). A delete drops the digest record; there is no value to unset.
 *
 * Fail closed on storage: the new state is in memory before the listeners run, so the next request
 * sees it whatever the store does. An entry whose generation is newer in memory than in the store
 * is unusable until the record is written (retried at every sync): otherwise a restart would bring
 * the older generation back and revive the tokens issued under it.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { ENTRY_STATUS, REVOCATION_KIND, SETTINGS_REFUSAL, TOKEN_VALUE } from '../../mcp-schema/constants.js'
import { diagnosticOf } from '../errors.js'
import { CREATE_ERROR, DIGEST_ENCODING, ENTRY_KEY, GENERATION, HOSTED_TOKEN, LOG, NO_TEXT, SYNC_REASON, VALUE_ENCODING } from './constants.js'
import { openTokenStore } from './store.js'

/** A generated token value (design §5.2): prefix + base64url of the K1 number of random bytes. */
export const generateTokenValue = () => TOKEN_VALUE.generatedPrefix + randomBytes(TOKEN_VALUE.generatedBytes).toString(VALUE_ENCODING)

/** The stored digest of a value (design §5.1). */
const digestOf = (value) => createHash(TOKEN_VALUE.digestAlgorithm).update(value).digest(DIGEST_ENCODING)

/** Constant-time equality of two digests of the one fixed algorithm and encoding. */
function sameDigest(a, b) {
  const left = Buffer.from(a, DIGEST_ENCODING)
  const right = Buffer.from(b, DIGEST_ENCODING)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Why `create` / `createHosted` rejected after a valid label: nothing was created (K3 `operation-failed`). */
export class TokenCreateError extends Error {
  constructor(cause) {
    super(CREATE_ERROR.operationFailed, { cause })
    this.name = TokenCreateError.name
    this.code = CREATE_ERROR.operationFailed
  }
}

/** One settings item as the registry reads it; anything else in it is ignored. */
const itemOf = (raw) => ({
  label: typeof raw?.label === 'string' ? raw.label : NO_TEXT,
  enabled: raw?.enabled === true,
  key: typeof raw?.key === 'string' ? raw.key : NO_TEXT,
})
const itemsOf = (tokens) => (Array.isArray(tokens) ? tokens : []).map(itemOf)

/** Groups `values` by `keyOf`, keeping only groups of two or more. */
function sharedGroups(values, keyOf) {
  const groups = new Map()
  for (const value of values) groups.set(keyOf(value), [...(groups.get(keyOf(value)) ?? []), value])
  return [...groups.values()].filter((group) => group.length > 1)
}

const labelsOf = (group) => Object.freeze(group.map((item) => item.label))

/**
 * The labels of every item whose `key` another item also has, one group per shared key (R3). The
 * one implementation of the key rule: C-WIRE's settings schema may use it to refuse the save itself.
 * The digest and no-record rules need the records, so only `apply` can check them.
 * @param {readonly {label?: unknown, key?: unknown}[]} tokens
 * @returns {string[][]} empty when every key is distinct
 */
export const findDuplicates = (tokens) => sharedGroups(itemsOf(tokens), (item) => item.key).map(labelsOf)

const newEntryKey = () => randomBytes(ENTRY_KEY.bytes).toString(ENTRY_KEY.encoding)
const labelsText = (labels) => labels.join(LOG.labelSeparator)
const bumped = (generation) => generation + GENERATION.step
const publicList = (records) => records.filter((record) => !record.removed).map(({ label, enabled, entryKey }) => ({ label, enabled, key: entryKey }))
/** Equal as stored or as written back: the shapes compared are built with one key order. */
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)
/** How often each key occurs among the items of `groups`. */
function keyCounts(groups) {
  const counts = new Map()
  for (const item of groups.flat()) counts.set(item.key, (counts.get(item.key) ?? 0) + 1)
  return counts
}
const freezeGroups = (groups) => Object.freeze(groups.map(labelsOf))

/**
 * @param {object} options
 * @param {object} options.ctx - a Cordis context with `storageDomain`.
 * @param {object} options.logger - `warn(format, ...args)`; is only ever given labels and error codes.
 * @param {import('../../mcp-schema/index.js').SettingsWriter} options.settings - the K1d writer `create`
 *   adds its item through (C-WIRE binds it). `addToken` resolves after the save and this registry's
 *   `apply` of it, so it is called outside the sync queue.
 * @param {(previous: {label: string, enabled: boolean, key: string}[]) => Promise<void>} [options.restoreTokens]
 *   writes the previous list back to the settings after a refused save (C-WIRE owns the document).
 *   It runs inside the registry's sync queue, so it must not wait for the `apply` that its own
 *   write's `settings/document-updated` starts: that `apply` is queued behind it. That `apply`
 *   (the restored list, the default reason) is not counted as the user saving again.
 */
export function createTokenRegistry({ ctx, logger, settings, restoreTokens }) {
  /** entryKey → record as the registry holds it (store.js shape), removed ones included. */
  const records = new Map()
  /** entryKey → the copy of that record the store holds (absent: none). */
  const stored = new Map()
  /** Records written by a `create` whose settings item is not saved yet: never treated as deleted. */
  const creating = new Set()
  /** The live state, in settings order: `{entry, digest, problem}` (`digest` null: no record). */
  let live = []
  /** The list as last applied, for a restore. */
  let applied
  /** The list a refusal wrote back, until the next settings sync, which is that write's when it holds this list. */
  let restored
  /** The problem groups (items) of the list last applied, and of the last refused save until an accepted one. */
  let problems = []
  let refusedGroups
  const listeners = new Set()
  let store
  let ready
  let chain = Promise.resolve()

  /**
   * Opens the store once. A failed open is kept: every later call rejects and nothing
   * authenticates until the connector restarts (fail closed).
   */
  const init = () => (ready ??= (async () => {
    store = await openTokenStore(ctx.storageDomain)
    for (const [entryKey, record] of store.table.entries()) {
      records.set(entryKey, record)
      stored.set(entryKey, record)
    }
  })())

  const serial = (task) => {
    const run = chain.then(() => init()).then(task)
    chain = run.catch(() => {})
    return run
  }

  const liveRecord = (key) => {
    const record = records.get(key)
    return record === undefined || record.removed ? undefined : record
  }

  /**
   * The problems of `items` (see the header): `groups`, one per problem, and `sharedKeys`, the keys
   * two or more items hold (such an item cannot be told to be the entry).
   */
  function problemsOf(items) {
    const keyGroups = sharedGroups(items, (item) => item.key)
    const shared = new Set(keyGroups.flat())
    const single = items.filter((item) => !shared.has(item))
    const unrecorded = single.filter((item) => liveRecord(item.key) === undefined).map((item) => [item])
    const recorded = single.filter((item) => liveRecord(item.key) !== undefined)
    const digestGroups = sharedGroups(recorded, (item) => liveRecord(item.key).digest)
    return { groups: [...keyGroups, ...unrecorded, ...digestGroups], sharedKeys: new Set(keyGroups.map((group) => group[0].key)) }
  }

  /**
   * Whether a group is new to this save: one of its keys occurs in it more often than in the
   * problems the current state already has (a new item counts as not there). So a third copy of
   * an already duplicated key is new, and the same hand-added item saved again is not.
   */
  function introduced(group, before) {
    const counts = keyCounts([group])
    return [...counts].some(([key, count]) => count > (before.get(key) ?? 0))
  }

  function announce(entryKey, kind, generation) {
    for (const listener of [...listeners]) {
      try { listener(entryKey, kind, generation) } catch (error) { logger.warn(LOG.listenerFailed, diagnosticOf(error)) }
    }
  }

  /** One store write; false (logged) when it failed. */
  async function attempt(write) {
    try {
      await write()
      return true
    } catch (error) {
      logger.warn(LOG.storeWriteFailed, diagnosticOf(error))
      return false
    }
  }

  /** Writes every record whose stored copy differs from the one held. A failed write is retried by the next sync. */
  async function persist() {
    for (const record of [...records.values()]) {
      if (record.removed || sameJson(stored.get(record.entryKey), record)) continue
      if (await attempt(() => store.table.put(record.entryKey, record))) stored.set(record.entryKey, record)
    }
  }

  /** Drops the records of deleted entries; one that cannot be dropped yet stays `removed` and is retried. */
  async function settleRemoved() {
    for (const record of [...records.values()].filter((candidate) => candidate.removed)) {
      if (!stored.has(record.entryKey) || await attempt(() => store.table.delete(record.entryKey))) {
        records.delete(record.entryKey)
        stored.delete(record.entryKey)
      }
    }
  }

  /** A refusal: nothing changes, and the refused save is written back (R-TOK-08). Labels only. */
  async function refuse(groups) {
    refusedGroups = groups
    if (restoreTokens !== undefined) {
      const previous = applied ?? publicList([...records.values()])
      // Set before the write: a restore that fails after writing must not let its echo count as an
      // accepted save (fail closed). One that fails before costs one user save of this same list.
      restored = previous
      try { await restoreTokens(previous) } catch (error) { logger.warn(LOG.restoreFailed, diagnosticOf(error)) }
    }
    return Object.freeze({ ok: false, code: SETTINGS_REFUSAL.tokenDuplicate, labels: freezeGroups(groups) })
  }

  /** The next record of an item with a record of its own, and the revocation it causes, if any. */
  function commitOne(item, record) {
    const kind = record.enabled && !item.enabled ? REVOCATION_KIND.disabled : undefined
    const next = { ...record, label: item.label, enabled: item.enabled, generation: kind === undefined ? record.generation : bumped(record.generation) }
    return { next, kind }
  }

  async function sync(tokens, reason) {
    const items = itemsOf(tokens)
    // The first settings sync after a restore is that restore's own write when it holds the
    // restored list: it is not the user saving, so nothing in it is refused. Any settings sync
    // clears `restored`, so a lost write-back event costs at most one user save of that same list.
    // Limit: a second user save queued between a refusal and its write's event takes the echo's
    // place; telling them apart for sure needs C-WIRE to mark its write.
    const settingsSync = reason === SYNC_REASON.settings
    const echo = settingsSync && restored !== undefined && sameJson(items, restored)
    if (settingsSync) restored = undefined
    const saved = settingsSync && !echo

    const { groups: found, sharedKeys } = problemsOf(items)
    const before = keyCounts(problems)
    const refusing = saved ? found.filter((group) => introduced(group, before)) : []
    for (const group of found) logger.warn(LOG.duplicate, labelsText(labelsOf(group)), refusing.includes(group) ? LOG.duplicateRefused : LOG.duplicateUnusable)
    if (refusing.length > 0) return refuse(refusing)
    if (saved) refusedGroups = undefined

    await settleRemoved()
    const inProblem = new Set(found.flat())
    const commits = []
    for (const item of items) {
      const record = liveRecord(item.key)
      // An item sharing its key with another cannot be told to be the entry: its record is left as
      // it was until the list is fixed (both items are listed, unusable).
      const { next, kind } = record === undefined || sharedKeys.has(item.key) ? { next: record, kind: undefined } : commitOne(item, record)
      commits.push({ item, next, kind, problem: inProblem.has(item) })
    }
    const listed = new Set(items.map((item) => item.key))
    const deleted = [...records.values()].filter((record) => !record.removed && !listed.has(record.entryKey) && !creating.has(record.entryKey))
      .map((record) => ({ ...record, generation: bumped(record.generation), removed: true }))

    // The swap: from here on match/get/list answer the new state (the next request, R-TOK-05).
    for (const record of [...commits.map(({ next }) => next).filter(Boolean), ...deleted]) records.set(record.entryKey, record)
    live = commits.map(({ item, next, problem }) => ({
      entry: Object.freeze({
        entryKey: item.key,
        label: item.label,
        // An entry in a problem refuses service (design §5.9): every caller admits only `enabled`.
        enabled: item.enabled && !problem && next !== undefined,
        status: ENTRY_STATUS.ok,
        generation: next?.generation ?? GENERATION.first,
        hosted: next?.hosted ?? false,
      }),
      digest: problem ? null : next?.digest ?? null,
    }))
    applied = items
    problems = found
    for (const record of deleted) announce(record.entryKey, REVOCATION_KIND.deleted, record.generation)
    for (const { next, kind } of commits) if (kind !== undefined) announce(next.entryKey, kind, next.generation)

    await persist()
    await settleRemoved()
    return Object.freeze({ ok: true })
  }

  /** A generation newer in memory than in the store: unusable until written (see the header). */
  const unwritten = (entry) => (stored.get(entry.entryKey)?.generation ?? GENERATION.first) < entry.generation
    || !stored.has(entry.entryKey)
  const usable = ({ entry, digest }) => entry.enabled && digest !== null && !unwritten(entry)

  /**
   * Design §5.2 steps 1–4: generate, write the record **before** the settings item (so the sync
   * that sees the new key finds its record), add the item through the SettingsWriter, then return
   * the value once. A failure at either write removes the record again and returns no value, so
   * there is no entry whose value nobody saw.
   */
  async function createEntry(label, hosted) {
    const value = generateTokenValue()
    const record = { entryKey: newEntryKey(), label, enabled: true, generation: GENERATION.first, digest: digestOf(value), hosted, removed: false }
    try {
      await serial(async () => {
        await store.table.put(record.entryKey, record)
        records.set(record.entryKey, record)
        stored.set(record.entryKey, record)
        creating.add(record.entryKey)
      })
    } catch (error) {
      logger.warn(LOG.createFailed, label, diagnosticOf(error))
      throw new TokenCreateError(error)
    }
    try {
      await settings.addToken(Object.freeze({ label, enabled: true, key: record.entryKey }))
    } catch (error) {
      logger.warn(LOG.createFailed, label, diagnosticOf(error))
      // The item never reached the list: the record goes, through the delete path's retry.
      await serial(async () => {
        creating.delete(record.entryKey)
        if (!live.some((state) => state.entry.entryKey === record.entryKey)) {
          records.set(record.entryKey, { ...record, removed: true })
          await settleRemoved()
        }
      }).catch(() => {})
      throw new TokenCreateError(error)
    }
    creating.delete(record.entryKey)
    return Object.freeze({ entryKey: record.entryKey, label, value })
  }

  const registry = Object.freeze({
    /**
     * Applies the settings list: on `settings/document-updated` (the default reason), and once at
     * start with `SYNC_REASON.start`. Resolves `{ok: true}` or `{ok: false, code, labels}`
     * (`token-duplicate`; labels only), never with a value. Rejects when the store cannot be opened.
     * @param {readonly {label: string, enabled: boolean, key: string}[]} tokens
     * @param {string} [reason] SYNC_REASON
     */
    apply: (tokens, reason = SYNC_REASON.settings) => serial(() => sync(tokens, reason)),

    /**
     * New token (design §5.9 step 3): a new enabled entry labelled `label` (trimmed). Resolves
     * `{entryKey, label, value}`, the only time this value is ever returned. Rejects `TypeError`
     * for a label that is not a non-empty string, and `TokenCreateError` (`operation-failed`) when
     * the record or the item could not be written; either way nothing was created.
     */
    create(label) {
      const trimmed = typeof label === 'string' ? label.trim() : NO_TEXT
      if (trimmed === NO_TEXT) return Promise.reject(new TypeError(LOG.invalidLabel))
      return createEntry(trimmed, false)
    },

    /**
     * The hosted create (design §5.4, R1): as `create`, labelled "Fishball (hosted)" and marked
     * `hosted`. Its only caller is C-SUCCEED's K3 `createHosted(instanceId)`, which returns the value
     * to the instance in process; it never reaches a UI.
     */
    createHosted: () => createEntry(HOSTED_TOKEN.label, true),

    /**
     * K1: constant-time match of the presented value's digest against the usable entries' digests
     * (R-TOK-06). Every entry with a digest is compared, usable or not, with no early exit, and
     * every miss is the same `undefined`.
     */
    match(value) {
      if (typeof value !== 'string') return undefined
      const presented = digestOf(value)
      let found
      for (const state of live) {
        if (state.digest === null) continue
        const admitted = usable(state)
        const equal = sameDigest(state.digest, presented)
        found = equal && admitted ? state.entry : found
      }
      return found
    },

    get: (entryKey) => live.find((state) => state.entry.entryKey === entryKey)?.entry,

    /** Every listed entry, in settings order (K3 README: `principals()` follows it). */
    list: () => Object.freeze(live.map((state) => state.entry)),

    /**
     * The notice the settings page shows (design §5.9): `{code: 'token-duplicate', labels}` with
     * one label group per problem, or undefined: a refused save's groups (they stand until an
     * accepted save), then the problems of the list last applied.
     */
    notice() {
      const groups = [...(refusedGroups ?? []), ...problems]
      return groups.length === 0 ? undefined : Object.freeze({ code: SETTINGS_REFUSAL.tokenDuplicate, labels: freezeGroups(groups) })
    },

    onRevoked(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    /** Closes the storage domain once pending syncs are done. */
    close: () => serial(() => store.close()),
  })
  return registry
}

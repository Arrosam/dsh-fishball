/**
 * The token registry (task C-TOKENS; K1 `TokenRegistry`; design §5.1–§5.3, §5.6; R-TOK-03…09).
 *
 * A token entry is one item `{label, enabled, ref}` of the connector's native settings list; its
 * value lives only in `ctx.credentials` under `ref` (R-TOK-04). The registry turns the list into
 * K1 `TokenEntry`s and keeps, per entry, one durable record (store.js) holding no value.
 *
 * One sync (`apply(tokens)` for a settings change or the start, `refresh()` for a credential
 * change) runs in two phases, serialised with every other sync:
 * 0. the deletes of earlier syncs that could not finish (see Identity) are retried first; that
 *    completes an earlier change and is not part of this list's.
 * 1. read: every item's value is resolved and fingerprinted; nothing is written. A saved list that
 *    gives one `ref` to two items is refused `ref-duplicate` (R-TOK-08); at start or on a
 *    credential change, when there is no save to refuse, only those items are left out (6 = A).
 *    Equal values under two refs are `value-duplicate` (K1 SETTINGS_REFUSAL; see `introduced`). A
 *    refused save changes nothing (R-TOK-08 "the previous settings stay"), and the caller's
 *    `restoreTokens` writes the previous list back.
 * 2. commit: values are generated for enabled entries whose ref has none (R-TOK-08; a value unset
 *    outside a save waits for the next save, see `awaitsSave`), the new state is swapped in,
 *    revocations are announced, records are written, and the generated values of deleted entries
 *    are unset (R-TOK-09).
 *
 * Identity (Fishball's decision 2026-11-14, question 1 = A): an item is the entry whose live
 * record has its `ref`. A changed ref is therefore a delete plus a new entry, and a ref added
 * again after a delete is a new entry with a new key: no old pair or token ever comes back. While
 * a deleted entry's record or generated value is not yet removed (a failed write or unset, retried
 * at every sync), its ref is blocked: an item naming it is left out until then, so the store never
 * holds two records for one ref and the old value never authenticates the new entry. A successful
 * unset fires `credentials/reference-updated`, whose sync then lists the item.
 *
 * Revocation (R-TOK-05, R-OA-06): a disable, a delete, and a change of a value the entry had
 * (unset included; a first value is not a change, nothing was ever issued under none) each add
 * `GENERATION.step` to the entry's `generation` and fire `onRevoked` once. A re-enable adds nothing:
 * tokens issued before the disable carry the older generation and stay invalid, and the pair is
 * kept (R-ID-09). A value that cannot be read is not a change: the entry is only unusable while
 * the read fails, so a briefly unreadable store revokes nothing.
 *
 * Fail closed on storage: the new state is in memory before the listeners run, so the next request
 * sees it whatever the store does. An entry whose generation is newer in memory than in the store
 * is unusable until the record is written (retried at every sync): otherwise a restart would bring
 * the older generation back and revive the tokens issued under it. What a restart cannot recover
 * is a change the store never took at all (the store itself failing until the connector stops).
 */
import { randomBytes } from 'node:crypto'
import { ENTRY_STATUS, SETTINGS_REFUSAL, TOKEN_VALUE } from '../../mcp-schema/constants.js'
import { isTokenLongEnough } from '../../mcp-schema/rules.js'
import { diagnosticOf } from '../errors.js'
import { CREDENTIALS_UPDATED, ENTRY_KEY, GENERATION, LOG, NO_TEXT, REF_PATTERN, REVOCATION, SYNC_REASON, VALUE_ENCODING } from './constants.js'
import { loadFingerprinter, sameFingerprint } from './fingerprint.js'
import { openTokenStore } from './store.js'

/** A generated token value (design §5.2): prefix + base64url of the K1 number of random bytes. */
export const generateTokenValue = () => TOKEN_VALUE.generatedPrefix + randomBytes(TOKEN_VALUE.generatedBytes).toString(VALUE_ENCODING)

/** One settings item as the registry reads it; anything else in it is ignored. */
const itemOf = (raw) => ({
  label: typeof raw?.label === 'string' ? raw.label : NO_TEXT,
  enabled: raw?.enabled === true,
  ref: typeof raw?.ref === 'string' ? raw.ref : NO_TEXT,
})
const itemsOf = (tokens) => (Array.isArray(tokens) ? tokens : []).map(itemOf)

/** Groups `values` by `keyOf` (compared with `same`), keeping only groups of two or more. */
function sharedGroups(values, keyOf, same) {
  const groups = []
  for (const value of values) {
    const group = groups.find((candidate) => same(keyOf(candidate[0]), keyOf(value)))
    if (group === undefined) groups.push([value])
    else group.push(value)
  }
  return groups.filter((group) => group.length > 1)
}

/** Items (or records) grouped by a `ref` that two or more of them have. */
const refClashesOf = (items) => sharedGroups(items, (item) => item.ref, Object.is)

/**
 * The labels of every item whose `ref` another item also has, one group per shared ref (R-TOK-08).
 * The one implementation of the rule: C-WIRE's settings schema may use it to refuse the save itself.
 * @param {readonly {label?: unknown, ref?: unknown}[]} tokens
 * @returns {string[][]} empty when every ref is distinct
 */
export const findRefDuplicates = (tokens) => refClashesOf(itemsOf(tokens)).map((group) => group.map((item) => item.label))

const isRef = (ref) => REF_PATTERN.test(ref)
const newEntryKey = () => randomBytes(ENTRY_KEY.bytes).toString(ENTRY_KEY.encoding)
const labelsText = (labels) => labels.join(LOG.labelSeparator)
const bumped = (generation) => generation + GENERATION.step
const publicList = (records) => records.filter((record) => !record.removed).map(({ label, enabled, ref }) => ({ label, enabled, ref }))

/**
 * @param {object} options
 * @param {object} options.ctx - a Cordis context with `credentials`, `storageDomain` and `on`.
 * @param {object} options.logger - `warn(format, ...args)`; is only ever given labels and error codes.
 * @param {(previous: {label: string, enabled: boolean, ref: string}[]) => Promise<void>} [options.restoreTokens]
 *   writes the previous list back to the settings after a refused save (C-WIRE owns the document).
 *   It runs inside the registry's sync queue, so it must not wait for the `apply` that its own
 *   write's `settings/document-updated` starts: that `apply` is queued behind it.
 */
export function createTokenRegistry({ ctx, logger, restoreTokens }) {
  const credentials = ctx.credentials
  /** entryKey → record as the registry holds it (store.js shape), removed ones included. */
  const records = new Map()
  /** entryKey → the copy of that record the store holds (absent: none). */
  const stored = new Map()
  /** The live state, in settings order: `{entry, fingerprint, duplicate}`. */
  let live = []
  /** The list as last applied, for `refresh()` and for a restore. */
  let applied
  /** Records repaired at open (two for one ref): announced `deleted` by the first sync. */
  let repaired = []
  const listeners = new Set()
  let store
  let fingerprinter
  let ready
  let stopListening
  let chain = Promise.resolve()

  /**
   * Opens the store and the fingerprint key once. A failed open is kept: every later call rejects
   * and nothing authenticates until the connector restarts (fail closed).
   */
  const init = () => (ready ??= (async () => {
    store = await openTokenStore(ctx.storageDomain)
    for (const [entryKey, record] of store.table.entries()) {
      records.set(entryKey, record)
      stored.set(entryKey, record)
    }
    repairSharedRefs()
    fingerprinter = await loadFingerprinter(credentials, logger)
    // A value set, changed or unset in the store is a sync of its own (design §5.3: a changed or
    // unset value revokes). The registry's own `set`/`unset` fire it too; that sync finds nothing new.
    stopListening = ctx.on(CREDENTIALS_UPDATED, () => { registry.refresh().catch((error) => logger.warn(LOG.syncFailed, diagnosticOf(error))) })
  })())

  /**
   * Two live records for one ref cannot come from this code (a pending ref is blocked), only from
   * a store edited by hand. Neither can be told to be the entry: both are treated as deleted, and
   * neither's value is unset, since it cannot be attributed (fail closed, as 7 = A).
   */
  function repairSharedRefs() {
    const shared = refClashesOf([...records.values()].filter((record) => !record.removed)).flat()
    if (shared.length > 0) logger.warn(LOG.repairedRef)
    repaired = shared.map((record) => ({ ...record, generation: bumped(record.generation), generated: false, removed: true }))
    for (const record of repaired) records.set(record.entryKey, record)
  }

  const serial = (task) => {
    const run = chain.then(() => init()).then(task)
    chain = run.catch(() => {})
    return run
  }

  const liveRecordOf = (ref) => [...records.values()].find((record) => !record.removed && record.ref === ref)
  const pendingRefs = () => new Set([...records.values()].filter((record) => record.removed).map((record) => record.ref))

  /** The value under `ref`: `{value}` (`value` undefined when none), or `{unreadable: true}`. */
  async function readValue(ref, label) {
    if (!isRef(ref)) return { value: undefined }
    try {
      return { value: (await credentials.resolve(ref))?.value || undefined }
    } catch (error) {
      logger.warn(LOG.credentialRead, label, diagnosticOf(error))
      return { unreadable: true }
    }
  }

  /**
   * Whether a record's fingerprint was taken with this run's key. It is not after a run whose key
   * could not be stored (fingerprint.js); such a value is then treated as the user's (7 = A).
   */
  const comparable = (record) => record.keyId === fingerprinter.id

  /** Phase 1 for one item: its record (if any), value and fingerprint. Writes nothing. */
  async function read(item) {
    const record = liveRecordOf(item.ref)
    const { value, unreadable = false } = await readValue(item.ref, item.label)
    return { item, record, unreadable, value, fingerprint: value === undefined ? null : fingerprinter.of(value) }
  }

  /** The read states whose fingerprints another item's equal, one group per value. */
  const valueGroups = (reads) => sharedGroups(reads.filter((state) => state.fingerprint !== null), (state) => state.fingerprint, sameFingerprint)

  /**
   * Two entries may never hold one value (the user's decision 2026-11-14, C-TOKENS question 4 =
   * A, kept as built): a save that
   * makes an entry a duplicate that was not one already (a new item counts as not one) is refused
   * and the previous list written back, logged with the labels only. A save that leaves an existing
   * duplicate as it was is not refused, so a label change or a disable is never blocked by it. A
   * duplicate that did not come from a save (a store edit, or one found at start) has no save to
   * undo: its entries stay unusable until the values differ.
   */
  function introduced(group) {
    const wasDuplicate = (state) => live.some((current) => current.duplicate && current.entry.entryKey === state.record?.entryKey)
    return group.some((state) => !wasDuplicate(state))
  }

  /** Whether the commit should generate a value for this item (R-TOK-08), given `awaitsSave`'s answer. */
  async function mayGenerate(state, waiting) {
    const { item, value, unreadable } = state
    if (!item.enabled || value !== undefined || unreadable || !isRef(item.ref) || waiting) return false
    try { return (await credentials.describe(item.ref)).writable === true } catch (error) {
      logger.warn(LOG.credentialRead, item.label, diagnosticOf(error))
      return false
    }
  }

  /**
   * The user's decision 2026-11-14, C-TOKENS question 5 = B: an entry whose value was unset
   * outside a settings save (a store edit, or one seen at start) stays `token-unconfigured` with no
   * generated value until the user saves the settings again; any value ends the wait. Only an
   * entry that had a value waits: a new entry, or one whose ref never held a value, is generated
   * for as R-TOK-08 says. The wait is recorded as the record's `awaitSave`, so a restart (whose
   * start sync sees no value, and no earlier one) keeps waiting. A save ends it even while the
   * value cannot be read: the user did save, and the read failing is not a reason to wait longer.
   * A refused save counts too (the user's answer 2026-11-14): the user did press Save, and the
   * previous list that `restoreTokens` writes back arrives as a settings sync that ends the wait.
   */
  function awaitsSave({ record, fingerprint, unreadable }, reason) {
    if (reason === SYNC_REASON.settings) return false
    if (unreadable) return record?.awaitSave === true
    if (fingerprint !== null) return false
    return record?.awaitSave === true || (record !== undefined && record.fingerprint !== null)
  }

  /** Stores a generated value; returns it, or undefined when the store refused it. */
  async function generateFor(item) {
    const candidate = generateTokenValue()
    try {
      await credentials.set(item.ref, candidate)
      return candidate
    } catch (error) {
      logger.warn(LOG.generateFailed, item.label, diagnosticOf(error))
      return undefined
    }
  }

  /** Phase 2 for one item: generate if needed, then `{next, status, kind}`: its next record, K1 status and revocation, if any. */
  async function commitOne(state, reason) {
    const { item, record, unreadable } = state
    const waiting = awaitsSave(state, reason)
    const generatedValue = (await mayGenerate(state, waiting)) ? await generateFor(item) : undefined
    const value = generatedValue ?? state.value
    // An unreadable value keeps what the record knew: it is unknown, not changed (see the header).
    const fingerprint = generatedValue !== undefined ? fingerprinter.of(generatedValue) : unreadable ? record?.fingerprint ?? null : state.fingerprint
    const known = record !== undefined && !unreadable && comparable(record)
    const valueChanged = known && record.fingerprint !== null && !sameFingerprint(record.fingerprint, fingerprint)
    const disabled = record !== undefined && record.enabled && !item.enabled
    const kind = disabled ? REVOCATION.disabled : valueChanged ? REVOCATION.valueChanged : undefined
    const status = unreadable || value === undefined ? ENTRY_STATUS.tokenUnconfigured
      : isTokenLongEnough(value) ? ENTRY_STATUS.ok : ENTRY_STATUS.tokenTooShort
    // Question 3 = A: a value the connector did not write itself is the user's from then on, and
    // so is one it cannot compare (7 = A); only an unreadable value leaves the flag as it was.
    const generated = generatedValue !== undefined || (unreadable ? record?.generated ?? false : known && !valueChanged && record.generated)
    const next = {
      entryKey: record?.entryKey ?? newEntryKey(),
      ref: item.ref,
      label: item.label,
      enabled: item.enabled,
      generation: kind === undefined ? record?.generation ?? GENERATION.first : bumped(record.generation),
      generated,
      fingerprint,
      keyId: unreadable && record !== undefined ? record.keyId : fingerprinter.id,
      awaitSave: waiting,
      removed: false,
    }
    return { next, status, kind }
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

  /**
   * Writes every record whose stored copy differs from the one held, removed ones included (so a
   * restart retries their unset). A failed write is retried by the next sync.
   */
  async function persist() {
    for (const record of [...records.values()]) {
      if (JSON.stringify(stored.get(record.entryKey)) === JSON.stringify(record)) continue
      if (await attempt(() => store.table.put(record.entryKey, record))) stored.set(record.entryKey, record)
    }
  }

  /**
   * Unsets a deleted entry's generated value, unless the value under its ref is no longer one the
   * connector generated (the user replaced it, question 3 = A, or it cannot be compared, 7 = A): a
   * user value is never removed (R-TOK-09). True when nothing is left to unset.
   */
  async function unsetGenerated(record) {
    try {
      const current = (await credentials.resolve(record.ref))?.value
      if (current !== undefined && comparable(record) && sameFingerprint(record.fingerprint, fingerprinter.of(current))) await credentials.unset(record.ref)
      return true
    } catch (error) {
      logger.warn(LOG.unsetFailed, diagnosticOf(error))
      return false
    }
  }

  /** Finishes deleted entries: unset their generated value, then drop their record. */
  async function settleRemoved() {
    for (const record of [...records.values()].filter((candidate) => candidate.removed)) {
      if (record.generated && !(await unsetGenerated(record))) continue
      const settled = { ...record, generated: false }
      records.set(record.entryKey, settled)
      if (await attempt(() => store.table.delete(record.entryKey))) {
        records.delete(record.entryKey)
        stored.delete(record.entryKey)
      }
    }
  }

  /** A refusal: nothing changes, and a refused save is written back (R-TOK-08). Labels only. */
  async function refuse(code, groups) {
    if (restoreTokens !== undefined) {
      try { await restoreTokens(applied ?? publicList([...records.values()])) } catch (error) { logger.warn(LOG.restoreFailed, diagnosticOf(error)) }
    }
    return Object.freeze({ ok: false, code, labels: Object.freeze(groups.map((group) => Object.freeze([...group]))) })
  }

  async function sync(tokens, reason) {
    const all = itemsOf(tokens)
    const saved = reason === SYNC_REASON.settings
    const refClashes = refClashesOf(all)
    const refLabels = refClashes.map((group) => group.map((item) => item.label))
    for (const labels of refLabels) logger.warn(LOG.refDuplicate, labelsText(labels), saved ? LOG.refDuplicateRefused : LOG.refDuplicateLeftOut)
    if (refClashes.length > 0 && saved) return refuse(SETTINGS_REFUSAL.refDuplicate, refLabels)

    await settleRemoved()
    // Left out of this sync, records untouched: clashing refs (6 = A) and blocked refs (Identity).
    const clashing = new Set(refClashes.flat().map((item) => item.ref))
    const pending = pendingRefs()
    const items = all.filter((item) => !clashing.has(item.ref) && (liveRecordOf(item.ref) !== undefined || !pending.has(item.ref)))
    const reads = []
    for (const item of items) reads.push(await read(item))
    const groups = valueGroups(reads)
    const refusing = groups.filter((group) => saved && introduced(group))
    for (const group of groups) {
      logger.warn(LOG.valueDuplicate, labelsText(group.map((state) => state.item.label)), refusing.includes(group) ? LOG.valueDuplicateRestored : LOG.valueDuplicateUnusable)
    }
    if (refusing.length > 0) return refuse(SETTINGS_REFUSAL.valueDuplicate, refusing.map((group) => group.map((state) => state.item.label)))
    const duplicates = new Set(groups.flat())

    const commits = []
    for (const state of reads) commits.push({ state, ...(await commitOne(state, reason)) })
    const kept = new Set(commits.map(({ next }) => next.entryKey))
    const deleted = [...records.values()].filter((record) => !record.removed && !kept.has(record.entryKey) && !clashing.has(record.ref))
      .map((record) => ({ ...record, generation: bumped(record.generation), removed: true }))

    // The swap: from here on match/get/list answer the new state (the next request, R-TOK-05).
    for (const record of [...commits.map(({ next }) => next), ...deleted]) records.set(record.entryKey, record)
    live = commits.map(({ state, next, status }) => ({
      entry: Object.freeze({ entryKey: next.entryKey, label: next.label, enabled: next.enabled, ref: next.ref, status, generation: next.generation, generated: next.generated }),
      // An unreadable value's record keeps its last fingerprint, but nothing may match it now.
      fingerprint: state.unreadable ? null : next.fingerprint,
      duplicate: duplicates.has(state),
    }))
    applied = all
    for (const record of [...repaired, ...deleted]) announce(record.entryKey, REVOCATION.deleted, record.generation)
    repaired = []
    for (const { next, kind } of commits) if (kind !== undefined) announce(next.entryKey, kind, next.generation)

    await persist()
    await settleRemoved()
    return Object.freeze({ ok: true })
  }

  /** A generation newer in memory than in the store: unusable until written (see the header). */
  const unwritten = (entry) => (stored.get(entry.entryKey)?.generation ?? GENERATION.first) < entry.generation
  const usable = ({ entry, fingerprint, duplicate }) => entry.enabled && entry.status === ENTRY_STATUS.ok && !duplicate && fingerprint !== null && !unwritten(entry)

  const registry = Object.freeze({
    /**
     * Applies the settings list: on `settings/document-updated` (the default reason), and once at
     * start with `SYNC_REASON.start`. Resolves `{ok: true}` or `{ok: false, code, labels}`
     * (SETTINGS_REFUSAL; labels only), never with a value. Rejects when the store cannot be opened.
     * @param {readonly {label: string, enabled: boolean, ref: string}[]} tokens
     * @param {string} [reason] SYNC_REASON
     */
    apply: (tokens, reason = SYNC_REASON.settings) => serial(() => sync(tokens, reason)),

    /** Re-reads every value under the list last applied (a `credentials/reference-updated`). */
    refresh: () => serial(() => (applied === undefined ? Object.freeze({ ok: true }) : sync(applied, SYNC_REASON.credentials))),

    /**
     * K1: constant-time match against the usable entries' fingerprints (R-TOK-06). Every entry is
     * compared, usable or not, with no early exit, and every miss is the same `undefined`.
     */
    match(value) {
      if (typeof value !== 'string' || fingerprinter === undefined) return undefined
      const presented = fingerprinter.of(value)
      let found
      for (const state of live) {
        const admitted = usable(state)
        const equal = sameFingerprint(state.fingerprint, presented)
        found = equal && admitted ? state.entry : found
      }
      return found
    },

    get: (entryKey) => live.find((state) => state.entry.entryKey === entryKey)?.entry,

    /** Every listed entry, in settings order (K3 README: `principals()` follows it). */
    list: () => Object.freeze(live.map((state) => state.entry)),

    onRevoked(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    /** Stops listening to the credential store, then closes the storage domain once pending syncs are done. */
    close: () => serial(() => {
      stopListening?.()
      stopListening = undefined
      return store.close()
    }),
  })
  return registry
}

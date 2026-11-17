/**
 * `dshConnectorTokens` (task C-SUCCEED; K3 host-services/tokens.d.ts; design §5.4; R-HOST-05,
 * R-HOST-09, R-HOST-10, R-NAME-07, R-WATCH-04). The hosted token set-up and the reinstall
 * succession. Composition only: C-WIRE provides `service` as `HOSTED_SERVICE.name` on the
 * connector row; the only caller is the instance's host row, in process.
 *
 * - `openHostedStore(ctx, {defineDomain, domainTable})` → `{table, close}`: which instance each
 *   hosted entry was made for.
 * - `createHostedTokens(ports)` → `{service, resume, close}`.
 *
 * `retire(old, successor)`: the refusals first, as data, each moving nothing (`unknown-entry`,
 * `not-hosted`, `successor-unpaired`), then the transfer as one step on the managed chain
 * (routing `succeedPrincipal`, which moves the sessions, the pending events and the live offers,
 * then calls this module's `commit`: `PairStore.succeed`, the commit
 * point for the name, so the sessions move in the same step as the name; R-NAME-07). A failure
 * up to the commit point is rolled back and answers `operation-failed`, and the instance retries at
 * its next start. After it, the old entry's settings item and hosted record are deleted and each
 * moved session gets one note; a failure there is logged and retried (the name and sessions have
 * moved), and an unfinished delete is finished at the next start (`resume`).
 * The delete makes C-REVOKE see a `deleted` revocation of the old entry; by then it has no pair,
 * no sessions and no pending events, so that does nothing visible.
 *
 * Crash recovery (review F03). The storage domains give no cross-domain transaction, and a crash
 * inside the step cannot run the in-memory undo, so the step is journalled:
 * - prepared: the old record is marked `succeededBy` **before** anything moves (the journal), and
 *   unmarked again when the step is refused or rolls back;
 * - committed: `PairStore.succeed` removes the old pair in the same atomic registry write that moves
 *   the name, so "the old entry has no pair" is the durable commit record. The mark alone never
 *   says the step committed.
 * `resume` reads both: a committed mark finishes the delete; a prepared one is cleared, so the old
 * entry is hosted again and nothing of it is deleted. The instance then asks `retire` again at its
 * next start (K3: "the instance retries at its next start"), and that `retire` completes a step that
 * crashed halfway, since each participant moves whatever `from` still holds. The connector does not
 * roll the step forward itself: the instance may have retargeted the succession to a newer entry
 * meanwhile (a Reconnect), and only the instance knows its current successor.
 */
import { principalLabel } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { isNonEmptyString } from '../mailbox/draft.js'
import { RETRY_CLOSED, createRetrier } from '../background.js'
import { serialChain } from '../serial.js'
import {
  CREATE_HOSTED_ERROR, HOSTED_ENTRY_STATE, HOSTED_SERVICE, HOSTED_STORE, HOSTED_TIMING, LOG, MISUSE, RETIRE_REFUSAL, SUCCESSION_NOTE,
} from './constants.js'

export { HOSTED_ENTRY_STATE, HOSTED_SERVICE, HOSTED_TIMING, RETIRE_REFUSAL, SUCCESSION_NOTE } from './constants.js'

/**
 * One hosted record `{entryKey, instanceId}`. A plain validator (as the token store's): `zod` is a
 * host peer only a DSH profile provides, and this module must load with DSH's own packages alone.
 */
const hostedRecord = Object.freeze({
  parse(value) {
    const valid = value !== null && typeof value === 'object' && isNonEmptyString(value.entryKey) && isNonEmptyString(value.instanceId)
      && (value.succeededBy === undefined || isNonEmptyString(value.succeededBy))
    if (!valid) throw new TypeError(MISUSE.record)
    return value
  },
})

/**
 * @param ctx - a Cordis context with `ctx.storageDomain`
 * @param storageDomain - `{defineDomain, domainTable}` of `@deepseek-ai/dsh-storage-domain`, passed in
 *   by the connector row (as routing and the mailbox take it)
 * @returns {Promise<{table: object, close: () => Promise<void>}>}
 */
export async function openHostedStore(ctx, { defineDomain, domainTable }) {
  const domain = await ctx.storageDomain.open(defineDomain({
    name: HOSTED_STORE.domain,
    version: HOSTED_STORE.version,
    layout: HOSTED_STORE.layout,
    tables: { [HOSTED_STORE.table]: domainTable(hostedRecord) },
  }))
  return { table: domain.table(HOSTED_STORE.table), close: () => domain.close() }
}

/** K3 `HostServiceError`: the code is the K3 word; the message holds nothing secret. */
export class HostedServiceError extends Error {
  constructor(code, cause) {
    super(code, { cause })
    this.name = HostedServiceError.name
    this.code = code
  }
}

const refusal = (code) => Object.freeze({ ok: false, code })
const OK = Object.freeze({ ok: true })
/** Runs a compensation; its own failure is logged and never replaces the error being undone. */
const compensate = (undo, onFailed) => Promise.resolve().then(undo).catch(onFailed)
/** The label a note names a principal by: its name, or `ID: <id>` (K1 `principalLabel`, R-NAME-08). */
const labelOf = (pair) => {
  const label = principalLabel(pair.name, pair.id)
  return label.name ?? label.prefix + label.id
}

/**
 * @param {object} ports
 * @param ports.table - the hosted table (`openHostedStore`)
 * @param ports.tokens - C-TOKENS' registry: `createHosted()`, `get(entryKey)`
 * @param ports.pairs - K1 `PairStore`: `pairOf`, `succeed`, `onChange`
 * @param ports.routing - the routing composition: `succeedPrincipal`
 * @param ports.writer - K1d `SettingsWriter`: `removeToken`
 * @param ports.notes - K1d `SessionNotes`
 * @param ports.timers - `{setTimeout, clearTimeout}`, the globals by default
 * @param ports.logger - `{warn}`
 * @returns `{service, resume, close}`; `service` is the frozen K3 `DshConnectorTokens`
 */
export function createHostedTokens({ table, tokens, pairs, routing, writer, notes, timers = globalThis, logger }) {
  const warn = (line) => (error) => logger.warn(LOG.format, line, diagnosticOf(error))
  const retrier = createRetrier({ timers, logger, format: LOG.format, retryMs: HOSTED_TIMING.retryMs })
  /** Retries a step that failed once already, in the background (logged as `line`); `close` ends it. */
  const retryLater = (line, step) => { retrier.later(line, step).catch((error) => { if (error !== RETRY_CLOSED) warn(line)(error) }) }
  // One succession at a time: two overlapping `retire`s would each check refusals against a state
  // the other is about to change.
  const serial = serialChain()

  /**
   * Whether a record's succession committed: marked, and its old pair is gone (the commit record;
   * module comment). A marked record whose old pair still exists is only prepared: still hosted.
   */
  const committed = (entryKey, record) => record.succeededBy !== undefined && pairs.pairOf(entryKey) === undefined

  /**
   * A listed entry made by `createHosted` and not succeeded yet, with its record, or undefined. A
   * prepared mark (a crash, or an unmark that failed) leaves the entry hosted (review P3): answering
   * `not-hosted` for it would make the instance drop a half-moved succession for good.
   */
  function hostedOf(entryKey) {
    const entry = tokens.get(entryKey)
    const record = entry?.hosted === true ? table.get(entryKey) : undefined
    return record === undefined || committed(entryKey, record) ? undefined : Object.freeze({ entry, instanceId: record.instanceId, record })
  }

  /**
   * Deletes a succeeded entry: its settings item, then its hosted record. Tried now; a failure is
   * logged and retried in the background, and the record's `succeededBy` mark makes the next
   * start (`resume`) finish it if the connector stops first.
   */
  async function deleteEntry(entryKey) {
    const step = async () => {
      await writer.removeToken(entryKey)
      await table.delete(entryKey)
    }
    try {
      await step()
    } catch (error) {
      warn(LOG.cleanupFailed)(error)
      retryLater(LOG.cleanupFailed, step)
    }
  }

  /** One note per moved session (R-HOST-09 step 7); each that fails is retried until written. */
  const writeSuccessionNotes = (sessionIds, note) => Promise.all(sessionIds.map((sessionId) => {
    const step = () => notes.system(sessionId, note)
    return Promise.resolve().then(step).catch((error) => {
      warn(LOG.noteFailed)(error)
      retryLater(LOG.noteFailed, step)
    })
  }))

  /**
   * The succession's transfer between its journal marks (module comment): the old record is marked
   * prepared, routing moves every participant and calls `PairStore.succeed` as its commit (the
   * commit point for the name), and a refusal or a rejection unmarks the record again (a failing
   * unmark is logged; the next start then clears the mark). C-WIRE-2 removed the designated
   * role, so R-HOST-09 step 2 moves nothing (the user's answer q5, 2026-11-17: "Remove agentToken
   * entirely"). An old entry that never paired has no principal: nothing moves.
   * @returns routing's result (`{ok: true, sessions}` or a refusal)
   * @throws (rejects) the failing step's error, after the unmark
   */
  async function transfer(oldEntryKey, successorEntryKey, oldPair, successorPair) {
    // A prepared mark left by an earlier attempt (to this or another successor) is replaced.
    const { succeededBy: _earlier, ...oldRecord } = table.get(oldEntryKey)
    await table.put(oldEntryKey, { ...oldRecord, succeededBy: successorEntryKey })
    const unmark = () => compensate(() => table.put(oldEntryKey, oldRecord), warn(LOG.undoFailed))
    const commit = () => pairs.succeed(oldEntryKey, successorEntryKey)
    try {
      const result = oldPair === undefined ? await commit() : await routing.succeedPrincipal(oldPair.principalKey, successorPair.principalKey, commit)
      if (!result.ok) await unmark()
      return result
    } catch (error) {
      await unmark()
      throw error
    }
  }

  async function succeed(oldEntryKey, successorEntryKey) {
    const old = hostedOf(oldEntryKey)
    const successor = hostedOf(successorEntryKey)
    if (tokens.get(oldEntryKey) === undefined || tokens.get(successorEntryKey) === undefined) return refusal(RETIRE_REFUSAL.unknownEntry)
    if (old === undefined || successor === undefined || old.instanceId !== successor.instanceId) return refusal(RETIRE_REFUSAL.notHosted)
    const successorPair = pairs.pairOf(successorEntryKey)
    if (successorPair === undefined) return refusal(RETIRE_REFUSAL.successorUnpaired)
    // Read here, outside the managed step; a racing delete of the old entry is caught by
    // `PairStore.succeed` itself (old unpaired: nothing moves but the role, as below).
    const oldPair = pairs.pairOf(oldEntryKey)
    let moved
    try {
      const result = await transfer(oldEntryKey, successorEntryKey, oldPair, successorPair)
      if (!result.ok) return refusal(result.code)
      moved = result.sessions ?? []
    } catch (error) {
      warn(LOG.retireFailed)(error)
      return refusal(RETIRE_REFUSAL.operationFailed)
    }
    await deleteEntry(oldEntryKey)
    const label = labelOf(pairs.pairOf(successorEntryKey) ?? successorPair)
    await writeSuccessionNotes(moved, SUCCESSION_NOTE.text(label))
    return OK
  }

  /** Removes a half-created entry (its record write failed): retried until it is gone. */
  async function removeHalfCreated(entryKey) {
    try {
      await writer.removeToken(entryKey)
    } catch (error) {
      warn(LOG.undoFailed)(error)
      retryLater(LOG.undoFailed, () => writer.removeToken(entryKey))
    }
  }

  const service = Object.freeze({
    apiVersion: HOSTED_SERVICE.apiVersion,

    /**
     * K3: a new enabled "Fishball (hosted)" entry made for `instanceId`, its value resolved once.
     * The value is C-TOKENS' (its one generator and digest record, design §5.9); this module only
     * passes it on and never stores or logs it.
     * @throws (rejects) TypeError for an instance id that is not a non-empty string (nothing is created)
     * @throws (rejects) HostedServiceError `operation-failed` (nothing is created)
     */
    async createHosted(instanceId) {
      if (!isNonEmptyString(instanceId)) throw new TypeError(MISUSE.instanceId)
      let created
      try {
        created = await tokens.createHosted()
      } catch (error) {
        warn(LOG.createFailed)(error)
        throw new HostedServiceError(CREATE_HOSTED_ERROR.operationFailed, error)
      }
      try {
        await table.put(created.entryKey, { entryKey: created.entryKey, instanceId })
      } catch (error) {
        warn(LOG.recordFailed)(error)
        await removeHalfCreated(created.entryKey)
        throw new HostedServiceError(CREATE_HOSTED_ERROR.operationFailed, error)
      }
      return Object.freeze({ entryKey: created.entryKey, label: created.label, value: created.value })
    },

    /** K3: read only; an unknown key, a user-made entry or one with no hosted record is `deleted`. */
    entryState(entryKey) {
      const hosted = hostedOf(entryKey)
      if (hosted === undefined) return HOSTED_ENTRY_STATE.deleted
      return hosted.entry.enabled ? HOSTED_ENTRY_STATE.enabled : HOSTED_ENTRY_STATE.disabled
    },

    /**
     * K3 reinstall succession (see the module comment).
     * @returns `{ok: true}` or a K3 `RetireRefusalCode` refusal
     * @throws (rejects) TypeError when both keys are the same (a caller bug, as `PairStore.succeed`)
     */
    async retire(oldEntryKey, successorEntryKey) {
      if (oldEntryKey === successorEntryKey) throw new TypeError(MISUSE.sameEntry)
      return serial(() => succeed(oldEntryKey, successorEntryKey))
    },

    /**
     * K3 amendment (I-SUCCEED, the user's Q1 = C, 2026-11-17): calls `fn` with no argument after
     * each change of the pair store, K1 `PairStore.onChange` ("Listeners run once after a change"),
     * so the instance retries a `successor-unpaired` succession once the new child has paired. The
     * pair store's own listener loop logs a throwing `fn` and runs the others.
     * @returns the K3 `Dispose` (the pair store's disposer is idempotent)
     * @throws TypeError for a listener that is not a function (a caller bug, as `createHosted`'s)
     */
    onChange(fn) {
      if (typeof fn !== 'function') throw new TypeError(MISUSE.listener)
      return pairs.onChange(() => fn())
    },
  })

  return Object.freeze({
    service,
    /**
     * Run once at start (C-WIRE), after the token registry's start sync: settles every succession
     * journalled before the connector stopped (module comment). A committed one (the old entry has
     * no pair) has its delete finished; a prepared one has its mark cleared, for the instance's next
     * `retire`. A clear that fails is logged and left marked, so the next start tries again; it
     * never fails the start.
     */
    resume: () => serial(async () => {
      for (const [entryKey, record] of [...table.entries()]) {
        if (record.succeededBy === undefined) continue
        if (committed(entryKey, record)) {
          await deleteEntry(entryKey)
          continue
        }
        const { succeededBy, ...prepared } = record
        await table.put(entryKey, prepared).catch(warn(LOG.recoveryFailed))
      }
    }),
    /** Ends every background retry and waits for a running `retire`. */
    async close() {
      retrier.close()
      await serial(async () => {})
    },
  })
}

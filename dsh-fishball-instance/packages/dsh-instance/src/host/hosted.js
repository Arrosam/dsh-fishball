/**
 * The hosted token's rules on the host (I-HOST; design §5.4; requirements 1.28 R1, 1.29 R6 = B,
 * 1.32 R11, 1.33 Q-B1/Q-B3, 1.39; R-HOST-05, R-HOST-09, R-HOST-10; HOST-DT-01, HOST-DT-02). It decides when the
 * instance provisions and stores the hosted credential and hands it to the child over the
 * authenticated lifecycle wire. Restarts and Reconnect re-hand the current URL and credential.
 * Explicit recovery provisions only after deletion or verified loss of the old credential.
 * Additional targets never affect the parent's reserved credential;
 * - Retry after the user deleted the entry: no token, only the notice (R6 = B);
 * - reinstall succession (R-HOST-09, I-SUCCEED): a first start's new entry under a new child
 *   runtime, when the record already lists one, makes that earlier entry's succession pending; it is finished by K3 `retire` (see
 *   `attempt` below). Neither Reconnect nor Retry starts a succession.
 * Handoffs and provisioning are serialized; no secret is logged or returned to the page.
 */
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { HOSTED, REFUSAL } from '../native-runtime/constants.js'

const { entryState: ENTRY, target: STATUS, reconnect: RECONNECT } = HOSTED

/** The connector's hosted-token service if it is usable (K3 `DshConnectorTokens`, apiVersion 1), else undefined. */
export function usableTokens(service) {
  return service?.apiVersion === HOSTED.apiVersion && typeof service.createHosted === 'function' && typeof service.entryState === 'function' ? service : undefined
}

/**
 * The reserved parent's URL, written through the unchanged child-row handoff. No remote override:
 * missing parent connector means an unset parent, never another target. `hostOrigin` must be a
 * loopback origin (host.js): the child runs locally and core refuses other plain-http names (D5).
 */
export function childTargetUrl({ hostOrigin, connectorUsable }) {
  return connectorUsable && typeof hostOrigin === 'string' ? new URL(HOSTED.mcpPath, hostOrigin).href : ''
}

/**
 * @param deps
 * @param deps.tokens - `() => DshConnectorTokens | undefined`, looked up per call
 * @param deps.record - the hosted record (hosted-record.js)
 * @param deps.credentials - `() => credential client | undefined` of the current wire (credential.js)
 * @param deps.instanceId - `() => string`, the instance's own non-secret id for `createHosted`
 * @param [deps.runtimeId] - `() => string | undefined`, the id of the child runtime folder now (its
 *   owner marker's `hostId`; a reinstall or a runtime reset makes a new one), undefined when unknown;
 *   omitted, every runtime is unknown and no first start is a reinstall (the safe side: nothing moves)
 * @param deps.changed - called after the target status or the notice changed
 * @param [deps.warn] - `(format, code) => void`, the row's logger (a code only, never a value)
 */
export function createHostedToken({ tokens, record, credentials, credentialStore, targetUrl = () => '', instanceId, runtimeId = () => undefined, changed, warn = () => {} }) {
  let notice = null
  let chain = Promise.resolve()
  /** Runs `step` after every earlier one; a failure there never breaks the chain. */
  const serial = (step) => {
    const run = chain.then(step)
    chain = run.catch(() => {})
    return run
  }
  const connector = () => usableTokens(tokens())
  const entryState = () => {
    const key = record.entries().at(-1)
    const service = connector()
    if (key === undefined || service === undefined) return undefined
    // A connector failure reads as "no entry known", never as a throw into a status route.
    try { return service.entryState(key) } catch { return undefined }
  }

  /** What blocks an import now, or undefined. A closed row imports nothing. */
  function refusal(client) {
    if (closed) return REFUSAL.notReady
    if (connector() === undefined) return REFUSAL.connectorMissing
    if (client === undefined) return REFUSAL.notReady
    return undefined
  }

  /** Whether the child holds a credential now; undefined when it cannot say (credential.js). */
  async function present(client) {
    try { return await client.probe() } catch { return undefined }
  }

  /** A record write that failed is logged (code only) and never fails the step that asked for it. */
  const recordWrite = (write) => write().then(() => true, (error) => { warn(HOSTED.recordWriteFailed, error?.code ?? REFUSAL.failed); return false })
  /**
   * The entries the child stored but the record could not keep yet, oldest first: replayed in order
   * before every later add and succession attempt, so a failed write never loses an entry or its
   * succession (the child holds the new token, so no later start would create, and record, it again).
   */
  const unrecorded = []
  /** Writes the queued adds in order; true once none is left. */
  async function flushAdds() {
    while (unrecorded.length > 0) {
      const { key, options } = unrecorded[0]
      if (!(await recordWrite(() => record.add(key, options)))) return false
      unrecorded.shift()
    }
    return true
  }
  const recordAdd = (key, options) => { unrecorded.push({ key, options }); return flushAdds() }
  /**
   * Whether a first start's new entry replaces one of an earlier child runtime (the user's Q3 = A,
   * 2026-11-17: "reinstall = new runtime"): the newest listed entry was created under another
   * runtime folder, or under one not recorded (a record written before I-SUCCEED). The same runtime
   * means the child itself dropped its credential (a Connect in the child replaces core's hosted
   * copy, R-HOST-10: "Succession … never to a user's delete or a replace"); its new entry starts no
   * succession. An unknown runtime now starts none either. Known gap (accepted with A): a hand
   * removal of only `<runtime>/dsh-home` keeps the runtime id and is not seen as a reinstall.
   */
  function isReinstall() {
    const now = runtimeId()
    // An add still queued (`unrecorded`) holds the runtime the record would show; read it first.
    const last = unrecorded.length > 0 ? unrecorded.at(-1).options.runtime : record.runtime()
    return now !== undefined && last !== now
  }

  /**
   * The child's own answer to importing `value`; one with no answer (timed out, or the channel
   * closed) answers K3's frozen `credentials-unwritable`: the child did not show this value stored.
   * Only the child's answer to this import counts (R-FIX-INSTANCE F06). Whether it holds *some*
   * credential says nothing about it, since before a Reconnect it holds the old one.
   */
  async function importAnswer(client, value) {
    try { return await client.importToken(value) } catch { return { ok: false, code: REFUSAL.unwritable } }
  }

  const heldRecord = (key) => HOSTED.hostTokenRecordPrefix + createHash('sha256').update(key).digest('hex')
  const failure = (code) => ({ ok: false, code })
  const currentKey = () => unrecorded.at(-1)?.key ?? record.entries().at(-1)
  const ownedBinding = (service) => typeof service.hostedState === 'function'
  const onWire = (client) => credentials() === client && refusal(client) === undefined

  async function hold(key, value) {
    if (!credentialStore) return
    await credentialStore.modifyRecord(heldRecord(key), async (current) => current?.payload?.value === value
      ? undefined : { kind: HOSTED.bindingKind, payload: { value } })
  }

  async function handoff(client, key, value) {
    if (!onWire(client)) return failure(REFUSAL.notReady)
    try { return await client.bindHosted({ url: targetUrl(), entryKey: key, value }) } catch { return failure(REFUSAL.unwritable) }
  }

  /**
   * One `createHosted` and its one import. The key is recorded once the child stored the value. The
   * value goes only to the wire it was created for: a wire that was replaced meanwhile, or a row
   * that closed, gets nothing (R-FIX-INSTANCE F01, F05), and the new entry stays for the user to
   * delete, as after a refusal.
   */
  async function createAndImport(client, reinstall, owned = false) {
    let entry
    try { entry = await connector().createHosted(instanceId()) } catch { return { ok: false, code: REFUSAL.failed } }
    // Asked again after the wait: the call may have outlived this wire, its child's target or the row.
    const blocked = credentials() === client ? refusal(client) : REFUSAL.notReady
    if (blocked !== undefined) return { ok: false, code: blocked }
    if (owned) {
      try { await hold(entry.entryKey, entry.value) } catch { return failure(REFUSAL.unwritable) }
      // Anchor the held secret before the wire request: a crash or a lost reply must not
      // turn an existing connector entry into another provisioning attempt on restart.
      await recordAdd(entry.entryKey, { runtime: runtimeId(), succession: reinstall && isReinstall() })
    }
    const stored = owned ? await handoff(client, entry.entryKey, entry.value) : await importAnswer(client, entry.value)
    // A definite refusal: the new entry stays for the user to delete (Q-B3 = B).
    if (stored.ok !== true) return { ok: false, code: stored.code ?? REFUSAL.unwritable }
    if (!owned) await recordAdd(entry.entryKey, { runtime: runtimeId(), succession: reinstall && isReinstall() })
    notice = null
    changed()
    return { ok: true }
  }

  /**
   * Reinstall succession (R-HOST-09, Q24 A; I-SUCCEED). A first start that had to create an entry
   * under a new child runtime (`isReinstall`) while the record already listed one is a reinstall:
   * the record keeps that earlier entry as the pending old entry, and its successor is always the newest entry, the one the child holds (the
   * user's Q2, 2026-11-17: a Reconnect or a second reinstall while one is pending retargets it). It
   * is finished through the connector's public succession path, K3 `retire`, which runs K1
   * `PairStore.succeed` in its one step ("the old entry's pair is removed … and the successor's pair
   * takes the old one's name … so the name is never held twice and never refused"); the instance
   * moves nothing itself and creates no extra entry.
   *
   * When it runs: at every start (K3 tokens.d.ts: "`operation-failed`: … the instance retries at its
   * next start"), after a Reconnect, and, while K3 answers `successor-unpaired` ("succession runs
   * only after the new pairing succeeds", HOST-DT-02 #2), at each K3 `onChange` (the user's Q1 = C:
   * the instance cannot see core's pairing since 1.39, so the connector signals its pair changes).
   */
  let subscription
  // Set by `close`: a queued or running step then calls nothing and writes nothing (a reloaded
  // host row opens its own record copy, and two writers would lose each other's updates).
  let closed = false
  /** Ends the subscription; a connector that closed meanwhile may throw from its disposer, which changes nothing here. */
  const unlisten = () => {
    try { subscription?.dispose() } catch { /* the connector's own teardown already dropped it */ }
    subscription = undefined
  }
  /**
   * Follows `service`'s pair changes while a succession waits for its successor's pairing. Made
   * before `retire` is asked, so a pairing that lands during the call is not missed. A service
   * without `onChange` gives the start retries only. After a connector row reload the subscription
   * stays on the old service until the next start or Reconnect subscribes to the new one.
   */
  function listen(service) {
    if (closed || subscription?.service === service || typeof service.onChange !== 'function') return
    unlisten()
    let queued = false
    // Coalesced: every pair change while one attempt waits in the chain adds nothing.
    const nudge = () => {
      if (queued || closed) return
      queued = true
      void serial(() => { queued = false; return attempt() }).catch(() => {})
    }
    try { subscription = { service, dispose: service.onChange(nudge) } } catch { subscription = undefined }
  }

  async function attempt() {
    if (closed) return
    const service = connector()
    // The successor must be in the record before it is named to the connector. While it is not,
    // the write is tried again at the next start, Reconnect or pair change: a successor that
    // paired meanwhile is then not left waiting for a start.
    if (!(await flushAdds())) return service === undefined ? undefined : listen(service)
    const old = record.pending()
    if (old === undefined) return unlisten()
    // Succession waits for a usable parent connector; added targets never suppress it.
    if (typeof service?.retire !== 'function') return
    const successor = record.entries().at(-1)
    let outcome
    // A record whose newest entry is the old one, or that lists none (edited by hand), has no
    // successor: K3 `retire` needs two different entry keys, so the instance never asks.
    if (successor === undefined || successor === old) outcome = { code: HOSTED.retire.noSuccessor }
    else {
      listen(service)
      try { outcome = await service.retire(old, successor) } catch { outcome = { ok: false, code: REFUSAL.failed } }
    }
    // Not paired yet is the normal wait, not logged: the next pair change asks again.
    if (outcome.code === HOSTED.retire.unpaired) return
    unlisten()
    if (closed) return
    if (outcome.ok === true || HOSTED.retire.final.includes(outcome.code)) {
      // Done, or never possible: the user deleted an entry (`unknown-entry`; R-HOST-10, a delete is
      // never a reinstall) or the old one is not this instance's or already succeeded (`not-hosted`).
      if (outcome.ok !== true) warn(HOSTED.retire.droppedLog, outcome.code)
      await recordWrite(() => record.settle(old))
      return
    }
    // `operation-failed`: K3 "the instance retries at its next start", so no pair change retries it.
    warn(HOSTED.retire.pendingLog, outcome.code)
  }

  async function confirm(service, client, key, outcome) {
    const until = Date.now() + RECONNECT.settleMs
    do {
      if (!onWire(client)) break
      const status = service.hostedState(instanceId(), key)
      if (status?.paired && status.online) return { ok: true, outcome }
      if (status?.state !== ENTRY.enabled) break
      await delay(RECONNECT.pollMs)
    } while (Date.now() < until)
    return outcome === RECONNECT.rebound ? failure(RECONNECT.rebindUnconfirmed)
      : { ok: true, outcome: RECONNECT.stored, code: RECONNECT.unconfirmed }
  }

  async function bindOwned(service, client, { explicit }) {
    const key = currentKey()
    if (!targetUrl()) return failure(REFUSAL.notReady)
    if (key !== undefined) {
      let status = service.hostedState(instanceId(), key)
      // Token deletion is visible before asynchronous revocation releases the old agent ID.
      if (explicit && status === undefined && service.entryState(key) === ENTRY.deleted) {
        const until = Date.now() + RECONNECT.settleMs
        while (status === undefined && onWire(client) && Date.now() < until) {
          await delay(RECONNECT.pollMs)
          status = service.hostedState(instanceId(), key)
        }
      }
      if (status === undefined) return failure(RECONNECT.unavailable)
      const reinstall = !explicit && isReinstall()
      if (status.state === ENTRY.disabled && !reinstall) return failure(RECONNECT.entryDisabled)
      if (status.state === ENTRY.enabled && !reinstall) {
        let value
        try {
          value = (await credentialStore?.readRecord(heldRecord(key)))?.payload?.value
          if (value === undefined) {
            const { values } = await client.recoverHosted()
            value = values.find((candidate) => service.matchHosted(instanceId(), key, candidate))
            if (value !== undefined) await hold(key, value)
          }
        } catch { return failure(RECONNECT.unavailable) }
        if (value !== undefined) {
          if (!service.matchHosted(instanceId(), key, value)) return failure(RECONNECT.unavailable)
          const stored = await handoff(client, key, value)
          return stored.ok && explicit ? confirm(service, client, key, RECONNECT.rebound) : stored
        }
        if (!explicit || !onWire(client) || !(await service.discardHosted(instanceId(), key))) return failure(RECONNECT.unavailable)
      } else if (!explicit && !reinstall) return failure(RECONNECT.unavailable)
      if (status.state === ENTRY.deleted || explicit) await credentialStore?.deleteRecord(heldRecord(key))
    }
    if (!onWire(client)) return failure(REFUSAL.notReady)
    const stored = await createAndImport(client, !explicit, true)
    return stored.ok && explicit ? confirm(service, client, currentKey(), RECONNECT.paired) : stored
  }

  return Object.freeze({
    /**
     * After each start's authenticated wire: imports only when the child holds no credential (a
     * reinstall's import also starts its succession), then tries a pending succession.
     */
    firstStart: () => serial(async () => {
      const client = credentials()
      if (refusal(client) !== undefined) return attempt()
      // Probed inside the chain, so an import that ran just before is seen: nothing twice. An
      // unanswered probe is not "absent": nothing is created then. A newer wire that replaced this
      // one meanwhile runs its own first start, which decides.
      const service = connector()
      if (ownedBinding(service)) {
        const result = await bindOwned(service, client, { explicit: false })
        if (!result.ok) warn(HOSTED.bindFailed, result.code)
      }
      else if ((await present(client)) === false && credentials() === client) await createAndImport(client, true)
      return attempt()
    }),
    /**
     * Re-hand the credential, or provision after confirmed loss. Storage and connector
     * confirmation are distinct; this path never starts a succession.
     */
    reconnect: () => serial(async () => {
      const client = credentials()
      const code = refusal(client)
      if (code !== undefined) return failure(code)
      const service = connector()
      if (ownedBinding(service)) return bindOwned(service, client, { explicit: true })
      if (currentKey() !== undefined && entryState() !== ENTRY.deleted) return failure(RECONNECT.unavailable)
      const result = await createAndImport(client, false)
      return result.ok ? { ok: true, outcome: RECONNECT.stored, code: RECONNECT.unconfirmed } : result
    }),
    /**
     * Ends the pair-change subscription for good (the host row closed); later steps run nothing.
     * @returns {Promise<void>} settled once the steps already running have finished, their record
     *   writes included (R-FIX-INSTANCE F05): a successor row opens the record only after it, so
     *   this row's last write can never overwrite the successor's.
     */
    close() { closed = true; unlisten(); return chain },
    /** The K3 target status from the host's own state (the user's answer Q3 = A). */
    targetStatus() {
      const state = entryState()
      if (state === undefined) return STATUS.unset
      return state === ENTRY.enabled ? STATUS.connected : STATUS.revoked
    },
    /**
     * The entry the child holds now: the newest recorded one (a key is recorded only after the
     * child stored its value), or null before the first. Non-secret (K3 `agentEntry`).
     */
    agentEntry: () => currentKey() ?? null,
    /** Retry's token rule: a deleted entry gets the notice and no token (R6 = B). */
    retryNotice() {
      if (entryState() !== ENTRY.deleted) return false
      notice = HOSTED.notice.entryDeleted
      changed()
      return true
    },
    /**
     * The notice. It is cleared by the instance's own next import (Reconnect); a token the user
     * pastes in core's field inside the child is not visible to the host (1.39), so the notice
     * stays until then or until the host row restarts.
     */
    notice: () => notice,
  })
}

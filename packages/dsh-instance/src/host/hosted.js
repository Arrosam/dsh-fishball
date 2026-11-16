/**
 * The hosted token's rules on the host (I-HOST; design §5.4; requirements 1.28 R1, 1.29 R6 = B,
 * 1.32 R11, 1.33 Q-B1/Q-B3, 1.39; R-HOST-05, R-HOST-10; HOST-DT-01). It decides when the
 * instance asks the connector for a hosted entry and imports its value into the child:
 * - first start (the child holds no credential, the target is this DSH's connector): one
 *   `createHosted`, its value imported once over `mcp-credential`; the entry key is recorded only
 *   after the child stored it. A restart, a reconnect of the link or a present credential creates
 *   nothing; a remote target never;
 * - Reconnect (the instance's settings page): the same, on demand, whatever the old entry's state;
 *   replacing moves nothing and deletes nothing (Q-B1 = B, Q-B3 = B);
 * - Retry after the user deleted the entry: no token, only the notice (R6 = B).
 * Every probe, create and import runs in one serial chain, so a first start, a Reconnect and a
 * quick restart never create two entries for one need (R1: exactly once). The value is held only
 * for the import and never stored, logged or returned.
 */
import { HOSTED, REFUSAL } from '../native-runtime/constants.js'

const { entryState: ENTRY, target: STATUS } = HOSTED
const blank = (value) => typeof value !== 'string' || value.trim() === ''

/** The connector's hosted-token service if it is usable (K3 `DshConnectorTokens`, apiVersion 1), else undefined. */
export function usableTokens(service) {
  return service?.apiVersion === HOSTED.apiVersion && typeof service.createHosted === 'function' && typeof service.entryState === 'function' ? service : undefined
}

/**
 * The target URL the child links to, written as the child-side row's setting: the instance's own
 * remote target when it names one, else this host's connector endpoint when a connector is here,
 * else nothing. `hostOrigin` must be a loopback origin (host.js): the child runs on this machine,
 * and core refuses plain `http:` to any other name (D5).
 */
export function childTargetUrl({ instanceTargetUrl, hostOrigin, connectorUsable }) {
  if (!blank(instanceTargetUrl)) return instanceTargetUrl
  return connectorUsable && typeof hostOrigin === 'string' ? new URL(HOSTED.mcpPath, hostOrigin).href : ''
}

/**
 * @param deps
 * @param deps.tokens - `() => DshConnectorTokens | undefined`, looked up per call
 * @param deps.record - the hosted record (hosted-record.js)
 * @param deps.credentials - `() => credential client | undefined` of the current wire (credential.js)
 * @param deps.instanceId - `() => string`, the instance's own non-secret id for `createHosted`
 * @param deps.remoteTarget - `() => string`, the instance's `targetUrl` ('' = this DSH)
 * @param deps.changed - called after the target status or the notice changed
 * @param [deps.warn] - `(format, code) => void`, the row's logger (a code only, never a value)
 */
export function createHostedToken({ tokens, record, credentials, instanceId, remoteTarget, changed, warn = () => {} }) {
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

  /** What blocks an import now, or undefined. */
  function refusal(client) {
    if (!blank(remoteTarget())) return REFUSAL.targetRemote
    if (connector() === undefined) return REFUSAL.connectorMissing
    if (client === undefined) return REFUSAL.notReady
    return undefined
  }

  /** Whether the child holds a credential now; undefined when it cannot say (credential.js). */
  async function present(client) {
    try { return await client.probe() } catch { return undefined }
  }

  /**
   * One `createHosted` and its one import. The key is recorded once the child stored the value;
   * an unanswered import is resolved by asking the child again, so a slow but successful write is
   * never reported as a failure.
   */
  async function createAndImport(client) {
    let entry
    try { entry = await connector().createHosted(instanceId()) } catch { return { ok: false, code: REFUSAL.failed } }
    let stored
    try { stored = await client.importToken(entry.value) } catch { stored = (await present(client)) === true ? { ok: true } : { ok: false, code: REFUSAL.unknown } }
    // A definite refusal: the new entry stays for the user to delete (Q-B3 = B).
    if (stored.ok !== true) return { ok: false, code: stored.code ?? REFUSAL.unwritable }
    try { await record.add(entry.entryKey) } catch (error) { warn(HOSTED.recordWriteFailed, error?.code ?? REFUSAL.failed) }
    notice = null
    changed()
    return { ok: true }
  }

  return Object.freeze({
    /** After each start's authenticated wire: imports only when the child holds no credential. */
    firstStart: () => serial(async () => {
      const client = credentials()
      if (refusal(client) !== undefined) return
      // Probed inside the chain, so an import that ran just before is seen: nothing twice. An
      // unanswered probe is not "absent": nothing is created then.
      if ((await present(client)) !== false) return
      // A newer wire replaced this one meanwhile: its own first start decides.
      if (credentials() !== client) return
      await createAndImport(client)
    }),
    /** Reconnect (R11): one new entry, imported once. */
    reconnect: () => serial(async () => {
      const client = credentials()
      const code = refusal(client)
      return code === undefined ? createAndImport(client) : { ok: false, code }
    }),
    /** The K3 target status from the host's own state (the user's answer Q3 = A). */
    targetStatus() {
      if (!blank(remoteTarget())) return STATUS.remote
      const state = entryState()
      if (state === undefined) return STATUS.unset
      return state === ENTRY.enabled ? STATUS.connected : STATUS.revoked
    },
    /** Retry's token rule: a deleted entry gets the notice and no token (R6 = B). */
    retryNotice() {
      if (!blank(remoteTarget()) || entryState() !== ENTRY.deleted) return false
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

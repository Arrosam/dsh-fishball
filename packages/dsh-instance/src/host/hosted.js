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
 * The value is held only for the import and never stored, logged or returned (R1).
 */
import { HOSTED } from '../native-runtime/constants.js'

const { reconnect: REFUSE, entryState: ENTRY, target: STATUS } = HOSTED
const blank = (value) => typeof value !== 'string' || value.trim() === ''

/**
 * The target URL the child links to, written as the child-side row's setting: the instance's own
 * remote target when it names one, else this host's connector endpoint when a connector is here,
 * else nothing.
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
 */
export function createHostedToken({ tokens, record, credentials, instanceId, remoteTarget, changed }) {
  let notice = null
  const connector = () => {
    const service = tokens()
    return service?.apiVersion === HOSTED.apiVersion && typeof service.createHosted === 'function' && typeof service.entryState === 'function' ? service : undefined
  }
  const lastEntry = () => record.entries().at(-1)
  const entryState = () => {
    const key = lastEntry()
    const service = connector()
    return key === undefined || service === undefined ? undefined : service.entryState(key)
  }

  /** One `createHosted` and its one import; the key is recorded after the child stored the value. */
  async function createAndImport(service, client) {
    let entry
    try { entry = await service.createHosted(instanceId()) } catch { return { ok: false, code: REFUSE.failed } }
    let stored
    try { stored = await client.importToken(entry.value) } catch { stored = { ok: false } }
    // The new entry stays when the child could not store it: the user deletes it (Q-B3 = B).
    if (stored.ok !== true) return { ok: false, code: REFUSE.unwritable }
    await record.add(entry.entryKey)
    notice = null
    changed()
    return { ok: true }
  }

  /** What blocks an import now, or undefined. */
  function refusal(client) {
    if (!blank(remoteTarget())) return REFUSE.targetRemote
    if (connector() === undefined) return REFUSE.connectorMissing
    if (client === undefined) return REFUSE.notReady
    return undefined
  }

  return Object.freeze({
    /** After each start's authenticated wire: imports only when the child holds no credential. */
    async firstStart() {
      const client = credentials()
      if (refusal(client) !== undefined) return
      // An unanswered probe is not "absent" (credential.js): nothing is created then.
      let present
      try { present = await client.probe() } catch { return }
      if (!present) await createAndImport(connector(), client)
      changed()
    },
    /** Reconnect (R11): always one new entry, imported once. */
    async reconnect() {
      const client = credentials()
      const code = refusal(client)
      return code === undefined ? createAndImport(connector(), client) : { ok: false, code }
    },
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
    notice: () => notice,
  })
}

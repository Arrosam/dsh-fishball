/**
 * Core's credential source and its saved credential (task F-LINK-SAVE; requirements 1.29 R7
 * "在第一次连接远程dsh的时候保存一次到fishball本地，这也apply to standalone fishball", 1.30 R9, 1.31
 * R10, 1.33 Q-B2; the user's Q-LS1 = A; K3a `link.d.ts` `HostedImportNames`, `connect.d.ts`;
 * design §5.4, §6.3, §6.3a). The same in hosted and standalone mode: only who fills the credential
 * reference differs (the instance's import, or the user's paste in core's write-only field).
 *
 * Two credentials, at most one saved per target origin (R9):
 * - a **token** (`client_credentials`, client id = `identity.id`): read from the reference
 *   `HOSTED_IMPORT.credentialRef`; once the target accepted it (the link's first successful
 *   connection with it), saved once into the record `HOSTED_IMPORT.savedRecord.key` (payload:
 *   `LINK_SAVE.hostedPayload`, the value per target origin), then the reference is unset;
 * - a **Connect grant** (authorization code + PKCE, `connect.js`): saved by the code exchange in
 *   the record `fishball-core/connect-<origin in hex>`; core never holds a token value for it.
 *
 * Which credential an attempt uses (first match):
 * 1. a value in the reference, for the target origin it was put there for only (R-FIX F01, below),
 *    unless the target refused that same value while a saved credential exists (Q-LS1 = A: a new
 *    token is tried first and replaces the saved one only once accepted; a refused one is not sent
 *    again until the reference changes or core restarts);
 * 2. the saved token copy for the origin;
 * 3. the saved Connect grant for the origin, while it holds tokens (an `invalid_grant` drops them:
 *    Connect is needed again, once, with no retry loop);
 * 4. nothing: the link reports `target-unset` and waits.
 * A saved credential the target refuses stays saved (R9: replaced only by a different accepted
 * one); Connect stops reporting `authorized` for it until a credential is accepted again.
 *
 * Q-LS1 = A refines K3a `link.d.ts`'s reader order ("a saved copy for the target origin wins"):
 * the user chose that a new, unrefused reference value is tried before the saved one (2026-11-16).
 * A reference whose value comes from the process environment cannot be unset; it is then tried and
 * saved at every connection, which changes nothing once saved. Emptying the reference by hand asks
 * for no reconnect: the link goes on with the credential it holds until its next attempt.
 *
 * The reference's value belongs to one target origin (R-FB-03: a changed origin is a new first
 * connection). Core binds it to the effective target origin when the reference is written (its
 * update event), or, for a value written while core was not running or no target was usable, at the
 * first attempt that finds it unbound (`LINK_SAVE.pendingOrigin`). A value bound elsewhere is not
 * this origin's credential, so a target changed before the first acceptance never receives it; a
 * new write of the reference (the same value included) binds it to the origin in force then.
 *
 * Every credential carries a non-secret `ref` (`LINK_SAVE.credentialId`) that F-PAIR keys its
 * records and holds on (decided item 13): the same token is one credential whether it is still in
 * the reference or already saved, so saving it never makes pairing start over.
 */
import { createHash } from 'node:crypto'
import { createTokenManager, accessTokenOf, isGrantFor } from './oauth-client.js'
import { CONNECT, HOSTED_IMPORT } from '../../contracts/constants.js'
import { codeOf } from '../events/diagnostics.js'
import { LINK_SAVE } from './constants.js'
import { createConnect } from './connect.js'
import { importMcpClient } from './link.js'
import { emitIsolated, subscribe } from './listeners.js'
import { checkTarget } from './target.js'

const REF = HOSTED_IMPORT.credentialRef
const HOSTED_KEY = HOSTED_IMPORT.savedRecord.key
const PENDING = LINK_SAVE.pendingOrigin

/** The link credential kinds (`LinkCredentials.kind`). */
export const CREDENTIAL_KIND = Object.freeze({ token: 'token', grant: 'grant' })

/**
 * The non-secret id of a token: a SHA-256 of its value under core's own domain prefix, so the id
 * can never equal the connector's stored lookup digest of the same value (K1 `TOKEN_VALUE`).
 */
export const tokenCredentialId = (value) => LINK_SAVE.credentialId.tokenPrefix
  + createHash(LINK_SAVE.credentialId.digest).update(LINK_SAVE.credentialId.domain + value).digest(LINK_SAVE.credentialId.digestEncoding)
const grantCredentialId = (grant) => LINK_SAVE.credentialId.grantPrefix + grant.grantId

/** Connect's grant record key for a target origin (see `LINK_SAVE.grantRecordIdPrefix`). */
export const grantRecordKey = (origin) => `${CONNECT.grantRecordScope}/${LINK_SAVE.grantRecordIdPrefix}${Buffer.from(origin).toString(LINK_SAVE.originEncoding)}`

/**
 * The token copies of the hosted record by origin. A payload of another version reads as none; V3
 * is installed fresh (Q-M1), so only this version is ever written, and `dropToken` leaves another
 * version's record alone rather than deleting what it cannot read.
 */
const isOwnVersion = (record) => record?.payload?.v === LINK_SAVE.hostedPayload.version
const hostedTokens = (record) => (isOwnVersion(record) ? record.payload.tokens ?? {} : {})
const hostedRecord = (tokens) => Object.freeze({ kind: HOSTED_IMPORT.savedRecord.kind, payload: { v: LINK_SAVE.hostedPayload.version, tokens } })
/**
 * A grant the link can connect with for `serverUrl` as fishball id `clientId`: issued for that URL,
 * still holding tokens, and approved for that id (R-FIX F10). The approval page bound the entry to
 * the id Connect passed (`agentId`, R-OA-22); refreshing never changes it, so after a change of
 * `identity.id` the grant still acts as the old id, and only a new Connect gives the new one. A
 * grant saved before Connect recorded its id has no `agentId`; the pairing records' id check
 * (identity/pairing.js) holds it.
 */
const usableGrant = (grant, serverUrl, clientId) => isGrantFor(grant, serverUrl) && grant.tokens !== undefined
  && (grant[LINK_SAVE.grantAgentIdField] === undefined || grant[LINK_SAVE.grantAgentIdField] === clientId)

/**
 * The reference value's binding (`LINK_SAVE.pendingOrigin`): its origin when it is bound to the
 * value with id `ref`, else `undefined` (no record, another version, or another value's record).
 */
const boundOrigin = (record, ref) => (record?.payload?.v === PENDING.version && record.payload.ref === ref ? record.payload.origin : undefined)
const bindingRecord = (ref, origin) => Object.freeze({ kind: PENDING.kind, payload: { v: PENDING.version, ref, origin } })

/**
 * The saved credentials in DSH's credential store (`ctx.credentials`), and one token manager per
 * grant record, so a refresh is single-flight for the link and Connect alike.
 */
function createSavedStore(credentials, { sdk, fetch, now, clientId }) {
  const managers = new Map()
  return Object.freeze({
    grantKey: grantRecordKey,
    async managerFor(origin) {
      const key = grantRecordKey(origin)
      if (!managers.has(key)) managers.set(key, createTokenManager({ sdk: await sdk(), credentials, key, now, refreshLeadMs: LINK_SAVE.refreshLeadMs, fetchFn: fetch }))
      return managers.get(key)
    },
    /** `{token, grant}` saved for `origin`: the token copy's value and the grant payload, each or `undefined`. */
    async read(origin) {
      const [hosted, grant] = await Promise.all([credentials.readRecord(HOSTED_KEY), credentials.readRecord(grantRecordKey(origin))])
      return { token: hostedTokens(hosted)[origin], grant: grant?.payload }
    },
    /** Whether `saved` (from `read`) holds a credential the link can use for `serverUrl`. */
    hasSaved: (saved, serverUrl) => saved.token !== undefined || usableGrant(saved.grant, serverUrl, clientId()),
    /**
     * Saves the accepted token for `origin` (once) and removes the grant `replaced` (the one `read`
     * found for the attempt): one saved credential per origin. Only that grant goes: a grant another
     * core process committed meanwhile (CLI and Web share the store) is newer and stays. DSH has no
     * compare-and-delete, so a commit between the fresh read and the delete is the window left.
     */
    async saveToken(origin, value, replaced) {
      await credentials.modifyRecord(HOSTED_KEY, async (current) => {
        const tokens = hostedTokens(current)
        return tokens[origin] === value ? undefined : hostedRecord({ ...tokens, [origin]: value })
      })
      const key = grantRecordKey(origin)
      if (replaced !== undefined && (await credentials.readRecord(key))?.payload?.grantId === replaced.grantId) await credentials.deleteRecord(key)
    },
    /**
     * Removes `origin`'s token copy (a Connect grant replaced it). The last one deletes the record,
     * so `describeRecord(savedRecord.key).configured` keeps meaning "the child holds a credential".
     * `modifyRecord` cannot delete, so the delete is a second step, taken only while a fresh read
     * still shows an empty record of this version (another process may have saved an origin since;
     * the window between that read and the delete is the one left).
     */
    async dropToken(origin) {
      await credentials.modifyRecord(HOSTED_KEY, async (current) => {
        const { [origin]: dropped, ...rest } = hostedTokens(current)
        return dropped === undefined ? undefined : hostedRecord(rest)
      })
      const fresh = await credentials.readRecord(HOSTED_KEY)
      if (isOwnVersion(fresh) && Object.keys(hostedTokens(fresh)).length === 0) await credentials.deleteRecord(HOSTED_KEY)
    },
  })
}

/**
 * The link's `authProvider` for a saved grant (the SDK's minimal `AuthProvider`: `token()` and
 * `onUnauthorized()`; deliberately no `tokens()` member, so the transport does not run the SDK's own
 * `auth()` on it). A due token is refreshed before use; a 401 refreshes once (single-flight, under
 * the record's lock); an `invalid_grant` leaves the grant without tokens, so the retry is refused.
 */
function grantAuthProvider(manager, initial) {
  let grant = initial
  const refresh = async (failedAccessToken) => { grant = (await manager.refresh({ failedAccessToken })).grant ?? grant }
  return Object.freeze({
    provider: Object.freeze({
      async token() {
        // A failed timely refresh keeps the current token: it may still be valid, and a 401 tries again.
        if (manager.isDue(grant)) await refresh().catch(() => {})
        return accessTokenOf(grant)
      },
      onUnauthorized: async () => refresh(accessTokenOf(grant)),
    }),
    scope: () => grant?.tokens?.scope,
    accessToken: () => accessTokenOf(grant),
  })
}

/**
 * @typedef {object} LinkCredentials what one attempt connects with (link.js `LinkOptions.credentials`)
 * @property {string} kind `CREDENTIAL_KIND.token` or `CREDENTIAL_KIND.grant`
 * @property {string} clientId the fishball id (`identity.id`)
 * @property {string} ref the credential's non-secret id (F-PAIR's record key)
 * @property {string} [secret] the token (kind `token`)
 * @property {object} [authProvider] the SDK `AuthProvider` (kind `grant`)
 * @property {() => string | undefined} [scope] the grant's scope (kind `grant`)
 * @property {() => Promise<void>} [accepted] the target accepted the token: save it (never rejects)
 * @property {() => Promise<void>} refused the target refused this credential (never rejects)
 */

/**
 * Core's credential source and Connect, over DSH's own services.
 * @param {object} ctx core's row context: `credentials` and `authorization` (DSH), `on` (Cordis),
 *   optional `logger(name)`
 * @param {object} options
 * @param {() => unknown} options.target the effective target URL (F-SETTINGS `effectiveTarget`)
 * @param {() => string} options.clientId `identity.id`
 * @param {() => unknown} options.clientMetadataUrl `connect.clientMetadataUrl`
 * @param {object} [options.sdk] the `@modelcontextprotocol/client` module; defaults to core's copy
 * @param {typeof fetch} [options.fetch] every OAuth request's fetch; defaults to the global one
 * @param {() => number} [options.now] epoch ms
 * @param {{setTimeout: Function, clearTimeout: Function}} [options.timers]
 * @returns {{credentials: (target: {url: URL, origin: string}) => Promise<LinkCredentials | null>,
 *   connect: object, onChange: (fn: () => void) => () => void, dispose: () => void}}
 *   `credentials` is the link's option; `connect` is K3a's `FishballConnect`; `onChange(fn)` calls
 *   `fn` when the link should reconnect (a new value in the reference, or a Connect grant saved)
 */
export function createLinkCredentials(ctx, { target, clientId, clientMetadataUrl, sdk, fetch = (...args) => globalThis.fetch(...args), now = Date.now, timers = globalThis }) {
  const logger = ctx.logger?.(LINK_SAVE.logger)
  const warn = (what) => (error) => logger?.warn(LINK_SAVE.text.failed, what, codeOf(error))
  const reconnects = new Set()
  let sdkModule = sdk
  // Connect's and the saved grants' MCP client; a failed import is logged as the link's (E-FIX-3).
  const loadSdk = async () => (sdkModule ??= await importMcpClient(logger))
  const store = createSavedStore(ctx.credentials, { sdk: loadSdk, fetch, now, clientId })
  // Q-LS1 = A: the reference value the target refused while a saved credential existed (by id);
  // cleared when the reference changes. And the saved credential the target refused, by id.
  let refusedReference
  let refusedSaved

  const connect = createConnect(ctx, {
    store, target, clientId, clientMetadataUrl, sdk: loadSdk, fetch, timers,
    isRefused: (ref) => ref === refusedSaved,
    credentialIdOf: (saved) => (saved.token !== undefined ? tokenCredentialId(saved.token) : grantCredentialId(saved.grant)),
    onSaved: async (origin) => {
      refusedSaved = undefined
      await store.dropToken(origin).catch(warn(LINK_SAVE.text.forget))
      emitIsolated(reconnects)
    },
  })

  /**
   * K3a step 3: unset the reference only while it still holds the value just saved. A newer token
   * written meanwhile (the instance's Reconnect, a paste) stays and is tried next (Q-LS1 = A). DSH
   * has no compare-and-unset, so a write between this read and the unset is the window left.
   */
  async function unsetIfSaved(value) {
    if ((await ctx.credentials.resolve(REF))?.value === value) await ctx.credentials.unset(REF)
  }

  /** Binds the reference value with id `ref` to `origin` (a new write: whatever it was bound to). */
  const bind = (ref, origin) => ctx.credentials.modifyRecord(PENDING.key, async (current) => (boundOrigin(current, ref) === origin ? undefined : bindingRecord(ref, origin)))

  /**
   * The origin the reference value with id `ref` is for. An unbound value is bound to `origin`, the
   * target this attempt dials (its first attempt); the write is conditional, so a binding another
   * process made meanwhile wins.
   */
  async function originOfReference(ref, origin) {
    // A plain read first: a bound value (every retry) takes no lock and needs no writable store.
    const bound = boundOrigin(await ctx.credentials.readRecord(PENDING.key), ref)
    if (bound !== undefined) return bound
    const record = await ctx.credentials.modifyRecord(PENDING.key, async (current) => (boundOrigin(current, ref) === undefined ? bindingRecord(ref, origin) : undefined))
    return boundOrigin(record, ref)
  }

  /**
   * A token credential. `source` is where it came from: the reference (`fromReference`, with
   * `saved`, what `read` found for the origin then) or the saved copy. A refusal is recorded per
   * source: a reference value refused while a saved credential exists is not sent again until the
   * reference changes (Q-LS1 = A); a refused reference with nothing saved is retried as before
   * (F-LINK); a refused saved copy stays saved (R9) but no longer counts as `authorized`.
   */
  const tokenCredentials = (origin, value, source) => {
    const ref = tokenCredentialId(value)
    return Object.freeze({
      kind: CREDENTIAL_KIND.token, clientId: clientId(), ref, secret: value,
      async accepted() {
        if (refusedSaved === ref) refusedSaved = undefined
        if (source.fromReference) {
          // A failed save keeps the reference, so the next connection saves again.
          try { await store.saveToken(origin, value, source.saved.grant) } catch (error) { warn(LINK_SAVE.text.save)(error); return connect.refresh() }
          refusedSaved = undefined
          await unsetIfSaved(value).catch(warn(LINK_SAVE.text.unset))
        }
        connect.refresh()
      },
      async refused() {
        if (!source.fromReference) refusedSaved = ref
        else if (store.hasSaved(source.saved, source.serverUrl)) refusedReference = ref
        connect.refresh()
      },
    })
  }

  async function grantCredentials(origin, grant) {
    const manager = await store.managerFor(origin)
    const auth = grantAuthProvider(manager, grant)
    const ref = grantCredentialId(grant)
    return Object.freeze({
      kind: CREDENTIAL_KIND.grant, clientId: clientId(), ref, authProvider: auth.provider, scope: auth.scope,
      async refused() {
        // A token refused after its refresh: the grant is dropped (Connect again, once, no loop).
        refusedSaved = ref
        await manager.dropTokens({ failedAccessToken: auth.accessToken() }).catch(warn(LINK_SAVE.text.forget))
        connect.refresh()
      },
    })
  }

  /** The credentials of one attempt (see the module header for the order). */
  async function credentialsFor(usable) {
    const { origin } = usable
    const serverUrl = usable.url.href
    // Connect's status follows the target the link dials (R9: a new origin is a new first connection).
    connect.refresh()
    const [reference, saved] = await Promise.all([ctx.credentials.resolve(REF), store.read(origin)])
    const value = reference?.value
    if (value && !(store.hasSaved(saved, serverUrl) && tokenCredentialId(value) === refusedReference)
      && await originOfReference(tokenCredentialId(value), origin) === origin) {
      return tokenCredentials(origin, value, { fromReference: true, saved, serverUrl })
    }
    if (saved.token !== undefined) return tokenCredentials(origin, saved.token, { fromReference: false })
    if (usableGrant(saved.grant, serverUrl, clientId())) return grantCredentials(origin, saved.grant)
    return null
  }

  /**
   * A change of the reference. Core's own unset after a save fires it too, so only a value that is
   * there now counts, and only a value other than the refused one (Q-LS1 = A: the same value written
   * again is not a new token, so it is neither resent nor a reason to reconnect).
   */
  async function referenceChanged() {
    const value = (await ctx.credentials.resolve(REF))?.value
    if (!value) return
    // A write is an import for the target in force now (the module header); without a usable
    // target the first attempt binds it.
    const usable = checkTarget(target())
    if (usable.ok) await bind(tokenCredentialId(value), usable.origin)
    if (tokenCredentialId(value) === refusedReference) return
    refusedReference = undefined
    emitIsolated(reconnects)
  }
  const offReference = ctx.on(LINK_SAVE.events.referenceUpdated, (ref) => {
    if (ref === REF) referenceChanged().catch(warn(LINK_SAVE.text.read))
  })
  const offRecord = ctx.on(LINK_SAVE.events.recordUpdated, () => connect.refresh())

  return Object.freeze({
    credentials: (usable) => credentialsFor(usable),
    connect: connect.control,
    onChange: (fn) => subscribe(reconnects, fn),
    dispose() {
      offReference?.()
      offRecord?.()
      connect.dispose()
    },
  })
}

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
 * 1. a value in the reference, unless the target refused that same value while a saved credential
 *    exists (Q-LS1 = A: a new token is tried first and replaces the saved one only once accepted;
 *    a refused one is not sent again until the reference changes or core restarts);
 * 2. the saved token copy for the origin;
 * 3. the saved Connect grant for the origin, while it holds tokens (an `invalid_grant` drops them:
 *    Connect is needed again, once, with no retry loop);
 * 4. nothing: the link reports `target-unset` and waits.
 * A saved credential the target refuses stays saved (R9: replaced only by a different accepted
 * one); Connect stops reporting `authorized` for it until a credential is accepted again.
 *
 * Every credential carries a non-secret `ref` (`LINK_SAVE.credentialId`) that F-PAIR keys its
 * records and holds on (decided item 13): the same token is one credential whether it is still in
 * the reference or already saved, so saving it never makes pairing start over.
 */
import { createHash } from 'node:crypto'
import { createTokenManager, accessTokenOf, isGrantFor } from 'fishball-shared/oauth-client'
import { CONNECT, HOSTED_IMPORT } from '../../contracts/constants.js'
import { codeOf } from '../events/diagnostics.js'
import { LINK_MCP, LINK_SAVE } from './constants.js'
import { createConnect } from './connect.js'
import { emitIsolated, subscribe } from './listeners.js'

const REF = HOSTED_IMPORT.credentialRef
const HOSTED_KEY = HOSTED_IMPORT.savedRecord.key

/** The link credential kinds (`LinkCredentials.kind`). */
export const CREDENTIAL_KIND = Object.freeze({ token: 'token', grant: 'grant' })

/** The non-secret id of a token: the SHA-256 of its value (the connector's own digest, K1). */
export const tokenCredentialId = (value) => LINK_SAVE.credentialId.tokenPrefix
  + createHash(LINK_SAVE.credentialId.digest).update(value).digest(LINK_SAVE.credentialId.digestEncoding)
const grantCredentialId = (grant) => LINK_SAVE.credentialId.grantPrefix + grant.grantId

/** Connect's grant record key for a target origin (see `LINK_SAVE.grantRecordIdPrefix`). */
export const grantRecordKey = (origin) => `${CONNECT.grantRecordScope}/${LINK_SAVE.grantRecordIdPrefix}${Buffer.from(origin).toString(LINK_SAVE.originEncoding)}`

const hostedTokens = (record) => (record?.payload?.v === LINK_SAVE.hostedPayload.version ? record.payload.tokens ?? {} : {})
const hostedRecord = (tokens) => Object.freeze({ kind: HOSTED_IMPORT.savedRecord.kind, payload: { v: LINK_SAVE.hostedPayload.version, tokens } })
/** A grant the link can connect with for `serverUrl`: issued for it, and still holding tokens. */
const usableGrant = (grant, serverUrl) => isGrantFor(grant, serverUrl) && grant.tokens !== undefined

/**
 * The saved credentials in DSH's credential store (`ctx.credentials`), and one token manager per
 * grant record, so a refresh is single-flight for the link and Connect alike.
 */
function createSavedStore(credentials, { sdk, fetch, now }) {
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
    /** Saves the accepted token for `origin` (once) and removes that origin's grant: one saved credential per origin. */
    async saveToken(origin, value) {
      await credentials.modifyRecord(HOSTED_KEY, async (current) => {
        const tokens = hostedTokens(current)
        return tokens[origin] === value ? undefined : hostedRecord({ ...tokens, [origin]: value })
      })
      await credentials.deleteRecord(grantRecordKey(origin))
    },
    /**
     * Removes `origin`'s token copy (a Connect grant replaced it). The last one deletes the record,
     * so `describeRecord(savedRecord.key).configured` keeps meaning "the child holds a credential".
     */
    async dropToken(origin) {
      let empty = false
      await credentials.modifyRecord(HOSTED_KEY, async (current) => {
        const { [origin]: dropped, ...rest } = hostedTokens(current)
        empty = Object.keys(rest).length === 0
        return dropped === undefined || empty ? undefined : hostedRecord(rest)
      })
      // modifyRecord cannot delete: the record's last origin goes with the record itself.
      if (empty) await credentials.deleteRecord(HOSTED_KEY)
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
  const loadSdk = async () => (sdkModule ??= await import(LINK_MCP.clientPackage))
  const store = createSavedStore(ctx.credentials, { sdk: loadSdk, fetch, now })
  // Q-LS1 = A: the reference value the target refused while a saved credential existed (by id);
  // cleared when the reference changes. And the saved credential the target refused, by id.
  let refusedReference
  let refusedSaved

  const connect = createConnect(ctx, {
    store, target, clientId, clientMetadataUrl, sdk: loadSdk, fetch, timers,
    isRefused: (ref) => ref === refusedSaved,
    credentialIdOf: (saved) => (saved.token !== undefined ? tokenCredentialId(saved.token) : grantCredentialId(saved.grant)),
    usableGrant,
    onSaved: async (origin) => {
      refusedSaved = undefined
      await store.dropToken(origin).catch(warn(LINK_SAVE.text.forget))
      emitIsolated(reconnects)
    },
  })

  const tokenCredentials = (origin, value, fromReference) => {
    const ref = tokenCredentialId(value)
    return Object.freeze({
      kind: CREDENTIAL_KIND.token, clientId: clientId(), ref, secret: value,
      async accepted() {
        if (refusedSaved === ref) { refusedSaved = undefined; connect.refresh() }
        if (!fromReference) return
        // K3a step 3: save, then unset; a failed save keeps the reference, so the next connection saves again.
        try { await store.saveToken(origin, value) } catch (error) { return warn(LINK_SAVE.text.save)(error) }
        refusedSaved = undefined
        await ctx.credentials.unset(REF).catch(warn(LINK_SAVE.text.unset))
        connect.refresh()
      },
      async refused(hasSaved) {
        if (fromReference && hasSaved) refusedReference = ref
        else refusedSaved = ref
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
    const [reference, saved] = await Promise.all([ctx.credentials.resolve(REF), store.read(origin)])
    const hasSaved = saved.token !== undefined || usableGrant(saved.grant, usable.url.href)
    const value = reference?.value
    if (value && !(hasSaved && tokenCredentialId(value) === refusedReference)) {
      const chosen = tokenCredentials(origin, value, true)
      return Object.freeze({ ...chosen, refused: () => chosen.refused(hasSaved) })
    }
    if (saved.token !== undefined) return tokenCredentials(origin, saved.token, false)
    if (usableGrant(saved.grant, usable.url.href)) return grantCredentials(origin, saved.grant)
    return null
  }

  const offReference = ctx.on(LINK_SAVE.events.referenceUpdated, (ref) => {
    if (ref !== REF) return
    refusedReference = undefined
    // Core's own unset after a save fires this too: only a value that is there now is a new token.
    ctx.credentials.describe(REF).then((info) => { if (info.configured) emitIsolated(reconnects) }, warn(LINK_SAVE.text.read))
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

/**
 * Core's credential source and its saved credential (task F-LINK-SAVE; requirements 1.29 R7
 * "在第一次连接远程dsh的时候保存一次到fishball本地，这也apply to standalone fishball", 1.30 R9, 1.31
 * R10, 1.33 Q-B2; the user's Q-LS1 = A; K3a `link.d.ts` `HostedImportNames`, `connect.d.ts`;
 * design §5.4, §6.3, §6.3a). The same in hosted and standalone mode: only who fills the credential
 * reference differs (the instance's import, or the user's paste in core's write-only field).
 *
 * MULTI-1: one of these per target epoch, over that epoch's names (`credentialNames`; MULTI-0
 * `TARGETS.credentials`): the parent's are the hosted import's fixed names, an added target's its
 * own. Every saved, pending and grant payload carries its `TargetCredentialBinding` (target id,
 * endpoint epoch, origin, agent id) and is used only while all four are current (security
 * amendment); a disposed epoch's late completions change nothing.
 *
 * Two credentials, at most one saved per binding (R9):
 * - a **token** (`client_credentials`, client id = `identity.id`): read from the epoch's
 *   reference; once the target accepted it (the link's first successful connection with it), saved
 *   once into the epoch's token record (payload: `LINK_SAVE.hostedPayload`, the value and its
 *   binding), then the reference is unset;
 * - a **Connect grant** (authorization code + PKCE, `connect.js`): saved by the code exchange in
 *   the epoch's grant record `fishball-core/connect-<id>-<epoch>`; core never holds a token value for it.
 *
 * Which credential an attempt uses (first match):
 * 1. a value in the reference, for the binding it was put there for only (R-FIX F01, below),
 *    unless the target refused that same value while a saved credential exists (Q-LS1 = A: a new
 *    token is tried first and replaces the saved one only once accepted; a refused one is not sent
 *    again until the reference changes or core restarts);
 * 2. the saved token copy of this binding;
 * 3. the saved Connect grant of this binding, while it holds tokens (an `invalid_grant` drops them:
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
 * write of the reference cannot relabel an unchanged value from a retired epoch.
 *
 * Every credential carries a non-secret `ref` (`LINK_SAVE.credentialId`) that F-PAIR keys its
 * records and holds on (decided item 13): the same token is one credential whether it is still in
 * the reference or already saved, so saving it never makes pairing start over.
 */
import { createHash } from 'node:crypto'
import { createTokenManager, accessTokenOf, isGrantFor } from './oauth-client.js'
import { CONNECT, HOSTED_IMPORT, TARGETS } from '../../contracts/constants.js'
import { codeOf } from '../events/diagnostics.js'
import { LINK_SAVE } from './constants.js'
import { createConnect } from './connect.js'
import { importMcpClient } from './link.js'
import { emitIsolated, subscribe } from './listeners.js'
import { checkTarget } from './target.js'

const PENDING = LINK_SAVE.pendingOrigin
const CRED = TARGETS.credentials
const BINDING = CRED.bindingField

/**
 * The binding of a credential payload to one target epoch (MULTI-0 `TargetCredentialBinding`,
 * security amendment): every core-private saved, pending and grant payload carries it under
 * `TARGETS.credentials.bindingField`, and it is used only while all four members are the current
 * ones. An origin match alone is never enough: the fixed parent names serve every parent epoch.
 */
const bindingOf = (names, origin, agentId) => Object.freeze({ targetId: names.targetId, endpointEpoch: names.endpointEpoch, origin, agentId })
const isBinding = (binding, expected) => binding !== null && typeof binding === 'object'
  && binding.targetId === expected.targetId && binding.endpointEpoch === expected.endpointEpoch && binding.origin === expected.origin && binding.agentId === expected.agentId
/** Whether a payload's binding names this target epoch (whatever its origin or agent): another epoch's is never touched. */
const ofEpoch = (payload, names) => payload?.[BINDING]?.targetId === names.targetId && payload[BINDING].endpointEpoch === names.endpointEpoch

/** An added target's record key `fishball-core/<prefix><id>-<epoch>` (MULTI-0 `TARGETS.credentials`). */
const targetRecordKey = (prefix, targetId, endpointEpoch) => `${CONNECT.grantRecordScope}/${prefix}${targetId}${CRED.recordSeparator}${endpointEpoch}`

/**
 * The credential names one target epoch reads and writes (MULTI-0 `TARGETS.credentials`,
 * `link.d.ts` hosted reservation): the reserved parent alone has the hosted import's reference and
 * record and the pending-origin binding; an added target has its own reference and token record
 * keyed by its id and epoch, so it can never satisfy the instance's hosted probe, and two targets
 * on one origin never share a credential. Every target, the parent included, keeps its Connect
 * grant in its own epoch's record (`connect-<id>-<epoch>`).
 * - `ref`: the token entry reference (DSH's grammar `^[A-Za-z_][A-Za-z0-9_]*$`, every `-` written `_`);
 * - `tokenRecord`: the saved token copy, payload `LINK_SAVE.hostedPayload` (value by origin);
 * - `pending`: the reference value's origin binding record, or `undefined` for an added target,
 *   whose reference exists for its one epoch, so the value is bound to that endpoint by its name;
 * - `grantKey()`: Connect's grant record of this epoch;
 * - `targetId`, `endpointEpoch`: the epoch every payload's binding names (`bindingOf`).
 * @param {{targetId: string, endpointEpoch: string}} target
 */
export function credentialNames({ targetId, endpointEpoch }) {
  const grant = targetRecordKey(CRED.grantRecordPrefix, targetId, endpointEpoch)
  if (targetId === TARGETS.parentId) {
    return Object.freeze({ targetId, endpointEpoch, ref: HOSTED_IMPORT.credentialRef, tokenRecord: HOSTED_IMPORT.savedRecord.key, pending: PENDING.key, grantKey: () => grant })
  }
  return Object.freeze({
    targetId,
    endpointEpoch,
    ref: (CRED.tokenRefPrefix + targetId + CRED.tokenRefSeparator + endpointEpoch).split(CRED.refReplaced).join(CRED.refReplacement),
    tokenRecord: targetRecordKey(CRED.tokenRecordPrefix, targetId, endpointEpoch),
    pending: undefined,
    grantKey: () => grant,
  })
}

/**
 * Deletes a retired target epoch's token material (MULTI-0 `FishballTargets.remove` / `setUrl`,
 * Q07; a parent epoch the instance re-pointed, security amendment): its Connect grant, its saved
 * token copy and its reference. An added target's are that epoch's alone. The parent's are fixed
 * names every parent epoch uses, so cleanup touches only the retired epoch's saved and pending
 * bindings (MULTI-0 review M3), and unsets the reference only when that pending binding matches
 * its current value. Retired credential ids remain as evidence; an unrelated handoff stays and
 * can bind at the new epoch's first attempt. Local only: nothing is revoked at the connector.
 * The caller runs this after the epoch's credentials are disposed.
 */
export async function forgetCredentials(credentials, names) {
  await credentials.deleteRecord(names.grantKey())
  if (names.pending === undefined) {
    await credentials.unset(names.ref)
    await credentials.deleteRecord(names.tokenRecord)
    return
  }
  await clearParentMaterial(credentials, names, (payload) => ofEpoch(payload, names))
}

/** After a crash only the new epoch may be known. Never infer ownership of an unbound handoff. */
export function clearStaleParentCredentials(credentials, endpointEpoch) {
  const names = credentialNames({ targetId: TARGETS.parentId, endpointEpoch })
  return clearParentMaterial(credentials, names, (payload) => {
    const binding = payload?.[BINDING]
    return binding?.targetId === TARGETS.parentId && typeof binding.endpointEpoch === 'string' && binding.endpointEpoch !== endpointEpoch
  })
}

async function clearParentMaterial(credentials, names, retired) {
  const [pending, saved] = await Promise.all([credentials.readRecord(names.pending), credentials.readRecord(names.tokenRecord)])
  const staleRefs = new Set(pendingBindings(pending).filter(retired).map(({ ref }) => ref))
  const staleSaved = retired(saved?.payload)
  if (staleRefs.size) {
    // Resolve immediately before unset: the instance may already have replaced the old handoff.
    const value = (await credentials.resolve(names.ref))?.value
    if (value !== undefined && staleRefs.has(tokenCredentialId(value))) await credentials.unset(names.ref)
  }
  if (staleSaved && typeof saved.payload.token === 'string') staleRefs.add(tokenCredentialId(saved.payload.token))
  if (staleRefs.size) {
    // An ambient value can survive unset or be masked by a writable handoff. Retain its id even
    // when not effective now, atomically with removing the bindings that belonged to that epoch.
    await credentials.modifyRecord(names.pending, async (current) => {
      const refs = new Set([...retiredRefs(current), ...staleRefs])
      const keep = pendingBindings(current).filter((entry) => {
        if (!retired(entry)) return true
        refs.add(entry.ref)
        return false
      })
      return pendingRecord(keep, [...refs])
    })
  }
  if (staleSaved) await credentials.deleteRecord(names.tokenRecord)
}

/** The link credential kinds (`LinkCredentials.kind`). */
export const CREDENTIAL_KIND = Object.freeze({ token: 'token', grant: 'grant' })

/**
 * The non-secret id of a token: a SHA-256 of its value under core's own domain prefix, so the id
 * can never equal the connector's stored lookup digest of the same value (K1 `TOKEN_VALUE`).
 */
export const tokenCredentialId = (value) => LINK_SAVE.credentialId.tokenPrefix
  + createHash(LINK_SAVE.credentialId.digest).update(LINK_SAVE.credentialId.domain + value).digest(LINK_SAVE.credentialId.digestEncoding)
const grantCredentialId = (grant) => LINK_SAVE.credentialId.grantPrefix + grant.grantId

/**
 * A saved token copy: one accepted value and its binding (security amendment: the copy is the
 * binding's, never "the origin's"). A payload of another version, or bound to anything but the
 * current target epoch, origin and agent, reads as none; V3 is installed fresh (Q-M1), so only this
 * version is ever written.
 */
const isOwnVersion = (record) => record?.payload?.v === LINK_SAVE.hostedPayload.version
const savedToken = (record, binding) => (isOwnVersion(record) && isBinding(record.payload[BINDING], binding) ? record.payload.token : undefined)
// The hosted record's kind serves every saved token copy (the parent's and an added target's).
const tokenRecordOf = (token, binding) => Object.freeze({ kind: HOSTED_IMPORT.savedRecord.kind, payload: { v: LINK_SAVE.hostedPayload.version, token, [BINDING]: binding } })
/**
 * A grant the link can connect with for `serverUrl` as fishball id `clientId`: issued for that URL,
 * still holding tokens, and approved for that id (R-FIX F10). The approval page bound the entry to
 * the id Connect passed (`agentId`, R-OA-22); refreshing never changes it, so after a change of
 * `identity.id` the grant still acts as the old id, and only a new Connect gives the new one. A
 * grant without its `agentId` or its binding (security amendment) is not usable.
 */
const usableGrant = (grant, serverUrl, binding) => isGrantFor(grant, serverUrl) && grant.tokens !== undefined
  && grant[LINK_SAVE.grantAgentIdField] === binding.agentId && isBinding(grant[BINDING], binding)

/**
 * The parent's pending record keeps the latest `{ref, binding}`, any masked bindings, and
 * retired ids. A writable value can mask an earlier binding even before renewal; keep that
 * binding until its epoch retires. One record lets DSH's lock protect all three together.
 * `pendingOf` returns `undefined` for a fresh handoff, `null` for a blocked value, or its binding.
 */
const pendingPayload = (record) => record?.payload?.v === PENDING.version ? record.payload : undefined
function pendingBindings(record) {
  const payload = pendingPayload(record)
  const masked = Array.isArray(payload?.maskedBindings) ? payload.maskedBindings : []
  return typeof payload?.ref === 'string' ? [{ ref: payload.ref, [BINDING]: payload[BINDING] ?? null }, ...masked] : masked
}
function retiredRefs(record) {
  const refs = pendingPayload(record)?.retiredRefs
  return Array.isArray(refs) ? refs : []
}
const pendingOf = (record, ref) => {
  if (retiredRefs(record).includes(ref)) return null
  const entry = pendingBindings(record).find((binding) => binding.ref === ref)
  return entry === undefined ? undefined : entry[BINDING] ?? null
}
const pendingRecord = ([active, ...maskedBindings], retiredRefs) => Object.freeze({ kind: PENDING.kind, payload: { v: PENDING.version, ...active, maskedBindings, retiredRefs } })
const bindPending = (record, ref, binding) => pendingRecord([
  { ref, [BINDING]: binding }, ...pendingBindings(record).filter((entry) => entry.ref !== ref),
], retiredRefs(record))

/**
 * The saved credentials in DSH's credential store (`ctx.credentials`), and one token manager per
 * grant record, so a refresh is single-flight for the link and Connect alike.
 */
function createSavedStore(credentials, { names, sdk, fetch, now, clientId, fenced }) {
  const managers = new Map()
  const HOSTED_KEY = names.tokenRecord
  const grantRecordKey = names.grantKey
  const binding = (origin) => bindingOf(names, origin, clientId())
  return Object.freeze({
    grantKey: grantRecordKey,
    binding,
    async managerFor(origin) {
      const key = grantRecordKey(origin)
      if (!managers.has(key)) managers.set(key, createTokenManager({ sdk: await sdk(), credentials, key, now, refreshLeadMs: LINK_SAVE.refreshLeadMs, fetchFn: fetch }))
      return managers.get(key)
    },
    /** Resolves once no refresh of this epoch's grants is in flight (review m7: before its grant is deleted). */
    settled: () => Promise.all([...managers.values()].map((manager) => manager.settled())),
    /** `{token, grant}` saved for `origin`: the token copy's value and the grant payload, each or `undefined`. */
    async read(origin) {
      const [hosted, grant] = await Promise.all([credentials.readRecord(HOSTED_KEY), credentials.readRecord(grantRecordKey(origin))])
      return { token: savedToken(hosted, binding(origin)), grant: grant?.payload, origin }
    },
    /** Whether `saved` (from `read`) holds a credential the link can use for `serverUrl`. */
    hasSaved: (saved, serverUrl) => saved.token !== undefined || usableGrant(saved.grant, serverUrl, binding(saved.origin)),
    /**
     * Saves the accepted token for `origin` (once) and removes the grant `replaced` (the one `read`
     * found for the attempt): one saved credential per origin. Only that grant goes: a grant another
     * core process committed meanwhile (CLI and Web share the store) is newer and stays. DSH has no
     * compare-and-delete, so a commit between the fresh read and the delete is the window left.
     */
    async saveToken(origin, value, replaced, bound) {
      // `fenced()`: this epoch was retired meanwhile (the late completion of the amendment): nothing changes.
      await credentials.modifyRecord(HOSTED_KEY, async (current) => (fenced() || savedToken(current, bound) === value ? undefined : tokenRecordOf(value, bound)))
      if (fenced()) return
      const key = grantRecordKey(origin)
      if (replaced !== undefined && (await credentials.readRecord(key))?.payload?.grantId === replaced.grantId) await credentials.deleteRecord(key)
    },
    /**
     * Removes this binding's token copy (a Connect grant replaced it), so
     * `describeRecord(savedRecord.key).configured` keeps meaning "the child holds a credential". A
     * copy of another binding stays. DSH has no compare-and-delete, so a save between this read and
     * the delete is the window left.
     */
    async dropToken(origin) {
      const fresh = await credentials.readRecord(HOSTED_KEY)
      if (!fenced() && savedToken(fresh, binding(origin)) !== undefined) await credentials.deleteRecord(HOSTED_KEY)
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
 * @param {() => unknown} options.target the target epoch's URL (MULTI-1: its target record's, or
 *   the instance's for the parent)
 * @param {{ref: string, tokenRecord: string, pending: string | undefined, grantKey: Function}} options.names
 *   the target epoch's credential names (`credentialNames`), required: a `TypeError` without them
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
export function createLinkCredentials(ctx, { target, clientId, clientMetadataUrl, names, sdk, fetch = (...args) => globalThis.fetch(...args), now = Date.now, timers = globalThis }) {
  // No default (review m10): a caller that names no target epoch must not get the parent's fixed names.
  if (typeof names?.ref !== 'string' || typeof names.targetId !== 'string' || typeof names.endpointEpoch !== 'string') throw new TypeError(LINK_SAVE.text.names)
  const logger = ctx.logger?.(LINK_SAVE.logger)
  const warn = (what) => (error) => logger?.warn(LINK_SAVE.text.failed, what, codeOf(error))
  const reconnects = new Set()
  let sdkModule = sdk
  // Connect's and the saved grants' MCP client; a failed import is logged as the link's (E-FIX-3).
  const loadSdk = async () => (sdkModule ??= await importMcpClient(logger))
  // Disposed (the epoch was retired, removed or re-pointed): every late completion of an attempt of
  // this epoch saves, unsets and binds nothing (security amendment: the generation fence).
  let disposed = false
  const fenced = () => disposed
  const store = createSavedStore(ctx.credentials, { names, sdk: loadSdk, fetch, now, clientId, fenced })
  const REF = names.ref
  // Q-LS1 = A: the reference value the target refused while a saved credential existed (by id);
  // cleared when the reference changes. And the saved credential the target refused, by id.
  let refusedReference
  let refusedSaved

  const connect = createConnect(ctx, {
    store, target, clientId, clientMetadataUrl, sdk: loadSdk, fetch, timers,
    // A Connect grant names its binding (the origin the attempt began for, and its agent id).
    bindingOf: (origin, agentId) => Object.freeze({ [BINDING]: bindingOf(names, origin, agentId) }),
    isRefused: (ref) => ref === refusedSaved,
    credentialIdOf: (saved) => (saved.token !== undefined ? tokenCredentialId(saved.token) : grantCredentialId(saved.grant)),
    onSaved: async (origin) => {
      if (fenced()) return
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
    if (!fenced() && (await ctx.credentials.resolve(REF))?.value === value) await ctx.credentials.unset(REF)
  }

  /**
   * A provider update can expose the same ambient value, not a new handoff. Never relabel that
   * value's retired binding. An added target's reference names its epoch, so it needs no record.
   */
  const bind = (ref, origin) => (names.pending === undefined || fenced() ? Promise.resolve()
    : ctx.credentials.modifyRecord(names.pending, async (current) => {
      const existing = pendingOf(current, ref)
      const expected = store.binding(origin)
      if (fenced() || existing === null || (existing !== undefined && (existing.targetId !== names.targetId
        || existing.endpointEpoch !== names.endpointEpoch || isBinding(existing, expected)))) return undefined
      return bindPending(current, ref, expected)
    }))

  /**
   * Whether the reference value with id `ref` is this epoch's at `origin` (all four binding members,
   * security amendment). An unbound value is bound now, to the epoch this attempt dials (its first
   * attempt); the write is conditional, so a binding another process made meanwhile wins. A value
   * bound to anything else (another parent epoch, origin or agent id) is never sent.
   */
  async function isOwnReference(ref, origin) {
    // An added target's reference is for its own epoch, whose endpoint never changes (a URL edit
    // is a new epoch with a new reference), so its value is always for the epoch dialled.
    if (names.pending === undefined) return true
    const expected = store.binding(origin)
    // A plain read first: a bound value (every retry) takes no lock and needs no writable store.
    const read = pendingOf(await ctx.credentials.readRecord(names.pending), ref)
    if (read !== undefined) return isBinding(read, expected)
    if (fenced()) return false
    const record = await ctx.credentials.modifyRecord(names.pending, async (current) => (pendingOf(current, ref) === undefined && !fenced() ? bindPending(current, ref, expected) : undefined))
    return isBinding(pendingOf(record, ref), expected)
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
    // The binding this attempt captured: a save after the epoch or the id changed is not this attempt's.
    const bound = store.binding(origin)
    return Object.freeze({
      kind: CREDENTIAL_KIND.token, clientId: bound.agentId, ref, secret: value,
      async accepted() {
        if (fenced()) return
        if (refusedSaved === ref) refusedSaved = undefined
        if (source.fromReference) {
          // A failed save keeps the reference, so the next connection saves again.
          try { await store.saveToken(origin, value, source.saved.grant, bound) } catch (error) { warn(LINK_SAVE.text.save)(error); return connect.refresh() }
          refusedSaved = undefined
          await unsetIfSaved(value).catch(warn(LINK_SAVE.text.unset))
        }
        connect.refresh()
      },
      async refused() {
        if (fenced()) return
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
        if (fenced()) return
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
      && await isOwnReference(tokenCredentialId(value), origin)) {
      return tokenCredentials(origin, value, { fromReference: true, saved, serverUrl })
    }
    if (saved.token !== undefined) return tokenCredentials(origin, saved.token, { fromReference: false })
    if (usableGrant(saved.grant, serverUrl, store.binding(origin))) return grantCredentials(origin, saved.grant)
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
    /**
     * Stops this epoch's credentials: every late completion is fenced from now on. Resolves once a
     * grant refresh in flight has settled, so a retirement that deletes the grant afterwards is not
     * undone by that refresh's write (review m7).
     */
    dispose() {
      disposed = true
      offReference?.()
      offRecord?.()
      connect.dispose()
      return store.settled().catch(() => {})
    },
  })
}

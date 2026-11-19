/**
 * The two browser grants of the token endpoint, as K1b `GrantHandler`s that C-WIRE registers with
 * C-OAUTH's `GrantRegistry` (R-OA-14, R-OA-16; design §5.5a step 6; S7b). C-OAUTH has already
 * answered the endpoint's own refusals (rate and failure limits, a secret in the URL, a repeated
 * parameter, a missing or unknown `grant_type`) and records `countedFailure`.
 *
 * Counted failures: only a refused credential counts (FAILURE_LIMIT "Counted"); here that is a
 * client secret sent on a public grant. A code or refresh token is a 256-bit bearer value, not a
 * guessable credential, so an unknown one is `invalid_grant` without counting.
 *
 * Concurrency: a redemption's issuance (the new refresh token's durable write, then the access
 * token) is held as a promise in this grant's memory from the moment it starts, before any await.
 * A replay or a reuse then waits for that issuance to settle before it calls `revokeChain`, so no
 * token of the chain can be written after its revocation (K1 does not promise that `revokeChain`
 * refuses later puts). A failed issuance puts back what it consumed (the code, or the refresh
 * token's unspent record), so the client's retry is a retry, not a replay.
 */
import { CLIENT_AUTH, GRANT, LIFETIME, OAUTH_ERROR } from '../../../mcp-schema/index.js'
import { TOKEN_FIELD } from './constants.js'
import { issueLink, liveBinding } from './issue.js'
import { digestOf, mintOpaque, verifierMatches } from './secrets.js'

const refused = (error, countedFailure = false) => Object.freeze({ ok: false, error, countedFailure })
const INVALID_GRANT = refused(OAUTH_ERROR.invalidGrant)
const INVALID_TARGET = refused(OAUTH_ERROR.invalidTarget)
const INVALID_REQUEST = refused(OAUTH_ERROR.invalidRequest)
const granted = (body) => Object.freeze({ ok: true, body })

/** Whether the client authenticated with a secret: browser clients are public (`none`, CIMD draft §4.1). */
const carriesSecret = (client) => client.secret !== undefined || client.method !== CLIENT_AUTH.none

/** Resolves once `promise` settles, whatever its outcome. */
const settled = (promise) => promise.then(() => undefined, () => undefined)

/**
 * The shared steps of a public browser grant: no client secret, then the presented code or refresh
 * token, which the subclass redeems. Each subclass keeps `held`: digest → `{until, issuance, …}`, a
 * short memory of its in-flight and recent redemptions.
 * Subclasses set `grantType`, `secretError` (the answer to a client secret) and `credentialField`.
 */
class BrowserGrant {
  held = new Map()

  /** @param deps `{store: OAuthTokenStore, tokens: TokenRegistry, pairs: PairStore}` */
  constructor(deps) {
    this.deps = deps
  }

  /** K1b `GrantHandler.handle`: never throws for a bad request; a storage failure rejects (C-OAUTH: 500). */
  async handle(form, ctx) {
    if (carriesSecret(ctx.client)) return refused(this.secretError, true)
    const presented = form[this.credentialField]
    // RFC 6749 §5.2: a missing required parameter is `invalid_request`.
    if (typeof presented !== 'string' || presented === '') return INVALID_REQUEST
    this.prune(ctx.now)
    return this.redeem(digestOf(presented), form, ctx.now)
  }

  /** Forgets memories whose `until` passed; one whose issuance is still running stays until it settles. */
  prune(now) {
    for (const [digest, memory] of this.held) if (memory.until <= now && memory.done) this.held.delete(digest)
  }

  /**
   * Starts an issuance and remembers it under `digest` in the same synchronous step, so any
   * presentation that arrives while it runs finds it. On failure the memory is dropped and
   * `restore()` puts back what the redemption consumed, both before anyone awaiting the issuance
   * sees the failure, so a waiting repeat finds the restored record; the original error rejects.
   */
  async remember(digest, memory, issue, restore) {
    memory.issuance = issue().catch(async (error) => {
      if (this.held.get(digest) === memory) this.held.delete(digest)
      await settled(Promise.resolve().then(restore))
      throw error
    })
    this.held.set(digest, memory)
    try {
      return granted((await memory.issuance).body)
    } finally {
      memory.done = true
    }
  }

  /** Reuse or replay: revokes `chainId` once the chain's in-flight issuance (if any) settled. */
  async revoke(digest, memory) {
    if (this.held.get(digest) === memory) this.held.delete(digest)
    if (memory.issuance !== undefined) await settled(memory.issuance)
    await this.deps.store.revokeChain(memory.chainId)
    return INVALID_GRANT
  }
}

/**
 * `authorization_code` (R-OA-14, AUTH-ST-04 rows 8–11, AUTH-BVA-07 rows 1–3). A code is single use,
 * bound to (client, redirect URI, challenge, resource, entry) and valid strictly before
 * `issuedAt + LIFETIME.codeMs`. A wrong client id, redirect URI or verifier, or a missing or foreign
 * `resource`, leaves the code unconsumed (K1 README, AUTH-ST-04 row 9). A code presented again after
 * its redemption revokes the chain it started and answers `invalid_grant`; that memory is kept for
 * the code's own life only (Fishball 2026-11-14), after which a replay is an expired code.
 */
class AuthorizationCodeGrant extends BrowserGrant {
  grantType = GRANT.authorizationCode
  // R-OA-14: a client secret on the code grant is `invalid_client` (counted, Fishball 2026-11-14).
  secretError = OAUTH_ERROR.invalidClient
  credentialField = TOKEN_FIELD.code

  async redeem(digest, form, now) {
    const { store } = this.deps
    const replay = this.held.get(digest)
    if (replay !== undefined) return this.revoke(digest, replay)
    const code = store.takeCode(digest)
    if (code === undefined || now >= code.issuedAt + LIFETIME.codeMs) return INVALID_GRANT
    const bound = code.clientId === form[TOKEN_FIELD.clientId] && code.redirectUri === form[TOKEN_FIELD.redirectUri]
      && verifierMatches(form[TOKEN_FIELD.codeVerifier], code.codeChallenge)
    const answer = !bound ? INVALID_GRANT : form[TOKEN_FIELD.resource] !== code.audience ? INVALID_TARGET : undefined
    const putBack = () => store.putCode(digest, code)
    if (answer !== undefined) {
      // `takeCode` is the store's only read, and it removes; the unconsumed code goes back as it was.
      putBack()
      return answer
    }
    // CodeRecord carries no generation (Fishball 2026-11-14, item 8): the entry must still be
    // enabled and bound to this client, and C-OAUTH's `revokeEntry` drops an entry's open codes.
    const binding = liveBinding(this.deps, code.entryKey, code.clientId)
    if (binding === undefined) return INVALID_GRANT
    const chain = { chainId: mintOpaque() }
    const memory = { chainId: chain.chainId, until: code.issuedAt + LIFETIME.codeMs, done: false }
    return this.remember(digest, memory, () => issueLink(store, binding, code.clientId, code.audience, chain, now), putBack)
  }
}

/**
 * `refresh_token` (R-OA-16, AUTH-ST-05, AUTH-BVA-08). No chain ends by age (R-OA-23, requirements
 * 1.32 R14): only reuse, a replayed code or a disable or delete of the entry ends one. Rotation:
 * each grant spends the presented token and returns a new pair. A spent token presented again strictly within
 * LIFETIME.refreshGraceMs of its spending, by the same `client_id` for the same `resource`, gets the
 * identical successor response (Q-S7B-1 B); any other repeat is reuse and revokes the chain. The
 * memory is held for the window only, so a restart forgets it (row 8a: reuse). Concurrent
 * presentations of one token (the stock TS client's in-flight calls) all await its one rotation.
 */
class RefreshTokenGrant extends BrowserGrant {
  grantType = GRANT.refreshToken
  // R-OA-07, R-OA-16 (6), AUTH-UC-03 E2: a secret-authenticated (machine) client's refresh grant is
  // `invalid_grant`, counted (Fishball 2026-11-14, decision (a): these rules beat the README's
  // general "secret on a public grant" row).
  secretError = OAUTH_ERROR.invalidGrant
  credentialField = TOKEN_FIELD.refreshToken

  /** Whether the entry still stands at the generation `record` was issued under (R-OA-16 (3)). */
  stands(record) {
    return liveBinding(this.deps, record.entryKey, record.clientId, record.generation)
  }

  async redeem(digest, form, now) {
    const memory = this.held.get(digest)
    if (memory !== undefined) return this.repeat(digest, memory, form, now)
    const { store } = this.deps
    const record = store.getRefresh(digest)
    if (record === undefined) return INVALID_GRANT
    if (record.spentAt !== undefined) return this.revoke(digest, { chainId: record.chainId })
    // AUTH-ST-05 rows 3c, 4, 5: a wrong client or resource rotates nothing.
    if (form[TOKEN_FIELD.clientId] !== record.clientId) return INVALID_GRANT
    if (form[TOKEN_FIELD.resource] !== record.audience) return INVALID_TARGET
    // R-OA-16 (3), AUTH-ST-05 rows 6, 8b: nothing replays a disable or delete made
    // while the connector was down and C-OAUTH runs no startup sweep (Fishball 2026-11-14), so the
    // entry's current generation (TokenRegistry.get) is compared with the record's on every refresh.
    const binding = this.stands(record)
    if (binding === undefined) return INVALID_GRANT
    const rotation = { record, chainId: record.chainId, until: now + LIFETIME.refreshGraceMs, done: false }
    const rotate = async () => {
      await store.putRefresh(digest, { ...record, spentAt: now })
      return issueLink(store, binding, record.clientId, record.audience, record, now)
    }
    // Rolls the spend back, so a failed rotation leaves the token usable instead of a reuse trap.
    return this.remember(digest, rotation, rotate, () => store.putRefresh(digest, record))
  }

  /**
   * A spent token again, while its rotation is remembered. The entry must still stand (checked
   * live, as in `redeem`). From the same caller within the window: the identical successor, once
   * the rotation succeeded and while its chain still lives (a code replay may have revoked it
   * since; the successor's refresh record is then gone from the store); otherwise reuse.
   */
  async repeat(digest, rotation, form, now) {
    if (this.stands(rotation.record) === undefined) return INVALID_GRANT
    const sameCaller = form[TOKEN_FIELD.clientId] === rotation.record.clientId && form[TOKEN_FIELD.resource] === rotation.record.audience
    if (now >= rotation.until || !sameCaller) return this.revoke(digest, rotation)
    let issued
    try {
      issued = await rotation.issuance
    } catch {
      // The rotation failed and was rolled back; this presentation is a fresh one.
      return this.redeem(digest, form, now)
    }
    if (this.deps.store.getRefresh(issued.refreshDigest) === undefined) return INVALID_GRANT
    return granted(issued.body)
  }
}

/** @param deps `{store: OAuthTokenStore, tokens: TokenRegistry, pairs: PairStore}` (K1; C-WIRE passes C-OAUTH's store) */
export const createAuthorizationCodeGrant = (deps) => Object.freeze(new AuthorizationCodeGrant(deps))
/** @param deps as `createAuthorizationCodeGrant` */
export const createRefreshTokenGrant = (deps) => Object.freeze(new RefreshTokenGrant(deps))

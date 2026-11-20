/**
 * X-SEC X-03, token-endpoint part (.runtime/reports/x-sec-audit.md; the C-WIRE-2 requirements relayed
 * 2026-11-17; K1 FAILURE_LIMIT amended): a valid client_credentials, authorization_code or
 * refresh_token request always succeeds, even when its (address, client_id) key or its address is past
 * the failure limit; a failing one while limited → 429 temporarily_unavailable, uncounted. RATE_LIMITS
 * (the request rate) is unchanged and still applies to every request. Decision table: credential
 * (valid, failing) × limited (key, address) × grant (client_credentials, authorization_code,
 * refresh_token). Black box over the real endpoint (cases.mjs world).
 */
import assert from 'node:assert/strict'
import { assertError, assertLimited, codeRequest, issue, okGrant, refusingGrant, row, tokenRequest } from './cases.mjs'
import { CLIENT_AUTH, FAILURE_LIMIT, FIXTURE, GRANT, HTTP_STATUS, HTTP_WIRE, OAUTH_ERROR, SCOPE } from './constants.mjs'

const ID = 'X-SEC X-03'
const FORM = HTTP_WIRE.form_
const keyOf = (w, clientId) => ({ remoteAddress: w.remoteAddresses.at(-1), clientId })
/** `n` wrong secrets for `clientId` (each counted invalid_client). */
async function wrongSecrets(w, clientId, n) {
  for (let i = 0; i < n; i += 1) assertError(await tokenRequest(w, { clientId, secret: FIXTURE.value() }), OAUTH_ERROR.invalidClient)
}
/** The address past perAddressPerWindow over many client ids (recorded on the shared limiter). */
function addressLimited(w) {
  for (let i = 0; i < FAILURE_LIMIT.perAddressPerWindow; i += 1) w.limiter.recordFailure(keyOf(w, FIXTURE.id.y + i), w.clock.now())
}
const refreshRequest = (w) => tokenRequest(w, { auth: CLIENT_AUTH.none, clientId: FIXTURE.cimd, grant: GRANT.refreshToken, extra: [[FORM.refreshToken, FIXTURE.fakeRefresh]] })

export function registerXsecTokenCases(sdk) {
  row(sdk, ID, 'client_credentials (key)', 'after perKeyPerWindow wrong secrets for client A, A\'s correct secret → a token, and B\'s correct secret → a token', async (w) => {
    const a = w.tokens.add()
    const b = w.tokens.add()
    await tokenRequest(w, { clientId: FIXTURE.id.agentA, secret: a.value })
    await wrongSecrets(w, FIXTURE.id.agentA, FAILURE_LIMIT.perKeyPerWindow)
    assert.equal(w.limiter.check(keyOf(w, FIXTURE.id.agentA), w.clock.now()).limited, true, 'harness: A is not limited')
    await issue(w, a, FIXTURE.id.agentA, SCOPE.pair)
    await issue(w, b, FIXTURE.id.x, SCOPE.pair)
  })
  row(sdk, ID, 'client_credentials (wrong, limited)', 'while A is limited a wrong secret for A → 429 temporarily_unavailable and is not counted again', async (w) => {
    w.tokens.add()
    await wrongSecrets(w, FIXTURE.id.agentA, FAILURE_LIMIT.perKeyPerWindow)
    const wait = assertLimited(await tokenRequest(w, { clientId: FIXTURE.id.agentA, secret: FIXTURE.value() }))
    assert.deepEqual(w.limiter.check(keyOf(w, FIXTURE.id.agentA), w.clock.now() + wait), { limited: false }, 'the limited request was counted')
  })
  row(sdk, ID, 'client_credentials (address)', 'the address past perAddressPerWindow: a valid client_credentials request → a token', async (w) => {
    const a = w.tokens.add()
    await tokenRequest(w, { clientId: FIXTURE.id.agentA, secret: a.value })
    addressLimited(w)
    await issue(w, a, FIXTURE.id.agentA, SCOPE.pair)
  })
  row(sdk, ID, 'authorization_code (key)', 'the code client\'s key past the limit: a valid authorization_code request → 200', async (w) => {
    const grant = refusingGrant(GRANT.authorizationCode, OAUTH_ERROR.invalidGrant, true)
    w.register(grant)
    for (let i = 0; i < FAILURE_LIMIT.perKeyPerWindow; i += 1) assertError(await codeRequest(w), OAUTH_ERROR.invalidGrant)
    grant.answer = okGrant(GRANT.authorizationCode).answer
    assert.equal((await codeRequest(w)).status, HTTP_STATUS.ok)
  })
  row(sdk, ID, 'authorization_code (wrong, limited)', 'the same key, a failing authorization_code request → 429, uncounted', async (w) => {
    w.register(refusingGrant(GRANT.authorizationCode, OAUTH_ERROR.invalidGrant, true))
    for (let i = 0; i < FAILURE_LIMIT.perKeyPerWindow; i += 1) assertError(await codeRequest(w), OAUTH_ERROR.invalidGrant)
    assertLimited(await codeRequest(w))
  })
  row(sdk, ID, 'refresh_token (address)', 'the address past perAddressPerWindow: a valid refresh_token request → 200', async (w) => {
    w.register(okGrant(GRANT.refreshToken))
    await refreshRequest(w)
    addressLimited(w)
    assert.equal((await refreshRequest(w)).status, HTTP_STATUS.ok)
  })
}

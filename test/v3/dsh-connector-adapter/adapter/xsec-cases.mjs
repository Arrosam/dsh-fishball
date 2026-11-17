/**
 * X-SEC rows of the connector adapter (.runtime/reports/x-sec-audit.md; the C-WIRE-2 requirements
 * relayed 2026-11-17). Black box over the adapter world (subject.mjs adapterWorld) and the fake
 * connector's script (oauth-client/fakes.mjs `tokenRedirect`, `asOverride`).
 * - X-05 (EP): a 307 from the token endpoint fails the code exchange; nothing is re-posted.
 * - X-06 (DT over the AS metadata): authorization_endpoint or token_endpoint not https / loopback http,
 *   or token_endpoint on another origin → needs-configuration (not-a-dsh-connector), no request.
 * - X-07 (ST): a refused access token whose recovery yields no new token → needs-authorization; the
 *   sign-in tool no longer answers authorized.
 * - X-13 (EP): AS metadata without code_challenge_methods_supported containing S256 → the attempt fails
 *   before any authorization request.
 */
import assert from 'node:assert/strict'
import { caseTest } from '../oauth-client/cases.mjs'
import { FIXTURE, K1, RESULT, ROWS, STATE, WAIT, XSEC } from './constants.mjs'
import { browser, eventually, staysFalse } from './fakes.mjs'
import { adapterWorld, untilState } from './subject.mjs'

const M = ROWS.m
const pick = (entry) => (entry === undefined ? undefined : { state: entry.state, ...(entry.reason === undefined ? {} : { reason: entry.reason }) })
const PKCE_FIELD = XSEC.pkceField
const XSEC_ID = XSEC.id

export function registerAdapterXsecCases(sdk) {
  // ---------------------------------------------------------------- X-05
  caseTest(sdk, XSEC_ID.x05, 'token 307', 'the token endpoint answers 307 at the code exchange → the attempt fails; the code is posted once and nowhere else; no grant', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    assert.equal(r.status, RESULT.approvalUrl)
    w.c.script.tokenRedirect = w.c.origin + FIXTURE.redirectedTokenPath
    await browser.approve(w.c, r.url)
    assert.ok(await eventually(() => w.n.stateOf(M)?.state !== STATE.authorizing), 'the attempt did not end')
    assert.notEqual(w.n.stateOf(M).state, STATE.authorized)
    assert.equal(w.c.codeRequests().length, 1, 'the code exchange was re-posted')
    assert.deepEqual(w.c.requests.filter((x) => x.path === FIXTURE.redirectedTokenPath), [], 'the redirect was followed')
    assert.equal(await w.n.record(M), undefined)
  })

  // ---------------------------------------------------------------- X-06
  for (const [rule, label, override] of [
    ['1', 'authorization_endpoint on plain http, not loopback', () => ({ authorization_endpoint: XSEC.httpRemote + K1.PATHS.authorize })],
    ['2', 'token_endpoint on plain http, not loopback', () => ({ token_endpoint: XSEC.httpRemote + K1.PATHS.token })],
    ['3', 'token_endpoint on another (https) origin', () => ({ token_endpoint: FIXTURE.other.origin + K1.PATHS.token })],
    ['4', 'token_endpoint on a *.localhost name', () => ({ token_endpoint: XSEC.localhostName + K1.PATHS.token })],
  ]) {
    caseTest(sdk, XSEC_ID.x06, `rule ${rule}`, `${label}: needs-configuration (not-a-dsh-connector); no authorization, registration or token request`, async (t) => {
      const w = await adapterWorld(t, sdk)
      w.c.script.asOverride = override(w.c)
      const r = await w.n.signIn(M)
      assert.equal(r.status, RESULT.needsConfiguration, JSON.stringify(r))
      assert.equal(r.url, undefined)
      assert.equal(pick(w.n.stateOf(M)).state, STATE.needsConfiguration)
      assert.deepEqual(w.forbidden(), [])
    })
  }

  // ---------------------------------------------------------------- X-07
  caseTest(sdk, XSEC_ID.x07, 'no refresh token', 'a grant with no refresh token; the access token is refused → needs-authorization; sign-in no longer answers authorized', async (t) => {
    const w = await adapterWorld(t, sdk, { issueRefresh: false })
    const r = await w.n.signIn(M)
    await browser.approve(w.c, r.url)
    await untilState(w.n, M, STATE.authorized)
    w.c.dropAccess()
    await w.n.call(M, XSEC.whoami)
    await untilState(w.n, M, STATE.needsAuthorization)
    const again = await w.n.signIn(M)
    assert.notEqual(again.status, RESULT.authorized, JSON.stringify(again))
  })

  // ---------------------------------------------------------------- X-13
  for (const [label, value] of [['absent', undefined], ['without S256', [XSEC.plainMethod]]]) {
    caseTest(sdk, XSEC_ID.x13, label, `${PKCE_FIELD} ${label} → the attempt fails before any authorization request; no grant`, async (t) => {
      const w = await adapterWorld(t, sdk)
      w.c.script.asOverride = { [PKCE_FIELD]: value }
      const r = await w.n.signIn(M)
      assert.notEqual(r.status, RESULT.approvalUrl, JSON.stringify(r))
      assert.notEqual(r.status, RESULT.authorized)
      assert.equal(await staysFalse(() => w.c.approvalPages().length > 0, WAIT.quietMs), true, 'an authorization request was made')
      assert.equal(await w.n.record(M), undefined)
    })
  }
}

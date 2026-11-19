/**
 * C-OAUTH cases for the K1 amendment after W2 that moved two token-endpoint limits into K1
 * (mcp-schema README "Lifetimes and limits"): TOKEN_ENDPOINT_LIMITS.formBodyBytes (the token-request
 * form; over it 400 invalid_request) and RATE_LIMITS.tokenRequestsPerAddressPerWindow (token
 * requests per address per RATE_LIMITS.windowMs, any client id). The existing suite has no row for
 * either, so these are K1-AMEND-6, Boundary Value Analysis (one test per value), over the real
 * endpoint as cases.mjs.
 */
import assert from 'node:assert/strict'
import {
  AMEND, BEARER_CHALLENGE, FIXTURE, GRANT, GRANT_DISPATCH, HTTP_METHOD, HTTP_WIRE, OAUTH_ERROR, PATHS, RATE_LIMITS, SCOPE, TOKEN_ENDPOINT_LIMITS, oauthUrls,
} from './constants.mjs'
import { assertError, assertLimited, assertToken, row, tokenRequest } from './cases.mjs'

const ID = 'K1-AMEND-6'
const FORM_LIMIT = TOKEN_ENDPOINT_LIMITS.formBodyBytes
const PER_ADDRESS = RATE_LIMITS.tokenRequestsPerAddressPerWindow
const PER_CLIENT = RATE_LIMITS.tokenRequestsPerWindow

/** A valid client_credentials form (Basic auth) padded with an unknown parameter to exactly `bytes`. */
function paddedRequest(w, e, bytes) {
  const form = new URLSearchParams({ [GRANT_DISPATCH.formField]: GRANT.clientCredentials, [HTTP_WIRE.form_.resource]: oauthUrls(w.origin()).resource })
  const base = form.toString()
  const padHead = '&' + AMEND.padParameter + '='
  const body = base + padHead + AMEND.padChar.repeat(bytes - base.length - padHead.length)
  assert.equal(Buffer.byteLength(body), bytes, 'harness: padded size')
  const credentials = Buffer.from(`${FIXTURE.id.agentA}${HTTP_WIRE.basicSeparator}${e.value}`).toString('base64')
  return w.send({
    method: HTTP_METHOD.post, path: PATHS.token, host: w.hostHeader(),
    headers: { [HTTP_WIRE.contentType]: HTTP_WIRE.form, [HTTP_WIRE.authorization]: `${BEARER_CHALLENGE.basicScheme} ${credentials}` },
    body,
  })
}

/** `count` valid token requests from this one address, spread over client ids each within its own PER_CLIENT. */
async function fromOneAddress(w, count) {
  const out = []
  for (let client = 0; out.length < count; client += 1) {
    const e = w.tokens.add()
    for (let i = 0; i < PER_CLIENT && out.length < count; i += 1) out.push(await tokenRequest(w, { clientId: AMEND.addressClient(client), secret: e.value }))
  }
  return out
}

export function registerCOAuthAmendCases(sdk) {
  // ---- TOKEN_ENDPOINT_LIMITS.formBodyBytes ----
  for (const [part, bytes, served] of [['form limit − 1', FORM_LIMIT - 1, true], ['form limit', FORM_LIMIT, true], ['form limit + 1', FORM_LIMIT + 1, false]]) {
    row(sdk, ID, part, `a token form of ${bytes} bytes (TOKEN_ENDPOINT_LIMITS.formBodyBytes ${FORM_LIMIT}): ${served ? 'served' : '400 invalid_request, no token'}`, async (w) => {
      const res = await paddedRequest(w, w.tokens.add(), bytes)
      if (served) assertToken(res, SCOPE.pair)
      else {
        assertError(res, OAUTH_ERROR.invalidRequest)
        assert.equal(res.body?.access_token, undefined)
      }
    })
  }

  // ---- RATE_LIMITS.tokenRequestsPerAddressPerWindow ----
  row(sdk, ID, 'address limit', `${PER_ADDRESS} token requests from one address over several client ids (each within ${PER_CLIENT}): all served`, async (w) => {
    for (const res of await fromOneAddress(w, PER_ADDRESS)) assertToken(res, SCOPE.pair)
  })
  row(sdk, ID, 'address limit + 1', `request ${PER_ADDRESS + 1} from that address, by a client id never seen: 429 temporarily_unavailable with Retry-After`, async (w) => {
    await fromOneAddress(w, PER_ADDRESS)
    const fresh = w.tokens.add()
    assertLimited(await tokenRequest(w, { clientId: FIXTURE.id.x, secret: fresh.value }))
  })
  row(sdk, ID, 'address window', `after the 429, once RATE_LIMITS.windowMs (or the Retry-After) has passed, the address is served again`, async (w) => {
    await fromOneAddress(w, PER_ADDRESS)
    const fresh = w.tokens.add()
    const wait = assertLimited(await tokenRequest(w, { clientId: FIXTURE.id.x, secret: fresh.value }))
    w.clock.advance(Math.max(wait, RATE_LIMITS.windowMs))
    assertToken(await tokenRequest(w, { clientId: FIXTURE.id.x, secret: fresh.value }), SCOPE.pair)
  })
  row(sdk, ID, 'address counts any request', `the per-address count includes refused requests (counted before the body is read): ${PER_ADDRESS} requests with no grant_type, then a valid one → 429`, async (w) => {
    for (let i = 0; i < PER_ADDRESS; i += 1) {
      assertError(await tokenRequest(w, { clientId: AMEND.addressClient(i), secret: FIXTURE.value(), grant: null }), OAUTH_ERROR.invalidRequest)
    }
    const fresh = w.tokens.add()
    assertLimited(await tokenRequest(w, { clientId: FIXTURE.id.x, secret: fresh.value }))
  })
}

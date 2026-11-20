/**
 * X-SEC rows of the approval page (.runtime/reports/x-sec-audit.md; the requirements relayed for
 * C-WIRE-2, 2026-11-17). Black box over C-OAUTH-WEB's handler (subject.mjs webWorld):
 * - X-01: every page answer sends `Referrer-Policy: same-origin` (K1 APPROVAL_LISTENER.headers); a
 *   POST to /authorize/decision with `Origin: null` (what a browser sends under `no-referrer`) is
 *   still 403; the page's own Origin works (EP over the Origin header).
 * - X-03 (page part): a valid token always authorizes, even while its key or its address is past
 *   FAILURE_LIMIT; a wrong token while limited → 429, uncounted; an empty field is uncounted (DT).
 * - X-04: GET /authorize is limited per remote address at RATE_LIMITS.tokenRequestsPerAddressPerWindow
 *   per RATE_LIMITS.windowMs, counted before the CIMD fetch (BVA: limit, limit + 1, after the window).
 */
import assert from 'node:assert/strict'
import { assertCode, assertOnPage, open, redirectOf, row } from './cases.mjs'
import { APPROVAL_LISTENER, FAILURE_LIMIT, FIXTURE, HTTP_HEADER, HTTP_STATUS, PAGE_TEXT, PATHS, XSEC } from './constants.mjs'
import { authorizeParams, pkce } from './subject.mjs'

const V = FIXTURE.value
const E = FIXTURE.entry
/** A flow's Authorize answer as the shape assertCode reads. */
const approved = (flow, res) => ({ ...flow, res, redirect: redirectOf(res) })
/** `n` wrong tokens typed on one flow's page (each counted). */
async function wrongTokens(flow, n) {
  for (let i = 0; i < n; i += 1) assertOnPage(await flow.b.authorize({ token: V(1) }), PAGE_TEXT.invalid)
}

export function registerXsecWebCases(sdk) {
  // ---------------------------------------------------------------- X-01 (EP over Origin; the header)
  row(sdk, XSEC.id.x01, 'header', `the page and its re-render send Referrer-Policy ${XSEC.referrerPolicy} (K1 APPROVAL_LISTENER.headers)`, async (w) => {
    assert.equal(APPROVAL_LISTENER.headers[XSEC.referrerHeader], XSEC.referrerPolicy)
    w.tokens.add(5, V(5))
    const flow = await open(w)
    assert.equal(flow.page.headers[XSEC.referrerHeader], XSEC.referrerPolicy)
    const rerender = await flow.b.authorize({ token: V(1) })
    assert.equal(rerender.headers[XSEC.referrerHeader], XSEC.referrerPolicy)
  })
  row(sdk, XSEC.id.x01, 'Origin null', 'a decision POST with Origin: null (a browser under no-referrer) → 403; nothing bound', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    const res = await flow.b.authorize({ token: V(5) }, { origin: XSEC.nullOrigin })
    assert.equal(res.status, HTTP_STATUS.forbidden)
    assert.equal(w.pairs.pairOf(E(5)), undefined)
  })
  row(sdk, XSEC.id.x01, 'own Origin', 'the same POST with the page\'s own Origin → authorized (303 with a code)', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    assertCode(w, approved(flow, await flow.b.authorize({ token: V(5) })))
  })

  // ---------------------------------------------------------------- X-03 (page part)
  row(sdk, XSEC.id.x03, 'key limited, valid', 'after perKeyPerWindow wrong tokens on a client\'s page, the right token still authorizes', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    await wrongTokens(flow, FAILURE_LIMIT.perKeyPerWindow)
    assertCode(w, approved(flow, await flow.b.authorize({ token: V(5) })))
  })
  row(sdk, XSEC.id.x03, 'key limited, wrong', 'while limited a wrong token → 429, not redirected, not counted again; nothing bound', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    await wrongTokens(flow, FAILURE_LIMIT.perKeyPerWindow)
    const res = await flow.b.authorize({ token: V(1) })
    assert.equal(res.status, HTTP_STATUS.tooManyRequests)
    assert.equal(res.headers[HTTP_HEADER.location], undefined)
    assert.equal(w.limiter.failures.length, FAILURE_LIMIT.perKeyPerWindow, 'a limited wrong token was counted')
    assert.equal(w.pairs.pairOf(E(5)), undefined)
  })
  row(sdk, XSEC.id.x03, 'key limited, empty', 'while limited an empty field is still "enter a token" and uncounted', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    await wrongTokens(flow, FAILURE_LIMIT.perKeyPerWindow)
    const res = await flow.b.authorize({ token: '' })
    assert.equal(res.headers[HTTP_HEADER.location], undefined)
    assert.equal(w.limiter.failures.length, FAILURE_LIMIT.perKeyPerWindow, 'an empty field was counted')
  })
  row(sdk, XSEC.id.x03, 'address limited, valid', 'the address past perAddressPerWindow (failures of many clients): another client\'s right token still authorizes', async (w) => {
    w.tokens.add(5, V(5))
    for (let i = 0; i < FAILURE_LIMIT.perAddressPerWindow; i += 1) w.limiter.recordFailure({ remoteAddress: FIXTURE.remoteAddress, clientId: XSEC.otherClient(i) }, w.clock.now())
    const flow = await open(w)
    assertCode(w, approved(flow, await flow.b.authorize({ token: V(5) })))
  })

  // ---------------------------------------------------------------- X-04 (BVA on the GET rate)
  const LIMIT = XSEC.authorizePerAddress
  /** `n` GET /authorize from one browser (one address), each a fresh PKCE pair. */
  async function gets(w, b, n) {
    const out = []
    for (let i = 0; i < n; i += 1) out.push(await b.open(PATHS.authorize, authorizeParams(w, pkce().challenge)))
    return out
  }
  row(sdk, XSEC.id.x04, 'limit', `${LIMIT} GET /authorize from one address in a window: every page shown`, async (w) => {
    const b = w.browser()
    for (const res of await gets(w, b, LIMIT)) assert.equal(res.status, HTTP_STATUS.ok)
  })
  row(sdk, XSEC.id.x04, 'limit + 1', `request ${LIMIT + 1}: 429 with a whole-second Retry-After, the page headers, no body and no CIMD fetch`, async (w) => {
    const b = w.browser()
    await gets(w, b, LIMIT)
    const fetches = w.cimd.calls.length
    const [res] = await gets(w, b, 1)
    assert.equal(res.status, HTTP_STATUS.tooManyRequests)
    assert.match(res.headers[XSEC.retryAfterHeader] ?? '', /^\d+$/)
    for (const [name, value] of Object.entries(APPROVAL_LISTENER.headers)) assert.equal(res.headers[name], value, name)
    assert.equal(res.body, '')
    assert.equal(w.cimd.calls.length, fetches, 'a limited request fetched the client document')
  })
  row(sdk, XSEC.id.x04, 'after the window', 'once the window has passed the address is served again', async (w) => {
    const b = w.browser()
    await gets(w, b, LIMIT)
    const [limited] = await gets(w, b, 1)
    assert.equal(limited.status, HTTP_STATUS.tooManyRequests)
    w.clock.advance(XSEC.windowMs)
    const [again] = await gets(w, b, 1)
    assert.equal(again.status, HTTP_STATUS.ok)
  })
}

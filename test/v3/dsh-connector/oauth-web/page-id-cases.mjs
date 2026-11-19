/**
 * C-PAGE-ID black-box cases on the approval page and its grants (PAGE-ID-USE-CASES.md): the id is
 * the authorization request's `agent_id` (K1 AUTHORIZE_EXTENSION.agentIdParam) or, when none is
 * passed, the derived `cid-` id (K1 DERIVED_AGENT_ID, computed here independently, subject.mjs
 * `derivedId`); Authorize binds at once with full rights; the same id reconnects the same
 * principal; another id is `already-paired`. Requirements 1.32 R13 / R14, 1.33 Q-A1 B, Q-A2 A;
 * R-OA-11, R-OA-12, R-OA-22, R-OA-23, R-ID-02, R-ID-13; design §5.5a; K1d-4, K1d-5.
 *
 * Techniques in this order: Use Case (AUTH-UC-10 rewritten, AUTH-UC-15…17), Equivalence
 * Partitioning (AUTH-EP-15), Boundary Value Analysis (AUTH-BVA-10), Decision Table (the new
 * AUTH-DT-08 rules) and State Transition (AUTH-ST-08). Level: integration over the oauth-web world
 * (fakes of every seam, a scripted browser on a loopback listener; subject.mjs).
 *
 * K1d-6 (decided by Fishball, 2026-11-16) is AUTH-ST-09 here: a successful reconnect revokes every
 * refresh chain the entry had before it (any client id URL), with their access tokens, and drops
 * its unredeemed codes, before the new code is minted (OAuthTokenStore.revokeEntryChains). A first
 * bind and an already-paired revoke nothing; chainless access tokens are not touched.
 */
import assert from 'node:assert/strict'
import {
  approve, assertCode, assertGrantError, assertGrantOk, assertNoLeak, assertOnPage, assertPageShown, assertRedirectedError, chain, open,
  redeem, redirectOf, refresh, row, snapshot,
} from './cases.mjs'
import {
  FIXTURE, HOSTS, ID_GRAMMAR, ID_REFUSAL, LATER, NAME_RULES, OAUTH_ERROR, PAGE_TEXT, PARAM, PATHS, REFUSAL, SCOPE, SMUGGLED_ID_FIELDS,
  oauthUrls,
} from './constants.mjs'
import { authorizeParams, derivedId, digest, documentOf, pkce } from './subject.mjs'

const ID = FIXTURE.id
const NAME = FIXTURE.name
const E = FIXTURE.entry
const V = FIXTURE.value
const CASE = Object.freeze({
  uc10: 'AUTH-UC-10', uc15: 'AUTH-UC-15', uc16: 'AUTH-UC-16', uc17: 'AUTH-UC-17', ep15: 'AUTH-EP-15', bva10: 'AUTH-BVA-10',
  dt08: 'AUTH-DT-08', st08: 'AUTH-ST-08', st09: 'AUTH-ST-09',
})
/** `fill.id: NO_ID` passes no `agent_id` (approve drops an undefined override): a generic client. */
const NO_ID = Object.freeze({ id: undefined })
const at = (offsetMs = 0) => FIXTURE.t0 + offsetMs
/** The fixture client's derived id, and the other client's (AUTH-UC-15). */
const CID = derivedId(FIXTURE.clientId)
const OTHER_CID = derivedId(FIXTURE.otherClientId)
/** The other client (Agent V) as a request override and as its token-request client id. */
const OTHER_CLIENT = Object.freeze({ overrides: Object.freeze({ [PARAM.clientId]: FIXTURE.otherClientId }) })
const otherClientForm = Object.freeze({ [PARAM.clientId]: FIXTURE.otherClientId })
const scriptOther = (w) => w.cimd.document(FIXTURE.otherClientId, documentOf(FIXTURE.otherClientId))

/** E5 enabled; returns the world. */
const withE5 = (w) => { w.tokens.add(5, V(5)); return w }
/** The pair's identity: what a reconnect must keep (R-OA-22: same principal, name, pairedAt). */
const identity = (p) => ({ principalKey: p.principalKey, id: p.id, name: p.name, pairedAt: p.pairedAt })
/** A refusal on the page that binds nothing and leaves E5 as it was. */
async function refusedOnPage(w, fill, options, ...texts) {
  const before = snapshot(w)
  const flow = await approve(w, fill, options)
  assertOnPage(flow.res, ...texts)
  assert.deepEqual(snapshot(w), before, 'a refusal changes nothing')
  return flow
}
/** A code that redeems to full power for E5's pair, bound to `id`; returns the token body. */
async function boundWithFullRights(w, flow, id, form = {}) {
  assertCode(w, flow)
  assert.equal(w.pairs.pairOf(E(5)).id, id)
  const body = assertGrantOk(await redeem(w, flow, form))
  assert.equal(body.scope, SCOPE.full, 'full rights at once (R-OA-22)')
  assert.equal(w.pairs.calls.filter(([n]) => n === 'pair').length, 0, 'no pair call')
  return body
}

// ---------------------------------------------------------------------------------------------
// Use Cases
// ---------------------------------------------------------------------------------------------

function useCases(sdk) {
  const uc = (id, part, title, fn) => row(sdk, id, part, title, fn)
  uc(CASE.uc10, 'main (agent_id)', 'agent_id agent-w-1 in the request, no id on the page → bound to agent-w-1 at once; the code redeems to full rights, no pair call', async (w) => {
    withE5(w)
    const body = await boundWithFullRights(w, await approve(w), ID.agentW)
    assert.equal(w.store.getAccess(digest(body.access_token)).clientId, ID.agentW, 'the access token is the pair\'s')
  })
  uc(CASE.uc10, 'E2a (agent_id invalid)', 'agent_id agent.w → the page is still shown; Authorize shows id-invalid; nothing bound; the request stays pending (Cancel answers access_denied)', async (w) => {
    withE5(w)
    const flow = await open(w, { overrides: { [PARAM.agentId]: ID.dotted } })
    assertPageShown(flow.page)
    assertOnPage(await flow.b.authorize({ token: V(5) }), ID_REFUSAL.idInvalid)
    assert.equal(w.pairs.pairOf(E(5)), undefined)
    assertRedirectedError(w, await flow.b.cancel(), OAUTH_ERROR.accessDenied)
  })
  row(sdk, CASE.uc10, 'A9 (tunnel)', 'the page reached through a trusted tunnel host binds the passed agent_id the same way (Q-A3 B)', async (w) => {
    withE5(w)
    const tunnel = oauthUrls(`${HOSTS.remoteScheme}//${FIXTURE.tunnelHost}`)
    const b = w.browser({ host: FIXTURE.tunnelHost, scheme: HOSTS.remoteScheme })
    const flow = await approve(w, {}, { browser: b, overrides: { [PARAM.resource]: tunnel.resource } })
    assert.equal(flow.redirect?.params[PARAM.iss], tunnel.issuer)
    assert.equal(w.pairs.pairOf(E(5)).id, ID.agentW)
  }, undefined, () => ({ trustedHosts: [FIXTURE.tunnelHost] }))
  row(sdk, CASE.uc10, 'end to end (agent_id)', 'a stock SDK and the Python authorization-code client pass agent_id through the wired connector and get full power with no pair call', null, LATER.wire)

  uc(CASE.uc15, 'main', 'no agent_id → E5 bound to cid- + 16 base32 of SHA-256(client id URL), full rights at once', async (w) => {
    withE5(w)
    const body = await boundWithFullRights(w, await approve(w, NO_ID), CID)
    assert.equal(w.store.getAccess(digest(body.access_token)).clientId, CID)
    assert.equal(w.pairs.pairOf(E(5)).clientIdUrl, FIXTURE.clientId)
  })
  uc(CASE.uc15, 'A1', 'agent_id= with no value is treated as omitted (RFC 6749 §3.1) → the derived id', async (w) => {
    withE5(w)
    assertCode(w, await approve(w, { id: '' }))
    assert.equal(w.pairs.pairOf(E(5)).id, CID)
  })
  uc(CASE.uc15, 'A2', 'two clients with different client id URLs and no agent_id get two different derived ids', async (w) => {
    withE5(w)
    w.tokens.add(6, V(6))
    scriptOther(w)
    assertCode(w, await approve(w, NO_ID))
    assertCode(w, await approve(w, { ...NO_ID, token: V(6) }, OTHER_CLIENT))
    assert.deepEqual([w.pairs.pairOf(E(5)).id, w.pairs.pairOf(E(6)).id], [CID, OTHER_CID])
    assert.notEqual(CID, OTHER_CID)
  })
  uc(CASE.uc15, 'E1', 'another entry already holds the derived id → id-taken on the page; nothing bound', async (w) => {
    withE5(w)
    await w.pairs.pair(E(1), CID, undefined, at())
    await refusedOnPage(w, NO_ID, undefined, REFUSAL.idTaken)
    assert.equal(w.pairs.pairOf(E(5)), undefined)
  })
  uc(CASE.uc15, 'post', 'the derived id is exactly prefix + 16 characters and fits R-ID-02', () => {
    assert.match(CID, ID_GRAMMAR.pattern)
    assert.equal(CID.length, derivedId(FIXTURE.otherClientId).length)
  })

  uc(CASE.uc16, 'main', 'a bound client returns with its token and agent_id → a new code and chain for the same principal, id, name and pairedAt', async (w) => {
    withE5(w)
    const bound = await approve(w, { name: NAME.watcher })
    assertCode(w, bound)
    const first = assertGrantOk(await redeem(w, bound))
    const firstChain = w.store.getRefresh(digest(first.refresh_token)).chainId
    const before = identity(w.pairs.pairOf(E(5)))
    // A year past the bind: no age condition on a reconnect (R-OA-23, 1.32 R14).
    w.clock.advance(FIXTURE.withdrawnChainCapMs)
    const flow = await approve(w)
    assertCode(w, flow)
    const second = assertGrantOk(await redeem(w, flow))
    assert.deepEqual(identity(w.pairs.pairOf(E(5))), before)
    assert.notEqual(w.store.getRefresh(digest(second.refresh_token)).chainId, firstChain, 'a new chain')
    assert.equal(w.pairs.list().length, 1, 'no second principal')
  })
  uc(CASE.uc16, 'A1 (redirect)', 'the same client with another listed redirect URI → reconnect; the newest redirect URI recorded', async (w) => {
    w.cimd.document(FIXTURE.clientId, documentOf(FIXTURE.clientId, [FIXTURE.redirect, FIXTURE.redirectSecond]))
    withE5(w)
    assertCode(w, await approve(w))
    const flow = await approve(w, {}, { overrides: { [PARAM.redirectUri]: FIXTURE.redirectSecond } })
    assertCode(w, flow, { target: FIXTURE.redirectSecond })
    assert.equal(w.pairs.pairOf(E(5)).redirectUri, FIXTURE.redirectSecond)
  })
  uc(CASE.uc16, 'A1 (client id URL)', 'another client id URL with the same agent_id → reconnect; the newest client id URL recorded; the same principal', async (w) => {
    withE5(w)
    scriptOther(w)
    assertCode(w, await approve(w))
    const before = identity(w.pairs.pairOf(E(5)))
    const flow = await approve(w, {}, OTHER_CLIENT)
    assertCode(w, flow)
    assert.equal(w.pairs.pairOf(E(5)).clientIdUrl, FIXTURE.otherClientId)
    assert.deepEqual(identity(w.pairs.pairOf(E(5))), before)
    assertGrantOk(await redeem(w, flow, otherClientForm))
  })
  uc(CASE.uc16, 'A1 (old client\'s chain)', 'after a reconnect from another client id URL, a chain of the earlier client id URL is invalid_grant on refresh (K1d-6); the new one rotates', async (w) => {
    scriptOther(w)
    const c = await chain(w)
    const flow = await approve(w, {}, OTHER_CLIENT)
    const fresh = assertGrantOk(await redeem(w, flow, otherClientForm))
    assertGrantError(await refresh(w, c.rt), OAUTH_ERROR.invalidGrant)
    assertGrantOk(await refresh(w, fresh.refresh_token, otherClientForm))
  })
  uc(CASE.uc16, 'A2', 'a name typed on reconnect does not change the stored name', async (w) => {
    withE5(w)
    assertCode(w, await approve(w, { name: NAME.watcher }))
    assertCode(w, await approve(w, { name: NAME.fishball }))
    assert.equal(w.pairs.pairOf(E(5)).name, NAME.watcher)
  })
  uc(CASE.uc16, 'A3 (derived)', 'a client with no agent_id returns from the same client id URL → the same derived id → reconnect', async (w) => {
    withE5(w)
    assertCode(w, await approve(w, NO_ID))
    const before = identity(w.pairs.pairOf(E(5)))
    w.clock.advance(FIXTURE.tenYearsMs)
    assertCode(w, await approve(w, NO_ID))
    assert.deepEqual(identity(w.pairs.pairOf(E(5))), before)
  })
  uc(CASE.uc16, 'A5', 'an entry bound by a machine client\'s pair with agent-w-1 → the page with agent-w-1 reconnects it; it is page-bound from then on', async (w) => {
    withE5(w)
    await w.pairs.pair(E(5), ID.agentW, NAME.watcher, at())
    const before = identity(w.pairs.pairOf(E(5)))
    const flow = await approve(w)
    assertCode(w, flow)
    assertGrantOk(await redeem(w, flow))
    assert.deepEqual(identity(w.pairs.pairOf(E(5))), before)
    assert.deepEqual({ clientIdUrl: w.pairs.pairOf(E(5)).clientIdUrl, redirectUri: w.pairs.pairOf(E(5)).redirectUri }, { clientIdUrl: FIXTURE.clientId, redirectUri: FIXTURE.redirect })
  })
  uc(CASE.uc16, 'post', 'no token entry is created, and the token value leaks nowhere across bind and reconnect', async (w) => {
    withE5(w)
    await chain(w)
    assertCode(w, await approve(w))
    assert.equal(w.tokens.list().length, 1)
    assertNoLeak(w, V(5))
  })

  uc(CASE.uc17, 'main', 'E5 bound to agent-w-1; agent_id agent-v-1 → already-paired with the bound name and last-seen; nothing changes; the request stays pending', async (w) => {
    withE5(w)
    assertCode(w, await approve(w, { name: NAME.watcher }))
    const flow = await refusedOnPage(w, { id: ID.other }, undefined, PAGE_TEXT.createNew, NAME.watcher)
    assertRedirectedError(w, await flow.b.cancel(), OAUTH_ERROR.accessDenied)
  })
  uc(CASE.uc17, 'main (derived)', 'E5 bound to the fixture client\'s derived id; another client with no agent_id derives another id → already-paired', async (w) => {
    withE5(w)
    scriptOther(w)
    assertCode(w, await approve(w, NO_ID))
    await refusedOnPage(w, NO_ID, OTHER_CLIENT, PAGE_TEXT.createNew)
  })
}

// ---------------------------------------------------------------------------------------------
// Equivalence Partitioning and Boundary Value Analysis
// ---------------------------------------------------------------------------------------------

function partitionsAndBoundaries(sdk) {
  const ep15 = (n, title, fn) => row(sdk, CASE.ep15, n, title, fn)
  ep15('1', 'agent_id absent → page; bound to the derived id', async (w) => {
    withE5(w)
    assertCode(w, await approve(w, NO_ID))
    assert.equal(w.pairs.pairOf(E(5)).id, CID)
  })
  ep15('2', 'agent_id present with no value → page; bound to the derived id', async (w) => {
    withE5(w)
    assertCode(w, await approve(w, { id: '' }))
    assert.equal(w.pairs.pairOf(E(5)).id, CID)
  })
  for (const [what, id] of [['agent-w-1', ID.agentW], ...FIXTURE.validAgentIds]) {
    ep15('3', `a valid agent_id (${what}) → bound to it`, async (w) => {
      withE5(w)
      assertCode(w, await approve(w, { id }))
      assert.equal(w.pairs.pairOf(E(5)).id, id)
    })
  }
  for (const [n, [what, id]] of [['4', FIXTURE.invalidAgentIds[0]], ...FIXTURE.invalidAgentIds.slice(1).map((c) => ['5', c]), ['6', ['65 characters', ID.long]]]) {
    ep15(n, `an invalid agent_id (${what}) → the page is shown; Authorize → id-invalid; nothing bound`, async (w) => {
      withE5(w)
      const flow = await open(w, { overrides: { [PARAM.agentId]: id } })
      assertPageShown(flow.page)
      assertOnPage(await flow.b.authorize({ token: V(5) }), ID_REFUSAL.idInvalid)
      assert.equal(w.pairs.pairOf(E(5)), undefined)
    })
  }
  ep15('7', 'agent_id repeated → redirect invalid_request with iss and state; no page (RFC 6749 §3.1, R-OA-14)', async (w) => {
    withE5(w)
    const { challenge } = pkce()
    const query = [...Object.entries(authorizeParams(w, challenge)), [PARAM.agentId, ID.other]]
    const res = await w.browser().open(PATHS.authorize, query)
    assertRedirectedError(w, res, OAUTH_ERROR.invalidRequest)
    assert.equal(w.pairs.pairOf(E(5)), undefined)
  })
  for (const [what, overrides, expected] of [['agent_id agent-w-1 in the request', {}, ID.agentW], ['no agent_id in the request', NO_ID, CID]]) {
    ep15('8', `${what}, an id posted in the form anyway → ignored: bound to ${expected === CID ? 'the derived id' : expected}`, async (w) => {
      withE5(w)
      const flow = await open(w, Object.hasOwn(overrides, 'id') ? { overrides: { [PARAM.agentId]: undefined } } : {})
      const captured = flow.b.formBody(PAGE_TEXT.authorize, { token: V(5) })
      const body = new URLSearchParams(captured.body)
      for (const field of SMUGGLED_ID_FIELDS) body.append(field, ID.other)
      const res = await flow.b.post({ ...captured, body: body.toString() })
      assertCode(w, { res, redirect: redirectOf(res) })
      assert.equal(w.pairs.pairOf(E(5)).id, expected)
    })
  }

  const ID_MAX = FIXTURE.idMaxChars
  for (const [n, length, outcome] of [['1', 0, 'derived'], ['2', 1, 'bound'], ['3', ID_MAX, 'bound'], ['4', ID_MAX + 1, 'id-invalid']]) {
    row(sdk, CASE.bva10, n, `agent_id of ${length} characters → ${outcome}`, async (w) => {
      withE5(w)
      const id = FIXTURE.idFill.repeat(length)
      const flow = await approve(w, { id })
      if (outcome === 'id-invalid') {
        assertOnPage(flow.res, ID_REFUSAL.idInvalid)
        assert.equal(w.pairs.pairOf(E(5)), undefined)
        return
      }
      assertCode(w, flow)
      assert.equal(w.pairs.pairOf(E(5)).id, outcome === 'derived' ? CID : id)
    })
  }
}

// ---------------------------------------------------------------------------------------------
// Decision Table: the AUTH-DT-08 rules the page id adds (PAGE-ID-USE-CASES.md)
// ---------------------------------------------------------------------------------------------

function decisionTable(sdk) {
  const dt08 = (rule, title, fn) => row(sdk, CASE.dt08, rule, title, fn)
  dt08('5h', 'valid, unpaired, no agent_id, name empty → code; bound to the derived id with no name', async (w) => {
    withE5(w)
    assertCode(w, await approve(w, NO_ID))
    assert.deepEqual({ id: w.pairs.pairOf(E(5)).id, name: w.pairs.pairOf(E(5)).name }, { id: CID, name: null })
  })
  dt08('5i', 'valid, unpaired, no agent_id, the derived id held by a disabled entry → id-taken', async (w) => {
    withE5(w)
    w.tokens.add(1, V(1))
    await w.pairs.pair(E(1), CID, undefined, at())
    w.tokens.disable(1)
    await refusedOnPage(w, NO_ID, undefined, REFUSAL.idTaken)
  })
  dt08('5j', 'an invalid agent_id and a held name → id-invalid (the id is checked before the name)', async (w) => {
    withE5(w)
    await w.pairs.pair(E(1), ID.machine, NAME.fishball, at())
    await refusedOnPage(w, { id: ID.dotted, name: NAME.fishball }, undefined, ID_REFUSAL.idInvalid)
  })
  dt08('5k', 'a held agent_id and an invalid name → id-taken (the id is checked before the name)', async (w) => {
    withE5(w)
    await w.pairs.pair(E(1), ID.agentW, undefined, at())
    await refusedOnPage(w, { name: FIXTURE.idFill.repeat(NAME_RULES.maxChars + 1) }, undefined, REFUSAL.idTaken)
  })
  dt08('5l', 'a free agent_id and a name over 64 characters → name-invalid; nothing bound', async (w) => {
    withE5(w)
    await refusedOnPage(w, { name: FIXTURE.idFill.repeat(NAME_RULES.maxChars + 1) }, undefined, REFUSAL.nameInvalid)
  })
  dt08('6a', 'bound by a machine client to agent-w-1; the page with agent-w-1 → code (reconnect)', async (w) => {
    withE5(w)
    await w.pairs.pair(E(5), ID.agentW, undefined, at())
    const before = identity(w.pairs.pairOf(E(5)))
    assertCode(w, await approve(w))
    assert.deepEqual(identity(w.pairs.pairOf(E(5))), before)
  })
  dt08('7c', 'bound on the page with the name Watcher; reconnect with the name Fishball typed → code; the name stays Watcher', async (w) => {
    withE5(w)
    assertCode(w, await approve(w, { name: NAME.watcher }))
    assertCode(w, await approve(w, { name: NAME.fishball }))
    assert.equal(w.pairs.pairOf(E(5)).name, NAME.watcher)
  })
  dt08('8 (derived)', 'bound to agent-w-1; no agent_id (the derived id differs) → already-paired', async (w) => {
    withE5(w)
    assertCode(w, await approve(w))
    await refusedOnPage(w, NO_ID, undefined, PAGE_TEXT.createNew)
  })
  dt08('8a', 'bound to agent-w-1 by another client id URL; agent-w-1 from this client → code (reconnect); this client id URL recorded', async (w) => {
    withE5(w)
    scriptOther(w)
    assertCode(w, await approve(w, {}, OTHER_CLIENT))
    assertCode(w, await approve(w))
    assert.equal(w.pairs.pairOf(E(5)).clientIdUrl, FIXTURE.clientId)
  })
  dt08('8b', 'bound to agent-w-1; an invalid agent_id → already-paired (the binding is checked before the id)', async (w) => {
    withE5(w)
    assertCode(w, await approve(w))
    await refusedOnPage(w, { id: ID.dotted }, undefined, PAGE_TEXT.createNew)
  })
  dt08('1 (before the id)', 'an invalid token with an invalid agent_id → "this token is not valid" (the token is checked first); counted', async (w) => {
    withE5(w)
    await refusedOnPage(w, { id: ID.dotted, token: V(1) }, undefined, PAGE_TEXT.invalid)
    assert.equal(w.limiter.failures.length, 1)
  })
}

// ---------------------------------------------------------------------------------------------
// State Transitions: AUTH-ST-08, a token entry on the page
// ---------------------------------------------------------------------------------------------

function stateTransitions(sdk) {
  const st08 = (n, title, fn) => row(sdk, CASE.st08, n, title, fn)
  st08('1', 'Unpaired → Authorize with a valid free agent_id → Bound(page): code; full rights', async (w) => {
    withE5(w)
    await boundWithFullRights(w, await approve(w), ID.agentW)
  })
  st08('2', 'Bound(page, X) → Authorize with X → Bound(page, X): a code for the same principal', async (w) => {
    withE5(w)
    assertCode(w, await approve(w))
    const before = identity(w.pairs.pairOf(E(5)))
    await boundWithFullRights(w, await approve(w), ID.agentW)
    assert.deepEqual(identity(w.pairs.pairOf(E(5))), before)
  })
  st08('3', 'Bound(page, X) → Authorize with Y → Bound(page, X): already-paired; nothing changes', async (w) => {
    withE5(w)
    assertCode(w, await approve(w))
    await refusedOnPage(w, { id: ID.other }, undefined, PAGE_TEXT.createNew)
  })
  st08('5', 'Bound(page, X) → the entry disabled → Off: Authorize is "this token is not valid"; the refresh is invalid_grant', async (w) => {
    const c = await chain(w)
    w.tokens.disable(5)
    await refusedOnPage(w, {}, undefined, PAGE_TEXT.invalid)
    assertGrantError(await refresh(w, c.rt), OAUTH_ERROR.invalidGrant)
  })
  st08('6', 'Off → re-enabled → Authorize with X → Bound(page, X): a code for the same principal; the old refresh token stays invalid_grant', async (w) => {
    const c = await chain(w)
    const before = identity(w.pairs.pairOf(E(5)))
    w.tokens.disable(5)
    w.tokens.enable(5)
    const flow = await approve(w)
    assertGrantOk(await redeem(w, flow))
    assert.deepEqual(identity(w.pairs.pairOf(E(5))), before)
    assertGrantError(await refresh(w, c.rt), OAUTH_ERROR.invalidGrant)
  })
  st08('8', 'Bound(machine, X) → Authorize with X → Bound(page, X): the client id URL and redirect URI recorded', async (w) => {
    withE5(w)
    await w.pairs.pair(E(5), ID.agentW, undefined, at())
    assertCode(w, await approve(w))
    assert.equal(w.pairs.pairOf(E(5)).clientIdUrl, FIXTURE.clientId)
  })
}

// ---------------------------------------------------------------------------------------------
// State Transitions: AUTH-ST-09, the entry's older chains on reconnect (K1d-6)
// ---------------------------------------------------------------------------------------------

/** The fake store's calls named `name` (oauth-web/fakes.mjs records each with its first argument). */
const storeCalls = (w, name) => w.store.calls.map(([n, arg], i) => ({ n, arg, i })).filter((c) => c.n === name)
/** A chainless access token of E5, as a machine client_credentials token is (K1 IssuedAccessToken without chainId). */
function chainlessAccess(w) {
  const record = Object.freeze({ entryKey: E(5), clientId: ID.agentW, audience: w.urls.resource, generation: w.tokens.get(E(5)).generation, issuedAt: w.clock.now() })
  w.store.putAccess(FIXTURE.chainlessDigest, record)
  return record
}

function olderChains(sdk) {
  const st09 = (n, title, fn) => row(sdk, CASE.st09, n, title, fn)
  st09('1', 'Bound with chain C1 → reconnect → C1\'s refresh token invalid_grant and its access tokens gone; the new code redeems and its chain refreshes', async (w) => {
    const c = await chain(w)
    const rotated = assertGrantOk(await refresh(w, c.rt))
    const flow = await approve(w)
    assertCode(w, flow)
    for (const body of [c.first, rotated]) assert.equal(w.store.getAccess(digest(body.access_token)), undefined, 'an older chain access token survived')
    assertGrantError(await refresh(w, rotated.refresh_token), OAUTH_ERROR.invalidGrant)
    const fresh = assertGrantOk(await redeem(w, flow))
    w.clock.advance(FIXTURE.graceProbeMs.after)
    assertGrantOk(await refresh(w, fresh.refresh_token))
  })
  st09('2', 'two chains of the entry, from two client id URLs → a reconnect revokes both', async (w) => {
    scriptOther(w)
    const a = await chain(w)
    const b = assertGrantOk(await redeem(w, await approve(w, {}, OTHER_CLIENT), otherClientForm))
    // That second approve was itself a reconnect (it revoked a); a third revokes b too.
    assertCode(w, await approve(w))
    assertGrantError(await refresh(w, a.rt), OAUTH_ERROR.invalidGrant)
    assertGrantError(await refresh(w, b.refresh_token, otherClientForm), OAUTH_ERROR.invalidGrant)
  })
  st09('3', 'a code minted before the reconnect and never redeemed → invalid_grant after it; the reconnect\'s own code redeems', async (w) => {
    withE5(w)
    const early = await approve(w)
    assertCode(w, early)
    const flow = await approve(w)
    assertCode(w, flow)
    assertGrantError(await redeem(w, early), OAUTH_ERROR.invalidGrant)
    assertGrantOk(await redeem(w, flow))
  })
  st09('4', 'the revocation comes before the reconnect\'s new code is minted (revokeEntryChains on E5, then putCode)', async (w) => {
    await chain(w)
    const codesBefore = storeCalls(w, 'putCode').length
    assertCode(w, await approve(w))
    const [revoked] = storeCalls(w, 'revokeEntryChains')
    assert.equal(revoked?.arg, E(5), 'revokeEntryChains was not called for E5')
    const minted = storeCalls(w, 'putCode')[codesBefore]
    assert.ok(minted && revoked.i < minted.i, 'the new code was minted before the older chains were revoked')
  })
  st09('5', 'a first bind revokes nothing: no revokeEntryChains, and another entry\'s chain still refreshes', async (w) => {
    const c = await chain(w)
    w.tokens.add(6, V(6))
    assertCode(w, await approve(w, { id: ID.other, token: V(6) }))
    assert.deepEqual(storeCalls(w, 'revokeEntryChains'), [])
    assertGrantOk(await refresh(w, c.rt))
  })
  st09('6', 'already-paired (another id) revokes nothing: the chain still refreshes', async (w) => {
    const c = await chain(w)
    await refusedOnPage(w, { id: ID.other }, undefined, PAGE_TEXT.createNew)
    assert.deepEqual(storeCalls(w, 'revokeEntryChains'), [])
    assertGrantOk(await refresh(w, c.rt))
  })
  st09('7', 'a pair-bound entry with a chainless (client_credentials) access token → reconnect on the page → that access token is kept', async (w) => {
    withE5(w)
    await w.pairs.pair(E(5), ID.agentW, undefined, at())
    const record = chainlessAccess(w)
    assertCode(w, await approve(w))
    assert.deepEqual({ ...w.store.getAccess(FIXTURE.chainlessDigest) }, record)
  })
  st09('8', 'A → B → A: reconnects from client id URLs A, B, A → A\'s chain from before the last reconnect and B\'s stay dead; the newest chain lives', async (w) => {
    scriptOther(w)
    const a1 = await chain(w)
    const b1 = assertGrantOk(await redeem(w, await approve(w, {}, OTHER_CLIENT), otherClientForm))
    const flow = await approve(w)
    const a2 = assertGrantOk(await redeem(w, flow))
    assertGrantError(await refresh(w, a1.rt), OAUTH_ERROR.invalidGrant)
    assertGrantError(await refresh(w, b1.refresh_token, otherClientForm), OAUTH_ERROR.invalidGrant)
    assertGrantOk(await refresh(w, a2.refresh_token))
  })
}

/** Every C-PAGE-ID case of the page on one SDK: Use Cases first, then EP / BVA, DT and ST. */
export function registerPageIdCases(sdk) {
  useCases(sdk)
  partitionsAndBoundaries(sdk)
  decisionTable(sdk)
  stateTransitions(sdk)
  olderChains(sdk)
}

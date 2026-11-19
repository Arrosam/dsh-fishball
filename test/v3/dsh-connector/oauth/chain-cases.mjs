/**
 * C-PAGE-ID black-box cases on C-OAUTH's side (test/v3/dsh-connector/oauth-web/PAGE-ID-USE-CASES.md):
 * - the K1d `OAuthTokenStore` (no `chainsOf`; `RefreshRecord` without `chainStartedAt`; persisted
 *   refresh digests survive a restart), K1d-5;
 * - no chain ends by age (R-OA-23, 1.32 R14): C-OAUTH's real store driven by C-OAUTH-WEB's real
 *   code and refresh grants on the approval-page world (AUTH-UC-19, AUTH-BVA-11);
 * - a page-bound entry refuses `client_credentials` with `invalid_client`, uniform and counted
 *   (README K1d: one token never serves two client types; AUTH-UC-18); a `pair`-bound entry still
 *   works.
 * - K1d-6 (Fishball 2026-11-16): `revokeEntryChains(entryKey)` revokes every refresh chain of the
 *   entry with its access tokens and drops its unredeemed codes, at once and durably; chainless
 *   (client_credentials) access tokens and other entries are untouched (AUTH-ST-09 at the store);
 * - K1d-7 (Fishball 2026-11-16): per chain only the newest spent refresh record and the live one are
 *   kept; the newest spent is still reuse, an older spent one is unknown (AUTH-BVA-12).
 * Techniques in this order: Use Case, Boundary Value Analysis, State Transition.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { approve, assertCode, assertGrantError, assertGrantOk, chain, redeem, refresh, row as pageRow } from '../oauth-web/cases.mjs'
import { FIXTURE as PAGE_FIXTURE, OAUTH_ERROR as PAGE_OAUTH_ERROR } from '../oauth-web/constants.mjs'
import { derivedId, digest } from '../oauth-web/subject.mjs'
import { INVALID, assertError, at, audience, issue, refreshRecord, row, shape, storeRow, tokenRequest, verify } from './cases.mjs'
import {
  CLIENT_AUTH, FAILURE_LIMIT, FIXTURE, OAUTH_ERROR, REFRESH_BOUND, REFRESH_RECORD_MEMBERS, SCOPE, TOKEN_STORE_MEMBERS, WITHDRAWN_STORE_MEMBER,
} from './constants.mjs'
import { storeWorld } from './subject.mjs'

const ID = FIXTURE.id
const CASE = Object.freeze({
  uc18: 'AUTH-UC-18', uc19: 'AUTH-UC-19', bva11: 'AUTH-BVA-11', bva12: 'AUTH-BVA-12', st05: 'AUTH-ST-05', st08: 'AUTH-ST-08', st09: 'AUTH-ST-09', k1d: 'K1d-PAGE',
})
/** What the approval page records with a page-bound pair (K1d `Pair.clientIdUrl`, `.redirectUri`). */
const PAGE_CLIENT = Object.freeze({ clientIdUrl: FIXTURE.cimd, redirectUri: FIXTURE.cimdRedirect })
/** An enabled entry the approval page bound to `id` (the fake pair store carries the page client). */
function pageBoundEntry(w, id) {
  const e = w.tokens.add()
  w.pairs.bind(e.entryKey, id, null, FIXTURE.t0, PAGE_CLIENT)
  return e
}
/** The failure key the endpoint counts a refused request of `clientId` under (FAILURE_LIMIT.keyParts). */
const keyOf = (w, clientId) => ({ remoteAddress: w.remoteAddresses.at(-1), clientId })
/**
 * The approval-page world over C-OAUTH's real token store (oauth-web/subject.mjs `options.store`).
 * The store world (its storage root) is kept per test, so a row can count what was persisted.
 */
const storeWorlds = new WeakMap()
const realStore = (sdk) => () => ({ store: async (t) => { const s = await storeWorld(t, sdk); storeWorlds.set(t, s); return s.store } })
/** The persisted refresh records of `chainId` under a store world's root (K1d-7: one JSON file per record). */
function persistedRecordsOf(root, chainId) {
  const files = fs.readdirSync(root, { recursive: true }).map(String)
    .filter((f) => REFRESH_BOUND.recordFile.test(f) && path.basename(path.dirname(f)) === REFRESH_BOUND.table)
  return files.map((f) => JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')))).filter((text) => text.includes(JSON.stringify(chainId)))
}
/** Lowercase hex SHA-256 of a bearer value: the store key of an access token (the relayed store-key decision). */
const keyOfValue = (value) => digest(value)
const E5 = PAGE_FIXTURE.entry(5)

// ---------------------------------------------------------------------------------------------
// The K1d token store
// ---------------------------------------------------------------------------------------------

function storeSurface(sdk) {
  storeRow(sdk, CASE.k1d, 'store surface', `the store has every K1d OAuthTokenStore member and no ${WITHDRAWN_STORE_MEMBER} (R-OA-23)`, (s) => {
    for (const member of TOKEN_STORE_MEMBERS) assert.equal(typeof s.store[member], 'function', member)
    assert.equal(s.store[WITHDRAWN_STORE_MEMBER], undefined)
  })
  storeRow(sdk, CASE.st05, '8 (store, K1d record)', 'a RefreshRecord without chainStartedAt is persisted and read back exactly, also after a restart', async (s) => {
    const record = refreshRecord(FIXTURE.entryKey(1), FIXTURE.chain(1), FIXTURE.firstGeneration)
    await s.store.putRefresh(FIXTURE.digest(1), record)
    await s.reopen()
    const read = s.store.getRefresh(FIXTURE.digest(1))
    assert.deepEqual({ ...read }, record)
    assert.deepEqual(Object.keys(read).filter((k) => read[k] !== undefined).sort(), REFRESH_RECORD_MEMBERS)
  })
}

// ---------------------------------------------------------------------------------------------
// No chain cap through the real store and the real grants
// ---------------------------------------------------------------------------------------------

function noChainCap(sdk) {
  const live = (id, part, title, fn) => pageRow(sdk, id, part, title, fn, undefined, realStore(sdk))
  live(CASE.uc19, 'main', 'a browser chain rotates at T + 365 days − 1 ms, T + 365 days and T + 10 years (real store, real grants)', async (w) => {
    const c = await chain(w)
    let rt = c.rt
    for (const offset of [PAGE_FIXTURE.withdrawnChainCapMs - 1, PAGE_FIXTURE.withdrawnChainCapMs, PAGE_FIXTURE.tenYearsMs]) {
      w.clock.set(PAGE_FIXTURE.t0 + offset)
      const next = assertGrantOk(await refresh(w, rt))
      assert.equal(w.store.getRefresh(digest(next.refresh_token)).chainId, c.chainId, 'the same chain rotates')
      rt = next.refresh_token
    }
  })
  for (const [n, offset] of [['1', PAGE_FIXTURE.withdrawnChainCapMs - 1], ['2', PAGE_FIXTURE.withdrawnChainCapMs], ['3', PAGE_FIXTURE.tenYearsMs]]) {
    live(CASE.bva11, n, `a refresh ${offset} ms after the chain started → rotates; the stored record has no chainStartedAt (real store)`, async (w) => {
      const c = await chain(w)
      w.clock.set(PAGE_FIXTURE.t0 + offset)
      const next = assertGrantOk(await refresh(w, c.rt))
      const record = w.store.getRefresh(digest(next.refresh_token))
      assert.deepEqual(Object.keys(record).filter((k) => record[k] !== undefined).sort(), REFRESH_RECORD_MEMBERS)
    })
  }
  live(CASE.uc19, 'E1 (reuse)', 'ten years on, reuse still ends the chain: invalid_grant and its successor revoked (R-OA-16 (2))', async (w) => {
    const c = await chain(w)
    w.clock.set(PAGE_FIXTURE.t0 + PAGE_FIXTURE.tenYearsMs)
    const next = assertGrantOk(await refresh(w, c.rt))
    w.clock.advance(PAGE_FIXTURE.graceProbeMs.after)
    assertGrantError(await refresh(w, c.rt), PAGE_OAUTH_ERROR.invalidGrant)
    assertGrantError(await refresh(w, next.refresh_token), PAGE_OAUTH_ERROR.invalidGrant)
  })
  live(CASE.uc19, 'E2 (disable)', 'ten years on, a disable still ends the chain: invalid_grant', async (w) => {
    const c = await chain(w)
    w.clock.set(PAGE_FIXTURE.t0 + PAGE_FIXTURE.tenYearsMs)
    w.tokens.disable(5)
    assertGrantError(await refresh(w, c.rt), PAGE_OAUTH_ERROR.invalidGrant)
  })
  live(CASE.st05, '12 (real store)', 'years later, a reconnect with the bound id mints a new chain for the same principal; the earlier chain is revoked (K1d-6)', async (w) => {
    const c = await chain(w)
    const principal = w.pairs.pairOf(E5).principalKey
    w.clock.set(PAGE_FIXTURE.t0 + PAGE_FIXTURE.tenYearsMs)
    const flow = await approve(w)
    assertCode(w, flow)
    const fresh = assertGrantOk(await redeem(w, flow))
    assert.notEqual(w.store.getRefresh(digest(fresh.refresh_token)).chainId, c.chainId)
    assert.equal(w.pairs.pairOf(E5).principalKey, principal)
    assertGrantError(await refresh(w, c.rt), PAGE_OAUTH_ERROR.invalidGrant)
  })
}

// ---------------------------------------------------------------------------------------------
// A page-bound entry at client_credentials
// ---------------------------------------------------------------------------------------------

function pageBoundAtTokenEndpoint(sdk) {
  const uc18 = (part, title, fn) => row(sdk, CASE.uc18, part, title, fn)
  for (const auth of [CLIENT_AUTH.basic, CLIENT_AUTH.post]) {
    uc18(`main (${auth})`, `a page-bound entry with its bound id over ${auth} → 401 invalid_client, no access token`, async (w) => {
      const e = pageBoundEntry(w, ID.agentA)
      assertError(await tokenRequest(w, { auth, clientId: ID.agentA, secret: e.value }), OAUTH_ERROR.invalidClient)
    })
  }
  uc18('main (uniform)', 'the refusal is byte-identical to an unknown token\'s (nothing says the entry exists or is page-bound)', async (w) => {
    const e = pageBoundEntry(w, ID.agentA)
    const pageBound = shape(await tokenRequest(w, { clientId: ID.agentA, secret: e.value }))
    const unknown = shape(await tokenRequest(w, { clientId: ID.agentA, secret: FIXTURE.value() }))
    assert.deepEqual(pageBound, unknown)
  })
  uc18('main (counted)', 'each refusal counts toward the failure limit: after perKeyPerWindow of them the key is limited', async (w) => {
    const e = pageBoundEntry(w, ID.agentA)
    for (let i = 0; i < FAILURE_LIMIT.perKeyPerWindow; i += 1) assertError(await tokenRequest(w, { clientId: ID.agentA, secret: e.value }), OAUTH_ERROR.invalidClient)
    assert.equal(w.limiter.check(keyOf(w, ID.agentA), w.clock.now()).limited, true)
  })
  uc18('A1', 'a page-bound entry with another client id → invalid_client too (no pair-only token for it)', async (w) => {
    const e = pageBoundEntry(w, ID.agentA)
    assertError(await tokenRequest(w, { clientId: ID.n999, secret: e.value }), OAUTH_ERROR.invalidClient)
  })
  uc18('A1 (derived id)', 'a page-bound entry whose id is the derived cid- id → invalid_client for that id', async (w) => {
    const cid = derivedId(FIXTURE.cimd)
    const e = pageBoundEntry(w, cid)
    assertError(await tokenRequest(w, { clientId: cid, secret: e.value }), OAUTH_ERROR.invalidClient)
  })
  uc18('A2', 'an entry bound by pair (machine) still gets a full token with client credentials', async (w) => {
    const e = w.tokens.add()
    w.pairs.bind(e.entryKey, ID.agentA)
    assert.equal(verify(w, await issue(w, e, ID.agentA, SCOPE.full)).scope, SCOPE.full)
  })
  row(sdk, CASE.st08, '4', 'Bound(page, X) → client_credentials with X → Bound(page, X): invalid_client; a machine entry beside it is unaffected', async (w) => {
    const page = pageBoundEntry(w, ID.agentA)
    const machine = w.tokens.add()
    w.pairs.bind(machine.entryKey, ID.x)
    assertError(await tokenRequest(w, { clientId: ID.agentA, secret: page.value }), OAUTH_ERROR.invalidClient)
    await issue(w, machine, ID.x, SCOPE.full)
    assert.deepEqual(w.pairs.writes, [], 'the token endpoint changes no pair')
  })
  row(sdk, CASE.st08, '8', 'Bound(machine, X) reconnected on the page (now page-bound) → client_credentials with X: invalid_client (one token, one client type)', async (w) => {
    const e = w.tokens.add()
    w.pairs.bind(e.entryKey, ID.agentA)
    await issue(w, e, ID.agentA, SCOPE.full)
    w.pairs.bind(e.entryKey, ID.agentA, null, FIXTURE.t0, PAGE_CLIENT)
    assertError(await tokenRequest(w, { clientId: ID.agentA, secret: e.value }), OAUTH_ERROR.invalidClient)
  })
}

// ---------------------------------------------------------------------------------------------
// K1d-6: revokeEntryChains on the real store
// ---------------------------------------------------------------------------------------------

function entryChains(sdk) {
  const E1 = FIXTURE.entryKey(1)
  const E2 = FIXTURE.entryKey(2)
  const G = FIXTURE.firstGeneration
  const st09 = (n, title, fn) => storeRow(sdk, CASE.st09, n, title, fn)
  const accessOf = (entryKey, chainId) => ({ entryKey, clientId: FIXTURE.cimd, audience: FIXTURE.foreignResource, generation: G, issuedAt: at(), ...(chainId === undefined ? {} : { chainId }) })
  const codeOf = (entryKey) => ({ entryKey, clientId: FIXTURE.cimd, redirectUri: FIXTURE.cimdRedirect, codeChallenge: FIXTURE.digest(99), audience: FIXTURE.foreignResource, issuedAt: at() })
  /**
   * E1: chains 1 and 2 (two client id URLs' chains alike: the store sees only the entry), each with
   * an access token, a chainless access token and a code; E2: chain 3, its access token and a code.
   */
  async function seed(s) {
    await s.store.putRefresh(FIXTURE.digest(1), refreshRecord(E1, FIXTURE.chain(1), G))
    await s.store.putRefresh(FIXTURE.digest(2), { ...refreshRecord(E1, FIXTURE.chain(2), G), clientId: FIXTURE.foreignResource })
    await s.store.putRefresh(FIXTURE.digest(3), refreshRecord(E2, FIXTURE.chain(3), G))
    s.store.putAccess(FIXTURE.digest(11), accessOf(E1, FIXTURE.chain(1)))
    s.store.putAccess(FIXTURE.digest(12), accessOf(E1, FIXTURE.chain(2)))
    s.store.putAccess(FIXTURE.digest(13), accessOf(E1))
    s.store.putAccess(FIXTURE.digest(14), accessOf(E2, FIXTURE.chain(3)))
    s.store.putCode(FIXTURE.digest(21), codeOf(E1))
    s.store.putCode(FIXTURE.digest(22), codeOf(E2))
  }
  const assertE1Revoked = (s) => {
    for (const n of [1, 2]) assert.equal(s.store.getRefresh(FIXTURE.digest(n)), undefined, `E1's chain ${n} refresh survived`)
    for (const n of [11, 12]) assert.equal(s.store.getAccess(FIXTURE.digest(n)), undefined, `E1's chain access token ${n} survived`)
  }
  const assertOthersKept = (s) => {
    assert.deepEqual({ ...s.store.getAccess(FIXTURE.digest(13)) }, accessOf(E1), 'a chainless access token was revoked')
    assert.ok(s.store.getRefresh(FIXTURE.digest(3)), 'another entry\'s chain was revoked')
    assert.ok(s.store.getAccess(FIXTURE.digest(14)), 'another entry\'s access token was revoked')
  }
  storeRow(sdk, CASE.k1d, 'store surface (K1d-6)', 'the store has revokeEntryChains', (s) => {
    assert.equal(typeof s.store.revokeEntryChains, 'function')
  })
  st09('1 (store)', 'two chains of E1 → revokeEntryChains(E1) → both refresh records and their access tokens gone, E1\'s code dropped; chainless and E2\'s kept', async (s) => {
    await seed(s)
    await s.store.revokeEntryChains(E1)
    assertE1Revoked(s)
    assert.equal(s.store.takeCode(FIXTURE.digest(21)), undefined, 'E1\'s unredeemed code survived')
    assertOthersKept(s)
    assert.ok(s.store.takeCode(FIXTURE.digest(22)), 'another entry\'s code was dropped')
  })
  st09('1 (at once)', 'the revocation is visible to getRefresh and getAccess before the promise settles', async (s) => {
    await seed(s)
    const pending = s.store.revokeEntryChains(E1)
    assertE1Revoked(s)
    await pending
  })
  st09('1 (durable)', 'revokeEntryChains(E1), then a restart → E1\'s chains stay revoked; E2\'s chain persists', async (s) => {
    await seed(s)
    await s.store.revokeEntryChains(E1)
    await s.reopen()
    for (const n of [1, 2]) assert.equal(s.store.getRefresh(FIXTURE.digest(n)), undefined)
    assert.ok(s.store.getRefresh(FIXTURE.digest(3)))
  })
  st09('1 (new chain after)', 'a chain put after revokeEntryChains(E1) lives (the entry itself is not revoked), also after a restart', async (s) => {
    await seed(s)
    await s.store.revokeEntryChains(E1)
    const fresh = refreshRecord(E1, FIXTURE.chain(4), G)
    await s.store.putRefresh(FIXTURE.digest(4), fresh)
    assert.deepEqual({ ...s.store.getRefresh(FIXTURE.digest(4)) }, fresh)
    await s.reopen()
    assert.deepEqual({ ...s.store.getRefresh(FIXTURE.digest(4)) }, fresh)
  })
  st09('5 (store)', 'an entry with no chain → revokeEntryChains resolves and changes nothing', async (s) => {
    await seed(s)
    await s.store.revokeEntryChains(FIXTURE.entryKey(9))
    for (const n of [1, 2, 3]) assert.ok(s.store.getRefresh(FIXTURE.digest(n)))
    for (const n of [11, 12, 13, 14]) assert.ok(s.store.getAccess(FIXTURE.digest(n)))
  })
  row(sdk, CASE.st09, '1 (verifier)', 'an older chain\'s access token verifies, then after revokeEntryChains it is invalid_token; a chainless (client_credentials) token of the entry still verifies', async (w) => {
    const e = w.tokens.add()
    w.pairs.bind(e.entryKey, ID.agentA, null, FIXTURE.t0, PAGE_CLIENT)
    const [chained, chainless] = [FIXTURE.value(), FIXTURE.value()]
    const base = { entryKey: e.entryKey, clientId: ID.agentA, audience: audience(w), generation: FIXTURE.firstGeneration, issuedAt: w.clock.now() }
    w.store.putAccess(keyOfValue(chained), { ...base, chainId: FIXTURE.chain(1) })
    w.store.putAccess(keyOfValue(chainless), base)
    assert.equal(verify(w, chained).scope, SCOPE.full, 'harness: the chain token verifies before')
    await w.store.revokeEntryChains(e.entryKey)
    assert.deepEqual(verify(w, chained), INVALID)
    assert.equal(verify(w, chainless).scope, SCOPE.full)
  })
  const live = (id, part, title, fn) => pageRow(sdk, id, part, title, fn, undefined, realStore(sdk))
  live(CASE.st09, '1 (real store, page)', 'a page reconnect on the real store → the older chain is invalid_grant; the new code redeems and its chain refreshes', async (w) => {
    const c = await chain(w)
    const flow = await approve(w)
    assertCode(w, flow)
    assertGrantError(await refresh(w, c.rt), PAGE_OAUTH_ERROR.invalidGrant)
    const fresh = assertGrantOk(await redeem(w, flow))
    w.clock.advance(PAGE_FIXTURE.graceProbeMs.after)
    assertGrantOk(await refresh(w, fresh.refresh_token))
  })
}

// ---------------------------------------------------------------------------------------------
// K1d-7: bounded refresh records (AUTH-BVA-12)
// ---------------------------------------------------------------------------------------------

function boundedRecords(sdk) {
  const E1 = FIXTURE.entryKey(1)
  const G = FIXTURE.firstGeneration
  const N = REFRESH_BOUND.rotations
  /** N rotations of chain 1 as a grant writes them: the new live record, then the old one spent. */
  async function rotateInStore(s, chainId, digestOf) {
    await s.store.putRefresh(digestOf(0), refreshRecord(E1, chainId, G))
    for (let i = 1; i <= N; i += 1) {
      await s.store.putRefresh(digestOf(i), refreshRecord(E1, chainId, G))
      await s.store.putRefresh(digestOf(i - 1), { ...refreshRecord(E1, chainId, G), spentAt: at(i) })
    }
  }
  const digestA = (i) => FIXTURE.digest(`a-${i}`)
  const digestB = (i) => FIXTURE.digest(`b-${i}`)
  storeRow(sdk, CASE.bva12, `1 (${N} rotations, persisted)`, `after ${N} rotations of one chain the refresh table holds exactly ${REFRESH_BOUND.recordsPerChain} records for it (newest spent + live)`, async (s) => {
    await rotateInStore(s, FIXTURE.chain(1), digestA)
    assert.equal(persistedRecordsOf(s.root, FIXTURE.chain(1)).length, REFRESH_BOUND.recordsPerChain)
  })
  storeRow(sdk, CASE.bva12, `1 (${N} rotations, after reopen)`, 'after a reopen: the live and the newest spent record read back; every older digest is unknown', async (s) => {
    await rotateInStore(s, FIXTURE.chain(1), digestA)
    await s.reopen()
    assert.equal(s.store.getRefresh(digestA(N))?.spentAt, undefined, 'the live record')
    assert.equal(s.store.getRefresh(digestA(N - 1))?.spentAt, at(N), 'the newest spent record')
    const older = Array.from({ length: N - 1 }, (_, i) => digestA(i)).filter((d) => s.store.getRefresh(d) !== undefined)
    assert.deepEqual(older, [], 'older spent records kept')
  })
  storeRow(sdk, CASE.bva12, '2 (per chain)', 'the bound is per chain: rotating chain 1 deletes none of chain 2\'s records', async (s) => {
    await rotateInStore(s, FIXTURE.chain(2), digestB)
    await rotateInStore(s, FIXTURE.chain(1), digestA)
    assert.ok(s.store.getRefresh(digestB(N)), 'chain 2\'s live record was deleted')
    assert.ok(s.store.getRefresh(digestB(N - 1)), 'chain 2\'s newest spent record was deleted')
  })
  const live = (n, title, fn) => pageRow(sdk, CASE.bva12, n, title, fn, undefined, realStore(sdk))
  /** A chain rotated N times through the real refresh grant; returns every response body (RT1 is c.rt). */
  async function rotated(w) {
    const c = await chain(w)
    const bodies = []
    for (let i = 0; i < N; i += 1) {
      w.clock.advance(PAGE_FIXTURE.graceProbeMs.after)
      bodies.push(assertGrantOk(await refresh(w, bodies.at(-1)?.refresh_token ?? c.rt)))
    }
    return { c, bodies }
  }
  live(`3 (${N} rotations, real grants)`, `${N} rotations through the real refresh grant → exactly ${REFRESH_BOUND.recordsPerChain} persisted records for the chain`, async (w, t) => {
    const { c } = await rotated(w)
    assert.equal(persistedRecordsOf(storeWorlds.get(t).root, c.chainId).length, REFRESH_BOUND.recordsPerChain)
  })
  live('4 (newest spent, in grace)', `after ${N} rotations the newest spent token within 10 s → the identical successor (grace unchanged)`, async (w) => {
    const { bodies } = await rotated(w)
    const newestSpent = bodies.at(-2).refresh_token
    w.clock.advance(PAGE_FIXTURE.graceProbeMs.justAfter)
    const again = await refresh(w, newestSpent)
    assert.equal(again.ok, true, JSON.stringify(again))
    assert.equal(again.body.refresh_token, bodies.at(-1).refresh_token)
  })
  live('5 (newest spent, after grace)', 'the newest spent token after its 10 s window → reuse: invalid_grant and the chain revoked', async (w) => {
    const { bodies } = await rotated(w)
    w.clock.advance(PAGE_FIXTURE.graceProbeMs.after)
    assertGrantError(await refresh(w, bodies.at(-2).refresh_token), PAGE_OAUTH_ERROR.invalidGrant)
    assertGrantError(await refresh(w, bodies.at(-1).refresh_token), PAGE_OAUTH_ERROR.invalidGrant)
  })
  live('6 (older spent)', 'a spent token older than the newest spent one → invalid_grant as unknown; the chain is NOT revoked and still refreshes', async (w) => {
    const { c, bodies } = await rotated(w)
    w.clock.advance(PAGE_FIXTURE.graceProbeMs.after)
    for (const old of [c.rt, bodies.at(-3).refresh_token]) assertGrantError(await refresh(w, old), PAGE_OAUTH_ERROR.invalidGrant)
    assertGrantOk(await refresh(w, bodies.at(-1).refresh_token))
  })
}

/** Every C-PAGE-ID case on C-OAUTH's side, on one SDK. */
export function registerChainCases(sdk) {
  storeSurface(sdk)
  noChainCap(sdk)
  pageBoundAtTokenEndpoint(sdk)
  entryChains(sdk)
  boundedRecords(sdk)
}

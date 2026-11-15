/**
 * C-PAGE-ID black-box cases on C-PAIR's real, storage-backed `PairStore` (K1d-4, K1d-5;
 * test/v3/dsh-connector/oauth-web/PAGE-ID-USE-CASES.md): `bindFromPage` binds at once with the
 * page's id, client id URL and redirect URI; `reconnectFromPage` keeps the principal for the same
 * id and records the newest client, refuses any other id `already-paired`, and throws `TypeError`
 * for an unpaired entry. Requirements R-OA-12, R-OA-22, R-ID-02, R-ID-13, R-NAME-02; design §5.5a.
 *
 * Techniques in this order: Use Case (AUTH-UC-16 at the store), Decision Table (the bind's refusal
 * order, AUTH-DT-08 rules 5–8 at the store) and State Transition (AUTH-ST-08 at the store). The
 * page-level rows are in oauth-web/page-id-cases.mjs; this file proves the store keeps the
 * principal (same principal key, so its mailbox and managed sessions, keyed by it, stay) and is
 * durable across a reopen.
 */
import assert from 'node:assert/strict'
import { assertRefused, at, bind, refusal, row } from './cases.mjs'
import { FIXTURE, ID_REFUSAL, NAME_RULES, REFUSAL, SCOPE, SUBJECT, pairStoreMembers } from './constants.mjs'

const ID = FIXTURE.id
const NAME = FIXTURE.name
const E = FIXTURE.entry
const CLIENT = FIXTURE.client
const CASE = Object.freeze({ uc16: 'AUTH-UC-16', dt08: 'AUTH-DT-08', st08: 'AUTH-ST-08', k1d: 'K1d-PAGE' })
const FULL = Object.freeze({ scope: SCOPE.full })
/** The members a reconnect must keep (R-OA-22: the same principal, its name and pairedAt). */
const identity = (p) => ({ entryKey: p.entryKey, principalKey: p.principalKey, id: p.id, name: p.name, pairedAt: p.pairedAt })
const clientOf = (p) => ({ clientIdUrl: p.clientIdUrl, redirectUri: p.redirectUri })
const TOO_LONG_NAME = FIXTURE.fill.repeat(NAME_RULES.maxChars + 1)

/** `bindFromPage` on entry `n`, required to succeed; returns the stored pair. */
async function pageBind(w, n, id, name, client = CLIENT, now = at()) {
  const result = await w.store.bindFromPage(E(n), id, name, client, now)
  assert.equal(result.ok, true, `harness: binding entry ${n} as ${id} on the page failed: ${JSON.stringify(result)}`)
  return w.store.pairOf(E(n))
}

function useCases(sdk) {
  const uc = (part, title, fn) => row(sdk, CASE.uc16, part, title, fn)
  uc('main (store)', 'bindFromPage then reconnectFromPage with the same id → {ok, pair}: the same principal key, id, name and pairedAt', async (w) => {
    const bound = await pageBind(w, 5, ID.agentW, NAME.watcher)
    const result = await w.store.reconnectFromPage(E(5), ID.agentW, CLIENT)
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.deepEqual(identity(result.pair), identity(bound))
    assert.deepEqual(identity(w.store.pairOf(E(5))), identity(bound))
    assert.equal(w.store.list().length, 1, 'no second principal')
    assert.deepEqual(w.power(E(5), ID.agentW), FULL)
  })
  uc('A1 (store)', 'a reconnect from another client id URL and redirect URI records the newest ones; the principal is unchanged', async (w) => {
    const bound = await pageBind(w, 5, ID.agentW)
    const result = await w.store.reconnectFromPage(E(5), ID.agentW, FIXTURE.otherClient)
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.deepEqual(clientOf(w.store.pairOf(E(5))), FIXTURE.otherClient)
    assert.deepEqual(identity(w.store.pairOf(E(5))), identity(bound))
  })
  uc('A5 (store)', 'an entry bound by a machine client\'s pair: the same id reconnects, keeps its principal and name, and records the page client', async (w) => {
    const bound = await bind(w, 5, ID.agentW, NAME.watcher)
    assert.deepEqual(clientOf(bound), { clientIdUrl: undefined, redirectUri: undefined }, 'a machine pair carries no page client')
    const result = await w.store.reconnectFromPage(E(5), ID.agentW, CLIENT)
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.deepEqual(identity(w.store.pairOf(E(5))), identity(bound))
    assert.deepEqual(clientOf(w.store.pairOf(E(5))), CLIENT)
  })
  uc('E1 (store)', 'reconnectFromPage of an unpaired entry is a caller bug → TypeError; nothing changes (K1d-5)', async (w) => {
    const before = w.snapshot()
    await assert.rejects(async () => w.store.reconnectFromPage(E(5), ID.agentW, CLIENT), TypeError)
    assert.deepEqual(w.snapshot(), before)
    assert.equal(w.store.pairOf(E(5)), undefined)
  })
  uc('post (durable)', 'a bind and a reconnect survive a reopen of the store: the principal and the newest client', async (w) => {
    const bound = await pageBind(w, 5, ID.agentW, NAME.watcher)
    await w.store.reconnectFromPage(E(5), ID.agentW, FIXTURE.otherClient)
    await w.reopen()
    assert.deepEqual(identity(w.store.pairOf(E(5))), identity(bound))
    assert.deepEqual(clientOf(w.store.pairOf(E(5))), FIXTURE.otherClient)
  })
  row(sdk, CASE.k1d, 'store surface', `the store implements K1d: ${SUBJECT.pageMembers.join(' and ')} are functions; ${SUBJECT.withdrawnMember} exists neither in K1 nor on the store`, async (w) => {
    for (const member of SUBJECT.pageMembers) assert.equal(typeof w.store[member], 'function', member)
    assert.equal(w.store[SUBJECT.withdrawnMember], undefined)
    assert.equal(pairStoreMembers().includes(SUBJECT.withdrawnMember), false)
  })
}

function decisionTable(sdk) {
  const dt = (rule, title, fn) => row(sdk, CASE.dt08, rule, title, fn)
  dt('5 (store)', 'unpaired, a free valid id, no name → {ok, pair}: the id, no name, pairedAt, the client recorded; full power at once', async (w) => {
    const result = await w.store.bindFromPage(E(5), ID.agentW, undefined, CLIENT, at(FIXTURE.t1Offset))
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.deepEqual({ id: result.pair.id, name: result.pair.name, pairedAt: result.pair.pairedAt, ...clientOf(result.pair) },
      { id: ID.agentW, name: null, pairedAt: at(FIXTURE.t1Offset), ...CLIENT })
    assert.deepEqual(w.power(E(5), ID.agentW), FULL)
  })
  dt('5a (store)', 'a free valid name → bound and named', async (w) => {
    assert.equal((await pageBind(w, 5, ID.agentW, NAME.watcher)).name, NAME.watcher)
  })
  dt('5b (store)', 'an invalid id (a dot) → id-invalid; nothing binds', async (w) => {
    await assertRefused(w, () => w.store.bindFromPage(E(5), ID.dotted, undefined, CLIENT, at()), refusal(ID_REFUSAL.idInvalid))
  })
  dt('5c (store)', 'an id another entry holds (machine or page) → id-taken; nothing binds', async (w) => {
    await bind(w, 1, ID.agentW)
    await pageBind(w, 2, ID.other, undefined, FIXTURE.otherClient)
    for (const id of [ID.agentW, ID.other]) await assertRefused(w, () => w.store.bindFromPage(E(5), id, undefined, CLIENT, at()), refusal(REFUSAL.idTaken))
  })
  dt('5d (store)', 'an id differing from a held one only in case → binds (case-sensitive)', async (w) => {
    await bind(w, 1, ID.abc)
    assert.equal((await pageBind(w, 5, ID.ABC)).id, ID.ABC)
  })
  dt('5e (store)', 'a held name → name-taken; nothing binds (unlike pair, a name refuses the page bind)', async (w) => {
    await bind(w, 1, ID.a, NAME.fishball)
    await assertRefused(w, () => w.store.bindFromPage(E(5), ID.agentW, NAME.fishballLower, CLIENT, at()), refusal(REFUSAL.nameTaken))
  })
  dt('5g (store)', 'an id a since-deleted entry held → binds (delete frees the id)', async (w) => {
    await bind(w, 1, ID.agentW)
    await w.store.remove(E(1))
    assert.equal((await pageBind(w, 5, ID.agentW)).id, ID.agentW)
  })
  dt('5j (store)', 'an invalid id and a held name → id-invalid (id before name)', async (w) => {
    await bind(w, 1, ID.a, NAME.fishball)
    await assertRefused(w, () => w.store.bindFromPage(E(5), ID.dotted, NAME.fishball, CLIENT, at()), refusal(ID_REFUSAL.idInvalid))
  })
  dt('5k (store)', 'a held id and an invalid name → id-taken (id before name)', async (w) => {
    await bind(w, 1, ID.agentW)
    await assertRefused(w, () => w.store.bindFromPage(E(5), ID.agentW, TOO_LONG_NAME, CLIENT, at()), refusal(REFUSAL.idTaken))
  })
  dt('5l (store)', 'a free id and an invalid name → name-invalid; nothing binds', async (w) => {
    await assertRefused(w, () => w.store.bindFromPage(E(5), ID.agentW, TOO_LONG_NAME, CLIENT, at()), refusal(REFUSAL.nameInvalid))
  })
  dt('6 (store)', 'already bound (by pair, to another id) and a bad id → bindFromPage answers already-paired first', async (w) => {
    await bind(w, 5, ID.a)
    await assertRefused(w, () => w.store.bindFromPage(E(5), ID.dotted, undefined, CLIENT, at()), refusal(REFUSAL.alreadyPaired))
  })
  dt('8 (store)', 'bound to agent-w-1; reconnectFromPage with another id → already-paired; nothing changes', async (w) => {
    await pageBind(w, 5, ID.agentW)
    await assertRefused(w, () => w.store.reconnectFromPage(E(5), ID.other, FIXTURE.otherClient), refusal(REFUSAL.alreadyPaired))
  })
  dt('8 (store, case)', 'bound to abc; reconnectFromPage with ABC → already-paired (ids compare exactly)', async (w) => {
    await pageBind(w, 5, ID.abc)
    await assertRefused(w, () => w.store.reconnectFromPage(E(5), ID.ABC, CLIENT), refusal(REFUSAL.alreadyPaired))
  })
}

function stateTransitions(sdk) {
  const st = (n, title, fn) => row(sdk, CASE.st08, n, title, fn)
  st('1 (store)', 'Unpaired → bindFromPage → Bound(page): pair\'s already-paired then names this id as bound (R-ID-04)', async (w) => {
    const bound = await pageBind(w, 5, ID.agentW)
    const again = await w.store.pair(E(5), ID.agentW, undefined, at())
    assert.equal(again.ok, false)
    assert.equal(again.code, REFUSAL.alreadyPaired)
    assert.deepEqual({ idMatches: again.bound.idMatches, boundId: again.bound.boundId }, { idMatches: true, boundId: bound.id })
  })
  st('2 (store)', 'Bound(page, X) → reconnectFromPage X, again and again → Bound(page, X): the same principal each time', async (w) => {
    const bound = await pageBind(w, 5, ID.agentW)
    for (const client of [CLIENT, FIXTURE.otherClient, CLIENT]) assert.equal((await w.store.reconnectFromPage(E(5), ID.agentW, client)).ok, true)
    assert.deepEqual(identity(w.store.pairOf(E(5))), identity(bound))
    assert.deepEqual(clientOf(w.store.pairOf(E(5))), CLIENT)
  })
  st('7 (store)', 'Bound(page, X) → remove → (gone): X is free; another entry binds X on the page', async (w) => {
    await pageBind(w, 5, ID.agentW)
    await w.store.remove(E(5))
    assert.equal(w.store.pairOf(E(5)), undefined)
    assert.equal((await pageBind(w, 6, ID.agentW)).id, ID.agentW)
  })
  st('9 (store)', 'Unpaired → reconnectFromPage → Unpaired: TypeError; a bind with the same arguments still works after it', async (w) => {
    await assert.rejects(async () => w.store.reconnectFromPage(E(5), ID.agentW, CLIENT), TypeError)
    assert.equal((await w.store.bindFromPage(E(5), ID.agentW, undefined, CLIENT, at())).ok, true)
  })
  st('10 (store)', 'Bound(page, X) → reopen → Bound(page, X) with its client; pair with another entry and X is still id-taken', async (w) => {
    await pageBind(w, 5, ID.agentW)
    await w.reopen()
    assert.deepEqual(clientOf(w.store.pairOf(E(5))), CLIENT)
    await assertRefused(w, () => w.store.pair(E(6), ID.agentW, undefined, at()), refusal(REFUSAL.idTaken))
  })
}

/** Every C-PAGE-ID case on the real PairStore, on one SDK. */
export function registerCPairReconnectCases(sdk) {
  useCases(sdk)
  decisionTable(sdk)
  stateTransitions(sdk)
}

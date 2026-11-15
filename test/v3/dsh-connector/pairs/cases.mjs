/**
 * C-PAIR black-box cases (v3-tasks.md row C-PAIR, wave W2): the pair store, `pair` / `set_name`'s
 * domain, live scope, names and ids. Cases from docs/test-design/v3/01-auth-pairing.md and
 * 02-names.md that the row names: AUTH-UC-02, AUTH-UC-04, AUTH-EP-03, AUTH-EP-06, AUTH-DT-02,
 * AUTH-BVA-05, AUTH-ST-01 (rows 2–4, 11, 13, 14), NAME-UC-01, NAME-UC-03, NAME-EP-01…04,
 * NAME-BVA-01, NAME-BVA-03, NAME-DT-01, NAME-DT-02, NAME-ST-01 (rows 1–7). Requirements R-ID-01…13,
 * R-NAME-01…08; design §5.8; K1 `PairStore`, `PairResult`, `SetNameResult`.
 *
 * Techniques, and only these, in this order: Use Case (each test names its flow: main step,
 * A<n>, E<n>, post), Equivalence Partitioning and Boundary Value Analysis (one test per row),
 * Decision Table (one per rule) and State Transition (one per transition row).
 *
 * Level: unit and integration as the cases state, over a real DSH storage domain of the SDK under
 * test (subject.mjs), with an injected clock. The parts of a row that need the MCP endpoint or a
 * later task are `todo` and name that task (constants.mjs LATER); the token-endpoint parts (AUTH-UC-02
 * main 2–3, A2, E1; AUTH-UC-04 E1; AUTH-EP-03 rows 1–6; AUTH-EP-06 row 9; AUTH-ST-01 row 14) run
 * against C-OAUTH in test/v3/dsh-connector/oauth/cases.mjs under the same case ids; the store part
 * of the same row runs here. "An access token of id X on entry E" is C-PAIR's live power,
 * `powerOf(pairOf(E), X)` (R-ID-03: scope is evaluated live, not stored in the token).
 *
 * Common refusal oracle (README): the exact code, nothing changed (every pair as before) and
 * nothing leaked (the result is exactly the frozen K1 shape, so no field of another pair).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import {
  FIXTURE, HOLDER, ID_CLASSES, ID_REFUSAL, INSUFFICIENT_SCOPE_REASON, LATER, NAME_CLASSES, NAME_RULES, NON_STRING_NAME, PAIR_ADVICE, PAIR_TIMING,
  REFUSAL, SCOPE, SUBJECT, TIME_UNIT, UNIQUENESS, nameKey, pairStoreMembers, principalLabel,
} from './constants.mjs'
import { pairWorld } from './subject.mjs'

const ID = FIXTURE.id
const NAME = FIXTURE.name
const E = FIXTURE.entry
const CASE = Object.freeze({
  uc02: 'AUTH-UC-02', uc04: 'AUTH-UC-04', ep03: 'AUTH-EP-03', ep06: 'AUTH-EP-06', bva05: 'AUTH-BVA-05', dt02: 'AUTH-DT-02', st01: 'AUTH-ST-01',
  nameUc01: 'NAME-UC-01', nameUc03: 'NAME-UC-03', nameEp01: 'NAME-EP-01', nameEp02: 'NAME-EP-02', nameEp03: 'NAME-EP-03', nameEp04: 'NAME-EP-04',
  nameBva01: 'NAME-BVA-01', nameBva03: 'NAME-BVA-03', nameDt01: 'NAME-DT-01', nameDt02: 'NAME-DT-02', nameSt01: 'NAME-ST-01',
})

// ---------------------------------------------------------------------------------------------
// Oracles and steps shared by the cases
// ---------------------------------------------------------------------------------------------

/** The fake clock: `offsetMs` after the reference instant. */
export const at = (offsetMs = 0) => FIXTURE.t0 + offsetMs
const seconds = (s) => s * TIME_UNIT.msPerSecond
/** Lets a `seen` (typed `void`) finish whatever it started before its effect is read. */
const tick = () => new Promise((resolve) => setImmediate(resolve))
const codePoints = (text) => [...text].length
const NAME_MAX = NAME_RULES.maxChars

/** K1 `PairResult` success: without a `name`, `nameAssigned` is absent (K1 README, NAME-DT-01 rule 1). */
export const paired = (id, name, extra = {}) => ({ ok: true, paired: true, id, name, ...extra })
const assigned = (id, name) => paired(id, name, { nameAssigned: true })
export const nameRefused = (id, code) => paired(id, null, { nameAssigned: false, nameRefused: code })
/** K1 `already-paired` (R-ID-04): the bound pair's fields and the fixed advice text. */
const alreadyPaired = (idMatches, pair) => ({
  ok: false, code: REFUSAL.alreadyPaired,
  bound: { idMatches, boundId: pair.id, name: pair.name, pairedAt: pair.pairedAt, lastSeenAt: pair.lastSeenAt },
  advice: idMatches ? PAIR_ADVICE.idMatches : PAIR_ADVICE.idDiffers,
})
const refusal = (code) => ({ ok: false, code })
const FULL = Object.freeze({ scope: SCOPE.full })
const pairOnly = (reason) => ({ scope: SCOPE.pair, reason })
const NOT_PAIRED = pairOnly(INSUFFICIENT_SCOPE_REASON.notPaired)
const ID_MISMATCH = pairOnly(INSUFFICIENT_SCOPE_REASON.idMismatch)

/** `pair` on entry `n`, required to succeed; returns the stored pair. */
export async function bind(w, n, id, name, now = at()) {
  const result = await w.store.pair(E(n), id, name, now)
  assert.equal(result.ok, true, `harness: pairing entry ${n} as ${id} failed: ${JSON.stringify(result)}`)
  return w.store.pairOf(E(n))
}
/** Principals already holding `names` (NAME preconditions such as "C has principals named …"). */
async function holders(w, names) {
  for (const [i, name] of names.entries()) await bind(w, `holder-${i}`, ID.holder(i), name)
}
/** Runs a refused call: exactly `expected` (nothing leaked) and every pair unchanged. */
async function assertRefused(w, call, expected) {
  const before = w.snapshot()
  assert.deepEqual(await call(), expected)
  assert.deepEqual(w.snapshot(), before, 'a refusal changes nothing')
}
/** Names are unique per connector after folding (R-NAME-01/02); nameless principals never clash. */
export function assertUniqueNames(w) {
  const keys = w.store.list().map((p) => p.name).filter((n) => n !== null).map(nameKey)
  assert.equal(new Set(keys).size, keys.length, `two principals hold one folded name: ${JSON.stringify(keys)}`)
}
/** Counts `onChange` notifications from now on. */
export function changes(w) {
  let count = 0
  const off = w.store.onChange(() => { count += 1 })
  return { get count() { return count }, off }
}
/** How a principal is shown (R-NAME-08, K1 `principalLabel`): `ID: <id>` when nameless. */
const labelOf = (pair) => principalLabel(pair.name, pair.id)
/** `set_name` on entry `n`'s principal. */
export const setName = (w, n, name) => w.store.setName(w.store.pairOf(E(n)).principalKey, name)

/** One case test on a fresh store; `todo` (a LATER owner) registers it as a todo instead. */
export function row(sdk, id, part, title, fn, todo) {
  caseTest(sdk, id, part, title, todo === undefined ? async (t) => fn(await pairWorld(t, sdk), t) : null, todo)
}
const todo = (sdk, id, part, title, owner) => row(sdk, id, part, title, null, owner)

// ---------------------------------------------------------------------------------------------
// Use Cases
// ---------------------------------------------------------------------------------------------

function useCases(sdk) {
  const uc02 = (part, title, fn, owner) => row(sdk, CASE.uc02, part, title, fn, owner)
  todo(sdk, CASE.uc02, 'main step 1', 'no token: 401 with the bearer challenge and no error=', LATER.mcpEndpoint)
  uc02('main step 3 (store)', 'an access token of agent-a on the unbound E1 has pair-only power (not-paired)', (w) => {
    assert.equal(w.store.pairOf(E(1)), undefined, 'E1 starts unbound')
    assert.deepEqual(w.power(E(1), ID.agentA), NOT_PAIRED)
  })
  todo(sdk, CASE.uc02, 'main step 4', 'server/discover and tools/list with the pair-only token list pair only', LATER.mcpEndpoint)
  uc02('main step 5', 'pair({}) binds E1 to agent-a with no name (no default names)', async (w) => {
    assert.deepEqual(await w.store.pair(E(1), ID.agentA, undefined, at()), paired(ID.agentA, null))
    assert.deepEqual(labelOf(w.store.pairOf(E(1))), principalLabel(null, ID.agentA), 'shown as ID: agent-a')
  })
  uc02('main step 6', 'the same access token is full at once after pair (scope evaluated live)', async (w) => {
    await bind(w, 1, ID.agentA)
    assert.deepEqual(w.power(E(1), ID.agentA), FULL)
  })
  todo(sdk, CASE.uc02, 'main step 6 (endpoint)', 'inbox_poll, subscriptions/listen and tools/list succeed with the same token; a new token request returns scope fishball', LATER.mcpEndpoint)
  uc02('A1', 'pair({name: "Agent A"}) with a free name: named, nameAssigned true', async (w) => {
    assert.deepEqual(await w.store.pair(E(1), ID.agentA, NAME.agentA, at()), assigned(ID.agentA, NAME.agentA))
    assert.equal(w.store.pairOf(E(1)).name, NAME.agentA)
  })
  uc02('E2', 'two agents race pair on E1 with ids a and b: exactly one binds, the other gets already-paired, idMatches false', async (w) => {
    const results = await Promise.all([w.store.pair(E(1), ID.a, undefined, at()), w.store.pair(E(1), ID.b, undefined, at())])
    const winners = results.filter((r) => r.ok)
    assert.equal(winners.length, 1, `exactly one binds: ${JSON.stringify(results)}`)
    const bound = w.store.pairOf(E(1))
    assert.equal(bound.id, winners[0].id)
    assert.deepEqual(results.find((r) => !r.ok), alreadyPaired(false, bound))
  })
  uc02('E3 (store)', 'before pair, the token has no full power (not-paired) and nothing is bound', (w) => {
    assert.deepEqual(w.power(E(1), ID.agentA), NOT_PAIRED)
    assert.deepEqual(w.snapshot(), [])
  })
  todo(sdk, CASE.uc02, 'E3', 'session_start before pair: HTTP 403 insufficient_scope, scope="agent", not-paired; nothing started', LATER.mcpEndpoint)
  uc02('post', 'the binding is durable across a connector restart, with pairedAt set and the id the client chose', async (w) => {
    await bind(w, 1, ID.agentA, undefined, at(FIXTURE.t1Offset))
    const before = w.store.pairOf(E(1))
    assert.equal(before.pairedAt, at(FIXTURE.t1Offset))
    await w.reopen()
    assert.deepEqual(w.store.pairOf(E(1)), before, 'same pair after the restart')
    assert.equal(w.store.pairOf(E(1)).id, ID.agentA, 'the connector never generated or changed the id (R-ID-08)')
    assert.deepEqual(w.power(E(1), ID.agentA), FULL)
  })
  todo(sdk, CASE.uc02, 'post (settings)', 'native settings show E1 paired, bound id, name, lastSeenAt, connected', LATER.wire)

  // AUTH-UC-04: E1 bound to 123, named "Fishball", pairedAt T1, lastSeenAt T2.
  const uc04 = (part, title, fn, owner) => row(sdk, CASE.uc04, part, title, fn, owner)
  async function boundE1(w) {
    const pair = await bind(w, 1, ID.n123, NAME.fishball, at(FIXTURE.t1Offset))
    w.store.seen(pair.principalKey, at(FIXTURE.t2Offset))
    await tick()
    const bound = w.store.pairOf(E(1))
    assert.equal(bound.lastSeenAt, at(FIXTURE.t2Offset), 'harness: precondition lastSeenAt T2')
    return bound
  }
  uc04('main step 1', 'agent B with 123 + v(E1) has full power', async (w) => {
    await boundE1(w)
    assert.deepEqual(w.power(E(1), ID.n123), FULL)
  })
  uc04('main step 2', 'pair with the bound id: already-paired, idMatches true, the bound pair and the fixed advice', async (w) => {
    const bound = await boundE1(w)
    await assertRefused(w, () => w.store.pair(E(1), ID.n123, undefined, at(FIXTURE.t2Offset)), {
      ok: false, code: REFUSAL.alreadyPaired,
      bound: { idMatches: true, boundId: ID.n123, name: NAME.fishball, pairedAt: at(FIXTURE.t1Offset), lastSeenAt: at(FIXTURE.t2Offset) },
      advice: PAIR_ADVICE.idMatches,
    })
    assert.deepEqual(w.store.pairOf(E(1)), bound)
  })
  uc04('main step 3', 'B continues with its full token: nothing changes at C', async (w) => {
    await boundE1(w)
    const before = w.snapshot()
    assert.deepEqual(w.power(E(1), ID.n123), FULL)
    assert.deepEqual(w.snapshot(), before)
  })
  uc04('A1', 'id 999: pair-only power (id-mismatch); pair answers already-paired, idMatches false, "use a new token"', async (w) => {
    const bound = await boundE1(w)
    assert.deepEqual(w.power(E(1), ID.n999), ID_MISMATCH)
    await assertRefused(w, () => w.store.pair(E(1), ID.n999, undefined, at(FIXTURE.t2Offset)), alreadyPaired(false, bound))
  })
  todo(sdk, CASE.uc04, 'A1 (endpoint)', 'id 999: token scope agent:pair; any other call 403 insufficient_scope (id-mismatch)', LATER.mcpEndpoint)
  uc04('A2', 'B switches to an unbound E2 and a new id: pairs normally', async (w) => {
    await boundE1(w)
    assert.deepEqual(await w.store.pair(E(2), ID.n999, undefined, at()), paired(ID.n999, null))
    assert.equal(w.store.pairOf(E(1)).id, ID.n123, 'E1 untouched')
  })
  uc04('A3', 'B switches to E2 but keeps id 123: id-taken, E2 stays unpaired', async (w) => {
    await boundE1(w)
    await assertRefused(w, () => w.store.pair(E(2), ID.n123, undefined, at()), refusal(REFUSAL.idTaken))
    assert.equal(w.store.pairOf(E(2)), undefined)
  })
  uc04('post', 'E1 stays bound to 123 as the same principal; no re-pairing occurred', async (w) => {
    const bound = await boundE1(w)
    await w.store.pair(E(1), ID.n123, undefined, at(FIXTURE.t2Offset))
    await w.store.pair(E(1), ID.n999, undefined, at(FIXTURE.t2Offset))
    await w.store.pair(E(2), ID.n123, undefined, at(FIXTURE.t2Offset))
    assert.deepEqual(w.store.pairOf(E(1)), bound)
    assert.deepEqual(w.store.byPrincipal(bound.principalKey), bound, 'the same principal key names the same pair')
  })
  todo(sdk, CASE.uc04, 'post (mailbox)', 'agent B with E1 + 123 sees the original principal\'s mailbox (R-ID-11)', LATER.mailbox)

  // NAME-UC-01: C has principals named "Fishball" and "Ops".
  const nameUc01 = (part, title, fn) => row(sdk, CASE.nameUc01, part, title, async (w) => { await holders(w, [NAME.fishball, NAME.ops]); await fn(w) })
  nameUc01('main', 'pair({name: "Bob"}) with a free name: named Bob, nameAssigned true', async (w) => {
    assert.deepEqual(await w.store.pair(E(1), ID.b, NAME.bob, at()), assigned(ID.b, NAME.bob))
  })
  nameUc01('A1', 'pair({}): name null, no nameRefused; shown as ID: <id>', async (w) => {
    assert.deepEqual(await w.store.pair(E(1), ID.b, undefined, at()), paired(ID.b, null))
    assert.deepEqual(labelOf(w.store.pairOf(E(1))), principalLabel(null, ID.b))
  })
  row(sdk, CASE.nameUc01, 'A2', 'a Fishball DSH pairs with "Fishball" while no one holds it: named Fishball', async (w) => {
    assert.deepEqual(await w.store.pair(E(1), ID.b, NAME.fishball, at()), assigned(ID.b, NAME.fishball))
  })
  nameUc01('E1', 'pair({name: "fishball"}) held case-insensitively: pairs, name null, nameRefused name-taken', async (w) => {
    assert.deepEqual(await w.store.pair(E(1), ID.b, NAME.fishballLower, at()), nameRefused(ID.b, REFUSAL.nameTaken))
    assert.equal(w.store.pairOf(E(1)).name, null)
  })
  nameUc01('E2', 'pair({name: "   "}): pairs, name null, nameRefused name-invalid', async (w) => {
    assert.deepEqual(await w.store.pair(E(1), ID.b, NAME.blank, at()), nameRefused(ID.b, REFUSAL.nameInvalid))
  })
  nameUc01('post', 'token and id are bound whatever the name outcome; no default name exists anywhere', async (w) => {
    await w.store.pair(E(1), ID.a, NAME.fishballLower, at())
    await w.store.pair(E(2), ID.b, NAME.blank, at())
    await w.store.pair(E(3), ID.x, undefined, at())
    for (const [n, id] of [[1, ID.a], [2, ID.b], [3, ID.x]]) assert.equal(w.store.pairOf(E(n))?.id, id, `entry ${n} bound`)
    const names = w.store.list().map((p) => p.name).filter((name) => name !== null).sort()
    assert.deepEqual(names, [NAME.fishball, NAME.ops].sort(), 'only the names principals chose exist')
  })

  // NAME-UC-03: P(E2, b) named "Fishball-2".
  const nameUc03 = (part, title, fn, owner) => row(sdk, CASE.nameUc03, part, title, owner === undefined ? async (w) => { await bind(w, 2, ID.b, NAME.fishball2); await fn(w) } : null, owner)
  nameUc03('main', 'set_name({name: "Indexer"}) with a full token: ok', async (w) => {
    assert.deepEqual(await setName(w, 2, NAME.indexer), { ok: true, name: NAME.indexer })
    assert.equal(w.store.pairOf(E(2)).name, NAME.indexer)
  })
  todo(sdk, CASE.nameUc03, 'main (endpoint)', 'set_name with a pair-only token: HTTP 403 insufficient_scope', LATER.mcpEndpoint)
  nameUc03('A1', 'set_name its own name "Fishball-2": ok, nothing else changes', async (w) => {
    const before = w.snapshot()
    assert.deepEqual(await setName(w, 2, NAME.fishball2), { ok: true, name: NAME.fishball2 })
    assert.deepEqual(w.snapshot(), before)
  })
  nameUc03('E1', 'set_name "INDEXER" while another holds "Indexer": name-taken', async (w) => {
    await bind(w, 3, ID.x, NAME.indexer)
    await assertRefused(w, () => setName(w, 2, NAME.indexerUpper), refusal(REFUSAL.nameTaken))
  })
  nameUc03('post', '"Fishball-2" is free for anyone after the rename; nobody was renamed to it', async (w) => {
    await bind(w, 3, ID.x)
    await setName(w, 2, NAME.indexer)
    assert.equal(w.store.pairOf(E(3)).name, null, 'nobody is renamed to the freed name')
    assert.deepEqual(await setName(w, 3, NAME.fishball2), { ok: true, name: NAME.fishball2 })
  })
}

// ---------------------------------------------------------------------------------------------
// Equivalence Partitioning
// ---------------------------------------------------------------------------------------------

function equivalencePartitions(sdk) {
  // AUTH-EP-03: valid ids bind; invalid ones never reach pair (the token endpoint refuses them),
  // and the page's bind, which shares the store's id rules, refuses them id-invalid (R-OA-12 (3)).
  for (const [n, cls, ids, valid] of ID_CLASSES) {
    row(sdk, CASE.ep03, `${n} (store)`, `${cls}: ${valid ? 'pair binds the id' : 'the page bind refuses id-invalid and binds nothing'}`, async (w) => {
      for (const [i, id] of ids.entries()) {
        if (valid) assert.deepEqual(await w.store.pair(E(i), id, undefined, at()), paired(id, null))
        else await assertRefused(w, () => w.store.bindFromPage(E(i), id, undefined, FIXTURE.client, at()), refusal(ID_REFUSAL.idInvalid))
      }
    })
  }
  todo(sdk, CASE.ep03, '2c', 'core setting identity.id = "fb.1" is refused id-invalid', LATER.coreIdentity)
  todo(sdk, CASE.ep03, '2d', 'generated identity.id is fb- + 16 lowercase base32', LATER.coreIdentity)
  row(sdk, CASE.ep03, '7', 'case-sensitive: E1 bound to abc; ABC is pair-only (id-mismatch), and ABC is another id for a second entry', async (w) => {
    const bound = await bind(w, 1, ID.abc)
    assert.deepEqual(w.power(E(1), ID.ABC), ID_MISMATCH)
    await assertRefused(w, () => w.store.pair(E(1), ID.ABC, undefined, at()), alreadyPaired(false, bound))
    assert.deepEqual(await w.store.pair(E(2), ID.ABC, undefined, at()), paired(ID.ABC, null), 'ids compare exactly (R-ID-13)')
  })
  row(sdk, CASE.ep03, '8', 'same id on two tokens: E2 pair x is id-taken and stays unpaired; then E2 pairs with y', async (w) => {
    await bind(w, 1, ID.x)
    await assertRefused(w, () => w.store.pair(E(2), ID.x, undefined, at()), refusal(REFUSAL.idTaken))
    assert.equal(w.store.pairOf(E(2)), undefined)
    assert.deepEqual(await w.store.pair(E(2), ID.y, undefined, at()), paired(ID.y, null))
  })
  row(sdk, CASE.ep03, '9', 'same token + same id from two clients: one principal', async (w) => {
    const pair = await bind(w, 1, ID.x)
    assert.deepEqual([w.power(E(1), ID.x), w.power(E(1), ID.x)], [FULL, FULL])
    assert.deepEqual(w.store.byPrincipal(pair.principalKey), pair)
    assert.equal(w.store.list().length, 1)
  })
  todo(sdk, CASE.ep03, '9 (mailbox)', 'both clients see the same mailbox', LATER.mailbox)

  // AUTH-EP-06: columns "unbound entry" (E1) and "entry bound to another id" (E2 bound to b).
  const columns = async (w) => { await bind(w, 2, ID.b); return { unbound: w.power(E(1), ID.a), other: w.power(E(2), ID.a) } }
  todo(sdk, CASE.ep06, '1', 'server/discover with a pair-only token: ok', LATER.mcpEndpoint)
  todo(sdk, CASE.ep06, '2', 'tools/list with a pair-only token lists pair only', LATER.mcpEndpoint)
  row(sdk, CASE.ep06, '3', 'pair: an unbound entry pairs; an entry bound to another id answers already-paired, idMatches false', async (w) => {
    const other = await bind(w, 2, ID.b)
    assert.deepEqual(await w.store.pair(E(1), ID.a, undefined, at()), paired(ID.a, null))
    await assertRefused(w, () => w.store.pair(E(2), ID.a, undefined, at()), alreadyPaired(false, other))
  })
  for (const [n, call] of [['4', 'sessions_list, session_start, approval_answer, set_name'], ['5', 'inbox_poll, inbox_ack'], ['6', 'subscriptions/listen'], ['7', 'resources/read dsh-agent://events'], ['8', 'a contributed tool call']]) {
    row(sdk, CASE.ep06, `${n} (store)`, `${call}: the live power is pair-only, not-paired (unbound) / id-mismatch (bound to another id)`, async (w) => {
      assert.deepEqual(await columns(w), { unbound: NOT_PAIRED, other: ID_MISMATCH })
    })
    todo(sdk, CASE.ep06, n, `${call} with a pair-only token: 403 insufficient_scope, scope="agent", with that description`, LATER.mcpEndpoint)
  }

  // NAME-EP-01: the class through set_name on a principal named "Watcher" (unchanged on a refusal).
  for (const [n, cls, input, stored] of NAME_CLASSES) {
    row(sdk, CASE.nameEp01, n, `${cls} ${JSON.stringify(input)}: ${stored === null ? 'name-invalid' : JSON.stringify(stored)}`, async (w) => {
      await bind(w, 1, ID.a, NAME.watcher)
      if (stored === null) await assertRefused(w, () => setName(w, 1, input), refusal(REFUSAL.nameInvalid))
      else {
        assert.deepEqual(await setName(w, 1, input), { ok: true, name: stored })
        assert.equal(w.store.pairOf(E(1)).name, stored)
      }
    })
  }
  row(sdk, CASE.nameEp01, '12', `not a string (${NON_STRING_NAME}): name-invalid at the store (the MCP schema answers invalid-arguments first, K1)`, async (w) => {
    await bind(w, 1, ID.a, NAME.watcher)
    await assertRefused(w, () => setName(w, 1, NON_STRING_NAME), refusal(REFUSAL.nameInvalid))
  })
  // The case row lists `null` as invalid; R-NAME-02 (1.23, decided A) and NAME-ST-01 row 10 make
  // `set_name({name: null})` the clear. The requirement is the authority, so `null` clears here.
  row(sdk, CASE.nameEp01, '12 (null)', 'null is the clear of R-NAME-02, not a name: ok, the name is cleared', async (w) => {
    await bind(w, 1, ID.a, NAME.watcher)
    assert.deepEqual(await setName(w, 1, null), { ok: true, name: null })
    assert.equal(w.store.pairOf(E(1)).name, null)
  })
  todo(sdk, CASE.nameEp01, '12 (schema)', 'set_name with a non-string, non-null name over MCP: invalid-arguments', LATER.wire)

  // NAME-EP-02: A (entry 1) holds `holds`; B (entry 2) calls set_name with `sets`.
  for (const [n, holds, sets, holder, taken] of UNIQUENESS) {
    row(sdk, CASE.nameEp02, n, `${JSON.stringify(holds)} held by ${holder}, B sets ${JSON.stringify(sets)}: ${taken ? 'name-taken' : 'ok'}`, async (w) => {
      const own = holder === HOLDER.own
      if (!own) await bind(w, 1, ID.a, holds)
      await bind(w, 2, ID.b, own ? holds : undefined)
      // A disabled entry keeps its pair (TQ-7 decided, R-ID-09): the store frees nothing until remove.
      if (holder === HOLDER.deleted) await w.store.remove(E(1))
      if (taken) return assertRefused(w, () => setName(w, 2, sets), refusal(REFUSAL.nameTaken))
      const before = w.snapshot()
      const notified = changes(w)
      assert.deepEqual(await setName(w, 2, sets), { ok: true, name: sets })
      assert.equal(w.store.pairOf(E(2)).name, sets)
      if (own && sets === holds) {
        assert.deepEqual(w.snapshot(), before, 'nothing else changes')
        assert.equal(notified.count, 0, 'no notification')
      }
      notified.off()
      assertUniqueNames(w)
    })
  }
  todo(sdk, CASE.nameEp02, '9 (revocation)', 'disabling the holder\'s entry keeps its pair, so its name stays held until delete', LATER.revoke)

  // NAME-EP-03: who may call set_name.
  row(sdk, CASE.nameEp03, '1', 'full power: processed', async (w) => {
    await bind(w, 1, ID.a)
    assert.deepEqual(w.power(E(1), ID.a), FULL)
    assert.deepEqual(await setName(w, 1, NAME.bob), { ok: true, name: NAME.bob })
  })
  todo(sdk, CASE.nameEp03, '2', 'pair-only, unbound: HTTP 403 insufficient_scope (not-paired)', LATER.mcpEndpoint)
  todo(sdk, CASE.nameEp03, '3', 'pair-only, bound to another id: HTTP 403 insufficient_scope (id-mismatch)', LATER.mcpEndpoint)
  row(sdk, CASE.nameEp03, '5', 'a nameless browser principal: set_name works and its name replaces ID: <id>', async (w) => {
    const bound = await w.store.bindFromPage(E(5), ID.agentW, undefined, FIXTURE.client, at())
    assert.equal(bound.ok, true, JSON.stringify(bound))
    assert.deepEqual(labelOf(w.store.pairOf(E(5))), principalLabel(null, ID.agentW))
    assert.deepEqual(await setName(w, 5, NAME.watcher), { ok: true, name: NAME.watcher })
    assert.deepEqual(labelOf(w.store.pairOf(E(5))), { name: NAME.watcher })
  })
  todo(sdk, CASE.nameEp03, '4', 'no or invalid access token: 401', LATER.mcpEndpoint)

  // NAME-EP-04: where a nameless principal is shown.
  todo(sdk, CASE.nameEp04, '1', 'managed-session mark: **ID:** agent-x', LATER.marks)
  todo(sdk, CASE.nameEp04, '2', 'Hand over button / dropdown row: "Hand over to ID: agent-x"', LATER.marks)
  todo(sdk, CASE.nameEp04, '3', 'token entry status in native settings: ID: agent-x', LATER.wire)
  todo(sdk, CASE.nameEp04, '4', 'designated-Fishball setting: ID: agent-x', LATER.wire)
  todo(sdk, CASE.nameEp04, '5', 'connector notes: "managed by ID: agent-x"', LATER.routeNotes)
  todo(sdk, CASE.nameEp04, '6', 'call.principal.name given to contributors is null', LATER.contributor)
  row(sdk, CASE.nameEp04, '7', 'two nameless principals never clash with each other', async (w) => {
    assert.deepEqual(await w.store.pair(E(1), ID.x, undefined, at()), paired(ID.x, null))
    assert.deepEqual(await w.store.pair(E(2), ID.y, undefined, at()), paired(ID.y, null))
    assert.deepEqual(await setName(w, 1, null), { ok: true, name: null })
  })
  row(sdk, CASE.nameEp04, '8', 'a principal named "ID: agent-y" by hand: allowed, shown as plain text', async (w) => {
    const chosen = NAME_CLASSES.find(([n]) => n === '9c')[3]
    await bind(w, 1, ID.x, chosen)
    assert.deepEqual(labelOf(w.store.pairOf(E(1))), { name: chosen })
  })
  row(sdk, CASE.nameEp04, '9', 'the nameless principal agent-y: ID: prefix label, visibly different from row 8', async (w) => {
    const chosen = NAME_CLASSES.find(([n]) => n === '9c')[3]
    await bind(w, 1, ID.x, chosen)
    await bind(w, 2, ID.agentA)
    assert.notDeepEqual(labelOf(w.store.pairOf(E(2))), labelOf(w.store.pairOf(E(1))))
    assert.deepEqual(labelOf(w.store.pairOf(E(2))), principalLabel(null, ID.agentA))
  })
}

// ---------------------------------------------------------------------------------------------
// Boundary Value Analysis
// ---------------------------------------------------------------------------------------------

function boundaryValues(sdk) {
  // AUTH-BVA-05: lastSeenAt is written at most once per PAIR_TIMING.lastSeenWriteIntervalMs (60 s).
  async function lastWrite(w) {
    const pair = await bind(w, 1, ID.a)
    assert.equal(pair.lastSeenAt, null, 'no request seen yet')
    w.store.seen(pair.principalKey, at(FIXTURE.firstRequestOffset))
    await tick()
    return { key: pair.principalKey, written: w.store.pairOf(E(1)).lastSeenAt }
  }
  const after = (title, afterMs, updated) => async (w) => {
    const { key, written } = await lastWrite(w)
    w.store.seen(key, written + afterMs)
    await tick()
    assert.equal(w.store.pairOf(E(1)).lastSeenAt, updated ? written + afterMs : written, title)
  }
  row(sdk, CASE.bva05, '1', '0 s after the last write: unchanged', after('unchanged', seconds(0), false))
  row(sdk, CASE.bva05, '2', '59 s after the last write: unchanged', after('unchanged', PAIR_TIMING.lastSeenWriteIntervalMs - seconds(1), false))
  row(sdk, CASE.bva05, '3', '60 s after the last write: updated', after('updated', PAIR_TIMING.lastSeenWriteIntervalMs, true))
  row(sdk, CASE.bva05, '4', 'the first request after pairing: lastSeenAt equals its time', async (w) => {
    assert.equal((await lastWrite(w)).written, at(FIXTURE.firstRequestOffset))
  })
  todo(sdk, CASE.bva05, '5', 'a failed request (401) leaves lastSeenAt unchanged', LATER.seenCallSite)

  // NAME-BVA-01: length in code points after normalisation, through set_name on a named principal.
  const a = (n) => FIXTURE.fill.repeat(n)
  const composed = FIXTURE.decomposed.normalize(NAME_RULES.normalForm)
  const half = (NAME_MAX - 2) / 2
  const lengths = [
    ['1', '0', '', null],
    ['2', '1', a(1), a(1)],
    ['3', '2', a(2), a(2)],
    ['4', '63', a(NAME_MAX - 1), a(NAME_MAX - 1)],
    ['5', '64', a(NAME_MAX), a(NAME_MAX)],
    ['6', '65', a(NAME_MAX + 1), null],
    ['7', '66 raw, 64 after trimming one space each side', FIXTURE.space + a(NAME_MAX) + FIXTURE.space, a(NAME_MAX)],
    ['8', '64 raw with one double space inside (63)', a(half) + FIXTURE.space.repeat(2) + a(half), a(half) + FIXTURE.space + a(half)],
    ['9', '64 NFD code points that become 60 in NFC', FIXTURE.decomposed.repeat(FIXTURE.decomposedPairs) + a(NAME_MAX - 2 * FIXTURE.decomposedPairs),
      composed.repeat(FIXTURE.decomposedPairs) + a(NAME_MAX - 2 * FIXTURE.decomposedPairs)],
    ['10', '65 with a leading space (64)', FIXTURE.space + a(NAME_MAX), a(NAME_MAX)],
  ]
  for (const [n, length, input, stored] of lengths) {
    row(sdk, CASE.nameBva01, n, `${length}: ${stored === null ? 'name-invalid' : `ok (${codePoints(stored)} code points)`}`, async (w) => {
      await bind(w, 1, ID.a, NAME.watcher)
      if (stored === null) return assertRefused(w, () => setName(w, 1, input), refusal(REFUSAL.nameInvalid))
      assert.deepEqual(await setName(w, 1, input), { ok: true, name: stored })
    })
  }

  // NAME-BVA-03: concurrent pairing and naming (one serial registry, S3).
  row(sdk, CASE.nameBva03, '1', 'two unbound entries pair({name: "Fishball"}) at once: one gets it, the other pairs nameless with name-taken', async (w) => {
    const results = await Promise.all([1, 2].map((n) => w.store.pair(E(n), ID.crowd(n), NAME.fishball, at())))
    const named = results.filter((r) => r.name === NAME.fishball)
    assert.equal(named.length, 1, JSON.stringify(results))
    assert.deepEqual(named[0], assigned(named[0].id, NAME.fishball))
    const other = results.find((r) => r !== named[0])
    assert.deepEqual(other, nameRefused(other.id, REFUSAL.nameTaken))
    assertUniqueNames(w)
  })
  row(sdk, CASE.nameBva03, '2', `${FIXTURE.crowd} at once, all pair({}): all pair, all nameless`, async (w) => {
    const ns = Array.from({ length: FIXTURE.crowd }, (_, i) => i)
    const results = await Promise.all(ns.map((n) => w.store.pair(E(n), ID.crowd(n), undefined, at())))
    assert.deepEqual(results, ns.map((n) => paired(ID.crowd(n), null)))
    assert.equal(w.store.list().length, FIXTURE.crowd)
  })
  row(sdk, CASE.nameBva03, '3', 'pair({name}) races set_name(name) of an existing principal: exactly one holds it, either branch may win', async (w) => {
    await bind(w, 0, ID.race(0))
    for (let round = 1; round <= FIXTURE.raceRounds; round += 1) {
      const name = NAME.race(round)
      const [pairResult, setResult] = await Promise.all([w.store.pair(E(round), ID.race(round), name, at()), setName(w, 0, name)])
      const pairWon = pairResult.name === name
      assert.deepEqual(pairResult, pairWon ? assigned(ID.race(round), name) : nameRefused(ID.race(round), REFUSAL.nameTaken), `round ${round}`)
      assert.deepEqual(setResult, pairWon ? refusal(REFUSAL.nameTaken) : { ok: true, name }, `round ${round}`)
      assertUniqueNames(w)
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Decision Tables
// ---------------------------------------------------------------------------------------------

function decisionTables(sdk) {
  // AUTH-DT-02: E1 is the token's entry; "another id" is b, the caller's id is a.
  const dt02 = (n, title, fn) => row(sdk, CASE.dt02, n, title, fn)
  todo(sdk, CASE.dt02, '1', 'missing / expired / revoked / foreign-audience token: 401 + WWW-Authenticate', LATER.mcpEndpoint)
  dt02('2', 'pair-only, unbound, pair: pairs; the same token is full on the next request', async (w) => {
    assert.deepEqual(w.power(E(1), ID.a), NOT_PAIRED)
    assert.deepEqual(await w.store.pair(E(1), ID.a, undefined, at()), paired(ID.a, null))
    assert.deepEqual(w.power(E(1), ID.a), FULL)
  })
  dt02('3', 'pair-only, unbound, another call: insufficient_scope (not-paired)', (w) => {
    assert.deepEqual(w.power(E(1), ID.a), NOT_PAIRED)
  })
  dt02('4', 'pair-only, bound to another id, pair: already-paired, idMatches false', async (w) => {
    const bound = await bind(w, 1, ID.b)
    await assertRefused(w, () => w.store.pair(E(1), ID.a, undefined, at()), alreadyPaired(false, bound))
  })
  dt02('5', 'pair-only, bound to another id, another call: insufficient_scope (id-mismatch)', async (w) => {
    await bind(w, 1, ID.b)
    assert.deepEqual(w.power(E(1), ID.a), ID_MISMATCH)
  })
  dt02('6', 'full, pair: already-paired, idMatches true', async (w) => {
    const bound = await bind(w, 1, ID.a)
    await assertRefused(w, () => w.store.pair(E(1), ID.a, undefined, at()), alreadyPaired(true, bound))
  })
  dt02('7', 'full, any other call: proceeds', async (w) => {
    await bind(w, 1, ID.a)
    assert.deepEqual(w.power(E(1), ID.a), FULL)
  })
  dt02('8', 'pair-only issued while unbound, entry since bound by another client: id-mismatch (live)', async (w) => {
    assert.deepEqual(w.power(E(1), ID.a), NOT_PAIRED)
    await bind(w, 1, ID.b)
    assert.deepEqual(w.power(E(1), ID.a), ID_MISMATCH)
  })
  dt02('9', 'pair-only issued while unbound, entry since bound by this token: proceeds', async (w) => {
    assert.deepEqual(w.power(E(1), ID.a), NOT_PAIRED)
    await bind(w, 1, ID.a)
    assert.deepEqual(w.power(E(1), ID.a), FULL)
  })
  dt02('10', 'pair-only, unbound, id held by another entry, pair: id-taken; the token stays unpaired', async (w) => {
    await bind(w, 2, ID.a)
    await assertRefused(w, () => w.store.pair(E(1), ID.a, undefined, at()), refusal(REFUSAL.idTaken))
    assert.equal(w.store.pairOf(E(1)), undefined)
    assert.deepEqual(w.power(E(1), ID.a), NOT_PAIRED)
  })
  for (const n of ['3', '5', '7']) todo(sdk, CASE.dt02, `${n} (endpoint)`, 'the HTTP outcome of that power at the MCP endpoint', LATER.mcpEndpoint)

  // NAME-DT-01: pair({name?}); "held by another" = a principal holds "Fishball".
  const dt01 = [
    ['1', 'no name', undefined, () => paired(ID.b, null)],
    ['2', 'valid and free', NAME.bob, () => assigned(ID.b, NAME.bob)],
    ['3', 'valid and held by another', NAME.fishballLower, () => nameRefused(ID.b, REFUSAL.nameTaken)],
    ['4', 'invalid after normalisation', NAME.blank, () => nameRefused(ID.b, REFUSAL.nameInvalid)],
    ['5', '"Fishball-2", no longer special, free', NAME.fishball2, () => assigned(ID.b, NAME.fishball2)],
  ]
  for (const [n, title, name, expected] of dt01) {
    row(sdk, CASE.nameDt01, n, `${title}: paired, ${JSON.stringify(expected())}`, async (w) => {
      await holders(w, [NAME.fishball])
      assert.deepEqual(await w.store.pair(E(1), ID.b, name, at()), expected())
      assert.equal(w.store.pairOf(E(1)).id, ID.b, 'paired whatever the name outcome')
    })
  }

  // NAME-DT-02: set_name by B (named "Bob"); another principal holds "Ops".
  const dt02Name = (n, title, sets, check) => row(sdk, CASE.nameDt02, n, title, async (w) => {
    await holders(w, [NAME.ops])
    await bind(w, 1, ID.b, NAME.bob)
    await check(w, () => setName(w, 1, sets))
  })
  dt02Name('1', 'invalid: name-invalid, unchanged', NAME.blank, (w, call) => assertRefused(w, call, refusal(REFUSAL.nameInvalid)))
  dt02Name('2', 'held by another (folded): name-taken, unchanged', NAME.ops.toUpperCase(), (w, call) => assertRefused(w, call, refusal(REFUSAL.nameTaken)))
  dt02Name('3', 'own name, same case: ok, nothing else changes', NAME.bob, async (w, call) => {
    const before = w.snapshot()
    const notified = changes(w)
    assert.deepEqual(await call(), { ok: true, name: NAME.bob })
    assert.deepEqual(w.snapshot(), before)
    assert.equal(notified.count, 0, 'no notification')
    notified.off()
  })
  dt02Name('4', 'own name, other case: ok, the new case is stored', NAME.bob.toUpperCase(), async (w, call) => {
    assert.deepEqual(await call(), { ok: true, name: NAME.bob.toUpperCase() })
    assert.equal(w.store.pairOf(E(1)).name, NAME.bob.toUpperCase())
  })
  dt02Name('5', 'free: ok, new name stored and the old one freed', NAME.watcher, async (w, call) => {
    assert.deepEqual(await call(), { ok: true, name: NAME.watcher })
    await bind(w, 2, ID.x)
    assert.deepEqual(await setName(w, 2, NAME.bob), { ok: true, name: NAME.bob }, 'the old name is free')
  })
}

// ---------------------------------------------------------------------------------------------
// State Transitions
// ---------------------------------------------------------------------------------------------

function stateTransitions(sdk) {
  // AUTH-ST-01 rows 2–4, 11, 13, 14 (the rest is C-TOKENS'). X = a, Y = b.
  const st01 = (n, title, fn) => row(sdk, CASE.st01, n, title, fn)
  st01('2', 'Ready → pair with X → Bound(X), pairedAt set', async (w) => {
    assert.deepEqual(await w.store.pair(E(1), ID.a, undefined, at(FIXTURE.t1Offset)), paired(ID.a, null))
    const pair = w.store.pairOf(E(1))
    assert.equal(pair.id, ID.a)
    assert.equal(pair.pairedAt, at(FIXTURE.t1Offset))
  })
  st01('3', 'Bound(X) → pair with X → Bound(X), already-paired idMatches true', async (w) => {
    const bound = await bind(w, 1, ID.a)
    await assertRefused(w, () => w.store.pair(E(1), ID.a, undefined, at()), alreadyPaired(true, bound))
  })
  st01('4', 'Bound(X) → pair with Y → Bound(X), already-paired idMatches false', async (w) => {
    const bound = await bind(w, 1, ID.a)
    await assertRefused(w, () => w.store.pair(E(1), ID.b, undefined, at()), alreadyPaired(false, bound))
  })
  st01('11', 'Bound(X) → any "unpair": no such operation exists; stays Bound(X)', async (w) => {
    const bound = await bind(w, 1, ID.a)
    const own = new Set([...Object.keys(w.store), ...Object.getOwnPropertyNames(Object.getPrototypeOf(w.store) ?? {})])
    assert.deepEqual([...own, ...pairStoreMembers()].filter((name) => SUBJECT.unbindName.test(name)), [], 'no unpair operation')
    assert.deepEqual(w.store.pairOf(E(1)), bound)
  })
  st01('13', 'Ready → pair × 2 concurrently → Bound(one id); the other gets already-paired', async (w) => {
    const results = await Promise.all([ID.a, ID.b].map((id) => w.store.pair(E(1), id, undefined, at())))
    assert.equal(results.filter((r) => r.ok).length, 1, JSON.stringify(results))
    const bound = w.store.pairOf(E(1))
    assert.deepEqual(results.find((r) => !r.ok), alreadyPaired(false, bound))
    assert.deepEqual(results.find((r) => r.ok), paired(bound.id, null))
  })

  // NAME-ST-01 rows 1–7 (rows 8–9 are C-SUCCEED's).
  const nameSt = (n, title, fn) => row(sdk, CASE.nameSt01, n, title, fn)
  nameSt('1', '(unpaired) → pair without a usable name → Nameless, shown as ID: <id>', async (w) => {
    await holders(w, [NAME.ops])
    await w.store.pair(E(1), ID.a, NAME.ops, at())
    assert.deepEqual(labelOf(w.store.pairOf(E(1))), principalLabel(null, ID.a))
  })
  nameSt('2', '(unpaired) → pair with free name N → Named(N)', async (w) => {
    await w.store.pair(E(1), ID.a, NAME.bob, at())
    assert.equal(w.store.pairOf(E(1)).name, NAME.bob)
  })
  nameSt('3', 'Nameless → another principal renames → Nameless (never named by others)', async (w) => {
    await bind(w, 1, ID.a)
    await bind(w, 2, ID.b, NAME.bob)
    await setName(w, 2, NAME.watcher)
    assert.equal(w.store.pairOf(E(1)).name, null)
  })
  nameSt('4', 'Nameless → set_name(N) free → Named(N); ID: <id> replaced by N', async (w) => {
    await bind(w, 1, ID.a)
    assert.deepEqual(await setName(w, 1, NAME.bob), { ok: true, name: NAME.bob })
    assert.deepEqual(labelOf(w.store.pairOf(E(1))), { name: NAME.bob })
  })
  nameSt('5', 'Named(N) → set_name(M) taken → Named(N), name-taken', async (w) => {
    await bind(w, 1, ID.a, NAME.bob)
    await bind(w, 2, ID.b, NAME.ops)
    await assertRefused(w, () => setName(w, 1, NAME.ops), refusal(REFUSAL.nameTaken))
    assert.equal(w.store.pairOf(E(1)).name, NAME.bob)
  })
  nameSt('6', 'Named(N) → set_name(M) free → Named(M); N freed for anyone', async (w) => {
    await bind(w, 1, ID.a, NAME.bob)
    await bind(w, 2, ID.b)
    await setName(w, 1, NAME.watcher)
    assert.equal(w.store.pairOf(E(1)).name, NAME.watcher)
    assert.deepEqual(await setName(w, 2, NAME.bob), { ok: true, name: NAME.bob })
  })
  nameSt('7', 'any → entry deleted → (gone); its name (and id, R-ID-13) freed', async (w) => {
    const gone = await bind(w, 1, ID.a, NAME.bob)
    await w.store.remove(E(1))
    assert.equal(w.store.pairOf(E(1)), undefined)
    assert.equal(w.store.byPrincipal(gone.principalKey), undefined)
    assert.deepEqual(await w.store.pair(E(2), ID.a, NAME.bob, at()), assigned(ID.a, NAME.bob))
  })
}

/** Every C-PAIR case on one SDK: Use Cases first, then EP, BVA, DT and ST. */
export function registerCPairCases(sdk) {
  useCases(sdk)
  equivalencePartitions(sdk)
  boundaryValues(sdk)
  decisionTables(sdk)
  stateTransitions(sdk)
}

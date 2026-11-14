/**
 * F-PAIR black-box cases (v3-tasks.md row F-PAIR; .runtime/reports/v3-w3-briefs.md "F-PAIR test
 * brief"): AUTH-UC-05 (decisions; the page parts are E2E-CORE's), AUTH-DT-06, AUTH-ST-03 (the rows
 * that are not the warning's UI), NAME-UC-02 (core part), NAME-DT-03 (core reaction), and
 * `token-revoked` (F-PAIR owns it): AUTH-ST-03 row 10 and HOST-UC-04 main as core sees it. A token
 * core holds a paired record for, when refused, gives state `token-refused` with code
 * `token-revoked`; a token it never paired with gives `TOKEN_REFUSED` (K3 child.d.ts).
 * Requirements R-ID-02/05/07/10/13, R-OA-18/19, R-FB-04, R-NAME-02/03/05, R-HOST-10.
 *
 * Techniques, and only the five of the test-design README: Use Case first (AUTH-UC-05,
 * NAME-UC-02, HOST-UC-04: each test names its flow step), then EP (AUTH-EP-03 rows 2c/2d and the
 * `token-revoked` partitions), BVA (AUTH-BVA-02 at core's settings validator), Decision Table
 * (AUTH-DT-06, NAME-DT-03: one test per rule) and State Transition (AUTH-ST-03: one test per
 * transition, plus one invalid transition).
 *
 * Level: unit, as AUTH-DT-06 says ("core with a fake link"): core's pairing module (subject.mjs
 * names its assumed entry) driving core's own link against a fake connector on loopback
 * (fake-connector.mjs, F-PAIR's own copy of the F-LINK pattern) whose pair registry follows K1's
 * rules. The NAME-UC-02 rows are integration: the same fake HTTP surface over C-PAIR's real merged
 * pair store in real DSH storage. Rows that need a later task are `todo` and name it.
 */
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { caseTest } from '../shared/cases.mjs'
import { pairWorld } from '../c-pair/subject.mjs'
import { CODE, CUSTOM_TOKEN_FIELD, FIXTURE, GENERATION_SAMPLE, HARNESS, IDENTITY, ID_ROWS, K1, LATER, NAME, SETTING, STATE, SUBJECT, WEB, mcpUrl, token } from './constants.mjs'
import { FakePairs, startFakeConnector } from './fake-connector.mjs'
import { defer, identityModule, pairingWorld, untilTrue } from './subject.mjs'

/** The fake token registry's entries: core's token, the "new token" of A2 / ST-03 row 7, another agent's. */
const ENTRY = Object.freeze({ core: FIXTURE.entry(1), next: FIXTURE.entry(2), other: FIXTURE.entry(9) })

/**
 * One world: core's token (ENTRY.core, under FIXTURE.ref) and a second, unbound token
 * (ENTRY.next, under FIXTURE.refNext) in the credential store, core's `identity.id` =
 * FIXTURE.coreId unless `settings` says otherwise. `bind` pre-binds entries before core starts:
 * `[entryKey, id, name?]` (another client paired them).
 */
async function world(t, sdk, { bind = [], settings = {}, store, coreEnabled = true, extraTokenFields, start = true } = {}) {
  const secrets = { core: token(), next: token(), other: token() }
  const entries = [
    { entryKey: ENTRY.core, secret: secrets.core, enabled: coreEnabled },
    { entryKey: ENTRY.next, secret: secrets.next },
    { entryKey: ENTRY.other, secret: secrets.other },
  ]
  const pairs = store ?? new FakePairs()
  for (const [entryKey, id, name] of bind) await pairs.pair(entryKey, id, name, FIXTURE.pairedAt)
  const w = await pairingWorld(t, sdk, {
    entries,
    refs: { [FIXTURE.ref]: secrets.core, [FIXTURE.refNext]: secrets.next },
    settings: { [IDENTITY.idKey]: FIXTURE.coreId, [SETTING.tokenRef]: FIXTURE.ref, ...settings },
    store: pairs,
    extraTokenFields,
    start,
  })
  return Object.assign(w, { secrets })
}

/** AUTH-UC-05 main: a fresh token pairs, the record is written and core works. */
async function pairedWorld(t, sdk, options) {
  const w = await world(t, sdk, options)
  await w.untilView('paired')
  await w.untilStatus(STATE.connected)
  return w
}
/** A1 / DT-06 rule 2 / ST-03 row 2: the token is already bound to core's own id (core has no record). */
async function warnMatchWorld(t, sdk) {
  const w = await world(t, sdk, { bind: [[ENTRY.core, FIXTURE.coreId, FIXTURE.boundName]] })
  await w.untilView('warnMatch')
  return w
}
/** A3 / DT-06 rule 3 / ST-03 row 6: the token is bound to another id. */
async function warnMismatchWorld(t, sdk) {
  const w = await world(t, sdk, { bind: [[ENTRY.core, FIXTURE.otherId, FIXTURE.boundName]] })
  await w.untilView('warnMismatch')
  return w
}
/** A5 / DT-06 rule 10 / ST-03 row 12: another entry holds core's id. */
async function needIdWorld(t, sdk) {
  const w = await world(t, sdk, { bind: [[ENTRY.other, FIXTURE.coreId]] })
  await w.untilView('needId')
  return w
}

const pairCalls = (w) => w.f.callsOf(K1.TOOL.pair)
const setNameCalls = (w) => w.f.callsOf(K1.TOOL.setName)
const lastPairResult = (w) => pairCalls(w).at(-1)?.result

/** Neither the paired records nor any log line holds a token value or an access token (R-ID-07: non-secret). */
function assertNoSecretKept(w) {
  const secrets = [...Object.values(w.secrets), ...w.f.issuedTokens()]
  const kept = JSON.stringify({ records: w.records.all(), logs: w.logger.lines })
  assert.deepEqual(secrets.filter((s) => kept.includes(s)).map((s) => s.slice(0, K1.TOKEN_VALUE.generatedPrefix.length) + '…'), [], 'a secret is in a paired record or a log line')
}

/**
 * AUTH-UC-05 E1 / DT-06 rule 8: with the warning open the connector sees no request of any kind,
 * not even after a rename (no `set_name`), and core holds no subscription.
 */
async function assertSilentWhileWarning(w) {
  const before = w.f.requests.length
  await sleep(HARNESS.quietMs)
  w.settings.save(IDENTITY.nameKey, NAME.renamed)
  await sleep(HARNESS.quietMs)
  const after = w.f.requests.slice(before).map((r) => `${r.method} ${r.path}`)
  assert.deepEqual(after, [], 'core sent requests while the warning was open')
  assert.deepEqual(w.f.eventListens().length, 0, 'core holds a subscriptions/listen stream while the warning is open')
  assert.deepEqual(w.f.calls.filter((c) => c.name !== K1.TOOL.pair).map((c) => c.name), [], 'a tool other than pair was called')
}

/** Token requests made after request index `from`, by secret. */
const secretsSince = (w, from) => w.f.tokenSecrets().slice(from)

export function registerFPairCases(sdk) {
  // ================================================================ Use Cases (first)
  // ---------------------------------------------------------------- AUTH-UC-05
  caseTest(sdk, 'AUTH-UC-05', 'main 1', `no record: core authenticates as identity.id and calls pair({name: identity.name}), default "${IDENTITY.defaultName}"`, async (t) => {
    const w = await pairedWorld(t, sdk)
    assert.deepEqual(pairCalls(w).map((c) => ({ clientId: c.clientId, entryKey: c.entryKey, name: c.args?.name })), [{ clientId: FIXTURE.coreId, entryKey: ENTRY.core, name: IDENTITY.defaultName }])
    assert.deepEqual([...new Set(w.f.tokenClientIds())], [FIXTURE.coreId], 'a token request used a client id other than identity.id (R-FB-04)')
  })

  caseTest(sdk, 'AUTH-UC-05', 'main 2', 'pair succeeds: core writes one non-secret record and works (opens its events listen stream)', async (t) => {
    const w = await pairedWorld(t, sdk)
    assert.equal(w.records.size, 1, `records after pairing: ${JSON.stringify(w.records.all())}`)
    assert.ok(await untilTrue(() => w.f.eventListens().length > 0), 'core does not listen on fishball://events after pairing')
    assertNoSecretKept(w)
  })

  caseTest(sdk, 'AUTH-UC-05', 'main 3', 'every later reconnect skips pair (R-ID-05)', async (t) => {
    const w = await pairedWorld(t, sdk)
    const listens = w.f.eventListens().length
    await w.f.drop()
    await w.untilStatus(STATE.unreachable)
    await w.f.restore()
    await w.untilStatus(STATE.connected)
    assert.ok(await untilTrue(() => w.f.eventListens().length > listens), 'core did not listen again after the reconnect')
    await sleep(HARNESS.quietMs)
    assert.equal(pairCalls(w).length, 1, 'pair was called again on reconnect')
  })

  caseTest(sdk, 'AUTH-UC-05', 'A1', 'already-paired, idMatches true: warning naming the bound pair\'s name and lastSeenAt, with both choices', async (t) => {
    const w = await warnMatchWorld(t, sdk)
    const { bound } = lastPairResult(w)
    assert.equal(bound.idMatches, true)
    const { warning } = w.view()
    assert.ok(warning, `no warning in the view: ${JSON.stringify(w.view())}`)
    assert.equal(warning.idMatches, true)
    assert.equal(warning.name, FIXTURE.boundName)
    assert.equal(warning.lastSeenAt, bound.lastSeenAt, 'the warning does not show the bound pair\'s lastSeenAt')
    assert.deepEqual([...warning.choices].sort(), [w.choice('continue'), w.choice('newToken')].sort())
    assert.equal(w.records.size, 0, 'a record exists before Continue')
  })

  caseTest(sdk, 'AUTH-UC-05', 'A1 (Continue)', 'Continue writes the record and core works, without another pair call', async (t) => {
    const w = await warnMatchWorld(t, sdk)
    await w.pairing.choose(w.choice('continue'))
    await w.untilView('paired')
    await w.untilStatus(STATE.connected)
    assert.equal(w.records.size, 1)
    assert.equal(pairCalls(w).length, 1, 'Continue sent pair again')
    assert.ok(await untilTrue(() => w.f.eventListens().length > 0), 'core does not listen after Continue')
    assertNoSecretKept(w)
  })

  caseTest(sdk, 'AUTH-UC-05', 'A1 (page)', 'the warning, its tick and the disabled-until-ticked Continue button on the Fishball page', null, LATER.page)

  caseTest(sdk, 'AUTH-UC-05', 'A2', 'Use a new token and a new id: core stops using the old token, then pairs again with the new reference and id', async (t) => {
    const w = await warnMatchWorld(t, sdk)
    await w.pairing.choose(w.choice('newToken'))
    await w.untilView('needToken')
    const from = w.f.tokenRequests().length
    await sleep(HARNESS.quietMs)
    assert.deepEqual(secretsSince(w, from).filter((s) => s === w.secrets.core).length, 0, 'core used the old token after choosing a new one')
    w.settings.save(SETTING.tokenRef, FIXTURE.refNext)
    w.settings.save(IDENTITY.idKey, FIXTURE.coreIdNext)
    await w.untilView('paired')
    const last = pairCalls(w).at(-1)
    assert.deepEqual({ entryKey: last.entryKey, clientId: last.clientId }, { entryKey: ENTRY.next, clientId: FIXTURE.coreIdNext })
    assert.equal(secretsSince(w, from).filter((s) => s === w.secrets.core).length, 0, 'the old token was used again')
  })

  caseTest(sdk, 'AUTH-UC-05', 'A5', 'id-taken: core asks for a new identity.id and keeps the token; once changed it pairs again with the same token', async (t) => {
    const w = await needIdWorld(t, sdk)
    assert.equal(lastPairResult(w).code, K1.REFUSAL.idTaken)
    assert.equal(w.records.size, 0)
    assert.equal(w.settings.get(SETTING.tokenRef), FIXTURE.ref, 'the token reference changed on id-taken')
    w.settings.save(IDENTITY.idKey, FIXTURE.coreIdNext)
    await w.untilView('paired')
    assert.deepEqual(pairCalls(w).map((c) => [c.entryKey, c.clientId]), [[ENTRY.core, FIXTURE.coreId], [ENTRY.core, FIXTURE.coreIdNext]], 'the second pair did not use the same token with the new id')
    assert.deepEqual([...new Set(w.f.tokenSecrets())], [w.secrets.core], 'core used another token')
  })

  caseTest(sdk, 'AUTH-UC-05', 'A3', 'idMatches false: only Use a new token is offered', async (t) => {
    const w = await warnMismatchWorld(t, sdk)
    assert.equal(lastPairResult(w).bound.idMatches, false)
    assert.deepEqual(w.view().warning?.choices, [w.choice('newToken')])
    assert.equal(w.records.size, 0)
  })

  caseTest(sdk, 'AUTH-UC-05', 'A4', 'identity.id changed after pairing: the next token is pair-only, core does not call pair and is not connected', async (t) => {
    const w = await pairedWorld(t, sdk)
    assert.deepEqual(w.settings.save(IDENTITY.idKey, FIXTURE.coreIdNext), { ok: true })
    const from = w.f.tokenRequests().length
    await w.f.drop()
    await w.f.restore()
    await w.untilView('idMismatch')
    assert.ok(w.f.tokenClientIds().slice(from).includes(FIXTURE.coreIdNext), 'no token request with the new id after the reconnect')
    await sleep(HARNESS.quietMs)
    assert.equal(pairCalls(w).length, 1, 'core called pair again while holding a paired record')
    assert.notEqual(w.status().state, STATE.connected)
  })

  caseTest(sdk, 'AUTH-UC-05', 'E1', 'while the warning is open core sends nothing else: no tool call, no subscription, no set_name', async (t) => {
    await assertSilentWhileWarning(await warnMatchWorld(t, sdk))
  })

  caseTest(sdk, 'AUTH-UC-05', 'post', 'no record after a warning or id-taken; the records hold no token value or access token', async (t) => {
    for (const open of [warnMatchWorld, warnMismatchWorld, needIdWorld]) {
      await t.test(open.name, async (st) => {
        const w = await open(st, sdk)
        assert.equal(w.records.size, 0)
        assertNoSecretKept(w)
      })
    }
  })

  // ---------------------------------------------------------------- NAME-UC-02 (core part; real C-PAIR store)
  /** HF paired as "Fishball" on C-PAIR's real store, while another principal holds "Ops". */
  async function namedWorld(t) {
    // The pairing stops before the store closes: open the defer stack first (node:test runs t.after in order).
    defer(t, () => {})
    const pairs = await pairWorld(t, sdk)
    const w = await pairedWorld(t, sdk, { store: pairs.store, bind: [[ENTRY.other, FIXTURE.otherId, NAME.other]] })
    assert.equal(pairs.store.pairOf(ENTRY.core)?.name, IDENTITY.defaultName, 'precondition: HF is paired as "Fishball"')
    return Object.assign(w, { name: () => pairs.store.pairOf(ENTRY.core)?.name, id: () => pairs.store.pairOf(ENTRY.core)?.id })
  }
  /** The owner saves `identity.name`; resolves once core's set_name for it has been answered. */
  async function rename(w, value) {
    const before = setNameCalls(w).length
    w.settings.save(IDENTITY.nameKey, value)
    assert.ok(await untilTrue(() => setNameCalls(w).slice(before).some((c) => c.result !== undefined)), `no set_name after setting identity.name = ${JSON.stringify(value)}`)
    return setNameCalls(w).slice(before)
  }

  caseTest(sdk, 'NAME-UC-02', 'main 1–2', `identity.name = "${NAME.renamed}": core calls set_name with it and the connector holds it`, async (t) => {
    const w = await namedWorld(t)
    const calls = await rename(w, NAME.renamed)
    assert.deepEqual(calls.map((c) => c.args), [{ name: NAME.renamed }])
    assert.equal(w.name(), NAME.renamed)
    assert.equal(w.view().nameClash, null)
  })

  caseTest(sdk, 'NAME-UC-02', 'main 3', 'the new name shows on the managed mark, Hand over, the token entry status and later notes', null, LATER.marks)

  caseTest(sdk, 'NAME-UC-02', 'A1', `a case-only change "${NAME.ownCaseOnly}" is accepted and stored`, async (t) => {
    const w = await namedWorld(t)
    await rename(w, NAME.ownCaseOnly)
    assert.equal(w.name(), NAME.ownCaseOnly)
    assert.equal(w.view().nameClash, null)
  })

  caseTest(sdk, 'NAME-UC-02', 'A2', 'the link was down during the change: after the reconnect core calls set_name with the current setting', async (t) => {
    const w = await namedWorld(t)
    await w.f.drop()
    await w.untilStatus(STATE.unreachable)
    w.settings.save(IDENTITY.nameKey, NAME.renamed)
    await w.f.restore()
    await w.untilStatus(STATE.connected)
    assert.ok(await untilTrue(() => w.name() === NAME.renamed), `the connector still holds ${JSON.stringify(w.name())}`)
    assert.deepEqual(setNameCalls(w).at(-1)?.args, { name: NAME.renamed })
  })

  caseTest(sdk, 'NAME-UC-02', 'E1', `"${NAME.otherFolded}" is name-taken: the clash names "${IDENTITY.defaultName}" (in use) and core keeps working`, async (t) => {
    const w = await namedWorld(t)
    const [call] = await rename(w, NAME.otherFolded)
    assert.equal(call.result.code, K1.REFUSAL.nameTaken)
    assert.ok(await untilTrue(() => w.view().nameClash !== null))
    assert.deepEqual(w.view().nameClash, { code: K1.REFUSAL.nameTaken, nameInUse: IDENTITY.defaultName })
    assert.equal(w.name(), IDENTITY.defaultName)
    assert.equal(w.status().state, STATE.connected)
  })

  caseTest(sdk, 'NAME-UC-02', 'E2', 'a 65-character name is name-invalid, shown the same way with its reason; the name stays', async (t) => {
    const w = await namedWorld(t)
    const [call] = await rename(w, NAME.tooLong)
    assert.equal(call.result.code, K1.REFUSAL.nameInvalid)
    assert.ok(await untilTrue(() => w.view().nameClash !== null))
    assert.deepEqual(w.view().nameClash, { code: K1.REFUSAL.nameInvalid, nameInUse: IDENTITY.defaultName })
    assert.equal(w.name(), IDENTITY.defaultName)
    assert.equal(w.status().state, STATE.connected)
  })

  caseTest(sdk, 'NAME-UC-02', 'E3', 'clearing identity.name: core calls set_name({name: null}) and the principal is nameless', async (t) => {
    const w = await namedWorld(t)
    const calls = await rename(w, IDENTITY.cleared)
    assert.deepEqual(calls.map((c) => c.args), [{ name: null }])
    assert.equal(w.name(), null)
  })

  caseTest(sdk, 'NAME-UC-02', 'post', 'no rename changes the id', async (t) => {
    const w = await namedWorld(t)
    for (const value of [NAME.renamed, NAME.otherFolded, NAME.tooLong, IDENTITY.cleared]) await rename(w, value)
    assert.equal(w.id(), FIXTURE.coreId)
    assert.equal(w.settings.get(IDENTITY.idKey), FIXTURE.coreId)
  })

  caseTest(sdk, 'NAME-UC-02', 'page', 'the Fishball page line for name-taken / name-invalid', null, LATER.page)

  // ---------------------------------------------------------------- HOST-UC-04 (main, as core sees it)
  caseTest(sdk, 'HOST-UC-04', 'main', `the entry is switched off: core reports ${STATE.refused} / ${CODE.revoked}; re-enabling restores the same principal with no pair`, async (t) => {
    const w = await pairedWorld(t, sdk)
    const principal = w.f.store.pairOf(ENTRY.core).principalKey
    w.f.setEnabled(ENTRY.core, false)
    const status = await w.untilStatus(STATE.refused)
    assert.equal(status.code, CODE.revoked)
    w.f.setEnabled(ENTRY.core, true)
    await w.untilStatus(STATE.connected)
    assert.equal(w.f.store.pairOf(ENTRY.core).principalKey, principal)
    assert.equal(pairCalls(w).length, 1, 'core paired again after re-enabling')
  })

  // ================================================================ Equivalence Partitioning
  // ---------------------------------------------------------------- identity.id (R-ID-10, AUTH-EP-03 rows 2c, 2d)
  caseTest(sdk, 'AUTH-EP-03', '2d', 'generateId: fb- + 16 lowercase base32 characters, no dot, never repeating', async () => {
    const mod = await identityModule(sdk)
    const ids = Array.from({ length: GENERATION_SAMPLE }, () => mod[SUBJECT.generateId]())
    assert.deepEqual(ids.filter((id) => !IDENTITY.generated.test(id)), [])
    assert.deepEqual(ids.filter((id) => !K1.isFishballId(id)), [], 'a generated id is not a valid fishball id')
    assert.equal(new Set(ids).size, ids.length, 'generated ids repeat')
  })

  caseTest(sdk, 'AUTH-EP-03', '2d (first start)', 'no identity.id: core generates one at first start, authenticates with it and keeps it across a restart', async (t) => {
    const w = await world(t, sdk, { settings: { [IDENTITY.idKey]: undefined } })
    await w.untilView('paired')
    const id = w.settings.get(IDENTITY.idKey)
    assert.match(id ?? '', IDENTITY.generated)
    assert.deepEqual([...new Set(w.f.tokenClientIds())], [id])
    await w.restart()
    await w.untilStatus(STATE.connected)
    assert.equal(w.settings.get(IDENTITY.idKey), id, 'the id was generated again')
    assert.equal(pairCalls(w).length, 1)
  })

  caseTest(sdk, 'AUTH-EP-03', '2c', 'saving identity.id = "fb.1" is refused id-invalid; the previous id stays and core never sends fb.1', async (t) => {
    const w = await pairedWorld(t, sdk)
    const dotted = ID_ROWS.invalid[0][2]
    assert.deepEqual(w.settings.save(IDENTITY.idKey, dotted), { ok: false, code: IDENTITY.idInvalid })
    assert.equal(w.settings.get(IDENTITY.idKey), FIXTURE.coreId)
    await w.f.drop()
    await w.f.restore()
    await w.untilStatus(STATE.connected)
    assert.ok(!w.f.tokenClientIds().includes(dotted), 'core sent the refused id')
    assert.equal(pairCalls(w).length, 1)
  })

  for (const [row, what, value] of ID_ROWS.valid.filter(([r]) => r.startsWith('EP'))) {
    caseTest(sdk, 'AUTH-EP-03', row.replace('EP-03 row ', ''), `core's checkId accepts ${what} (${JSON.stringify(value)})`, async () => {
      assert.deepEqual((await identityModule(sdk))[SUBJECT.checkId](value), { ok: true })
    })
  }
  for (const [row, what, value] of ID_ROWS.invalid.filter(([r]) => r.startsWith('EP'))) {
    caseTest(sdk, 'AUTH-EP-03', `${row.replace('EP-03 row ', '')} (${what})`, `core's checkId refuses ${what} with id-invalid`, async () => {
      assert.deepEqual((await identityModule(sdk))[SUBJECT.checkId](value), { ok: false, code: IDENTITY.idInvalid })
    })
  }

  // ---------------------------------------------------------------- token-revoked partitions (R-HOST-10, K3 child.d.ts)
  caseTest(sdk, 'TOKEN-REVOKED', 'EP 1', `a token core never paired with is refused → ${STATE.refused} / ${CODE.refused}`, async (t) => {
    const w = await world(t, sdk, { coreEnabled: false })
    const status = await w.untilStatus(STATE.refused)
    assert.equal(status.code, CODE.refused)
    assert.equal(w.records.size, 0)
    assert.deepEqual(pairCalls(w), [])
  })

  caseTest(sdk, 'TOKEN-REVOKED', 'EP 2', `a token core paired with is refused → ${STATE.refused} / ${CODE.revoked}`, async (t) => {
    const w = await pairedWorld(t, sdk)
    w.f.setEnabled(ENTRY.core, false)
    assert.equal((await w.untilStatus(STATE.refused)).code, CODE.revoked)
  })

  caseTest(sdk, 'TOKEN-REVOKED', 'EP 3', `the record survives a restart: still ${CODE.revoked} (Q-10: core cannot tell why)`, async (t) => {
    const w = await pairedWorld(t, sdk)
    w.f.setEnabled(ENTRY.core, false)
    await w.untilStatus(STATE.refused)
    await w.restart()
    assert.equal((await w.untilStatus(STATE.refused)).code, CODE.revoked)
  })

  caseTest(sdk, 'TOKEN-REVOKED', 'EP 4', `a refused token under another reference than the paired one → ${CODE.refused} (the record is per target and reference)`, async (t) => {
    const w = await pairedWorld(t, sdk)
    w.f.setEnabled(ENTRY.next, false)
    w.settings.save(SETTING.tokenRef, FIXTURE.refNext)
    await untilTrue(() => w.f.tokenSecrets().includes(w.secrets.next))
    assert.equal((await w.untilStatus(STATE.refused)).code, CODE.refused)
  })

  caseTest(sdk, 'AUTH-UC-05', 'main 1 (per target)', 'a record for one target does not skip pair at another target with the same reference', async (t) => {
    const w = await pairedWorld(t, sdk)
    const other = await startFakeConnector({ store: new FakePairs(), entries: [{ entryKey: ENTRY.core, secret: w.secrets.core }] })
    defer(t, () => other.stop())
    await w.stop()
    w.settings.save(SETTING.url, mcpUrl(other.port))
    await w.start()
    assert.ok(await untilTrue(() => other.callsOf(K1.TOOL.pair).length === 1), 'core did not pair at the second target')
  })

  // ================================================================ Boundary Value Analysis
  for (const [row, what, value] of [...ID_ROWS.valid, ...ID_ROWS.invalid].filter(([r]) => r.startsWith('BVA'))) {
    const valid = ID_ROWS.valid.some(([r]) => r === row)
    caseTest(sdk, 'AUTH-BVA-02', row.replace('BVA-02 row ', ''), `identity.id of ${what}: core's checkId ${valid ? 'accepts' : 'refuses (id-invalid)'}`, async () => {
      assert.deepEqual((await identityModule(sdk))[SUBJECT.checkId](value), valid ? { ok: true } : { ok: false, code: IDENTITY.idInvalid })
    })
  }

  // ================================================================ Decision Tables
  // ---------------------------------------------------------------- AUTH-DT-06
  caseTest(sdk, 'AUTH-DT-06', 'rule 1', 'absent, pair-only, pair ok → write the record; work', async (t) => {
    const w = await pairedWorld(t, sdk)
    assert.equal(w.records.size, 1)
    assert.equal(pairCalls(w).length, 1)
  })

  caseTest(sdk, 'AUTH-DT-06', 'rule 2', 'absent, full scope → pair → already-paired (match) → warning with Continue and New token', async (t) => {
    const w = await warnMatchWorld(t, sdk)
    assert.equal(pairCalls(w).length, 1)
    assert.deepEqual([...w.view().warning.choices].sort(), [w.choice('continue'), w.choice('newToken')].sort())
  })

  caseTest(sdk, 'AUTH-DT-06', 'rule 3', 'absent, pair-only bound to another id → already-paired (mismatch) → New token only', async (t) => {
    const w = await warnMismatchWorld(t, sdk)
    assert.deepEqual(w.view().warning.choices, [w.choice('newToken')])
  })

  caseTest(sdk, 'AUTH-DT-06', 'rule 4', 'present, full scope → pair not called; work', async (t) => {
    const w = await pairedWorld(t, sdk)
    await w.restart()
    await w.untilStatus(STATE.connected)
    await w.untilView('paired')
    await sleep(HARNESS.quietMs)
    assert.equal(pairCalls(w).length, 1)
  })

  caseTest(sdk, 'AUTH-DT-06', 'rule 5', 'present, pair-only → no pair; status says a new token is needed', async (t) => {
    const w = await pairedWorld(t, sdk)
    w.settings.save(IDENTITY.idKey, FIXTURE.coreIdNext)
    await w.restart()
    await w.untilView('idMismatch')
    await sleep(HARNESS.quietMs)
    assert.equal(pairCalls(w).length, 1)
    assert.notEqual(w.status().state, STATE.connected)
  })

  caseTest(sdk, 'AUTH-DT-06', 'rule 6', `present, invalid_client → ${STATE.refused}; core retries (it reconnects once the entry is back)`, async (t) => {
    const w = await pairedWorld(t, sdk)
    w.f.setEnabled(ENTRY.core, false)
    await w.untilStatus(STATE.refused)
    w.f.setEnabled(ENTRY.core, true)
    await w.untilStatus(STATE.connected)
    assert.equal(pairCalls(w).length, 1)
  })

  caseTest(sdk, 'AUTH-DT-06', 'rule 7', 'absent, pair lost to a race → already-paired (mismatch) → New token only', async (t) => {
    const w = await world(t, sdk, { start: false })
    w.f.bindBeforeNextPair(ENTRY.core, FIXTURE.otherId)
    await w.start()
    await w.untilView('warnMismatch')
    assert.equal(lastPairResult(w).bound.idMatches, false)
    assert.deepEqual(w.view().warning.choices, [w.choice('newToken')])
    assert.equal(w.records.size, 0)
  })

  caseTest(sdk, 'AUTH-DT-06', 'rule 10', 'absent, pair → id-taken → ask for a new identity.id; then pair again with the same token', async (t) => {
    const w = await needIdWorld(t, sdk)
    w.settings.save(IDENTITY.idKey, FIXTURE.coreIdNext)
    await w.untilView('paired')
    assert.deepEqual(pairCalls(w).map((c) => c.entryKey), [ENTRY.core, ENTRY.core])
  })

  caseTest(sdk, 'AUTH-DT-06', 'rule 8 (match)', 'warning open (match) → core sends nothing else to the target', async (t) => {
    await assertSilentWhileWarning(await warnMatchWorld(t, sdk))
  })
  caseTest(sdk, 'AUTH-DT-06', 'rule 8 (mismatch)', 'warning open (mismatch) → core sends nothing else to the target', async (t) => {
    await assertSilentWhileWarning(await warnMismatchWorld(t, sdk))
  })

  caseTest(sdk, 'AUTH-DT-06', 'rule 9 (grant)', 'core only uses client_credentials: no other grant, no browser authorization request', async (t) => {
    const w = await pairedWorld(t, sdk)
    await w.restart()
    await w.untilStatus(STATE.connected)
    const grants = w.f.tokenRequests().map((r) => new URLSearchParams(r.body).get(WEB.formGrant))
    assert.ok(grants.length > 0)
    assert.deepEqual([...new Set(grants)], [K1.GRANT.clientCredentials])
    assert.deepEqual(w.f.requests.filter((r) => r.path.startsWith(K1.PATHS.authorize)).map((r) => r.path), [])
  })

  caseTest(sdk, 'AUTH-DT-06', 'rule 9 (scope only)', 'a custom token-response field claiming "paired" is ignored: pairing state comes from scope and pair only', async (t) => {
    const w = await world(t, sdk, { extraTokenFields: CUSTOM_TOKEN_FIELD })
    await w.untilView('paired')
    assert.equal(pairCalls(w).length, 1, 'core skipped pair on a custom field')
  })

  // ---------------------------------------------------------------- NAME-DT-03 (core reaction)
  caseTest(sdk, 'NAME-DT-03', 'rule 1', 'pair: nameAssigned true → no clash; core works as the given name', async (t) => {
    const w = await pairedWorld(t, sdk, { settings: { [IDENTITY.nameKey]: NAME.given } })
    assert.equal(lastPairResult(w).nameAssigned, true)
    assert.equal(w.f.store.pairOf(ENTRY.core).name, NAME.given)
    assert.equal(w.view().nameClash, null)
  })

  caseTest(sdk, 'NAME-DT-03', 'rule 2', 'pair: name-taken → clash shown as ID: <id> for now (no name in use); core keeps working nameless', async (t) => {
    const w = await pairedWorld(t, sdk, { bind: [[ENTRY.other, FIXTURE.otherId, IDENTITY.defaultName]] })
    assert.equal(lastPairResult(w).nameRefused, K1.REFUSAL.nameTaken)
    assert.deepEqual(w.view().nameClash, { code: K1.REFUSAL.nameTaken, nameInUse: null })
    assert.equal(w.f.store.pairOf(ENTRY.core).name, null)
  })

  caseTest(sdk, 'NAME-DT-03', 'rule 3', 'pair: name-invalid → clash with the reason; core keeps working nameless', async (t) => {
    const w = await pairedWorld(t, sdk, { settings: { [IDENTITY.nameKey]: NAME.tooLong } })
    assert.deepEqual(w.view().nameClash, { code: K1.REFUSAL.nameInvalid, nameInUse: null })
    assert.equal(w.f.store.pairOf(ENTRY.core).name, null)
  })

  caseTest(sdk, 'NAME-DT-03', 'rule 4', 'set_name ok → no clash; the new name', async (t) => {
    const w = await pairedWorld(t, sdk)
    w.settings.save(IDENTITY.nameKey, NAME.renamed)
    assert.ok(await untilTrue(() => w.f.store.pairOf(ENTRY.core).name === NAME.renamed))
    assert.equal(w.view().nameClash, null)
  })

  caseTest(sdk, 'NAME-DT-03', 'rule 5', 'set_name name-taken → clash naming the old name; core keeps the old name', async (t) => {
    const w = await pairedWorld(t, sdk, { bind: [[ENTRY.other, FIXTURE.otherId, NAME.other]] })
    w.settings.save(IDENTITY.nameKey, NAME.otherFolded)
    assert.ok(await untilTrue(() => w.view().nameClash !== null), 'no clash after a refused set_name')
    assert.deepEqual(w.view().nameClash, { code: K1.REFUSAL.nameTaken, nameInUse: IDENTITY.defaultName })
    assert.equal(w.f.store.pairOf(ENTRY.core).name, IDENTITY.defaultName)
    assert.equal(w.status().state, STATE.connected)
  })

  caseTest(sdk, 'NAME-DT-03', 'rule 6', 'setting changed while offline (core stopped) → on reconnect core calls set_name with the setting', async (t) => {
    const w = await pairedWorld(t, sdk)
    await w.stop()
    w.settings.edit(IDENTITY.nameKey, NAME.renamed)
    await w.start()
    assert.ok(await untilTrue(() => w.f.store.pairOf(ENTRY.core).name === NAME.renamed), 'the stale name was not corrected after the restart')
    assert.deepEqual(setNameCalls(w).at(-1)?.args, { name: NAME.renamed })
    assert.equal(pairCalls(w).length, 1)
  })

  caseTest(sdk, 'NAME-DT-03', 'page', 'the page column (nothing / the clash line / with the old name)', null, LATER.page)

  // ================================================================ State Transitions
  // ---------------------------------------------------------------- AUTH-ST-03
  caseTest(sdk, 'AUTH-ST-03', 1, 'NoRecord → unpaired auth, pair ok → Paired', async (t) => {
    const w = await pairedWorld(t, sdk)
    assert.equal(w.view().state, w.state('paired'))
  })
  caseTest(sdk, 'AUTH-ST-03', 2, 'NoRecord → already-paired (match) → WarnMatch, sending nothing', async (t) => {
    const w = await warnMatchWorld(t, sdk)
    await assertSilentWhileWarning(w)
  })
  caseTest(sdk, 'AUTH-ST-03', 3, 'WarnMatch → Continue without the tick → WarnMatch (button disabled)', null, LATER.page)
  caseTest(sdk, 'AUTH-ST-03', 4, 'WarnMatch → tick + Continue → Paired (record written, no pair)', async (t) => {
    const w = await warnMatchWorld(t, sdk)
    await w.pairing.choose(w.choice('continue'))
    await w.untilView('paired')
    assert.equal(w.records.size, 1)
    assert.equal(pairCalls(w).length, 1)
  })
  caseTest(sdk, 'AUTH-ST-03', '5 (match)', 'WarnMatch → Use a new token and a new id → NeedToken', async (t) => {
    const w = await warnMatchWorld(t, sdk)
    await w.pairing.choose(w.choice('newToken'))
    await w.untilView('needToken')
    assert.equal(w.records.size, 0)
  })
  caseTest(sdk, 'AUTH-ST-03', '5 (mismatch)', 'WarnMismatch → Use a new token → NeedToken', async (t) => {
    const w = await warnMismatchWorld(t, sdk)
    await w.pairing.choose(w.choice('newToken'))
    await w.untilView('needToken')
  })
  caseTest(sdk, 'AUTH-ST-03', 6, 'NoRecord → already-paired (mismatch) → WarnMismatch', async (t) => {
    const w = await warnMismatchWorld(t, sdk)
    assert.equal(w.view().warning.idMatches, false)
  })
  caseTest(sdk, 'AUTH-ST-03', 7, 'NeedToken → new reference set → NoRecord → pair ok → Paired, with the same id', async (t) => {
    const w = await warnMismatchWorld(t, sdk)
    await w.pairing.choose(w.choice('newToken'))
    await w.untilView('needToken')
    w.settings.save(SETTING.tokenRef, FIXTURE.refNext)
    await w.untilView('paired')
    const last = pairCalls(w).at(-1)
    assert.deepEqual({ entryKey: last.entryKey, clientId: last.clientId }, { entryKey: ENTRY.next, clientId: FIXTURE.coreId })
    assert.equal(w.records.size, 1)
  })
  caseTest(sdk, 'AUTH-ST-03', 8, 'Paired → reconnect and restart → Paired, no pair', async (t) => {
    const w = await pairedWorld(t, sdk)
    await w.f.drop()
    await w.f.restore()
    await w.untilStatus(STATE.connected)
    await w.restart()
    await w.untilStatus(STATE.connected)
    await w.untilView('paired')
    assert.equal(pairCalls(w).length, 1)
  })
  caseTest(sdk, 'AUTH-ST-03', 9, 'Paired → identity.id changed → IdMismatch (no pair)', async (t) => {
    const w = await pairedWorld(t, sdk)
    w.settings.save(IDENTITY.idKey, FIXTURE.coreIdNext)
    await w.f.drop()
    await w.f.restore()
    await w.untilView('idMismatch')
    assert.equal(pairCalls(w).length, 1)
  })
  caseTest(sdk, 'AUTH-ST-03', 10, `Paired → invalid_client (revoked) → TokenRefused, status ${STATE.refused} / ${CODE.revoked}`, async (t) => {
    const w = await pairedWorld(t, sdk)
    w.f.setEnabled(ENTRY.core, false)
    await w.untilView('tokenRefused')
    assert.deepEqual(w.status(), { state: STATE.refused, code: CODE.revoked })
  })
  caseTest(sdk, 'AUTH-ST-03', 11, 'TokenRefused → entry re-enabled → Paired (no pair)', async (t) => {
    const w = await pairedWorld(t, sdk)
    w.f.setEnabled(ENTRY.core, false)
    await w.untilView('tokenRefused')
    w.f.setEnabled(ENTRY.core, true)
    await w.untilView('paired')
    await w.untilStatus(STATE.connected)
    assert.equal(pairCalls(w).length, 1)
  })
  caseTest(sdk, 'AUTH-ST-03', 12, 'NoRecord → id-taken → NeedId (the token stays)', async (t) => {
    const w = await needIdWorld(t, sdk)
    assert.equal(w.settings.get(SETTING.tokenRef), FIXTURE.ref)
    assert.equal(w.records.size, 0)
  })
  caseTest(sdk, 'AUTH-ST-03', 13, 'NeedId → new identity.id set → NoRecord → Paired', async (t) => {
    const w = await needIdWorld(t, sdk)
    w.settings.save(IDENTITY.idKey, FIXTURE.coreIdNext)
    await w.untilView('paired')
    assert.equal(pairCalls(w).at(-1).clientId, FIXTURE.coreIdNext)
  })
  caseTest(sdk, 'AUTH-ST-03', 'invalid (Continue on mismatch)', 'WarnMismatch → Continue (not offered) → stays WarnMismatch, no record, nothing sent', async (t) => {
    const w = await warnMismatchWorld(t, sdk)
    const before = w.f.requests.length
    await w.pairing.choose(w.choice('continue')).catch(() => {})
    await sleep(HARNESS.quietMs)
    assert.equal(w.view().state, w.state('warnMismatch'))
    assert.equal(w.records.size, 0)
    assert.equal(w.f.requests.length, before)
  })

  // ---------------------------------------------------------------- the module's constants (R-NAME-03, R-ID-07)
  caseTest(sdk, 'NAME-UC-02', 'precondition', `IDENTITY_DEFAULTS.name is "${IDENTITY.defaultName}" (R-NAME-03; the settings row is F-WIRE's)`, async () => {
    assert.equal((await identityModule(sdk))[SUBJECT.defaults].name, IDENTITY.defaultName)
  })
  caseTest(sdk, 'AUTH-ST-03', 'states', 'the module names every AUTH-ST-03 state and both R-ID-07 choices, each distinct', async () => {
    const mod = await identityModule(sdk)
    for (const [group, keys] of [[SUBJECT.states, SUBJECT.stateKeys], [SUBJECT.choices, SUBJECT.choiceKeys]]) {
      const values = keys.map((k) => mod[group][k])
      assert.deepEqual(keys.filter((k) => mod[group][k] === undefined), [], `${group} lacks keys`)
      assert.equal(new Set(values).size, values.length, `${group} values repeat`)
    }
  })
}

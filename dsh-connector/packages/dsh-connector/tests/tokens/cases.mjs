/**
 * C-TOKENS-REVEAL black-box cases, registry level (v3-w4-briefs.md "C-TOKENS-REVEAL"; USE-CASES.md
 * in this folder): AUTH-UC-01 (rewritten: create and reveal), AUTH-EP-04 rows 1 and 8 (plus the
 * negative `match` partition), AUTH-BVA (label), AUTH-DT-05 rows 1–2 and 5, AUTH-DT-13 (what a save
 * of the tokens list does), AUTH-ST-01 (no Unconfigured state). Requirements R-TOK-03, R-TOK-04,
 * R-TOK-06, R-TOK-08, R-TOK-09, R-TOK-11, R-OA-03, R-OA-06; design §5.1–§5.3, §5.6, §5.9; K1d.
 * The route and page rows (AUTH-UC-15, AUTH-ST-08, PLAT-EP-03 row 1, HAND-EP-01 row 3) are in
 * ../settings-page/.
 *
 * Techniques, and only these: Use Case (each test names its flow), Equivalence Partitioning and
 * Boundary Value Analysis (one test per class or boundary), Decision Table (one per rule) and
 * State Transition (one per transition row).
 *
 * Level: integration over the installed SDK's real storage domain, credential store and logger
 * (world.mjs), with a fake SettingsWriter and restoreTokens that keep their K1d contract. Observables
 * only the wired connector shows (the token endpoint, access tokens, the hosted child) are `todo`
 * and name their owner. Withdrawn by design §5.9 and so gone from this suite: AUTH-UC-01 A1, A2,
 * E1–E3 (old), AUTH-EP-04 rows 2–7a, AUTH-BVA-03 rows 1–7, AUTH-DT-05 rows 3–4, AUTH-ST-01 row 10
 * and 10a–10m.
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { caseName } from 'dsh-connector-test-helpers/cases'
import {
  ENTRY_STATUS, FIXTURE, HOSTED_LABEL, LATER, NO_SUCH_MEMBER, REQUIREMENT, REVOCATION_KIND, SECRET_FIELDS, SETTINGS_REFUSAL, STORE, SUBJECT,
  TOKEN_VALUE, VALUE_ANYWHERE, VALUE_PATTERN, WAIT,
} from './constants.mjs'
import { tokensModule } from './subject.mjs'
import { answersOf, digestOf, eventually, leaksOf, staysFalse, worldFor } from './world.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({
  uc01: 'AUTH-UC-01', ep04: 'AUTH-EP-04', dt05: 'AUTH-DT-05', dt13: 'AUTH-DT-13', st01: 'AUTH-ST-01',
})

/** One test per case row, named as every V3 suite names them; `todo` names the owning task. */
function row(sdk, id, part, title, fn, todo) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, T, fn)
}

// ------------------------------------------------------------------------------------------------
// Shared observations (each states one requirement oracle once).

/** R-TOK-08, design §5.2: `dsht_` + 32 random bytes in base64url (no padding): ≥ 256 bits. */
function assertValueShape(value) {
  assert.equal(typeof value, 'string', 'the value is not a string')
  assert.match(value, VALUE_PATTERN, 'the value is not dsht_ + 43 base64url characters')
  const body = value.slice(TOKEN_VALUE.generatedPrefix.length)
  const bytes = Buffer.from(body, 'base64url')
  assert.equal(bytes.toString('base64url'), body, 'the value does not round-trip as base64url')
  assert.equal(bytes.length, TOKEN_VALUE.generatedBytes, 'random bytes behind the value')
  assert.ok(bytes.length * REQUIREMENT.bitsPerByte >= REQUIREMENT.minEntropyBits, 'less than 256 bits')
}

/** A K1d TokenEntry: exactly what it may hold, never a value, digest or reference. */
function assertEntryShape(entry, value) {
  assert.ok(entry, 'no entry')
  assert.equal(entry.status, ENTRY_STATUS.ok, 'K1d: the only status is ok')
  assert.equal(typeof entry.generation, 'number')
  assert.equal(typeof entry.hosted, 'boolean')
  assert.deepEqual(SECRET_FIELDS.filter((f) => Object.hasOwn(entry, f)), [], 'the entry carries a secret field')
  if (value !== undefined) assert.ok(!JSON.stringify(entry).includes(value), 'the entry carries the value')
}

/** `create`'s answer `{entryKey, label, value}`, once (design §5.9 step 3). */
async function created(world, label) {
  const answer = await world.registry.create(label)
  assert.ok(answer && typeof answer.entryKey === 'string' && answer.entryKey.length > 0, 'no entry key: ' + JSON.stringify(Object.keys(answer ?? {})))
  assertValueShape(answer.value)
  return answer
}
/** A world with entries created for `labels`, and their answers. */
async function withEntries(t, sdk, labels, options) {
  const world = await worldFor(t, sdk, options)
  const made = []
  for (const label of labels) made.push(await created(world, label))
  return { world, made }
}

/** The settings item of an entry, as the document holds it. */
const itemOf = (world, entryKey) => world.doc.tokens.find((i) => i.key === entryKey)
/** The list with one item changed. */
const edited = (world, entryKey, change) => world.doc.tokens.map((i) => (i.key === entryKey ? { ...i, ...change } : i))
const without = (world, entryKey) => world.doc.tokens.filter((i) => i.key !== entryKey)

/** The value authenticates as exactly this entry (R-OA-03: `client_secret` → entry). */
function assertMatches(world, made) {
  const hit = world.registry.match(made.value)
  assert.equal(hit?.entryKey, made.entryKey, 'the value does not match its entry')
  assertEntryShape(hit, made.value)
}
const assertNoMatch = (world, value, why) => assert.equal(world.registry.match(value), undefined, why)
/** R-TOK-04, R1: the value is nowhere (logs, files, answers, document, writer calls), and the host credential store was never written. */
function assertNoLeak(world, value) {
  assert.deepEqual(leaksOf(world, value), [], 'the token value leaked')
  assert.deepEqual(world.credentialWrites, [], 'the host credential store was written (R1: it holds no token value)')
}

/** Label groups, order-free (one group per problem; the order of a group's labels is not specified). */
const groups = (labels) => (labels ?? []).map((g) => [...g].sort()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
/** A refusal or notice: `token-duplicate` with exactly these label groups, naming labels only. */
function assertDuplicate(answer, expected, world) {
  assert.equal(answer?.ok === true, false, 'accepted: ' + JSON.stringify(answer))
  assert.equal(answer.code, SETTINGS_REFUSAL.tokenDuplicate)
  assert.deepEqual(groups(answer.labels), groups(expected))
  // "a notice naming the labels only" (design §5.9): no value, no entry key.
  const text = JSON.stringify(answer)
  assert.ok(!VALUE_ANYWHERE.test(text), 'the refusal carries a value')
  for (const key of [...world.doc.tokens.map((i) => i.key), ...world.registry.list().map((e) => e.entryKey)]) assert.ok(!text.includes(key), 'the refusal carries an entry key')
}
async function assertAccepted(promise) {
  const result = await promise
  assert.deepEqual(result, { ok: true }, 'the save was refused: ' + JSON.stringify(result))
}
/** Entry `entryKey` is listed, but refuses service and matches nothing (R-TOK-08 "refuse service"). */
function assertUnusable(world, entryKey, value) {
  const listed = world.registry.list().find((e) => e.entryKey === entryKey)
  assert.ok(listed, 'the entry is not listed')
  assert.equal(listed.enabled, false, 'an entry in a problem reads enabled')
  assert.equal(world.registry.get(entryKey)?.enabled, false)
  assertEntryShape(listed)
  if (value !== undefined) assertNoMatch(world, value, 'an entry in a problem authenticates')
}
/** R-TOK-09: deleting drops the digest: no live record of the entry, and no record anywhere holds its digest. */
async function assertRecordDropped(world, made) {
  assert.ok(await eventually(() => world.recordOfKey(made.entryKey) === undefined), 'the deleted entry\'s record is still stored')
  assert.ok(await eventually(() => !JSON.stringify(world.records()).includes(digestOf(made.value))), 'a stored record still holds the deleted entry\'s digest')
}
const revocationsOf = (world, entryKey) => world.revocations.filter((r) => r.entryKey === entryKey)
/** Exactly one revocation of `kind` for the entry, with a generation past `before`. */
function assertRevokedOnce(world, entryKey, kind, before) {
  const mine = revocationsOf(world, entryKey)
  assert.equal(mine.length, 1, 'revocations: ' + JSON.stringify(mine))
  assert.equal(mine[0].kind, kind)
  assert.ok(mine[0].generation > before, `the generation did not move past ${before}: ${mine[0].generation}`)
  return mine[0]
}

/** A value no entry was ever created for (same shape as a generated one). */
const strangerValue = () => TOKEN_VALUE.generatedPrefix + randomBytes(TOKEN_VALUE.generatedBytes).toString('base64url')

/**
 * A copy of `made`'s record under `key` (a hand edit of the records store while the connector is
 * down): same digest, so the copy's item and `made`'s share one value digest. Its own `label`.
 */
function copiedRecord(table, made, key, label) {
  return table.put(key, { ...table.get(recordKeyOf(table, made)), entryKey: key, label })
}
/** The table key of `made`'s record (found by its entryKey field). */
function recordKeyOf(table, made) {
  const found = [...table.entries()].find(([, r]) => r?.entryKey === made.entryKey)
  assert.ok(found, 'harness: no record for the entry')
  return found[0]
}

// ------------------------------------------------------------------------------------------------

export function registerTokenCases(sdk) {
  // ---- AUTH-UC-01 (rewritten): create a token and reveal it once (Use Case) ----

  row(sdk, ID.uc01, 'main 3–4', 'create(label) resolves {entryKey, label, value} once: a dsht_ value of 32 random bytes; the entry is listed, enabled, ok, not hosted', async (t) => {
    const world = await worldFor(t, sdk)
    const made = await created(world, FIXTURE.labelA)
    assert.equal(made.label, FIXTURE.labelA)
    const entry = world.registry.get(made.entryKey)
    assertEntryShape(entry, made.value)
    assert.equal(entry.label, FIXTURE.labelA)
    assert.equal(entry.enabled, true)
    assert.equal(entry.hosted, false)
    assert.deepEqual(world.registry.list().map((e) => e.entryKey), [made.entryKey])
  })
  row(sdk, ID.uc01, 'main 3 (record first)', 'the digest record is written before the settings item, and addToken gets exactly {label, enabled: true, key}', async (t) => {
    const world = await worldFor(t, sdk)
    const made = await created(world, FIXTURE.labelA)
    const adds = world.settingsCalls.filter((c) => c.op === 'addToken')
    assert.equal(adds.length, 1, 'addToken calls: ' + adds.length)
    assert.deepEqual(adds[0].item, { label: FIXTURE.labelA, enabled: true, key: made.entryKey })
    assert.ok(world.recordAtAdd[0], 'no record existed when addToken was called (design §5.2 step 2)')
    assert.equal(world.recordAtAdd[0][1]?.[STORE.digestField], digestOf(made.value))
    assert.deepEqual(world.doc.tokens, [{ label: FIXTURE.labelA, enabled: true, key: made.entryKey }])
  })
  row(sdk, ID.uc01, 'main 4 (once)', 'no registry member returns the value again: get, list, match and notice hold no value; the registry has no reveal, regenerate, replace or value member', async (t) => {
    const world = await worldFor(t, sdk)
    const made = await created(world, FIXTURE.labelA)
    world.registry.match(made.value)
    assert.ok(!answersOf(world).includes(made.value), 'a registry answer returns the value')
    const names = new Set()
    for (let o = world.registry; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) for (const n of Object.getOwnPropertyNames(o)) if (typeof world.registry[n] === 'function') names.add(n)
    assert.deepEqual([...names].filter((n) => n !== 'constructor' && NO_SUCH_MEMBER.test(n)), [], 'a member that could show or change a value')
  })
  row(sdk, ID.uc01, 'post (digest only)', 'the stored record holds the hex SHA-256 digest of the value and never the value', async (t) => {
    const world = await worldFor(t, sdk)
    const made = await created(world, FIXTURE.labelA)
    const record = world.recordOfValue(made.value)
    assert.ok(record, 'no record holds the value\'s SHA-256 digest')
    assert.equal(record[1].entryKey, made.entryKey)
    assert.ok(!JSON.stringify(world.records()).includes(made.value), 'a record holds the value')
  })
  row(sdk, ID.uc01, 'post (no leak)', 'the value is in no log, no file under the DSH root, no registry answer, settings document or SettingsWriter call; the host credential store is never written (R-TOK-04, R1)', async (t) => {
    const world = await worldFor(t, sdk)
    const made = await created(world, FIXTURE.labelA)
    assertMatches(world, made)
    assertNoLeak(world, made.value)
    const next = await world.restart()
    assertMatches(next, made)
    assertNoLeak(next, made.value)
  })
  row(sdk, ID.uc01, 'post (entry key)', 'the entry key is opaque: it carries neither the value nor the label', async (t) => {
    const world = await worldFor(t, sdk)
    const made = await created(world, FIXTURE.labelA)
    for (const part of [made.value, made.value.slice(TOKEN_VALUE.generatedPrefix.length), FIXTURE.labelA, digestOf(made.value)]) assert.ok(!made.entryKey.includes(part), 'the entry key carries ' + part)
  })
  row(sdk, ID.uc01, 'post (match)', 'match(value) finds the entry; it still does after a connector restart', async (t) => {
    const { world, made: [made] } = await withEntries(t, sdk, [FIXTURE.labelA])
    assertMatches(world, made)
    const next = await world.restart()
    assert.deepEqual(next.startResult, { ok: true })
    assertMatches(next, made)
  })
  row(sdk, ID.uc01, 'A1', 'a label with surrounding spaces is trimmed in the answer, the entry and the settings item', async (t) => {
    const world = await worldFor(t, sdk)
    const made = await created(world, FIXTURE.padded)
    assert.equal(made.label, FIXTURE.labelA)
    assert.equal(world.registry.get(made.entryKey).label, FIXTURE.labelA)
    assert.equal(itemOf(world, made.entryKey).label, FIXTURE.labelA)
  })
  row(sdk, ID.uc01, 'E2 (save fails)', 'the settings save fails: create rejects operation-failed, the record is removed again, no item and no value', async (t) => {
    const world = await worldFor(t, sdk)
    world.failSaves = true
    const error = await world.registry.create(FIXTURE.labelA).then(() => assert.fail('create resolved'), (e) => e)
    assert.equal(error?.code, SUBJECT.operationFailed)
    const add = world.settingsCalls.find((c) => c.op === 'addToken')
    assert.ok(add, 'harness: addToken was not called')
    assert.ok(await eventually(() => world.liveRecords().length === 0), 'the record of the failed create is still stored')
    assert.equal(world.registry.get(add.item.key), undefined)
    assert.deepEqual(world.registry.list(), [])
    assert.deepEqual(world.doc.tokens, [])
    assert.deepEqual(leaksOf(world, VALUE_ANYWHERE), [], 'a value was written or returned')
    assert.ok(!VALUE_ANYWHERE.test(JSON.stringify(error, Object.getOwnPropertyNames(error))), 'the error carries a value')
  })
  row(sdk, ID.uc01, 'E2 (record write fails)', 'the record cannot be written: create rejects operation-failed, nothing is added to the settings and no value is returned', async (t) => {
    const world = await worldFor(t, sdk)
    fs.mkdirSync(path.join(world.root, FIXTURE.domainDir), { recursive: true })
    const dirs = fs.readdirSync(path.join(world.root, FIXTURE.domainDir), { recursive: true }).map((d) => path.join(world.root, FIXTURE.domainDir, String(d))).filter((d) => fs.statSync(d).isDirectory())
    const locked = [path.join(world.root, FIXTURE.domainDir), ...dirs]
    const READ_ONLY = 0o555
    const OWNER = 0o755
    for (const d of locked) fs.chmodSync(d, READ_ONLY)
    try {
      const error = await world.registry.create(FIXTURE.labelA).then(() => assert.fail('create resolved'), (e) => e)
      assert.equal(error?.code, SUBJECT.operationFailed)
    } finally {
      for (const d of locked) fs.chmodSync(d, OWNER)
    }
    assert.deepEqual(world.settingsCalls.filter((c) => c.op === 'addToken'), [], 'the item was added although its record failed (design §5.2: record first)')
    assert.deepEqual(world.registry.list(), [])
    assert.deepEqual(world.doc.tokens, [])
    assert.deepEqual(leaksOf(world, VALUE_ANYWHERE), [], 'a value was written or returned')
  })
  row(sdk, ID.uc01, 'E3', 'the answer is lost: the entry exists and nothing can show its value; delete + New token gives a new entry and a new value (R4)', async (t) => {
    const { world, made: [lost] } = await withEntries(t, sdk, [FIXTURE.labelA])
    assert.ok(!answersOf(world).includes(lost.value))
    await assertAccepted(world.save(without(world, lost.entryKey)))
    const next = await created(world, FIXTURE.labelA)
    assert.notEqual(next.entryKey, lost.entryKey, 'the new token reuses the old entry key (it is a new principal)')
    assert.notEqual(next.value, lost.value)
    assertNoMatch(world, lost.value, 'the deleted entry\'s value authenticates')
    assertMatches(world, next)
  })
  row(sdk, ID.uc01, 'hosted', `createHosted() resolves {entryKey, label: ${HOSTED_LABEL}, value} once; the entry is hosted; only the digest is stored on the host`, async (t) => {
    const world = await worldFor(t, sdk)
    const made = await world.registry.createHosted()
    assertValueShape(made.value)
    assert.equal(made.label, HOSTED_LABEL)
    const entry = world.registry.get(made.entryKey)
    assertEntryShape(entry, made.value)
    assert.equal(entry.hosted, true)
    assert.equal(entry.enabled, true)
    assert.deepEqual(world.settingsCalls.filter((c) => c.op === 'addToken').map((c) => c.item), [{ label: HOSTED_LABEL, enabled: true, key: made.entryKey }])
    assertMatches(world, made)
    assert.ok(world.recordOfValue(made.value), 'no digest record for the hosted value')
    assertNoLeak(world, made.value)
  })
  row(sdk, ID.uc01, 'hosted (child)', 'the hosted value is stored in the child\'s own credential store only', null, LATER.hostedChild)
  row(sdk, ID.uc01, 'post (surfaces)', 'the settings read-back, every browser response and DSH UI of the wired connector hold no value', null, LATER.surfaces)
  row(sdk, ID.uc01, 'post (form)', 'the page shows the entry read-only as unpaired (R-ID-12)', null, LATER.formStatus)

  // ---- AUTH-UC-01 E1: the label of New token, by its boundaries (BVA within the use case; no new case id) ----

  for (const blank of FIXTURE.blanks) {
    row(sdk, ID.uc01, `E1 (blank ${JSON.stringify(blank)})`, 'a blank label is refused with a TypeError; nothing is created', async (t) => {
      const world = await worldFor(t, sdk)
      await assert.rejects(Promise.resolve().then(() => world.registry.create(blank)), TypeError)
      assert.deepEqual([world.settingsCalls, world.liveRecords(), world.registry.list()], [[], [], []])
    })
  }
  for (const bad of FIXTURE.nonStrings) {
    row(sdk, ID.uc01, `E1 (non-string ${JSON.stringify(bad) ?? String(bad)})`, 'a non-string label is refused with a TypeError; nothing is created', async (t) => {
      const world = await worldFor(t, sdk)
      await assert.rejects(Promise.resolve().then(() => world.registry.create(bad)), TypeError)
      assert.deepEqual([world.settingsCalls, world.liveRecords(), world.registry.list()], [[], [], []])
    })
  }
  row(sdk, ID.uc01, 'A1 (one character)', 'a one-character label is accepted', async (t) => {
    const world = await worldFor(t, sdk)
    assert.equal((await created(world, FIXTURE.shortest)).label, FIXTURE.shortest)
  })

  // ---- AUTH-EP-04: token value classes (Equivalence Partitioning; rows 1 and 8 reworded) ----

  row(sdk, ID.ep04, 1, 'New token: generated dsht_ + 32 random bytes; only the hex SHA-256 digest is stored; no host credential write', async (t) => {
    const world = await worldFor(t, sdk)
    const made = await created(world, FIXTURE.labelA)
    assert.equal(world.recordOfValue(made.value)?.[1]?.entryKey, made.entryKey)
    assertNoLeak(world, made.value)
  })
  row(sdk, ID.ep04, '1 (hosted)', 'the hosted create: the same value class and the same digest-only storage', async (t) => {
    const world = await worldFor(t, sdk)
    const made = await world.registry.createHosted()
    assertValueShape(made.value)
    assert.equal(world.recordOfValue(made.value)?.[1]?.entryKey, made.entryKey)
    assertNoLeak(world, made.value)
  })
  row(sdk, ID.ep04, '1 (generator)', 'generateTokenValue() gives fresh values of the same class', async () => {
    const mod = await tokensModule(sdk)
    const a = mod[SUBJECT.generate]()
    const b = mod[SUBJECT.generate]()
    assertValueShape(a)
    assertValueShape(b)
    assert.notEqual(a, b)
  })
  row(sdk, ID.ep04, 8, 'ten created values: all distinct, each matches only its own entry, none appears in a log, file, answer or the settings', async (t) => {
    const labels = Array.from({ length: FIXTURE.manyEntries }, (_, i) => FIXTURE.manyLabelPrefix + i)
    const { world, made } = await withEntries(t, sdk, labels)
    assert.equal(new Set(made.map((m) => m.value)).size, made.length, 'two values are equal')
    assert.equal(new Set(made.map((m) => m.entryKey)).size, made.length, 'two entry keys are equal')
    for (const m of made) {
      assertMatches(world, m)
      assertNoLeak(world, m.value)
    }
  })
  row(sdk, ID.ep04, '9 (no match)', 'values that are no live entry\'s match nothing: a stranger dsht_ value, the value ± one character, its body, the empty string, its digest, its entry key', async (t) => {
    const { world, made: [m] } = await withEntries(t, sdk, [FIXTURE.labelA])
    const body = m.value.slice(TOKEN_VALUE.generatedPrefix.length)
    for (const v of [strangerValue(), m.value + 'x', m.value.slice(0, -1), body, '', digestOf(m.value), m.entryKey, m.value.toUpperCase()]) assertNoMatch(world, v, 'matched: ' + (v === m.entryKey ? 'the entry key' : 'a non-value'))
  })
  row(sdk, ID.ep04, '9 (timing)', 'the comparison is constant-time over every entry (R-TOK-06)', null, LATER.timing)

  // ---- AUTH-DT-05: what delete and disable do to the stored digest (Decision Table; rows 1–2, 5) ----

  for (const [kind, make] of [['page-made', (w) => created(w, FIXTURE.labelA)], ['hosted', (w) => w.registry.createHosted()]]) {
    row(sdk, ID.dt05, `1 (${kind})`, 'delete: the record is dropped, one deleted revocation, nothing unset anywhere on the host', async (t) => {
      const world = await worldFor(t, sdk)
      const m = await make(world)
      const before = world.registry.get(m.entryKey).generation
      await assertAccepted(world.save(without(world, m.entryKey)))
      assertRevokedOnce(world, m.entryKey, REVOCATION_KIND.deleted, before)
      await assertRecordDropped(world, m)
      assertNoMatch(world, m.value, 'a deleted entry authenticates')
      assert.deepEqual(world.credentialWrites, [], 'the delete wrote to the host credential store')
    })
    row(sdk, ID.dt05, `2 (${kind})`, 'disable: the record is kept, one disabled revocation, the value is refused', async (t) => {
      const world = await worldFor(t, sdk)
      const m = await make(world)
      const before = world.registry.get(m.entryKey).generation
      await assertAccepted(world.save(edited(world, m.entryKey, { enabled: false })))
      assertRevokedOnce(world, m.entryKey, REVOCATION_KIND.disabled, before)
      assert.ok(world.recordOfValue(m.value), 'disabling dropped the record')
      assertNoMatch(world, m.value, 'a disabled entry authenticates')
      assert.equal(world.registry.get(m.entryKey)?.enabled, false)
    })
  }
  row(sdk, ID.dt05, '1 (hosted child)', 'a deleted hosted entry\'s value stays dead in the child\'s store until replaced', null, LATER.hostedChild)
  row(sdk, ID.dt05, 5, 'disabled, then enabled: the same entry and value authenticate again; no further revocation; the generation does not go back', async (t) => {
    const { world, made: [m] } = await withEntries(t, sdk, [FIXTURE.labelA])
    const before = world.registry.get(m.entryKey).generation
    await assertAccepted(world.save(edited(world, m.entryKey, { enabled: false })))
    const revoked = assertRevokedOnce(world, m.entryKey, REVOCATION_KIND.disabled, before)
    await assertAccepted(world.save(edited(world, m.entryKey, { enabled: true })))
    assertMatches(world, m)
    // Old access tokens carry the old generation, so a re-enable revives none (R-OA-06).
    assert.ok(world.registry.get(m.entryKey).generation >= revoked.generation, 'the generation went back')
    assert.equal(revocationsOf(world, m.entryKey).length, 1, 'enabling fired a revocation')
  })

  // ---- AUTH-DT-13: what a save of the tokens list does (Decision Table) ----

  row(sdk, ID.dt13, 1, 'save, a label edited: accepted; the label changes; no revocation; the generation is kept; the value still matches', async (t) => {
    const { world, made: [m] } = await withEntries(t, sdk, [FIXTURE.labelA])
    const before = world.registry.get(m.entryKey).generation
    await assertAccepted(world.save(edited(world, m.entryKey, { label: FIXTURE.renamed })))
    assert.equal(world.registry.get(m.entryKey).label, FIXTURE.renamed)
    assert.equal(world.registry.get(m.entryKey).generation, before)
    assert.deepEqual(world.revocations, [])
    assertMatches(world, m)
  })
  row(sdk, ID.dt13, 2, 'save, a switch off then on: each accepted; disabled once, nothing on re-enable', async (t) => {
    const { world, made: [m] } = await withEntries(t, sdk, [FIXTURE.labelA])
    await assertAccepted(world.save(edited(world, m.entryKey, { enabled: false })))
    await assertAccepted(world.save(edited(world, m.entryKey, { enabled: true })))
    assert.deepEqual(world.revocations.map((r) => r.kind), [REVOCATION_KIND.disabled])
  })
  row(sdk, ID.dt13, 3, 'save, an item removed: accepted; one deleted revocation; the entry is unknown; the other entry is untouched', async (t) => {
    const { world, made: [a, b] } = await withEntries(t, sdk, [FIXTURE.labelA, FIXTURE.labelB])
    const before = world.registry.get(a.entryKey).generation
    await assertAccepted(world.save(without(world, a.entryKey)))
    assertRevokedOnce(world, a.entryKey, REVOCATION_KIND.deleted, before)
    assert.equal(world.registry.get(a.entryKey), undefined)
    assert.deepEqual(world.registry.list().map((e) => e.entryKey), [b.entryKey])
    assertMatches(world, b)
    assert.deepEqual(revocationsOf(world, b.entryKey), [])
  })
  row(sdk, ID.dt13, 4, 'save, items reordered: accepted; no revocation; both values still match', async (t) => {
    const { world, made } = await withEntries(t, sdk, [FIXTURE.labelA, FIXTURE.labelB])
    await assertAccepted(world.save([...world.doc.tokens].reverse()))
    assert.deepEqual(world.revocations, [])
    for (const m of made) assertMatches(world, m)
  })

  /**
   * A refused save (rules 5–7): `token-duplicate` with `labels`; nothing changes; the previous list
   * goes to restoreTokens and its echo is not refused again; the notice names the labels until the
   * next accepted save; A keeps serving.
   */
  async function assertRefusedSave(world, list, labels, keep) {
    const previous = structuredClone(world.doc.tokens)
    const listBefore = world.registry.list()
    const revokedBefore = world.revocations.length
    assertDuplicate(await world.save(list), labels, world)
    assert.deepEqual(world.registry.list(), listBefore, 'the refused save changed the entries')
    await eventually(() => world.restored.length > 0)
    assert.deepEqual(world.restored, [previous], 'restoreTokens did not get exactly the previous list')
    await world.settled()
    assert.deepEqual(world.restored.length, 1, 'the restore echo was refused and restored again')
    assert.deepEqual(world.doc.tokens, previous, 'the document does not hold the previous list')
    assert.deepEqual(world.registry.list(), listBefore, 'the echo changed the entries')
    assertDuplicate(world.registry.notice(), labels, world)
    assert.deepEqual(world.revocations.slice(revokedBefore), [], 'a refused save or its echo revoked')
    for (const m of keep) assertMatches(world, m)
    // The next accepted save (a label edit, so it cannot be taken for the echo) clears the notice.
    await assertAccepted(world.save(previous.map((i, n) => (n === 0 ? { ...i, label: FIXTURE.renamed } : i))))
    assert.equal(world.registry.notice(), undefined, 'the notice outlived the next accepted save')
  }
  row(sdk, ID.dt13, 5, 'save, two items with one key: refused token-duplicate naming both labels; nothing changes; the previous list restored; notice until the next accepted save', async (t) => {
    const { world, made: [a] } = await withEntries(t, sdk, [FIXTURE.labelA])
    await assertRefusedSave(world, [...world.doc.tokens, { label: FIXTURE.labelCopy, enabled: true, key: a.entryKey }], [[FIXTURE.labelA, FIXTURE.labelCopy]], [a])
  })
  row(sdk, ID.dt13, '5 (disabled copy)', 'the same with the copy switched off: still refused (identity, not the switch)', async (t) => {
    const { world, made: [a] } = await withEntries(t, sdk, [FIXTURE.labelA])
    await assertRefusedSave(world, [...world.doc.tokens, { label: FIXTURE.labelCopy, enabled: false, key: a.entryKey }], [[FIXTURE.labelA, FIXTURE.labelCopy]], [a])
  })
  row(sdk, ID.dt13, 6, 'save, an item whose record has another entry\'s digest (store edited by hand): refused token-duplicate naming both labels; as rule 5', async (t) => {
    const { world, made: [a] } = await withEntries(t, sdk, [FIXTURE.labelA])
    const copyKey = FIXTURE.handKey
    const next = await world.restart({ stage: (table) => copiedRecord(table, a, copyKey, FIXTURE.labelC) })
    assert.deepEqual(next.startResult, { ok: true }, 'a record with no item is not a problem of the list')
    assertMatches(next, a)
    // If the start sync dropped the record no item names (USE-CASES.md, ambiguity 1), the added item
    // has no record and is refused alone (rule 7); while the record stands, the digest pairs it with A.
    const labels = next.recordOfKey(copyKey) === undefined ? [[FIXTURE.labelC]] : [[FIXTURE.labelA, FIXTURE.labelC]]
    await assertRefusedSave(next, [...next.doc.tokens, { label: FIXTURE.labelC, enabled: true, key: copyKey }], labels, [a])
  })
  row(sdk, ID.dt13, 7, 'save, an item with no record (added by hand): refused token-duplicate naming its label; as rule 5 (R5)', async (t) => {
    const { world, made: [a] } = await withEntries(t, sdk, [FIXTURE.labelA])
    await assertRefusedSave(world, [...world.doc.tokens, { label: FIXTURE.handLabel, enabled: true, key: FIXTURE.handKey }], [[FIXTURE.handLabel]], [a])
  })
  row(sdk, ID.dt13, '7 (disabled)', 'the same with the hand-added item switched off: still refused', async (t) => {
    const { world, made: [a] } = await withEntries(t, sdk, [FIXTURE.labelA])
    await assertRefusedSave(world, [...world.doc.tokens, { label: FIXTURE.handLabel, enabled: false, key: FIXTURE.handKey }], [[FIXTURE.handLabel]], [a])
  })
  row(sdk, ID.dt13, '5+7', 'one save with two problems: one label group per problem', async (t) => {
    const { world, made: [a] } = await withEntries(t, sdk, [FIXTURE.labelA])
    const list = [...world.doc.tokens, { label: FIXTURE.labelCopy, enabled: true, key: a.entryKey }, { label: FIXTURE.handLabel, enabled: true, key: FIXTURE.handKey }]
    await assertRefusedSave(world, list, [[FIXTURE.labelA, FIXTURE.labelCopy], [FIXTURE.handLabel]], [a])
  })
  row(sdk, ID.dt13, 8, 'the restore echo is accepted, not refused again, and not a user save: the notice stays', async (t) => {
    const { world, made: [a] } = await withEntries(t, sdk, [FIXTURE.labelA])
    const previous = structuredClone(world.doc.tokens)
    await world.save([...previous, { label: FIXTURE.handLabel, enabled: true, key: FIXTURE.handKey }])
    await eventually(() => world.restored.length > 0)
    await world.settled()
    assert.equal(world.restored.length, 1)
    assertDuplicate(world.registry.notice(), [[FIXTURE.handLabel]], world)
    assert.ok(await staysFalse(() => world.restored.length > 1), 'the echo was restored again')
    assertMatches(world, a)
  })

  /** Rule 9: a document or store edited by hand while the connector was down, found at start. */
  const atStart = (world) => {
    assert.deepEqual(world.startResult, { ok: true }, 'the start sync was refused (a problem found at start is not a save)')
    assert.deepEqual(world.restored, [], 'a start problem was written back (it is not a save)')
  }
  row(sdk, ID.dt13, '9 (key)', 'at start, two items with one key: not refused; the entry is listed, reads enabled: false and matches nothing; the notice names both; no revocation, no generation change', async (t) => {
    const { world, made: [a, b] } = await withEntries(t, sdk, [FIXTURE.labelA, FIXTURE.labelB])
    const before = world.registry.get(a.entryKey).generation
    world.doc.tokens = [...world.doc.tokens, { label: FIXTURE.labelCopy, enabled: true, key: a.entryKey }]
    const next = await world.restart()
    atStart(next)
    assertUnusable(next, a.entryKey, a.value)
    assertDuplicate(next.registry.notice(), [[FIXTURE.labelA, FIXTURE.labelCopy]], next)
    assert.deepEqual(next.revocations, [])
    assert.equal(next.registry.get(a.entryKey).generation, before)
    assertMatches(next, b)
  })
  row(sdk, ID.dt13, '9 (digest)', 'at start, two entries whose records share one digest (store edited by hand): both listed, enabled: false, neither matches; the notice names both', async (t) => {
    const { world, made: [a, b] } = await withEntries(t, sdk, [FIXTURE.labelA, FIXTURE.labelB])
    const next = await world.restart({ stage: (table) => table.update(recordKeyOf(table, b), (r) => ({ ...r, [STORE.digestField]: digestOf(a.value) })) })
    atStart(next)
    assertUnusable(next, a.entryKey, a.value)
    assertUnusable(next, b.entryKey, b.value)
    assertDuplicate(next.registry.notice(), [[FIXTURE.labelA, FIXTURE.labelB]], next)
    assert.deepEqual(next.revocations, [])
  })
  row(sdk, ID.dt13, '9 (no record)', 'at start, an item with no record: listed, enabled: false, never authenticates; the notice names it; the other entries serve (R5)', async (t) => {
    const { world, made: [a] } = await withEntries(t, sdk, [FIXTURE.labelA])
    world.doc.tokens = [...world.doc.tokens, { label: FIXTURE.handLabel, enabled: true, key: FIXTURE.handKey }]
    const next = await world.restart()
    atStart(next)
    assertUnusable(next, FIXTURE.handKey)
    assert.equal(next.registry.get(FIXTURE.handKey).label, FIXTURE.handLabel)
    assertDuplicate(next.registry.notice(), [[FIXTURE.handLabel]], next)
    assertMatches(next, a)
  })
  row(sdk, ID.dt13, '9 (W2 store)', `at start over a store a W2 build left (version ${STORE.oldVersion}): its records are ignored and authenticate nothing; their items read as having no record`, async (t) => {
    const value = strangerValue()
    const item = { label: FIXTURE.labelA, enabled: true, key: FIXTURE.handKey }
    const record = { entryKey: FIXTURE.handKey, label: FIXTURE.labelA, enabled: true, generation: 0, [STORE.digestField]: digestOf(value), hosted: false, removed: false }
    const world = await worldFor(t, sdk, { tokens: [item], stageVersion: STORE.oldVersion, stage: (table) => table.put(FIXTURE.handKey, record) })
    atStart(world)
    assertNoMatch(world, value, 'a W2 record authenticates')
    assertUnusable(world, FIXTURE.handKey)
    assertDuplicate(world.registry.notice(), [[FIXTURE.labelA]], world)
  })
  row(sdk, ID.dt13, 10, 'save that keeps a start problem and edits something else: accepted; the problem and its notice stay', async (t) => {
    const { world, made: [a, b] } = await withEntries(t, sdk, [FIXTURE.labelA, FIXTURE.labelB])
    world.doc.tokens = [...world.doc.tokens, { label: FIXTURE.handLabel, enabled: true, key: FIXTURE.handKey }]
    const next = await world.restart()
    await assertAccepted(next.save(edited(next, b.entryKey, { label: FIXTURE.renamed })))
    assert.equal(next.registry.get(b.entryKey).label, FIXTURE.renamed)
    assert.deepEqual(next.restored, [])
    assertUnusable(next, FIXTURE.handKey)
    assertDuplicate(next.registry.notice(), [[FIXTURE.handLabel]], next)
    assertMatches(next, a)
  })
  row(sdk, ID.dt13, 11, 'save that removes the copy behind a start problem: accepted; the entry serves again; the notice is cleared; no revocation', async (t) => {
    const { world, made: [a] } = await withEntries(t, sdk, [FIXTURE.labelA])
    const original = structuredClone(world.doc.tokens)
    world.doc.tokens = [...original, { label: FIXTURE.labelCopy, enabled: true, key: a.entryKey }]
    const next = await world.restart()
    assertUnusable(next, a.entryKey, a.value)
    await assertAccepted(next.save(original))
    assertMatches(next, a)
    assert.equal(next.registry.get(a.entryKey).enabled, true)
    assert.equal(next.registry.notice(), undefined)
    assert.deepEqual(next.revocations, [])
  })
  row(sdk, ID.dt13, '11 (no record)', 'save that removes a hand-added item: accepted; the notice is cleared', async (t) => {
    const { world } = await withEntries(t, sdk, [FIXTURE.labelA])
    const original = structuredClone(world.doc.tokens)
    world.doc.tokens = [...original, { label: FIXTURE.handLabel, enabled: true, key: FIXTURE.handKey }]
    const next = await world.restart()
    await assertAccepted(next.save(original))
    assert.equal(next.registry.notice(), undefined)
    assert.equal(next.registry.get(FIXTURE.handKey), undefined)
  })
  row(sdk, ID.dt13, '12 (no problem)', 'with no problem the notice is undefined, at start and after saves', async (t) => {
    const { world, made: [a] } = await withEntries(t, sdk, [FIXTURE.labelA, FIXTURE.labelB])
    assert.equal(world.registry.notice(), undefined)
    await assertAccepted(world.save(edited(world, a.entryKey, { label: FIXTURE.renamed })))
    assert.equal(world.registry.notice(), undefined)
    assert.equal((await world.restart()).registry.notice(), undefined)
  })
  const item = (label, key) => ({ label, enabled: true, key })
  for (const [part, list, expected] of [
    ['12 (empty)', [], []],
    ['12 (one)', [item('A', 'k1')], []],
    ['12 (two distinct)', [item('A', 'k1'), item('B', 'k2')], []],
    ['12 (two, one key)', [item('A', 'k1'), item('B', 'k1')], [['A', 'B']]],
    ['12 (three, one key)', [item('A', 'k1'), item('B', 'k1'), item('C', 'k1')], [['A', 'B', 'C']]],
    ['12 (two pairs)', [item('A', 'k1'), item('B', 'k2'), item('C', 'k1'), item('D', 'k2')], [['A', 'C'], ['B', 'D']]],
    ['12 (disabled)', [item('A', 'k1'), { label: 'B', enabled: false, key: 'k1' }], [['A', 'B']]],
  ]) {
    row(sdk, ID.dt13, part, `findDuplicates groups the labels of items sharing one key: ${JSON.stringify(expected)}`, async () => {
      const mod = await tokensModule(sdk)
      assert.deepEqual(groups(mod[SUBJECT.findDuplicates](list)), groups(expected))
    })
  }
  row(sdk, ID.dt13, '5–7 (endpoint)', 'an entry in a problem gets invalid_client at the token endpoint, and its approval page refuses it', null, LATER.tokenEndpoint)

  // ---- AUTH-ST-01: token entry lifecycle (State Transition; no Unconfigured state) ----

  row(sdk, ID.st01, 1, 'none → New token → Ready: the value is returned once and authenticates; the entry starts at some generation g', async (t) => {
    const world = await worldFor(t, sdk)
    assert.deepEqual(world.registry.list(), [])
    const m = await created(world, FIXTURE.labelA)
    assertMatches(world, m)
    assert.deepEqual(world.revocations, [])
  })
  row(sdk, ID.st01, '5/7', 'Ready → disable → Off: one disabled revocation with a newer generation, equal to the entry\'s; the value authenticates nothing', async (t) => {
    const { world, made: [m] } = await withEntries(t, sdk, [FIXTURE.labelA])
    const before = world.registry.get(m.entryKey).generation
    await assertAccepted(world.save(edited(world, m.entryKey, { enabled: false })))
    const revoked = assertRevokedOnce(world, m.entryKey, REVOCATION_KIND.disabled, before)
    assert.equal(world.registry.get(m.entryKey).generation, revoked.generation)
    assertNoMatch(world, m.value, 'a disabled entry authenticates')
  })
  row(sdk, ID.st01, '5 (tokens)', '401 for its access tokens and invalid_client at the token endpoint', null, LATER.accessTokens)
  row(sdk, ID.st01, '6/8', 'Off → enable → Ready: the same entry authenticates again; no revocation', async (t) => {
    const { world, made: [m] } = await withEntries(t, sdk, [FIXTURE.labelA])
    await assertAccepted(world.save(edited(world, m.entryKey, { enabled: false })))
    await assertAccepted(world.save(edited(world, m.entryKey, { enabled: true })))
    assertMatches(world, m)
    assert.equal(world.revocations.length, 1)
  })
  row(sdk, ID.st01, 9, 'Ready → delete → Gone: one deleted revocation; unknown to get and list; the record dropped; nothing unset', async (t) => {
    const { world, made: [m] } = await withEntries(t, sdk, [FIXTURE.labelA])
    const before = world.registry.get(m.entryKey).generation
    await assertAccepted(world.save(without(world, m.entryKey)))
    assertRevokedOnce(world, m.entryKey, REVOCATION_KIND.deleted, before)
    assert.equal(world.registry.get(m.entryKey), undefined)
    assert.deepEqual(world.registry.list(), [])
    await assertRecordDropped(world, m)
    assert.deepEqual(world.credentialWrites, [])
  })
  row(sdk, ID.st01, '9 (off)', 'Off → delete → Gone: one deleted revocation after the disabled one', async (t) => {
    const { world, made: [m] } = await withEntries(t, sdk, [FIXTURE.labelA])
    await assertAccepted(world.save(edited(world, m.entryKey, { enabled: false })))
    await assertAccepted(world.save(without(world, m.entryKey)))
    assert.deepEqual(revocationsOf(world, m.entryKey).map((r) => r.kind), [REVOCATION_KIND.disabled, REVOCATION_KIND.deleted])
    const [first, second] = revocationsOf(world, m.entryKey)
    assert.ok(second.generation > first.generation)
  })
  row(sdk, ID.st01, 12, 'Gone → any request, another save, a restart → Gone: no match, still unknown, no second revocation', async (t) => {
    const { world, made: [m] } = await withEntries(t, sdk, [FIXTURE.labelA])
    await assertAccepted(world.save(without(world, m.entryKey)))
    for (let i = 0; i < 2; i += 1) assertNoMatch(world, m.value, 'a deleted entry authenticates')
    await assertAccepted(world.save(world.doc.tokens))
    assert.ok(await staysFalse(() => world.revocations.length > 1), 'a gone entry was revoked again')
    const next = await world.restart()
    assertNoMatch(next, m.value, 'a deleted entry authenticates after a restart')
    assert.equal(next.registry.get(m.entryKey), undefined)
  })
  row(sdk, ID.st01, '12 (re-added)', 'Gone → its old key added back by hand → refused token-duplicate (no record); the value stays dead', async (t) => {
    const { world, made: [m] } = await withEntries(t, sdk, [FIXTURE.labelA])
    const old = itemOf(world, m.entryKey)
    await assertAccepted(world.save(without(world, m.entryKey)))
    await assertRecordDropped(world, m)
    assertDuplicate(await world.save([...world.doc.tokens, old]), [[FIXTURE.labelA]], world)
    assertNoMatch(world, m.value, 'a re-added deleted entry authenticates')
  })
  row(sdk, ID.st01, '12 (endpoint)', 'invalid_client at the token endpoint and 401 at the MCP endpoint', null, LATER.accessTokens)
  row(sdk, ID.st01, 'r1', 'Ready and Off → connector restart → Ready and Off: the value still matches, the disabled one is still refused, generations kept', async (t) => {
    const { world, made: [a, b] } = await withEntries(t, sdk, [FIXTURE.labelA, FIXTURE.labelB])
    await assertAccepted(world.save(edited(world, b.entryKey, { enabled: false })))
    const generations = world.registry.list().map((e) => [e.entryKey, e.generation])
    const next = await world.restart()
    assertMatches(next, a)
    assertNoMatch(next, b.value, 'a disabled entry authenticates after a restart')
    assert.equal(next.registry.get(b.entryKey).enabled, false)
    assert.deepEqual(next.registry.list().map((e) => [e.entryKey, e.generation]), generations)
    assert.deepEqual(next.revocations, [], 'the restart revoked')
  })
  row(sdk, ID.st01, 'r2', 'Gone → New token → Ready: a new principal (new key, new value), the old value still dead', async (t) => {
    const { world, made: [m] } = await withEntries(t, sdk, [FIXTURE.labelA])
    await assertAccepted(world.save(without(world, m.entryKey)))
    const next = await created(world, FIXTURE.labelA)
    assert.notEqual(next.entryKey, m.entryKey)
    assertMatches(world, next)
    assertNoMatch(world, m.value, 'the old value authenticates')
  })
  row(sdk, ID.st01, 'r3', 'any state → read or change the value → no such transition: no revocation kind but disabled and deleted is ever reported', async (t) => {
    const { world, made: [a, b] } = await withEntries(t, sdk, [FIXTURE.labelA, FIXTURE.labelB])
    await assertAccepted(world.save(edited(world, a.entryKey, { label: FIXTURE.renamed })))
    await assertAccepted(world.save([...world.doc.tokens].reverse()))
    await assertAccepted(world.save(edited(world, a.entryKey, { enabled: false })))
    await assertAccepted(world.save(edited(world, a.entryKey, { enabled: true })))
    await assertAccepted(world.save(without(world, b.entryKey)))
    const kinds = new Set(Object.values(REVOCATION_KIND))
    assert.deepEqual(world.revocations.filter((r) => !kinds.has(r.kind)), [])
  })
}

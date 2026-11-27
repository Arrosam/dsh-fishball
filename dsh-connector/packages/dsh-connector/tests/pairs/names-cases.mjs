/**
 * Generated names (the user's decision, 2026-11-21): "When an agent pairs and the default name
 * 'Fishball' is already taken (or generally, when it has no name), generate a name with a random
 * name generator instead of showing 'ID: <id>'. Make the names readable and unique among the agents
 * paired to this DSH." It supersedes R-NAME-04's "the connector never assigns a name" for the
 * nameless case; R-NAME-06's refusal report stays.
 *
 * | Row | Technique | Expected |
 * |---|---|---|
 * | GEN-NAME EP (form) | EP | every generated name is two capitalised ASCII words, valid as stored (R-NAME-02 checkName) |
 * | GEN-NAME EP (folded uniqueness) | EP | never a name held by another, in any letter case (K1 nameKey) |
 * | GEN-NAME BVA (exhaustion) | BVA | a random source whose every draw collides → the base with " 2", " 3", … the first free suffix; ends |
 * | GEN-NAME UC (default name ×3) | UC | three pair({name: "Fishball"}) (the 3rd "FISHBALL"): "Fishball", then two distinct generated names, refusal reported |
 * | GEN-NAME DT (set_name) | DT | null → a generated name replacing the current one; refused on a named pair → unchanged; refused on a nameless pair → a generated name, still {ok: false, code} |
 * | GEN-NAME UC (Connect) | UC | page bind with no name → nameless; set_name("Fishball") held → name-taken, and the pair is named by the generator |
 * | GEN-NAME ST (backfill) | ST | pairs stored nameless before the decision → named at the next open, uniquely, durably; a page-bound pair awaiting its first request stays nameless |
 */
import assert from 'node:assert/strict'
import { caseTest } from 'dsh-connector-test-helpers/cases'
import { assertGeneratedName, assertNameRefused, assertPairedGenerated, assertUniqueNames, at, bind, bindNameless, refusal, row, setName } from './cases.mjs'
import { FIXTURE, GENERATED, REFUSAL, SUBJECT, nameKey, principalLabel } from './constants.mjs'
import { pairWorld, pairsModule } from './subject.mjs'

const E = FIXTURE.entry
const NAME = FIXTURE.name
const ID = FIXTURE.id
const CASE = 'GEN-NAME'

/** A generator row: the pure function from the pairs entry, no store. */
const generatorRow = (sdk, part, title, fn) => caseTest(sdk, CASE, part, title, async () => fn((await pairsModule(sdk))[SUBJECT.generate]))
/** A store row whose names come from `random` (the openPairStore option). */
const randomRow = (sdk, part, title, random, fn) => caseTest(sdk, CASE, part, title, async (t) => fn(await pairWorld(t, sdk, { random })))
/** The registry record as a connector before the decision stored it (pairs nameless unless `name`). */
const stored = (n, id, extra = {}) => ({ entryKey: E(n), principalKey: `fbtest-pk-${n}`, id, name: null, pairedAt: at(), lastSeenAt: null, ...extra })

function generator(sdk) {
  generatorRow(sdk, 'EP (form)', `${GENERATED.many} draws: each is two capitalised ASCII words and valid as stored (R-NAME-02)`, (generate) => {
    for (let i = 0; i < GENERATED.many; i += 1) assertGeneratedName(generate([]))
  })
  generatorRow(sdk, 'EP (folded uniqueness)', 'never returns a name held by another in any letter case; draws avoid every held one', (generate) => {
    const first = generate([])
    const held = [first.toUpperCase(), first.toLowerCase()]
    for (let i = 0; i < GENERATED.many; i += 1) {
      const name = generate(held)
      assert.ok(!held.map(nameKey).includes(nameKey(name)), `${name} is held`)
      held.push(name)
    }
  })
  generatorRow(sdk, 'BVA (exhaustion)', `every draw collides (an injected source) → the base name with the first free suffix from ${GENERATED.suffixFrom}; held suffixes skipped, folded`, (generate) => {
    const base = generate([], GENERATED.firstWord)
    assertGeneratedName(base)
    const suffixed = (n) => base + GENERATED.separator + n
    assert.equal(generate([base], GENERATED.firstWord), suffixed(GENERATED.suffixFrom))
    const held = [base.toUpperCase()]
    for (let n = GENERATED.suffixFrom; n < GENERATED.suffixFrom + GENERATED.exhaustion; n += 1) held.push(suffixed(n).toLowerCase())
    const next = generate(held, GENERATED.firstWord)
    assert.equal(next, suffixed(GENERATED.suffixFrom + GENERATED.exhaustion))
    assertGeneratedName(next)
  })
}

function store(sdk) {
  row(sdk, CASE, 'UC (default name ×3)', 'three agents pair({name: "Fishball"}), the 3rd as "FISHBALL": the 1st is Fishball; the 2nd and 3rd get distinct generated names, nameRefused name-taken', async (w) => {
    assert.deepEqual(await w.store.pair(E(1), ID.a, NAME.fishball, at()), { ok: true, paired: true, id: ID.a, name: NAME.fishball, nameAssigned: true })
    const second = assertNameRefused(await w.store.pair(E(2), ID.b, NAME.fishball, at()), ID.b, REFUSAL.nameTaken)
    const third = assertNameRefused(await w.store.pair(E(3), ID.x, NAME.fishball.toUpperCase(), at()), ID.x, REFUSAL.nameTaken)
    assert.deepEqual(w.store.list().map((p) => p.name), [NAME.fishball, second, third])
    for (const p of w.store.list()) assert.deepEqual(principalLabel(p.name, p.id), { name: p.name }, 'shown as ID: <id>')
    assertUniqueNames(w)
  })
  randomRow(sdk, 'UC (collision fallback)', 'every random draw collides: the 2nd and 3rd pair({}) get the base name\'s " 2" and " 3"', GENERATED.firstWord, async (w) => {
    const base = assertPairedGenerated(await w.store.pair(E(1), ID.a, undefined, at()), ID.a)
    assert.equal(assertPairedGenerated(await w.store.pair(E(2), ID.b, undefined, at()), ID.b), base + GENERATED.separator + GENERATED.suffixFrom)
    assert.equal(assertPairedGenerated(await w.store.pair(E(3), ID.x, undefined, at()), ID.x), base + GENERATED.separator + (GENERATED.suffixFrom + 1))
    assertUniqueNames(w)
  })
  row(sdk, CASE, 'DT (set_name null)', 'set_name(null) on a chosen name → ok with a new generated name; the cleared name is free; the store holds the answered name', async (w) => {
    await bind(w, 1, ID.a, NAME.bob)
    const cleared = await setName(w, 1, null)
    assert.deepEqual(cleared, { ok: true, name: cleared.name })
    assertGeneratedName(cleared.name)
    assert.equal(w.store.pairOf(E(1)).name, cleared.name)
    await bind(w, 2, ID.b)
    assert.deepEqual(await setName(w, 2, NAME.bob), { ok: true, name: NAME.bob })
  })
  randomRow(sdk, 'DT (set_name null, generated)', 'set_name(null) on a generated name → another generated name, never the one it cleared', GENERATED.firstWord, async (w) => {
    const { name } = await bind(w, 1, ID.a)
    const cleared = await setName(w, 1, null)
    assert.equal(cleared.ok, true)
    assertGeneratedName(cleared.name)
    assert.notEqual(nameKey(cleared.name), nameKey(name))
  })
  row(sdk, CASE, 'DT (refused, named)', 'set_name of a held name on a named pair → name-taken; the pair keeps its name (unchanged rule)', async (w) => {
    await bind(w, 1, ID.a, NAME.fishball)
    const { name } = await bind(w, 2, ID.b)
    const before = w.snapshot()
    assert.deepEqual(await setName(w, 2, NAME.fishball), refusal(REFUSAL.nameTaken))
    assert.equal(w.store.pairOf(E(2)).name, name)
    assert.deepEqual(w.snapshot(), before, 'nothing changes')
  })
  row(sdk, CASE, 'DT (refused, nameless)', 'set_name "   " on a nameless pair → name-invalid, and the pair is named by the generator', async (w) => {
    await bindNameless(w, 1, ID.agentW)
    assert.deepEqual(await setName(w, 1, NAME.blank), refusal(REFUSAL.nameInvalid))
    assertGeneratedName(w.store.pairOf(E(1)).name)
  })
  row(sdk, CASE, 'UC (Connect)', 'page bind with no name → nameless (ID: <id>) until the first name call; set_name("Fishball") while held → name-taken, the pair gets a generated name; the agent can still rename', async (w) => {
    await bind(w, 1, ID.a, NAME.fishball)
    const bound = await bindNameless(w, 2, ID.agentW)
    assert.deepEqual(principalLabel(bound.name, bound.id), principalLabel(null, ID.agentW), 'briefly nameless, by design')
    assert.deepEqual(await setName(w, 2, NAME.fishball), refusal(REFUSAL.nameTaken), 'the refusal is still reported')
    const { name } = w.store.pairOf(E(2))
    assertGeneratedName(name)
    assert.deepEqual(principalLabel(name, ID.agentW), { name })
    assertUniqueNames(w)
    assert.deepEqual(await setName(w, 2, NAME.bob), { ok: true, name: NAME.bob })
  })
  row(sdk, CASE, 'ST (backfill)', 'pairs stored nameless before the decision → each gets a distinct generated name at the next open, durably; named pairs and a page-bound pair awaiting its first request stay as they were', async (w) => {
    await w.seedStored([
      stored(1, ID.a, { name: NAME.fishball }),
      stored(2, ID.b),
      stored(3, ID.x, { lastSeenAt: at() }),
      stored(4, ID.y, { clientIdUrl: FIXTURE.client.clientIdUrl, redirectUri: FIXTURE.client.redirectUri, lastSeenAt: at() }),
      stored(5, ID.agentW, { clientIdUrl: FIXTURE.client.clientIdUrl, redirectUri: FIXTURE.client.redirectUri }),
    ])
    const names = w.store.list().map((p) => p.name)
    assert.equal(names[0], NAME.fishball)
    for (const name of names.slice(1, 4)) assertGeneratedName(name)
    assert.equal(names[4], null, 'a page bind awaiting its first name call')
    assertUniqueNames(w)
    await w.reopen()
    assert.deepEqual(w.store.list().map((p) => p.name), names, 'durable, and not drawn again')
  })
}

/** The generated-name rows on one SDK. */
export function registerCPairNameCases(sdk) {
  generator(sdk)
  store(sdk)
}

/**
 * IX-MULTI: one real DSH connected to several agents (several Fishball instances, or other paired
 * principals), and the names the Hand over UI is given for them. Black box: tokens are made on the
 * owner's settings route, agents pair through the stock MCP SDK client with `pair({name})` and
 * rename with `set_name`; the names are read where the browser reads them, the UI backend's state
 * route and its event stream, beside the host service `dshConnectorHandover.principals()`, and the
 * Hand over goes through the owner's UI route. Each row boots its own DSH, so its targets are its
 * own agents only.
 *
 * Expected values (requirements, not the implementation): K3 `principals()` lists every token entry
 * in the settings list's order ({key, name, id, online, enabled, paired}; unpaired: key = entry key,
 * name and id null); the Hand over targets are the enabled and paired ones in that order with
 * {key, name, id, online} (R-UI-10); marks name the managing pair (R-UI-05); names are unique per
 * connector, case-folded (R-NAME-02): a `pair` whose name is held still pairs, with
 * `nameRefused: 'name-taken'` (R-NAME-06, NAME-DT-01) and, since the user's decision of 2026-11-21,
 * a generated name in place of none (so no agent shows "ID: <id>"); a disabled entry keeps its pair (and so its
 * name; C-REVOKE: only a delete removes the pair) and is no target; deleting an entry frees its
 * name (R-NAME-02); a nameless agent is shown as bold "ID:" and its id (R-NAME-08, browser rows
 * MARKS-MULTI); the `handover` event goes to the new manager only (HAND-DT-01 rule 5).
 *
 * | Row | Technique | Expected |
 * |---|---|---|
 * | IX-MULTI EP (names) | EP (named, unicode RTL, paired without a name → generated, disabled, never paired) × BVA (5 agents) | principals(), state targets and stream targets map 1:1 by id to the right pair; order = settings list; disabled and unpaired excluded from targets; online only for the listening one |
 * | IX-MULTI ST (reorder) | ST | the settings list reordered → targets reorder, no name moves |
 * | IX-MULTI ST (rename) | ST | set_name on the 2nd → state and stream show the new name for the 2nd's key, the others unchanged |
 * | IX-MULTI UC (hand over to the 2nd) | UC | UI route handover with the 2nd's key → answer principal and marks name the 2nd; the 2nd gets one handover event, the 1st and 3rd none |
 * | IX-MULTI DT (default name "Fishball" ×3) | DT (name free / held / held in another case) | 1st gets "Fishball"; 2nd and 3rd ("FISHBALL") pair with name-taken and two distinct generated names; principals(), state targets and the hand-over mark show those names, never null |
 * | IX-MULTI ST (default name freed) | ST | set_name "Fishball" by the 2nd → name-taken; the 1st disabled → still name-taken (a disabled pair keeps its name); the 1st deleted → ok; targets: the 2nd is "Fishball" |
 */
import assert from 'node:assert/strict'
import { HTTP } from 'dsh-connector-test-helpers/connector-world/constants'
import { createToken } from 'dsh-connector-test-helpers/connector-world/steps'
import { EVENT_TYPE, K1, MULTI_AGENT as M, SURFACE, TOOL } from 'dsh-connector-test-helpers/connector-world/interactions-constants'
import { row } from 'dsh-connector-test-helpers/connector-world/rows'
import { call, connect, eventually, fresh, ofType, okCall, pending, saveTokens, session, setEnabled, tokensOf, world } from 'dsh-connector-test-helpers/connector-world/interactions'
import { stateOf } from 'dsh-connector-test-helpers/connector-world/steps'
import { assertGeneratedName } from '../pairs/cases.mjs'

const H = SURFACE.service.handover
const ID_BASE = 'ix-multi'

/** A token entry and, unless `pairs` is false, a stock client paired with `name` (omitted: no name). */
async function agent(t, w, label, { name, pairs = true } = {}) {
  const made = await createToken(w, fresh(label))
  if (!pairs) return { made, entryKey: made.entryKey }
  const id = fresh(ID_BASE)
  const client = await connect(t, w, { id, value: made.value })
  const paired = await okCall(client, TOOL.pair, name === undefined ? {} : { name })
  assert.equal(paired.id, id)
  return { made, entryKey: made.entryKey, id, client, paired }
}
const principals = async (w) => (await w.service(H, 'principals')).value
const principalKeyOf = async (w, a) => (await principals(w)).find((p) => p.id === a.id)?.key
/** The UI backend's snapshot, as the browser's state route answers it. */
async function uiState(w) {
  const answer = await w.owner('GET', SURFACE.route.uiState)
  assert.equal(answer.status, HTTP.ok, answer.text)
  return answer.json.state
}
const view = (rows) => rows.map(({ key, name, id }) => ({ key, name, id }))

/** The UI backend's event stream as the owner's page opens it; `latest()` is its newest frame. */
async function stream(t, w) {
  const abort = new AbortController()
  const res = await fetch(w.origin + M.events, { headers: { cookie: w.dsh.cookie, origin: w.origin, ...HTTP.sameOrigin }, signal: abort.signal })
  assert.equal(res.status, HTTP.ok)
  const frames = []
  let buffer = ''
  const decoder = new TextDecoder()
  const pump = (async () => {
    try {
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true })
        let at
        while ((at = buffer.indexOf(M.frame.end)) >= 0) {
          frames.push(JSON.parse(buffer.slice(M.frame.prefix.length, at)))
          buffer = buffer.slice(at + M.frame.end.length)
        }
      }
    } catch { /* aborted at the row's end */ }
  })()
  t.after(async () => { abort.abort(); await pump })
  return {
    latest: () => frames.at(-1),
    /** Waits for a frame whose snapshot satisfies `pred`. */
    async seen(pred, what) {
      assert.ok(await eventually(() => frames.some(pred)), 'no stream frame shows ' + what)
      return frames.findLast(pred)
    },
  }
}

/** The targets the requirements expect: the settings list's enabled and paired entries, in its order, keyed by principals(). */
async function expectedTargets(w) {
  const keys = new Map((await principals(w)).filter((p) => p.paired).map((p) => [p.id, p.key]))
  return (await stateOf(w)).entries.filter((e) => e.enabled && e.paired).map((e) => ({ key: keys.get(e.id), name: e.name, id: e.id }))
}

/** Five entries: Fishball, Fishball Two (listening), an RTL name, a nameless one, a disabled one, and one that never pairs. */
async function roster(t, w) {
  const first = await agent(t, w, M.label.first, { name: M.name.first })
  const second = await agent(t, w, M.label.second, { name: M.name.second })
  const rtl = await agent(t, w, M.label.rtl, { name: M.name.rtl })
  const nameless = await agent(t, w, M.label.nameless)
  const disabled = await agent(t, w, M.label.disabled, { name: M.name.disabled })
  const never = await agent(t, w, M.label.never, { pairs: false })
  const sub = await second.client.listen({ resourceSubscriptions: [K1.RESOURCE.events.uri] }, { timeout: K1.TIME_UNIT.msPerSecond * 10 })
  t.after(() => sub.close?.().catch?.(() => {}))
  for (const a of [first, second, rtl, nameless, disabled]) a.key = await principalKeyOf(w, a)
  await setEnabled(w, disabled, false)
  assert.ok(await eventually(async () => (await principals(w)).find((p) => p.key === disabled.key)?.enabled === false), 'the entry is not disabled')
  assert.ok(await eventually(async () => (await principals(w)).find((p) => p.id === second.id)?.online === true), 'the listening agent is not online')
  return { first, second, rtl, nameless, disabled, never }
}
const ref = (a, name) => ({ key: a.key, name, id: a.id })

export function registerMultiAgentCases(sdk) {
  row(sdk, M.id, 'EP (names)', 'named, unicode RTL, paired-without-a-name (generated), disabled and never-paired agents → principals(), the state route and the stream map each target 1:1 to its pair, in settings order; disabled and unpaired excluded', async (t) => {
    const w = await world(sdk, M.scenario.names)
    const r = await roster(t, w)
    const s = await stream(t, w)
    assert.deepEqual([r.first.paired.name, r.second.paired.name, r.rtl.paired.name], [M.name.first, M.name.second, M.name.rtl], 'pair results')
    assertGeneratedName(r.nameless.paired.name)
    const want = [ref(r.first, M.name.first), ref(r.second, M.name.second), ref(r.rtl, M.name.rtl), ref(r.nameless, r.nameless.paired.name)]
    assert.deepEqual(await expectedTargets(w), want, 'harness: the settings list does not hold the roster in creation order')
    const all = await principals(w)
    assert.deepEqual(all.map((p) => [p.key, p.name, p.id, p.paired, p.enabled]), [
      ...want.map((p) => [p.key, p.name, p.id, true, true]),
      [r.disabled.key, M.name.disabled, r.disabled.id, true, false],
      [r.never.entryKey, null, null, false, true],
    ], 'principals()')
    const state = await uiState(w)
    assert.deepEqual(view(state.targets), want, 'state targets')
    assert.deepEqual(state.targets.map((x) => x.online), [false, true, false, false], 'state lights')
    assert.deepEqual(view(state.targets).filter((x) => [r.disabled.key, r.never.entryKey].includes(x.key)), [], 'a disabled or unpaired entry is a target')
    assert.deepEqual(view((await s.seen((f) => f.targets.length === want.length, 'the roster')).targets), want, 'stream targets')
  })

  row(sdk, M.id, 'ST (reorder)', 'the settings list reordered (the first entry moved last) → the targets follow the new order; every key keeps its own name', async (t) => {
    const w = await world(sdk, M.scenario.reorder)
    const r = await roster(t, w)
    const s = await stream(t, w)
    const list = await tokensOf(w)
    const moved = [...list.filter((i) => i.key !== r.first.entryKey), list.find((i) => i.key === r.first.entryKey)]
    assert.equal((await saveTokens(w, moved)).ok, true)
    const want = [ref(r.second, M.name.second), ref(r.rtl, M.name.rtl), ref(r.nameless, r.nameless.paired.name), ref(r.first, M.name.first)]
    assert.ok(await eventually(async () => JSON.stringify(view((await uiState(w)).targets)) === JSON.stringify(want)), 'state targets did not follow the new order: ' + JSON.stringify(view((await uiState(w)).targets)))
    assert.deepEqual(view((await s.seen((f) => f.targets[0]?.key === r.second.key, 'the new order')).targets), want, 'stream targets')
  })

  row(sdk, M.id, 'ST (rename)', `set_name "${M.name.renamed}" by the 2nd → its key shows the new name in the state route and the stream; the others are unchanged`, async (t) => {
    const w = await world(sdk, M.scenario.rename)
    const r = await roster(t, w)
    const s = await stream(t, w)
    assert.deepEqual(await okCall(r.second.client, TOOL.setName, { name: M.name.renamed }), { ok: true, name: M.name.renamed })
    const want = [ref(r.first, M.name.first), ref(r.second, M.name.renamed), ref(r.rtl, M.name.rtl), ref(r.nameless, r.nameless.paired.name)]
    assert.deepEqual(view((await s.seen((f) => f.targets.some((x) => x.name === M.name.renamed), 'the rename')).targets), want, 'stream targets')
    assert.deepEqual(view((await uiState(w)).targets), want, 'state targets')
    assert.equal((await principals(w)).find((p) => p.key === r.second.key)?.name, M.name.renamed, 'principals()')
  })

  row(sdk, M.id, 'UC (hand over to the 2nd)', 'POST ui/handover with the 2nd target\'s key → the answer and the marks name the 2nd; only the 2nd agent gets the handover event', async (t) => {
    const w = await world(sdk, M.scenario.handOver)
    const r = await roster(t, w)
    const s = await stream(t, w)
    const sid = await session(w)
    const [, target] = (await uiState(w)).targets
    assert.deepEqual(view([target]), [ref(r.second, M.name.second)], 'harness: the 2nd target is not the 2nd agent')
    const answer = await w.owner('POST', SURFACE.route.uiHandOver, { sessionId: sid, principalKey: target.key })
    assert.equal(answer.status, HTTP.ok, answer.text)
    assert.deepEqual(answer.json.principal, ref(r.second, M.name.second), 'answer principal')
    const markOf = (snapshot) => snapshot.marks.find((m) => m.sessionId === sid)
    assert.deepEqual(markOf(answer.json.state)?.principal, ref(r.second, M.name.second), 'answer state mark')
    assert.deepEqual(markOf(await uiState(w))?.principal, ref(r.second, M.name.second), 'state mark')
    assert.deepEqual(markOf(await s.seen((f) => markOf(f) !== undefined, 'the mark'))?.principal, ref(r.second, M.name.second), 'stream mark')
    const handovers = async (a) => ofType(await pending(a.client), EVENT_TYPE.handover).filter((e) => e.payload.sessionId === sid)
    assert.ok(await eventually(async () => (await handovers(r.second)).length > 0), 'the 2nd agent got no handover event')
    assert.equal((await handovers(r.second)).length, 1, 'handover events of the 2nd')
    for (const other of [r.first, r.rtl, r.nameless]) assert.deepEqual(await handovers(other), [], 'another agent got the handover: ' + other.id)
  })

  // Re-baselined by the user's decision of 2026-11-21: the 2nd and 3rd get generated names, not null.
  row(sdk, M.id, `DT (default name "${M.defaultName}" ×3)`, `three Fishball instances ask for "${M.defaultName}" (the 3rd as "${M.folded}") → the 1st is "${M.defaultName}"; the 2nd and 3rd pair with name-taken and two distinct generated names; principals(), the targets and the mark read those names`, async (t) => {
    const w = await world(sdk, M.scenario.fishball)
    const a = await agent(t, w, M.label.first, { name: M.defaultName })
    const b = await agent(t, w, M.label.second, { name: M.defaultName })
    const c = await agent(t, w, M.label.rtl, { name: M.folded })
    assert.deepEqual(a.paired, { ok: true, paired: true, id: a.id, name: M.defaultName, nameAssigned: true }, '1st pair')
    for (const [x, what] of [[b, '2nd'], [c, '3rd']]) {
      assert.deepEqual(x.paired, { ok: true, paired: true, id: x.id, name: x.paired.name, nameAssigned: false, nameRefused: M.nameTaken }, what + ' pair')
      assertGeneratedName(x.paired.name)
    }
    const names = [a, b, c].map((x) => x.paired.name.toLowerCase())
    assert.equal(new Set(names).size, names.length, 'two agents hold one folded name: ' + JSON.stringify(names))
    for (const x of [a, b, c]) x.key = await principalKeyOf(w, x)
    const want = [ref(a, M.defaultName), ref(b, b.paired.name), ref(c, c.paired.name)]
    assert.deepEqual((await principals(w)).map(({ key, name, id }) => ({ key, name, id })), want, 'principals()')
    assert.deepEqual(view((await uiState(w)).targets), want, 'state targets')
    const sid = await session(w)
    const answer = await w.owner('POST', SURFACE.route.uiHandOver, { sessionId: sid, principalKey: c.key })
    assert.equal(answer.status, HTTP.ok, answer.text)
    assert.deepEqual(answer.json.state.marks.find((m) => m.sessionId === sid)?.principal, ref(c, c.paired.name), 'the mark names the generated name')
  })

  row(sdk, M.id, `ST (default name "${M.defaultName}" freed)`, `the 2nd's set_name "${M.defaultName}" → name-taken; the 1st disabled → still name-taken; the 1st deleted → ok; the targets: the 2nd is "${M.defaultName}"`, async (t) => {
    const w = await world(sdk, M.scenario.freed)
    const a = await agent(t, w, M.label.first, { name: M.defaultName })
    const b = await agent(t, w, M.label.second, { name: M.defaultName })
    b.key = await principalKeyOf(w, b)
    const taken = async (what) => {
      const refused = await call(b.client, TOOL.setName, { name: M.defaultName })
      assert.deepEqual([refused.ok, refused.code], [false, M.nameTaken], 'set_name ' + what)
    }
    await taken('while the 1st holds it')
    a.key = await principalKeyOf(w, a)
    await setEnabled(w, a, false)
    assert.ok(await eventually(async () => (await principals(w)).find((p) => p.key === a.key)?.enabled === false), 'the 1st is not disabled')
    await taken('while the 1st is disabled')
    // A refused set_name keeps the 2nd's generated name (the user's decision, 2026-11-21).
    assertGeneratedName(b.paired.name)
    assert.deepEqual(view((await uiState(w)).targets), [ref(b, b.paired.name)], 'targets while the 1st is disabled')
    assert.equal((await saveTokens(w, (await tokensOf(w)).filter((i) => i.key !== a.entryKey))).ok, true, 'delete the 1st')
    assert.ok(await eventually(async () => !(await principals(w)).some((p) => p.id === a.id)), 'the 1st is still listed after its delete')
    // The entry leaves the list at the save; its pair (and so its name) goes in the delete's
    // revocation job right after (C-REVOKE: endPrincipal, then the pair's removal), so the name is
    // free within that job's time, not at the save's answer.
    let renamed
    assert.ok(await eventually(async () => (renamed = await call(b.client, TOOL.setName, { name: M.defaultName })).ok), 'the name was not freed by the delete: ' + JSON.stringify(renamed))
    assert.deepEqual(renamed, { ok: true, name: M.defaultName })
    assert.deepEqual(view((await uiState(w)).targets), [ref(b, M.defaultName)], 'state targets')
  })
}

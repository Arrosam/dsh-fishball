/**
 * F-FACADE black-box cases (v3-tasks.md row F-FACADE; .runtime/reports/v3-w3-briefs.md "F-FACADE"):
 * EXT-DT-03 rules E6 and E8, Fishball side (docs/test-design/v3/07-contributors.md); EXT-UC-02 A3;
 * the core side of EXT-UC-04 A1. Requirements R-EXT-05/13/14/20, R-UI-08/09, R-FB-06, R-FN-01 and
 * design §6.3 "no raw `mcp__…` tool reaches the model".
 *
 * Techniques: Use Case first (EXT-UC-02 A3 and its postcondition, EXT-UC-04 A1), then the Decision
 * Table (EXT-DT-03 E6/E8, one test per rule plus the X8 attention table), Equivalence Partitioning
 * (which tools are listed: none, core only, contributed of any namespace, attention tools; link up
 * or down), Boundary Values (the contributed-tool count at 0, 1 and n) and State Transitions (the
 * offered set across `tools/list_changed`, the link going down and coming back).
 *
 * Level: integration in one process. A real DSH of each SDK (tools, agent loop, sessions) runs
 * Fishball's agent with a fake model that records what it is offered; core's link is a fake that
 * speaks only its public API (fakes.mjs); EXT-UC-02 A3 also runs the real F-INTERCEPT module.
 * Two-DSH rows (a real connector with real contributors) are X-REMOTE's and stay `todo`.
 *
 * Model-facing names follow Q-8's recommendation: the public name is kept unchanged, because both
 * SDKs' tool registries accept a dotted name and offer it to the model (checked by this session on
 * 0.2.1-rc.5 and 0.2.2-rc.1). The rows that depend on it say so; Q-8 is asked of Fishball.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { caseTest } from '../shared/cases.mjs'
import {
  ATTENTION, CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE, FIXTURE, K1, K2, LATER, RAW_MCP_PREFIX, TOOLS, WATCHDOG_TYPES,
} from './constants.mjs'
import { worldFor } from './world.mjs'

const json = (value) => JSON.stringify(value)
const names = (tools) => tools.map((t) => t.name).sort()
const isContributed = (tool) => tool.name.includes(K2.separator)
/** What the target connector lists: K1's core tools, then the contributed ones (EXT-UC-01 step 3). */
const listed = (...contributed) => [...TOOLS, ...contributed.flat()]
const offeredNamed = (offered, name) => offered.find((t) => t.name === name)

/** Every listed tool is offered under its public name with the connector's input schema. */
function assertOffersEvery(offered, tools) {
  for (const tool of tools) {
    const found = offeredNamed(offered, tool.name)
    assert.ok(found, `${tool.name} is not offered to Fishball's model; offered: ${json(names(offered))}`)
    assert.deepEqual(found.parameters, tool.inputSchema, `${tool.name} is offered with another input schema`)
  }
}
function assertNoRawMcp(offered) {
  const raw = offered.filter((t) => t.name.startsWith(RAW_MCP_PREFIX)).map((t) => t.name)
  assert.deepEqual(raw, [], 'a raw MCP-client tool reaches the model (design §6.3)')
}
/** The offered contributed tools, by name. */
const offeredContributed = (offered) => names(offered.filter(isContributed))

/** One K1 mailbox event of a contributed type, with `marker` in its summary and data. */
let eventSeq = 0
function contributedEvent(namespace, event, marker) {
  const payload = { namespace, event, data: { text: marker }, summary: marker }
  eventSeq += 1
  return {
    eventId: 'fbtest-evt-' + eventSeq, mailboxGeneration: 'fbtest-gen', sequence: eventSeq,
    type: CONTRIBUTED_TYPE_PREFIX + namespace + K2.separator + event, at: Date.now(),
    sourceSessionId: null, correlationId: null, payload,
    payloadDigest: createHash('sha256').update(json(payload)).digest('hex'),
  }
}

export function registerFacadeCases(sdk) {
  // ------------------------------------------------------------------ EXT-UC-02 A3 (use case)

  caseTest(sdk, 'EXT-UC-02', 'A3', 'a contributed event nobody in the Fishball DSH intercepts reaches the Fishball agent through the façade\'s present', async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x) }, { events: true })
    const marker = 'FBTEST-A3-BUILD-42-FAILED'
    await w.deliver(contributedEvent('ci-watch', 'build.failed', marker))
    assert.ok(w.modelRequestsWith(marker).length > 0, 'the event never reached Fishball\'s model')
  })

  caseTest(sdk, 'EXT-UC-02', 'A3 (Watchdog)', 'Watchdog\'s registration (permission, settlement, retirement) never sees a contributed event; Fishball does', async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x) }, { events: true })
    const watchdog = await w.interceptor(FIXTURE.pluginWatchdog, WATCHDOG_TYPES)
    const marker = 'FBTEST-A3-WATCHDOG'
    await w.deliver(contributedEvent('ci-watch', 'build.failed', marker))
    assert.deepEqual(watchdog.seen, [], 'Watchdog\'s handler got a contributed event (R-INT-07)')
    assert.ok(w.modelRequestsWith(marker).length > 0, 'the event never reached Fishball\'s model')
  })

  caseTest(sdk, 'EXT-UC-02', 'A3 (intercepted partition)', 'a plugin registered for that contributed type gets it, and Fishball\'s model never sees it (R-EXT-20)', async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x) }, { events: true })
    const event = contributedEvent('ci-watch', 'build.failed', 'FBTEST-A3-INTERCEPTED')
    const plugin = await w.interceptor(FIXTURE.pluginFold, [event.type])
    await w.deliver(event)
    assert.deepEqual(plugin.seen.map((e) => e.eventId), [event.eventId])
    assert.deepEqual(w.modelRequestsWith('FBTEST-A3-INTERCEPTED'), [], 'an intercepted contributed event reached Fishball\'s model')
  })

  caseTest(sdk, 'EXT-UC-02', 'post (one wake)', 'one contributed event wakes Fishball for one turn, and a second delivery of the same eventId wakes none', async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x) }, { events: true })
    const marker = 'FBTEST-A3-ONCE'
    const event = contributedEvent('ci-watch', 'build.failed', marker)
    await w.deliver(event)
    await w.deliver(event)
    const users = w.requests.map((r) => r.messages.filter((m) => m.role === 'user' && json(m).includes(marker)).length)
    assert.equal(Math.max(0, ...users), 1, 'the event was admitted to Fishball more than once, or never')
  })

  caseTest(sdk, 'EXT-UC-02', 'A3 (fold batcher)', 'fold-notify batches the contributed event on the Fishball branch', null, 'FEAT-PEERS (fold-notify\'s X9 batcher on the Fishball branch)')
  caseTest(sdk, 'EXT-UC-02', 'A3 (real Watchdog row)', 'the loaded Watchdog plugin never sees a contributed event', null, LATER.watchdog)
  caseTest(sdk, 'EXT-UC-02', 'A3 (other event types)', 'present(event) also renders the K1 event types (message, notice, …) for the Fishball branch', null, LATER.q11)

  // ------------------------------------------------------------------ EXT-UC-04 A1 (use case, core side)

  caseTest(sdk, 'EXT-UC-04', 'A1', `without embed-UI at the target, core's attention.signal answers ${K1.unsupported} and sends no attention call`, async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x) })
    const result = await w.bridge.attention.signal(FIXTURE.pluginFold, { important: true })
    assert.equal(result?.ok, false)
    assert.equal(result?.code, K1.unsupported)
    assert.deepEqual(w.link.sent(ATTENTION.signal), [], 'an attention call reached the connector')
  })

  caseTest(sdk, 'EXT-UC-04', 'main 2 (core side)', `with embed-UI at the target, attention.signal calls ${ATTENTION.signal} with exactly {important} and returns its acceptance`, async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.attention), answers: { [ATTENTION.signal]: () => ATTENTION.accepted } })
    const result = await w.bridge.attention.signal(FIXTURE.pluginFold, { important: true })
    assert.deepEqual(result, ATTENTION.accepted)
    // X8: no plugin identity is added to the wire.
    assert.deepEqual(w.link.sent(ATTENTION.signal).map((c) => c.args), [{ important: true }])
  })

  // ------------------------------------------------------------------ X8 attention decision table (core side)

  const ATTENTION_RULES = [
    { rule: 1, listedTool: false, up: true, important: true, expect: K1.unsupported },
    { rule: 2, listedTool: false, up: true, important: false, expect: K1.unsupported },
    // Rule 3 (tool absent from the last list, link down) has two candidate answers: asked as Q-FACADE-2.
    { rule: 3, listedTool: false, up: false, important: true, expect: null },
    { rule: 4, listedTool: true, up: true, important: true, expect: 'accepted' },
    { rule: 5, listedTool: true, up: true, important: false, expect: 'accepted' },
    { rule: 6, listedTool: true, up: false, important: true, expect: K1.disconnected },
  ]
  for (const r of ATTENTION_RULES) {
    const title = `tool ${r.listedTool ? 'listed' : 'absent'}, link ${r.up ? 'up' : 'down'}, important ${r.important} → ${r.expect ?? `${K1.unsupported} or ${K1.disconnected}`}`
    if (r.expect === null) { caseTest(sdk, 'EXT-UC-04 A1 (DT)', `rule ${r.rule}`, title, null, LATER.qAbsentDown); continue }
    caseTest(sdk, 'EXT-UC-04 A1 (DT)', `rule ${r.rule}`, title, async (t) => {
      const w = await worldFor(t, sdk, {
        tools: listed(r.listedTool ? FIXTURE.attention : []),
        status: r.up ? K1.connected : K1.down,
        answers: { [ATTENTION.signal]: () => ATTENTION.accepted },
      })
      const result = await w.bridge.attention.signal(FIXTURE.pluginFold, { important: r.important })
      if (r.expect === 'accepted') {
        assert.deepEqual(result, ATTENTION.accepted)
        assert.deepEqual(w.link.sent(ATTENTION.signal).map((c) => c.args), [{ important: r.important }])
      } else {
        assert.equal(result?.ok, false)
        assert.equal(result?.code, r.expect)
        assert.deepEqual(w.link.sent(ATTENTION.signal), [], 'an attention call reached the connector')
      }
    })
  }

  caseTest(sdk, 'EXT-UC-04 A1 (ST)', 'absent → listed → absent', `attention.signal follows tools/list_changed: ${K1.unsupported}, then accepted, then ${K1.unsupported} again`, async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(), answers: { [ATTENTION.signal]: () => ATTENTION.accepted } })
    assert.equal((await w.bridge.attention.signal(FIXTURE.pluginFold, { important: false }))?.code, K1.unsupported)
    w.link.listChanged(listed(FIXTURE.attention))
    assert.deepEqual(await w.bridge.attention.signal(FIXTURE.pluginFold, { important: false }), ATTENTION.accepted)
    w.link.listChanged(listed())
    assert.equal((await w.bridge.attention.signal(FIXTURE.pluginFold, { important: false }))?.code, K1.unsupported)
    assert.equal(w.link.sent(ATTENTION.signal).length, 1)
  })

  // ------------------------------------------------------------------ EXT-DT-03 (decision table, Fishball side)

  caseTest(sdk, 'EXT-DT-03', 'E8', 'standalone F → C: Fishball\'s model is offered every core tool and all of C\'s contributed tools, unfiltered', async (t) => {
    const contributed = [...FIXTURE.x, ...FIXTURE.attention]
    const w = await worldFor(t, sdk, { tools: listed(contributed) })
    const offered = await w.offered()
    assertOffersEvery(offered, listed(contributed))
    assert.deepEqual(offeredContributed(offered), names(contributed), 'the offered contributed set differs from C\'s')
    assertNoRawMcp(offered)
  })

  caseTest(sdk, 'EXT-DT-03', 'E6', 'hosted, remote C\': Fishball\'s model is offered C\'\'s contributions only; no embed-UI attention tool when C\' lists none (R-UI-09)', async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.remote) })
    const offered = await w.offered()
    assertOffersEvery(offered, listed(FIXTURE.remote))
    assert.deepEqual(offeredContributed(offered), names(FIXTURE.remote))
    assert.equal(offeredNamed(offered, ATTENTION.signal), undefined)
    assert.equal(offeredNamed(offered, ATTENTION.state), undefined)
    assertNoRawMcp(offered)
  })

  caseTest(sdk, 'EXT-DT-03', 'E8 (end to end)', 'a standalone Fishball DSH against a real connector DSH with contributors offers all of them', null, LATER.remote)
  caseTest(sdk, 'EXT-DT-03', 'E6 (end to end)', 'a hosted Fishball with a remote target offers only the remote connector\'s contributions', null, LATER.remote)

  // ------------------------------------------------------------------ EP: what the target lists

  caseTest(sdk, 'F-FACADE EP', 'core only (E1 seen by F)', 'C lists no contributed tool: every core tool is offered and no contributed one', async (t) => {
    const w = await worldFor(t, sdk, { tools: listed() })
    const offered = await w.offered()
    assertOffersEvery(offered, TOOLS)
    assert.deepEqual(offeredContributed(offered), [])
    assertNoRawMcp(offered)
  })

  caseTest(sdk, 'F-FACADE EP', 'embed-UI only (E4 seen by F)', `C lists only embed-UI's tools: ${ATTENTION.signal} and ${ATTENTION.state} are offered (R-UI-08, R-EXT-13)`, async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.attention) })
    const offered = await w.offered()
    assert.deepEqual(offeredContributed(offered), [ATTENTION.signal, ATTENTION.state].sort())
  })

  caseTest(sdk, 'F-FACADE EP', 'names (Q-8)', 'every offered connector tool keeps its public name (`<namespace>.<name>` for contributed tools); none starts with mcp__', async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x, FIXTURE.attention) })
    const offered = await w.offered()
    for (const tool of listed(FIXTURE.x, FIXTURE.attention)) assert.ok(offeredNamed(offered, tool.name), `${tool.name} is not offered under its public name`)
    assertNoRawMcp(offered)
  })

  // ------------------------------------------------------------------ calls through the façade

  caseTest(sdk, 'F-FACADE EP', 'call (contributed, link up)', 'the model\'s call of a contributed tool goes to the link under its public name with its arguments, and the result reaches the model', async (t) => {
    const [tool] = FIXTURE.x
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x) })
    const result = await w.modelCalls(tool.name, { q: FIXTURE.query })
    assert.deepEqual(w.link.sent(tool.name).map((c) => c.args), [{ q: FIXTURE.query }])
    assert.ok(json(result.content).includes(FIXTURE.resultMarker), `the connector's result did not reach the model: ${json(result.content)}`)
  })

  for (const [partition, name, args] of [
    ['core tool', TOOLS.find((t) => !(t.inputSchema.required ?? []).length).name, {}],
    ['contributed tool', FIXTURE.x[0].name, { q: FIXTURE.query }],
  ]) {
    caseTest(sdk, 'F-FACADE EP', `call (${partition}, link down)`, `a call while the link is down answers ${K1.disconnected} and nothing reaches the connector`, async (t) => {
      const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x), status: K1.down })
      const result = await w.modelCalls(name, args)
      assert.ok(json(result.content).includes(K1.disconnected), `the model got no ${K1.disconnected}: ${json(result.content)}`)
      assert.deepEqual(w.link.sent(), [], 'a request reached the connector while the link was down')
    })
  }

  caseTest(sdk, 'F-FACADE ST', 'link down → up', `a call answers ${K1.disconnected} while down, and the same call reaches the connector once the link is back`, async (t) => {
    const [tool] = FIXTURE.x
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x), status: K1.down })
    const down = await w.modelCalls(tool.name, { q: FIXTURE.query })
    assert.ok(json(down.content).includes(K1.disconnected))
    w.link.setStatus(K1.connected)
    const up = await w.modelCalls(tool.name, { q: FIXTURE.query })
    assert.ok(json(up.content).includes(FIXTURE.resultMarker))
    assert.equal(w.link.sent(tool.name).length, 1)
  })

  // ------------------------------------------------------------------ ST: tools/list_changed

  caseTest(sdk, 'F-FACADE ST', 'list_changed (add)', 'a tool C adds is offered on Fishball\'s next turn, with no restart', async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x) })
    assert.equal(offeredNamed(await w.offered(), FIXTURE.added.name), undefined)
    w.link.listChanged(listed(FIXTURE.x, [FIXTURE.added]))
    const offered = await w.offered()
    assertOffersEvery(offered, listed(FIXTURE.x, [FIXTURE.added]))
  })

  caseTest(sdk, 'F-FACADE ST', 'list_changed (remove)', 'a tool C withdraws is no longer offered on the next turn; the rest stay', async (t) => {
    const [kept, removed] = FIXTURE.x
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x) })
    assert.ok(offeredNamed(await w.offered(), removed.name))
    w.link.listChanged(listed([kept]))
    const offered = await w.offered()
    assert.equal(offeredNamed(offered, removed.name), undefined, `${removed.name} is still offered after C withdrew it`)
    assertOffersEvery(offered, listed([kept]))
  })

  caseTest(sdk, 'F-FACADE ST', 'list_changed (all contributed gone)', 'C withdraws every contributed tool: only core tools are offered', async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x, FIXTURE.attention) })
    w.link.listChanged(listed())
    const offered = await w.offered()
    assert.deepEqual(offeredContributed(offered), [])
    assertOffersEvery(offered, TOOLS)
  })

  // ------------------------------------------------------------------ BVA: the contributed-tool count

  for (const [label, contributed] of [['0', []], ['1', FIXTURE.remote], ['n', [...FIXTURE.x, ...FIXTURE.attention]]]) {
    caseTest(sdk, 'F-FACADE BVA', `count ${label}`, `the contributed-tool count is ${contributed.length} when C lists ${contributed.length} contributed tool(s)`, async (t) => {
      const w = await worldFor(t, sdk, { tools: listed(contributed) })
      assert.equal(w.bridge.contributedCount(), contributed.length)
    })
  }

  caseTest(sdk, 'F-FACADE BVA', 'count follows list_changed', 'the count moves 2 → 3 → 0 with each re-list', async (t) => {
    const w = await worldFor(t, sdk, { tools: listed(FIXTURE.x) })
    assert.equal(w.bridge.contributedCount(), FIXTURE.x.length)
    w.link.listChanged(listed(FIXTURE.x, [FIXTURE.added]))
    assert.equal(w.bridge.contributedCount(), FIXTURE.x.length + 1)
    w.link.listChanged(listed())
    assert.equal(w.bridge.contributedCount(), 0)
  })

  caseTest(sdk, 'F-FACADE BVA', 'count in status', 'core\'s status shows how many contributed tools are offered', null, LATER.status)
}

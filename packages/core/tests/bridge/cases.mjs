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
 * Model-facing names (Fishball 2026-11-15, Q-8 decided; constants.mjs MODEL_NAME): every `.` of a
 * public name becomes `__` (`embed-ui.attention.signal` → `embed-ui__attention__signal`); a mapped
 * name over 64 characters, starting with `mcp__`, without a namespace or clashing is not offered and
 * is logged once; core tools keep their names, and `inbox_poll`, `inbox_ack`, `pair`, `set_name`
 * are withheld from the model and from X12. The link is always called with the public name.
 * The call order, `present(event)` for every event, and X12 are Fishball's answers 2–4 of the same day.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import {
  ATTENTION, CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE, EXTERNAL, FIXTURE, GATE, K1, K2, MODEL_NAME, PRESENT, TOOL, TOOLS, OTHER_TYPES,
  modelName,
} from './constants.mjs'
import { bridgeExport, bridgeSources } from './subject.mjs'
import { worldFor } from './world.mjs'
import { registerRfixBridgeCases } from './rfix.mjs'

const json = (value) => JSON.stringify(value)
const names = (tools) => tools.map((t) => t.name).sort()
/** No core tool name holds `__`; every mapped contributed name does (Fishball 2026-11-15). */
const isContributed = (tool) => tool.name.includes(MODEL_NAME.to)
/** What the target connector lists: K1's core tools, then the contributed ones (EXT-UC-01 step 3). */
const listed = (...contributed) => [...TOOLS, ...contributed.flat()]
/** The core tools Fishball's model is offered: K1's, minus the four withheld ones (Fishball 2026-11-15). */
const CORE_OFFERED = TOOLS.filter((t) => !MODEL_NAME.withheld.includes(t.name))
/** The listed tools the model is expected to see: the withheld core tools left out. */
const offerable = (tools) => tools.filter((t) => !MODEL_NAME.withheld.includes(t.name))
/** The offered tool for a public name, found by its model-facing name. */
const offeredNamed = (offered, publicName) => offered.find((t) => t.name === modelName(publicName))
const modelNames = (tools) => tools.map((t) => modelName(t.name)).sort()

/** Every offerable listed tool is offered under its model-facing name with the connector's input schema. */
function assertOffersEvery(offered, tools) {
  for (const tool of offerable(tools)) {
    const found = offeredNamed(offered, tool.name)
    assert.ok(found, `${tool.name} is not offered to Fishball's model as ${modelName(tool.name)}; offered: ${json(names(offered))}`)
    assert.deepEqual(found.parameters, tool.inputSchema, `${tool.name} is offered with another input schema`)
  }
}
function assertNoRawMcp(offered) {
  const raw = offered.filter((t) => t.name.startsWith(MODEL_NAME.rawPrefix)).map((t) => t.name)
  assert.deepEqual(raw, [], 'a raw MCP-client tool reaches the model (design §6.3)')
}
/** The offered contributed tools, by model-facing name. */
const offeredContributed = (offered) => names(offered.filter(isContributed))
/** One contributed tool descriptor with a given public name (fixture). */
const toolNamed = (name) => ({ ...FIXTURE.x[1], name })
/** A fake X19 gate: records every check and answers `answer`. */
function fakeGate(answer) {
  const checks = []
  return { checks, send: (operation, sessionId) => { checks.push({ operation, sessionId }); return answer } }
}

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

export function registerFacadeCases() {
  // R-FIX-CORE (F13): rfix.mjs.
  registerRfixBridgeCases()
  // ------------------------------------------------------------------ EXT-UC-02 A3 (use case)

  caseTest('EXT-UC-02', 'A3', 'a contributed event nobody in the Fishball DSH intercepts reaches the Fishball agent through the façade\'s present', async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.x) }, { events: true })
    const marker = 'FBTEST-A3-BUILD-42-FAILED'
    await w.deliver(contributedEvent('ci-watch', 'build.failed', marker))
    assert.ok(w.modelRequestsWith(marker).length > 0, 'the event never reached Fishball\'s model')
  })

  caseTest('EXT-UC-02', 'A3 (other registration)', 'a registration for other types (permission, settlement, retirement) never sees a contributed event; Fishball does', async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.x) }, { events: true })
    const other = await w.interceptor(FIXTURE.pluginOther, OTHER_TYPES)
    const marker = 'FBTEST-A3-OTHER'
    await w.deliver(contributedEvent('ci-watch', 'build.failed', marker))
    assert.deepEqual(other.seen, [], 'the other registration\'s handler got a contributed event (R-INT-07)')
    assert.ok(w.modelRequestsWith(marker).length > 0, 'the event never reached Fishball\'s model')
  })

  caseTest('EXT-UC-02', 'A3 (intercepted partition)', 'a plugin registered for that contributed type gets it, and Fishball\'s model never sees it (R-EXT-20)', async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.x) }, { events: true })
    const event = contributedEvent('ci-watch', 'build.failed', 'FBTEST-A3-INTERCEPTED')
    const plugin = await w.interceptor(FIXTURE.plugin, [event.type])
    await w.deliver(event)
    assert.deepEqual(plugin.seen.map((e) => e.eventId), [event.eventId])
    assert.deepEqual(w.modelRequestsWith('FBTEST-A3-INTERCEPTED'), [], 'an intercepted contributed event reached Fishball\'s model')
  })

  caseTest('EXT-UC-02', 'post (one wake)', 'one contributed event wakes Fishball for one turn, and a second delivery of the same eventId wakes none', async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.x) }, { events: true })
    const marker = 'FBTEST-A3-ONCE'
    const event = contributedEvent('ci-watch', 'build.failed', marker)
    await w.deliver(event)
    await w.deliver(event)
    const users = w.requests.map((r) => r.messages.filter((m) => m.role === 'user' && json(m).includes(marker)).length)
    assert.equal(Math.max(0, ...users), 1, 'the event was admitted to Fishball more than once, or never')
  })


  // present(event) renders every event (Fishball 2026-11-15, answer 3; Q-11 decided: F-FACADE's).
  const PRESENT_ROWS = [
    ['message', { ...contributedEvent('ci-watch', 'x', 'FBTEST-P1'), type: EVENT_TYPE.message, payload: { text: 'FBTEST-P1', images: [] } }, true],
    ['notice', { ...contributedEvent('ci-watch', 'x', 'FBTEST-P2'), type: EVENT_TYPE.notice, payload: { code: 'fbtest', text: 'FBTEST-P2' } }, true],
    ['contributed', contributedEvent('ci-watch', 'build.failed', 'FBTEST-P3'), true],
    ['unknown type', { ...contributedEvent('ci-watch', 'x', 'FBTEST-P4'), type: 'fbtest-not-a-k1-type' }, false],
  ]
  for (const [partition, event, known] of PRESENT_ROWS) {
    caseTest('EXT-UC-02', `A3 (present: ${partition})`, known ? `present(event) is one text block whose header names the type ${event.type}` : 'present(event) of a type K1 does not know is one text block saying "unknown type"', async (t) => {
      const w = await worldFor(t, { tools: listed() })
      const blocks = await w.bridge.present(event)
      assert.equal(blocks?.length, 1, `present returned ${json(blocks)}`)
      assert.equal(blocks[0].type, PRESENT.blockType)
      if (known) {
        assert.ok(blocks[0].text.includes(event.type), `the header does not name ${event.type}: ${blocks[0].text}`)
        assert.doesNotMatch(blocks[0].text, PRESENT.unknownType)
      } else {
        assert.match(blocks[0].text, PRESENT.unknownType)
      }
    })
  }

  // ------------------------------------------------------------------ EXT-UC-04 A1 (use case, core side)

  caseTest('EXT-UC-04', 'A1', `without embed-UI at the target, core's attention.signal answers ${K1.unsupported} and sends no attention call`, async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.x) })
    const result = await w.bridge.attention.signal(FIXTURE.plugin, { important: true })
    assert.equal(result?.ok, false)
    assert.equal(result?.code, K1.unsupported)
    assert.deepEqual(w.link.sent(ATTENTION.signal), [], 'an attention call reached the connector')
  })

  caseTest('EXT-UC-04', 'main 2 (core side)', `with embed-UI at the target, attention.signal calls ${ATTENTION.signal} with exactly {important} and returns its acceptance`, async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.attention), answers: { [ATTENTION.signal]: () => ATTENTION.accepted } })
    const result = await w.bridge.attention.signal(FIXTURE.plugin, { important: true })
    assert.deepEqual(result, ATTENTION.accepted)
    // X8: no plugin identity is added to the wire.
    assert.deepEqual(w.link.sent(ATTENTION.signal).map((c) => c.args), [{ important: true }])
  })

  // ------------------------------------------------------------------ X8 attention decision table (core side)

  const ATTENTION_RULES = [
    { rule: 1, listedTool: false, up: true, important: true, expect: K1.unsupported },
    { rule: 2, listedTool: false, up: true, important: false, expect: K1.unsupported },
    // Link down is checked before "not listed" (Fishball 2026-11-15, answer 2).
    { rule: 3, listedTool: false, up: false, important: true, expect: K1.disconnected },
    { rule: 4, listedTool: true, up: true, important: true, expect: 'accepted' },
    { rule: 5, listedTool: true, up: true, important: false, expect: 'accepted' },
    { rule: 6, listedTool: true, up: false, important: true, expect: K1.disconnected },
  ]
  for (const r of ATTENTION_RULES) {
    caseTest('EXT-UC-04 A1 (DT)', `rule ${r.rule}`, `tool ${r.listedTool ? 'listed' : 'absent'}, link ${r.up ? 'up' : 'down'}, important ${r.important} → ${r.expect}`, async (t) => {
      const w = await worldFor(t, {
        tools: listed(r.listedTool ? FIXTURE.attention : []),
        status: r.up ? K1.connected : K1.down,
        answers: { [ATTENTION.signal]: () => ATTENTION.accepted },
      })
      const result = await w.bridge.attention.signal(FIXTURE.plugin, { important: r.important })
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

  caseTest('EXT-UC-04 A1 (ST)', 'absent → listed → absent', `attention.signal follows tools/list_changed: ${K1.unsupported}, then accepted, then ${K1.unsupported} again`, async (t) => {
    const w = await worldFor(t, { tools: listed(), answers: { [ATTENTION.signal]: () => ATTENTION.accepted } })
    assert.equal((await w.bridge.attention.signal(FIXTURE.plugin, { important: false }))?.code, K1.unsupported)
    w.link.listChanged(listed(FIXTURE.attention))
    assert.deepEqual(await w.bridge.attention.signal(FIXTURE.plugin, { important: false }), ATTENTION.accepted)
    w.link.listChanged(listed())
    assert.equal((await w.bridge.attention.signal(FIXTURE.plugin, { important: false }))?.code, K1.unsupported)
    assert.equal(w.link.sent(ATTENTION.signal).length, 1)
  })

  // ------------------------------------------------------------------ EXT-DT-03 (decision table, Fishball side)

  caseTest('EXT-DT-03', 'E8', 'standalone F → C: Fishball\'s model is offered every core tool and all of C\'s contributed tools, unfiltered', async (t) => {
    const contributed = [...FIXTURE.x, ...FIXTURE.attention]
    const w = await worldFor(t, { tools: listed(contributed) })
    const offered = await w.offered()
    assertOffersEvery(offered, listed(contributed))
    assert.deepEqual(offeredContributed(offered), modelNames(contributed), 'the offered contributed set differs from C\'s')
    assertNoRawMcp(offered)
  })

  caseTest('EXT-DT-03', 'E6', 'hosted, remote C\': Fishball\'s model is offered C\'\'s contributions only; no embed-UI attention tool when C\' lists none (R-UI-09)', async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.remote) })
    const offered = await w.offered()
    assertOffersEvery(offered, listed(FIXTURE.remote))
    assert.deepEqual(offeredContributed(offered), modelNames(FIXTURE.remote))
    assert.equal(offeredNamed(offered, ATTENTION.signal), undefined)
    assert.equal(offeredNamed(offered, ATTENTION.state), undefined)
    assertNoRawMcp(offered)
  })

  // EXT-DT-03 E6/E8 (end to end) needed the real connector DSH with its contributors, which left this
  // repository in 6b7c53bf: retired (packages/core/tests/bridge/README.md).

  // ------------------------------------------------------------------ EP: what the target lists

  caseTest('F-FACADE EP', 'core only (E1 seen by F)', 'C lists no contributed tool: every core tool is offered and no contributed one', async (t) => {
    const w = await worldFor(t, { tools: listed() })
    const offered = await w.offered()
    assertOffersEvery(offered, CORE_OFFERED)
    assert.deepEqual(offeredContributed(offered), [])
    assertNoRawMcp(offered)
  })

  caseTest('F-FACADE EP', 'embed-UI only (E4 seen by F)', `C lists only embed-UI's tools: ${ATTENTION.signal} and ${ATTENTION.state} are offered (R-UI-08, R-EXT-13)`, async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.attention) })
    const offered = await w.offered()
    assert.deepEqual(offeredContributed(offered), [modelName(ATTENTION.signal), modelName(ATTENTION.state)].sort())
  })

  caseTest('F-FACADE EP', 'names (Q-8)', 'core tools keep their names and every contributed `<ns>.<name>` is offered as `<ns>__<name>`; none starts with mcp__ (Fishball 2026-11-15)', async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.x, FIXTURE.attention) })
    const offered = await w.offered()
    for (const tool of CORE_OFFERED) assert.ok(offered.some((o) => o.name === tool.name), `core tool ${tool.name} is not offered under its own name`)
    for (const tool of [...FIXTURE.x, ...FIXTURE.attention]) assert.ok(offeredNamed(offered, tool.name), `${tool.name} is not offered as ${modelName(tool.name)}`)
    assert.ok(offered.some((o) => o.name === 'embed-ui__attention__signal'), 'the decision\'s own example is not offered')
    assert.deepEqual(offered.filter((o) => o.name.includes(K2.separator)).map((o) => o.name), [], 'a dotted name reaches the model')
    assertNoRawMcp(offered)
  })

  caseTest('F-FACADE EP', 'withheld core tools', `${MODEL_NAME.withheld.join(', ')} are never offered to the model, and X12 does not support them (Fishball 2026-11-15)`, async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.x) })
    const offered = await w.offered()
    for (const name of MODEL_NAME.withheld) assert.equal(offered.find((o) => o.name === name), undefined, `${name} is offered to the model`)
    const x12 = w.bridge.bridge(FIXTURE.pluginX12, MODEL_NAME.withheld)
    for (const name of MODEL_NAME.withheld) assert.equal(x12.supports(name), false, `X12 supports ${name}`)
  })

  // Names the mapping refuses: not offered, logged once (Fishball 2026-11-15). BVA on the 64-character
  // limit: a 14-character namespace and a 48-character local name (K2's maximum) map to exactly 64; one
  // `.` in the same local name maps to 65 (each `.` becomes two characters).
  const NS14 = 'fbtest-bva-ns1'
  const LOCAL48 = 'a'.repeat(48)
  const LOCAL48_DOT = 'a'.repeat(23) + '.' + 'a'.repeat(24)
  const REFUSED = [
    ['over 64 (65)', NS14 + K2.separator + LOCAL48_DOT],
    ['starts with mcp__', 'mcp' + K2.separator + 'lookup'],
    ['not namespaced', 'fbtest_plain'],
  ]
  caseTest('F-FACADE BVA', 'model name 64', `a mapped name of exactly ${MODEL_NAME.maxChars} characters is offered`, async (t) => {
    const tool = toolNamed(NS14 + K2.separator + LOCAL48)
    assert.equal(modelName(tool.name).length, MODEL_NAME.maxChars, 'fixture')
    const w = await worldFor(t, { tools: listed([tool]) })
    assert.ok(offeredNamed(await w.offered(), tool.name), `${modelName(tool.name)} is not offered`)
  })
  for (const [partition, name] of REFUSED) {
    caseTest('F-FACADE EP', `refused name (${partition})`, `${name} is not offered, the other tools are, and it is logged once`, async (t) => {
      const tool = toolNamed(name)
      const w = await worldFor(t, { tools: listed(FIXTURE.remote, [tool]) })
      const offered = await w.offered()
      assert.equal(offered.find((o) => o.name === modelName(name) || o.name === name), undefined, `${name} is offered`)
      assertOffersEvery(offered, listed(FIXTURE.remote))
      w.link.listChanged(listed(FIXTURE.remote, [tool]))
      await w.offered()
      assert.equal(w.logsWith(name).length, 1, `${name} is not logged exactly once: ${json(w.logsWith(name))}`)
    })
  }
  // Which of two clashing names (if either) stays offered is not decided; the oracle is "never two
  // tools under one model name, and the rest unaffected".
  caseTest('F-FACADE EP', 'refused name (clash)', 'two public names mapping to one model name (`a.b__c`, `a.b.c`): at most one tool under that name; the others are offered', async (t) => {
    const clash = [toolNamed('fbtest-x' + K2.separator + 'b__c'), toolNamed('fbtest-x' + K2.separator + 'b' + K2.separator + 'c')]
    assert.equal(modelName(clash[0].name), modelName(clash[1].name), 'fixture')
    const w = await worldFor(t, { tools: listed(FIXTURE.remote, clash) })
    const offered = await w.offered()
    assert.ok(offered.filter((o) => o.name === modelName(clash[0].name)).length <= 1, 'two tools are offered under one model name')
    assertOffersEvery(offered, listed(FIXTURE.remote))
  })

  // ------------------------------------------------------------------ calls through the façade

  caseTest('F-FACADE EP', 'call (contributed, link up)', 'the model\'s call of a contributed tool goes to the link under its public name with its arguments, and the result reaches the model', async (t) => {
    const [tool] = FIXTURE.x
    const w = await worldFor(t, { tools: listed(FIXTURE.x) })
    const result = await w.modelCalls(modelName(tool.name), { q: FIXTURE.query })
    assert.deepEqual(w.link.sent(tool.name).map((c) => c.args), [{ q: FIXTURE.query }])
    assert.ok(json(result.content).includes(FIXTURE.resultMarker), `the connector's result did not reach the model: ${json(result.content)}`)
  })

  // The names are taken when the row runs: a contract without EXTERNAL_NAME fails the row, not the file.
  for (const [partition, nameOf, args] of [
    ['core tool', () => CORE_OFFERED.find((t) => !(t.inputSchema.required ?? []).length).name, {}],
    ['contributed tool', () => modelName(FIXTURE.x[0].name), { q: FIXTURE.query }],
  ]) {
    caseTest('F-FACADE EP', `call (${partition}, link down)`, `a call while the link is down answers ${K1.disconnected} and nothing reaches the connector`, async (t) => {
      const w = await worldFor(t, { tools: listed(FIXTURE.x), status: K1.down })
      const result = await w.modelCalls(nameOf(), args)
      assert.ok(json(result.content).includes(K1.disconnected), `the model got no ${K1.disconnected}: ${json(result.content)}`)
      assert.deepEqual(w.link.sent(), [], 'a request reached the connector while the link was down')
    })
  }

  caseTest('F-FACADE ST', 'link down → up', `a call answers ${K1.disconnected} while down, and the same call reaches the connector once the link is back`, async (t) => {
    const [tool] = FIXTURE.x
    const w = await worldFor(t, { tools: listed(FIXTURE.x), status: K1.down })
    const down = await w.modelCalls(modelName(tool.name), { q: FIXTURE.query })
    assert.ok(json(down.content).includes(K1.disconnected))
    w.link.setStatus(K1.connected)
    const up = await w.modelCalls(modelName(tool.name), { q: FIXTURE.query })
    assert.ok(json(up.content).includes(FIXTURE.resultMarker))
    assert.equal(w.link.sent(tool.name).length, 1)
  })

  // ------------------------------------------------------------------ DT: the call order (Fishball 2026-11-15, answer 2)
  // link down → disconnected; not listed → unsupported-operation; X19 gate; image gate (model calls
  // of attachment_read only) → images-unsupported; then callTool. Each rule: what the caller gets,
  // and whether anything reached the connector.

  const sendArgs = { sessionId: FIXTURE.sessionId, message: FIXTURE.query, attachments: [] }
  const readArgs = { sessionId: FIXTURE.sessionId, attachmentId: FIXTURE.attachmentId }
  caseTest('F-FACADE DT (order)', 'rule 1', `link down and the tool not listed → ${K1.disconnected} (down is checked first)`, async (t) => {
    const w = await worldFor(t, { tools: listed(), status: K1.down })
    const result = await w.bridge.bridge(FIXTURE.pluginX12, [FIXTURE.x[0].name]).call(FIXTURE.x[0].name, { q: FIXTURE.query })
    assert.equal(result?.code, K1.disconnected)
    assert.deepEqual(w.link.sent(), [])
  })
  caseTest('F-FACADE DT (order)', 'rule 2', `link up, tool no longer listed → ${K1.unsupported}`, async (t) => {
    const w = await worldFor(t, { tools: listed() })
    const result = await w.bridge.bridge(FIXTURE.pluginX12, [FIXTURE.x[0].name]).call(FIXTURE.x[0].name, { q: FIXTURE.query })
    assert.equal(result?.code, K1.unsupported)
    assert.deepEqual(w.link.sent(), [])
  })
  for (const [tool, operation] of Object.entries(GATE.sends)) {
    caseTest('F-FACADE DT (order)', `rule 3 (${tool})`, `the X19 gate refuses ${operation}: the model gets the gate's code and nothing is sent`, async (t) => {
      const gate = fakeGate(FIXTURE.gateRefusal)
      const w = await worldFor(t, { tools: listed() }, { gate })
      const result = await w.modelCalls(tool, sendArgs)
      assert.deepEqual(gate.checks, [{ operation, sessionId: FIXTURE.sessionId }])
      assert.ok(json(result.content).includes(FIXTURE.gateRefusal.code), `the model did not get the gate's code: ${json(result.content)}`)
      assert.deepEqual(w.link.sent(), [])
    })
    caseTest('F-FACADE DT (order)', `rule 4 (${tool})`, `the X19 gate passes ${operation}: the call reaches the connector`, async (t) => {
      const gate = fakeGate({ ok: true })
      const w = await worldFor(t, { tools: listed() }, { gate })
      await w.modelCalls(tool, sendArgs)
      assert.deepEqual(gate.checks, [{ operation, sessionId: FIXTURE.sessionId }])
      assert.deepEqual(w.link.sent(tool).map((c) => c.args), [sendArgs])
    })
  }
  caseTest('F-FACADE DT (order)', 'rule 5', `the model's ${GATE.imageTool} without image support → ${K1.imagesUnsupported}, nothing sent`, async (t) => {
    const w = await worldFor(t, { tools: listed() }, { imagesSupported: false })
    const result = await w.modelCalls(GATE.imageTool, readArgs)
    assert.ok(json(result.content).includes(K1.imagesUnsupported), `the model got no ${K1.imagesUnsupported}: ${json(result.content)}`)
    assert.deepEqual(w.link.sent(), [])
  })
  caseTest('F-FACADE DT (order)', 'rule 6', `the model's ${GATE.imageTool} with image support reaches the connector`, async (t) => {
    const w = await worldFor(t, { tools: listed() }, { imagesSupported: true })
    await w.modelCalls(GATE.imageTool, readArgs)
    assert.deepEqual(w.link.sent(GATE.imageTool).map((c) => c.args), [readArgs])
  })
  caseTest('F-FACADE DT (order)', 'rule 7', `an X12 ${GATE.imageTool} is not image-gated (model calls only): it reaches the connector`, async (t) => {
    const w = await worldFor(t, { tools: listed() }, { imagesSupported: false })
    await w.bridge.bridge(FIXTURE.pluginX12, [GATE.imageTool]).call(GATE.imageTool, readArgs)
    assert.deepEqual(w.link.sent(GATE.imageTool).map((c) => c.args), [readArgs])
  })
  caseTest('F-FACADE DT (order)', 'X12 scope', `an X12 call of a tool outside its operations → ${K1.forbidden}, nothing sent`, async (t) => {
    const w = await worldFor(t, { tools: listed() })
    const result = await w.bridge.bridge(FIXTURE.pluginX12, [TOOL.sessionsList]).call(TOOL.sessionStop, { sessionId: FIXTURE.sessionId })
    assert.equal(result?.code, K1.forbidden)
    assert.deepEqual(w.link.sent(), [])
  })

  // ------------------------------------------------------------------ ST: tools/list_changed

  caseTest('F-FACADE ST', 'list_changed (add)', 'a tool C adds is offered on Fishball\'s next turn, with no restart', async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.x) })
    assert.equal(offeredNamed(await w.offered(), FIXTURE.added.name), undefined)
    w.link.listChanged(listed(FIXTURE.x, [FIXTURE.added]))
    const offered = await w.offered()
    assertOffersEvery(offered, listed(FIXTURE.x, [FIXTURE.added]))
  })

  caseTest('F-FACADE ST', 'list_changed (remove)', 'a tool C withdraws is no longer offered on the next turn; the rest stay', async (t) => {
    const [kept, removed] = FIXTURE.x
    const w = await worldFor(t, { tools: listed(FIXTURE.x) })
    assert.ok(offeredNamed(await w.offered(), removed.name))
    w.link.listChanged(listed([kept]))
    const offered = await w.offered()
    assert.equal(offeredNamed(offered, removed.name), undefined, `${removed.name} is still offered after C withdrew it`)
    assertOffersEvery(offered, listed([kept]))
  })

  caseTest('F-FACADE ST', 'list_changed (all contributed gone)', 'C withdraws every contributed tool: only core tools are offered', async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.x, FIXTURE.attention) })
    w.link.listChanged(listed())
    const offered = await w.offered()
    assert.deepEqual(offeredContributed(offered), [])
    assertOffersEvery(offered, CORE_OFFERED)
  })

  // ------------------------------------------------------------------ BVA: the contributed-tool count

  for (const [label, contributed] of [['0', []], ['1', FIXTURE.remote], ['n', [...FIXTURE.x, ...FIXTURE.attention]]]) {
    caseTest('F-FACADE BVA', `count ${label}`, `the contributed-tool count is ${contributed.length} when C lists ${contributed.length} contributed tool(s)`, async (t) => {
      const w = await worldFor(t, { tools: listed(contributed) })
      assert.equal(w.bridge.contributedCount(), contributed.length)
    })
  }

  caseTest('F-FACADE BVA', 'count follows list_changed', 'the count moves 2 → 3 → 0 with each re-list', async (t) => {
    const w = await worldFor(t, { tools: listed(FIXTURE.x) })
    assert.equal(w.bridge.contributedCount(), FIXTURE.x.length)
    w.link.listChanged(listed(FIXTURE.x, [FIXTURE.added]))
    assert.equal(w.bridge.contributedCount(), FIXTURE.x.length + 1)
    w.link.listChanged(listed())
    assert.equal(w.bridge.contributedCount(), 0)
  })

  // 'count in status' (a todo for F-STATUS) is not ported: core's status forwards contributedTools,
  // checked by the status area's MULTI-STATUS-EP-01.

  externalNameCases()
}

/**
 * K2-AMEND-1, F-FACADE side (DECIDED #W3-2): the façade applies exactly K2's EXTERNAL_NAME. EP on the
 * façade's own exports and on public names with 1, 2 and 3 dots and core names (no dot); BVA on the
 * 64-character limit where only the dots cross it; a static row that the mapping is imported, not
 * restated, in packages/core/src/bridge/*.js.
 */
function externalNameCases() {
  const rule = (part, title, fn) => caseTest(EXTERNAL.id, part, title, fn)
  const modelNameOf = async () => {
    const fn = await bridgeExport(EXTERNAL.modelNameOf)
    assert.equal(typeof fn, 'function', `the bridge exports no ${EXTERNAL.modelNameOf}()`)
    return fn
  }
  rule('EP 1 (constants)', `the bridge's ${EXTERNAL.constants}.dot and .separator equal K2's EXTERNAL_NAME.replaced and .replacement`, async () => {
    assert.equal(typeof K2.externalName, 'object', 'dsh-agent-connector/tools exports no EXTERNAL_NAME')
    const constants = await bridgeExport(EXTERNAL.constants)
    assert.deepEqual([constants?.dot, constants?.separator], [K2.externalName.replaced, K2.externalName.replacement])
  })
  rule('EP 2 (mapping)', `${EXTERNAL.modelNameOf} replaces every dot: ${EXTERNAL.mapped.map(([from, to]) => `${from} → ${to}`).join(', ')}`, async () => {
    const map = await modelNameOf()
    for (const [from, to] of EXTERNAL.mapped) {
      assert.equal(modelName(from), to, `fixture: ${from} under K2's EXTERNAL_NAME`)
      assert.equal(map(from), to, from)
    }
  })
  rule('EP 3 (core names)', `${EXTERNAL.modelNameOf} leaves every K1 core tool name unchanged`, async () => {
    const map = await modelNameOf()
    assert.deepEqual(TOOLS.map((t) => map(t.name)), TOOLS.map((t) => t.name))
  })
  rule('EP 4 (offered, several dots)', 'a contributed tool whose local name holds dots is offered under the name with every dot replaced, and is called under its public name', async (t) => {
    const [, , [publicName, mapped]] = EXTERNAL.mapped
    const tool = toolNamed(publicName)
    const w = await worldFor(t, { tools: listed([tool]) })
    assert.ok((await w.offered()).some((o) => o.name === mapped), `${mapped} is not offered`)
    await w.modelCalls(mapped, { q: FIXTURE.query })
    assert.deepEqual(w.link.sent(publicName).map((c) => c.args), [{ q: FIXTURE.query }])
  })
  for (const [part, dots, offered] of [['BVA 64 (dots)', EXTERNAL.dotsAt64, true], ['BVA 65 (dots)', EXTERNAL.dotsAt64 + 1, false]]) {
    const name = EXTERNAL.bvaNamespace + K2.separator + dottedLocal(dots)
    const mappedChars = MODEL_NAME.maxChars + (offered ? 0 : 1)
    rule(part, `${name} (${name.length} characters, ${dots + 1} dots) maps to ${mappedChars}: ${offered ? 'offered' : 'not offered, logged once; the rest offered'}`, async (t) => {
      assert.equal(modelName(name).length, mappedChars, 'fixture')
      const w = await worldFor(t, { tools: listed(FIXTURE.remote, [toolNamed(name)]) })
      const got = await w.offered()
      assert.equal(offeredNamed(got, name) !== undefined, offered, `${modelName(name)} ${offered ? 'is not' : 'is'} offered`)
      assertOffersEvery(got, listed(FIXTURE.remote))
      if (!offered) assert.equal(w.logsWith(name).length, 1, `${name} is not logged exactly once`)
    })
  }
  rule('static', 'the bridge source restates no `__` string literal: the mapping is imported from K2 (constants defined once)', () => {
    const restated = bridgeSources().filter((file) => EXTERNAL.restated.test(fs.readFileSync(file, 'utf8')))
    assert.deepEqual(restated.map((file) => path.basename(file)), [], 'bridge files that write the `__` literal themselves')
  })
}
/** A grammar-valid local name of EXTERNAL.localChars characters holding `dots` single dots, none at an end. */
function dottedLocal(dots) {
  const chars = EXTERNAL.localChars - dots
  const segment = Math.floor(chars / (dots + 1))
  const segments = Array.from({ length: dots + 1 }, (_, i) => EXTERNAL.pad.repeat(i === 0 ? chars - segment * dots : segment))
  return segments.join(K2.separator)
}

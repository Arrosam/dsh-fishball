/**
 * WAKE-BATCH system rows (the user-approved design relayed 2026-11-21): a real standalone Fishball
 * DSH with core installed (world.mjs worker) and a fake target DSH (fake-dsh.mjs). Public surfaces
 * only: core's settings namespace (DSH's settings service), the manager's model request tools, the
 * manager session's durable log.
 *
 * Rows:
 * - WAKE-SYS-TOOL-01: core's MCP.tools copy names workspaces_list and models_list, and the manager is
 *   offered both, namespaced for the target, when the target lists them (the lead's request);
 * - WAKE-SYS-ST-01: three events committed together with a live-changed quiet window reach the manager
 *   as ONE delivery holding all three (items 2, 4);
 * - WAKE-SYS-EP-01: a turn-finished event's final message text reaches the manager's model (item 7).
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import * as K1 from 'fishball-test-helpers/connector-contract/mcp-schema'
import { FAKE_DSH } from 'fishball-test-helpers/fake-connector'
import { until } from 'fishball-test-helpers/wait'
import { MCP, connectorTools, toolNameOf } from '../support/targets-oracle.mjs'
import { C, MULTI } from './constants.mjs'
import { multiWorld } from './world.mjs'

/** Sentences of the persona Fishball's model reads (core's src/persona.js PERSONA_ROLE). */
async function personaSentences() {
  const role = (await import(path.join(C.coreDir, 'src', 'persona.js'))).PERSONA_ROLE
  const text = Array.isArray(role) ? role.join('\n') : String(role)
  return text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim() !== '')
}

const T = { timeout: C.budget.boot + MULTI.budget.connectMs * 4 }
const row = (id, part, title, fn) => caseTest(id, part, title, T, fn)
const sourceOf = (v) => ({ targetId: v.targetId, endpointEpoch: v.endpointEpoch, serverName: v.serverName, name: v.name })
/** The two discovery tools (the connector's names, relayed 2026-11-21) and their MCP.tools keys. */
const DISCOVERY = Object.freeze({ workspacesList: 'workspaces_list', modelsList: 'models_list' })
const WAKE = Object.freeze({ path: ['wake', 'quietWindowSeconds'], windowSeconds: 2, msPerSecond: 1000, marker: 'FBTEST-WAKE-SYS-', final: 'FBTEST-FINAL-MESSAGE the session said this' })

/** A K1-shaped tool definition the fake target lists (object input, open output), named `name`. */
const discoveryTool = (name) => ({ name, description: 'fbtest ' + name, inputSchema: { type: 'object', properties: {}, additionalProperties: false } })
/** One mailbox event of `type` (K1 mailboxEvent fields), its marker in its id and payload. */
let seq = 0
function mailboxEvent(type, payload) {
  seq += 1
  return { eventId: WAKE.marker + seq, mailboxGeneration: FAKE_DSH.generation, sequence: seq, type, at: Date.now(), sourceSessionId: MULTI.event.session, correlationId: null, payload, payloadDigest: MULTI.event.digestFill.repeat(K1.WIRE.digestHexChars) }
}

export function registerWakeSystemCases() {
  const standalone = multiWorld()

  row('WAKE-SYS-TOOL-01', 'MCP.tools', 'core\'s MCP.tools copy has workspacesList: workspaces_list and modelsList: models_list', () => {
    for (const [key, name] of Object.entries(DISCOVERY)) assert.equal(MCP.tools[key], name, 'MCP.tools.' + key)
  })
  row('WAKE-SYS-TOOL-01', 'offered', 'a target listing workspaces_list and models_list: the manager\'s model is offered both as that target\'s namespaced core tools', async () => {
    const w = await standalone()
    const fake = await w.fake({ name: MULTI.name.office, tools: [...connectorTools(K1.TOOLS), ...Object.values(DISCOVERY).map(discoveryTool)] })
    const a = await w.connect(fake)
    const names = (await w.tools()).map((t) => t.name)
    for (const name of Object.values(DISCOVERY)) assert.ok(names.includes(toolNameOf(sourceOf(a.view), name)), toolNameOf(sourceOf(a.view), name) + ' not offered; offered ' + JSON.stringify(names))
  })

  // Item 7: the persona no longer sends Fishball to session_read for a finished turn, and says events come batched.
  row('WAKE-SYS-EP-02', 'persona turn-finished', 'no persona sentence about a turn-finished event tells Fishball to use session_read (the event carries the final message)', async () => {
    const offending = (await personaSentences()).filter((s) => /turn-finished|finishes a turn|finished turn/i.test(s) && s.includes(MCP.tools.sessionRead))
    assert.deepEqual(offending, [])
  })
  row('WAKE-SYS-EP-02', 'persona batched', 'the persona says events arrive batched (one sentence naming events and a batch / together)', async () => {
    const said = (await personaSentences()).filter((s) => /\bevents?\b/i.test(s) && /\bbatch(?:ed|es)?\b|\btogether\b|\bat once\b/i.test(s))
    assert.ok(said.length > 0, 'no persona sentence says events arrive batched')
  })

  row('WAKE-SYS-ST-01', 'one turn', `the window set live to ${WAKE.windowSeconds} s through core's settings; three messages committed together → ONE delivery to the manager holding all three, admitted no earlier than the window`, async () => {
    const w = await standalone()
    const fake = await w.fake({ name: MULTI.name.office })
    await w.connect(fake)
    await w.h.call('ensure')
    await w.h.call('mutate', { ns: C.core, ops: [{ op: 'set', path: WAKE.path, value: WAKE.windowSeconds }] })
    const before = await w.h.call('managerDeliveries')
    const events = [1, 2, 3].map(() => mailboxEvent(K1.EVENT_TYPE.message, { text: 'fbtest batch', images: [] }))
    const sent = Date.now()
    fake.enqueue(...events.map((e) => structuredClone(e)))
    let now
    await until(async () => { now = await w.h.call('managerDeliveries'); return now.deliveries.length > before.deliveries.length }, MULTI.budget.connectMs, MULTI.budget.pollMs)
    await new Promise((resolve) => setTimeout(resolve, WAKE.windowSeconds * WAKE.msPerSecond + MULTI.budget.quietMs))
    now = await w.h.call('managerDeliveries')
    const fresh = now.deliveries.slice(before.deliveries.length)
    assert.equal(fresh.length, 1, 'deliveries ' + JSON.stringify(fresh.map((d) => d.text.slice(0, 200))))
    for (const e of events) assert.ok(fresh[0].text.includes(e.eventId), e.eventId + ' is not in the delivery')
    assert.ok(fresh[0].time - sent >= WAKE.windowSeconds * WAKE.msPerSecond - MULTI.budget.pollMs, `delivered ${fresh[0].time - sent} ms after the commit (window ${WAKE.windowSeconds} s)`)
    assert.equal(now.turns - before.turns, 1, 'manager turns for the batch')
  })

  row('WAKE-SYS-EP-01', 'final message', 'a turn-finished event {sessionId, outcome: completed, finalMessage: {text, truncated}} → its final message text reaches the manager\'s delivery', async () => {
    const w = await standalone()
    const fake = await w.fake({ name: MULTI.name.office })
    await w.connect(fake)
    await w.h.call('ensure')
    await w.h.call('mutate', { ns: C.core, ops: [{ op: 'set', path: WAKE.path, value: 0 }] })
    const event = mailboxEvent(K1.EVENT_TYPE.turnFinished, { sessionId: MULTI.event.session, outcome: 'completed', finalMessage: { text: WAKE.final, truncated: false } })
    fake.enqueue(structuredClone(event))
    let now
    const ok = await until(async () => { now = await w.h.call('managerDeliveries'); return now.deliveries.some((d) => d.text.includes(event.eventId)) }, MULTI.budget.connectMs, MULTI.budget.pollMs)
    assert.ok(ok, 'the turn-finished event never reached the manager')
    assert.ok(now.deliveries.find((d) => d.text.includes(event.eventId)).text.includes(WAKE.final), 'the final message text is not in the delivery')
  })
}
/**
 * IX-UC-01 (USE-CASES.md): the managed session's one connector tool, `message_agent`, on a real DSH.
 * Gap-check (B) rows: MSG-01, MSG-03, MSG-05, MSG-06, MSG-07, MSG-08, L60, MSG-09; MGD-04/05/07/08/09,
 * MGD-14, MGD-15, DUR-01; LUM-01/03 (the tool-list part). The user: "不给ask_agent工具";
 * "list_user_messages is deleted". Techniques: UC, EP, BVA, DT, ST (each row's part says which).
 */
import assert from 'node:assert/strict'
import { DECISION_TEXT, EVENT_TYPE, FIXTURE, IX, RELAYED, TOOL } from './constants.mjs'
import { row, withdrawn } from './rows.mjs'
import {
  cid, eventually, free, handOver, managed, ofBytes, ofType, okCall, pending, principal, quiet, resultOf, session, setLimit, step, takeBack, tok,
  turn, waitEvents, world, jsonOf,
} from './subject.mjs'

const MSG = RELAYED.messageTool
const CODE = RELAYED.messageCode
const SET = RELAYED.setting
const connectorTools = [MSG, ...RELAYED.deletedTools]

/** The tool definitions of the session's newest model request. */
async function lastTools(w, sid) {
  const all = await w.call('requestTools', { sessionId: sid })
  assert.ok(all.length > 0, 'the session made no model request')
  return all.at(-1)
}
/** The connector's tools among a request's tools. */
const connectorOf = (tools) => tools.filter((t) => connectorTools.includes(t.name))
/** One model call of message_agent with `message`; returns its parsed result. */
async function messageAgent(w, sid, message, id = cid('msg')) {
  await turn(w, sid, [step(MSG, { [RELAYED.messageArg]: message }, id)])
  return jsonOf(await resultOf(w, sid, id))
}
/** The `message` events of `p` whose text is exactly `text`. */
const messagesWith = async (p, text) => ofType(await pending(p.client), EVENT_TYPE.message).filter((e) => e.payload.text === text)

export function registerMessagingCases(sdk) {
  const w0 = () => world(sdk)

  // ------------------------------------------------------------------------- the tool list
  row(sdk, 'MSG-01 / LUM-01', 'EP (managed by Hand over)', `the next model request has exactly one connector tool, ${MSG}, with a required string message and no notify_when_finished; no ask_agent, no list_user_messages (${DECISION_TEXT.noAsk}; ${DECISION_TEXT.noList})`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await turn(w, sid, [[{ text: tok('hi') }]])
    const tools = connectorOf(await lastTools(w, sid))
    assert.deepEqual(tools.map((x) => x.name), [MSG])
    const params = tools[0].parameters
    assert.equal(params?.properties?.[RELAYED.messageArg]?.type, 'string')
    assert.deepEqual(params?.required, [RELAYED.messageArg])
    assert.deepEqual(Object.keys(params?.properties ?? {}), [RELAYED.messageArg], 'an extra argument (notify_when_finished?)')
  })
  row(sdk, 'MSG-01 / LUM-02', 'EP (unmanaged)', 'a session nobody manages has no connector tool', async (t) => {
    const w = await w0()
    await principal(t, w)
    const sid = await session(w)
    await turn(w, sid, [[{ text: tok('hi') }]])
    assert.deepEqual(connectorOf(await lastTools(w, sid)), [])
  })
  row(sdk, 'MGD-07', 'UC (session_start)', `a session started by session_start has ${MSG} in every model request`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const folder = await w.call('folder', { name: tok('start') })
    const s = await okCall(p.client, TOOL.sessionStart, { folder, title: FIXTURE.title, message: tok('first'), attachments: [] })
    await w.call('waitIdle', { sessionId: s.sessionId })
    const all = await w.call('requestTools', { sessionId: s.sessionId })
    assert.ok(all.length > 0)
    for (const tools of all) assert.deepEqual(connectorOf(tools).map((x) => x.name), [MSG])
  })
  for (const how of ['Take back', 'session_release']) {
    row(sdk, 'MGD-08 / MGD-09 / LUM-03', `ST (Managed → ${how} → Unmanaged)`, `after ${how} the next model request has no connector tool`, async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      await turn(w, sid, [[{ text: tok('before') }]])
      assert.deepEqual(connectorOf(await lastTools(w, sid)).map((x) => x.name), [MSG])
      if (how === 'Take back') await takeBack(w, sid)
      else await okCall(p.client, TOOL.sessionRelease, { sessionId: sid, reason: FIXTURE.reason })
      await turn(w, sid, [[{ text: tok('after') }]])
      assert.deepEqual(connectorOf(await lastTools(w, sid)), [])
    })
  }
  row(sdk, 'MGD-15', 'ST (held turn: step 2 after Take back)', 'a turn running when the session is taken back: its next step has no connector tool', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await free(w, sid)
    await w.call('holdNext', { sessionId: sid })
    await w.call('driveStart', { sessionId: sid, text: tok('held'), script: [step(IX.fixture.echoTool, { text: tok('e') }, cid('e')), [{ text: 'done' }]] })
    assert.ok(await eventually(() => w.call('isHeld', { sessionId: sid })), 'the first step is not held')
    await takeBack(w, sid)
    await w.call('releaseHold', { sessionId: sid })
    await w.call('idle', { sessionId: sid })
    const all = await w.call('requestTools', { sessionId: sid })
    assert.deepEqual(connectorOf(all.at(-1)), [], 'step 2 still had a connector tool')
  })
  row(sdk, 'MSG-06 / MGD-14', 'EP (a subagent of a managed session)', `the parent has ${MSG}; its subagent has no connector tool, and nothing is sent`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p, IX.dsh.standardPreset)
    const marker = tok('sub')
    const text = tok('fromsub')
    await w.call('queueMarker', { marker, except: sid, script: [step(MSG, { message: text }, cid('sub')), [{ text: 'sub done' }]] })
    await turn(w, sid, [step(IX.dsh.subagentTool, { description: tok('d'), prompt: marker }, cid('spawn'))])
    assert.ok(await eventually(async () => (await w.call('markerState', { marker }))?.sessions.length > 0), 'the subagent never ran')
    const child = (await w.call('markerState', { marker })).sessions[0]
    assert.notEqual(child, sid)
    for (const tools of await w.call('requestTools', { sessionId: child })) assert.deepEqual(connectorOf(tools), [], 'the subagent lists a connector tool')
    assert.ok((await w.call('requestTools', { sessionId: sid })).every((tools) => connectorOf(tools).some((x) => x.name === MSG)), 'the parent lacks ' + MSG)
    await quiet()
    assert.deepEqual(await messagesWith(p, text), [])
  })
  row(sdk, 'DUR-01', 'ST (agent disposed → resumed)', `after the agent is disposed and the session resumed, the new agent's next request has ${MSG}`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const { sessionId: sid } = await w.call('createKept', { name: tok('kept'), preset: IX.preset.bare })
    await handOver(w, sid, p)
    assert.equal((await w.call('disposeKept', { sessionId: sid })).live, false)
    assert.equal((await w.call('resume', { sessionId: sid })).live, true)
    await turn(w, sid, [[{ text: tok('back') }]])
    assert.deepEqual(connectorOf(await lastTools(w, sid)).map((x) => x.name), [MSG])
  })

  // ------------------------------------------------------------------------- delivery
  row(sdk, 'MSG-03 / MSG-05', 'UC (principal not connected)', `${MSG} → {ok: true, note}; one message event {text, images: []} in P's mailbox, sourceSessionId = the calling session, never an argument`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const other = await session(w)
    const sid = await managed(w, p)
    // The text names another session: the sender is still the caller.
    const text = tok('m03') + ' sessionId=' + other
    const result = await messageAgent(w, sid, text)
    assert.deepEqual(result, { ok: true, note: RELAYED.delivered })
    const got = await waitEvents(p.client, (e) => { const m = ofType(e, EVENT_TYPE.message).filter((x) => x.payload.text === text); return m.length > 0 && m }, 'the message event')
    await quiet()
    assert.equal((await messagesWith(p, text)).length, 1, 'more than one message event')
    assert.equal(got.length, 1)
    assert.deepEqual(got[0].payload, { text, images: [] })
    assert.equal(got[0].sourceSessionId, sid)
  })
  // MSG-07: the dedupe decision table (call id × model response × text).
  for (const [label, calls, events, dup] of [
    ['1 same id, same response, same text', [['a', 'x', 1], ['a', 'x', 1]], 1, true],
    ['2 same id and text, a later response', [['b', 'x', 1], ['b', 'x', 2]], 2, false],
    ['3 same id and response, other text', [['c', 'x', 1], ['c', 'y', 1]], 2, false],
    ['4 other ids, same text', [['d', 'x', 1], ['e', 'x', 1]], 2, false],
  ]) {
    row(sdk, 'MSG-07', `DT row ${label}`, dup ? 'one event; the repeat answers {ok: true, duplicate: true, note}' : 'two events, no duplicate', async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      const base = tok('m07')
      const ids = Object.fromEntries(calls.map(([k]) => [k, cid('m07' + k)]))
      const texts = { x: base, y: base + '-other' }
      // One model response per distinct response number, holding its calls in order.
      const responses = [...new Set(calls.map((c) => c[2]))].map((n) => calls.filter((c) => c[2] === n).map(([k, x]) => ({ tool: MSG, args: { message: texts[x] }, id: ids[k] })))
      await turn(w, sid, responses)
      const results = (await w.call('results', { sessionId: sid })).filter((r) => Object.values(ids).includes(r.callId)).map(jsonOf)
      assert.equal(results.length, calls.length)
      if (dup) {
        assert.deepEqual(results[0], { ok: true, note: RELAYED.delivered })
        assert.deepEqual(results[1], { ok: true, duplicate: true, note: RELAYED.duplicate })
      } else for (const r of results) assert.deepEqual(r, { ok: true, note: RELAYED.delivered })
      await quiet()
      const got = ofType(await pending(p.client), EVENT_TYPE.message).filter((e) => e.payload.text.startsWith(base))
      assert.equal(got.length, events)
    })
  }

  // ------------------------------------------------------------------------- bounds (maxMessageBytes, live)
  const L = FIXTURE.smallBytes
  for (const [label, make, code] of [
    ['\'\'', () => '', CODE.empty],
    ['whitespace only', () => ' \n\t ', CODE.empty],
    ['1 byte', () => 'q', null],
    [`${L} ASCII bytes (= L)`, (h) => ofBytes(L, FIXTURE.padUnit, h), null],
    [`${L} bytes of 2-byte characters (= L)`, (h) => ofBytes(L, FIXTURE.twoByte, h), null],
    [`${L + 1} ASCII bytes (L + 1)`, (h) => ofBytes(L + 1, FIXTURE.padUnit, h), CODE.tooLarge],
    [`${L - 1} ASCII bytes and one 2-byte character (L + 1 bytes)`, (h) => ofBytes(L - 1, FIXTURE.padUnit, h) + FIXTURE.twoByte, CODE.tooLarge],
    [`${L + 2} bytes`, (h) => ofBytes(L + 2, FIXTURE.padUnit, h), CODE.tooLarge],
  ]) {
    row(sdk, 'MSG-08', `BVA (maxMessageBytes = ${L}: ${label})`, code ? `→ {ok: false, code: ${code}}; nothing queued` : '→ delivered once', async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      await setLimit(t, w, SET.maxMessageBytes, L)
      const head = tok('m8').slice(0, 12)
      const text = make(head)
      const result = await messageAgent(w, sid, text)
      await quiet()
      const got = ofType(await pending(p.client), EVENT_TYPE.message).filter((e) => e.sourceSessionId === sid)
      if (code) {
        assert.deepEqual(result, { ok: false, code })
        assert.deepEqual(got, [], 'something was queued')
      } else {
        assert.deepEqual(result, { ok: true, note: RELAYED.delivered })
        assert.deepEqual(got.map((e) => e.payload.text), [text])
      }
    })
  }
  for (const [label, n, ok] of [['= default', RELAYED.kept.maxMessageBytes, true], ['default + 1', RELAYED.kept.maxMessageBytes + 1, false]]) {
    row(sdk, 'MSG-08b', `BVA (default maxMessageBytes, ${label})`, ok ? 'exactly 65536 bytes (multi-byte counted as bytes) is delivered' : `65537 bytes → ${CODE.tooLarge}`, async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      assert.equal((await w.settings()).value[SET.maxMessageBytes], RELAYED.kept.maxMessageBytes, 'the default changed')
      const text = ofBytes(n, FIXTURE.euro, tok('m8b'))
      const result = await messageAgent(w, sid, text)
      assert.deepEqual(result, ok ? { ok: true, note: RELAYED.delivered } : { ok: false, code: CODE.tooLarge })
    })
  }
  row(sdk, 'L60', 'ST (L → L + 1, live)', `maxMessageBytes = ${L}: a ${L + 1}-byte message is too-large; raised to ${L + 1} it is delivered without a restart`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await setLimit(t, w, SET.maxMessageBytes, L)
    const text = ofBytes(L + 1, FIXTURE.padUnit, tok('l60').slice(0, 12))
    assert.deepEqual(await messageAgent(w, sid, text), { ok: false, code: CODE.tooLarge })
    assert.equal((await w.call('settingsUpdate', { patch: { [SET.maxMessageBytes]: L + 1 } })).ok, true)
    assert.deepEqual(await messageAgent(w, sid, text), { ok: true, note: RELAYED.delivered })
  })
  // A managed session's own turns also put turn-finished / state events in P's mailbox, and they count
  // toward the bound (K1 QUEUE). So the bound is set to what P already holds (the box is full before the
  // turn starts) and then raised with room to spare: "at the bound → queue-full; with room → delivered".
  row(sdk, 'MSG-09', 'BVA (maxQueuedInputs = what P holds → raised)', `P's mailbox at maxQueuedInputs → ${CODE.queueFull}, nothing queued; the bound raised (live) → the next is delivered`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const held = (await pending(p.client)).length
    assert.ok(held >= 1, 'the handover event is not pending')
    await setLimit(t, w, SET.maxQueuedInputs, held)
    const full = tok('m09')
    assert.deepEqual(await messageAgent(w, sid, full), { ok: false, code: CODE.queueFull })
    assert.deepEqual(await messagesWith(p, full), [], 'a message past the bound was queued')
    assert.equal((await w.call('settingsUpdate', { patch: { [SET.maxQueuedInputs]: held + FIXTURE.queueRoom } })).ok, true)
    assert.deepEqual(await messageAgent(w, sid, tok('m09b')), { ok: true, note: RELAYED.delivered })
  })
  // Re-baselined (dev session, 2026-11-17; spike S34): the tool lives in the managed agent's own scope and
  // Take back removes it at once, so a call the model makes after it is answered by DSH itself (its
  // unknown-tool error) before any body runs. `not-managed` needs a release between DSH resolving the
  // tool and its body running, a window the harness cannot hold.
  row(sdk, 'MSG-10', `ST (managed at the tool list → taken back before the call lands)`, 'the call gets DSH\'s own unknown-tool error result (no connector envelope); no message event', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const text = tok('m10')
    const id = cid('m10')
    await free(w, sid)
    await w.call('holdNext', { sessionId: sid })
    await w.call('driveStart', { sessionId: sid, text: tok('u'), script: [step(MSG, { message: text }, id), [{ text: 'done' }]] })
    assert.ok(await eventually(() => w.call('isHeld', { sessionId: sid })))
    await takeBack(w, sid)
    await w.call('releaseHold', { sessionId: sid })
    await w.call('idle', { sessionId: sid })
    const result = await resultOf(w, sid, id)
    assert.equal(result.isError, true, 'the call after Take back did not fail: ' + result.text)
    assert.equal(typeof jsonOf(result)?.ok, 'undefined', 'a connector body answered the call: ' + result.text)
    await quiet()
    assert.deepEqual(await messagesWith(p, text), [])
  })

  // ------------------------------------------------------------------------- withdrawn (the user's decisions)
  withdrawn(sdk, 'MSG-01', 'notify_when_finished', 'message_agent takes notify_when_finished', 'R-WATCH-03 (watches retired); the brief: message_agent has `message` only')
  withdrawn(sdk, 'LUM-05…09 / LUS-01…03', 'list_user_messages', 'list_user_messages lists the user-typed messages, newest first, bounded', DECISION_TEXT.noList)
  withdrawn(sdk, 'LUM-10 / LUM-11', 'settings', 'userMessagesListed / userMessageExcerptChars are settings fields', DECISION_TEXT.noList + ' (the fields are removed)')
  withdrawn(sdk, 'MSG-02 / ask_agent', 'tool list', 'a managed session lists ask_agent', DECISION_TEXT.noAsk)
}

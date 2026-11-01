/**
 * Revision 10c (DESIGN §10d "Fishball's own plugins", Q-own-plugins, Q-own-plugins-open): every tool Fishball
 * registers belongs to a catalog plugin; four new built-ins and the Messenger look form the "Fishball" group.
 * This file: the catalog entries at the defaults, who may switch them (decision table), Plugin management off,
 * Session messages switched while Fishball is inside a turn, and the features invariant over every SSE frame.
 * One new-install host (default worker: the scripted answerer answers every prompt); cases run in order.
 * Requirements: the revision 10c brief (CASES.md "Revision 10c cases"); never the implementation.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | OWN-01 ×5 | EP (one per Fishball-group entry) | kind builtin, dsh fishball, status builtin, on, applied, [disable], removing false, changedBy null, lastError null, its title, exactly its tools |
 * | OWN-02 | EP (tool status) | every own tool visible, message_fishball other-sessions |
 * | OWN-03 | EP (otherTools) | none of Fishball's own tool names in otherTools; each own tool under exactly one plugin |
 * | OWN-04 | EP (other built-ins) | the 7 DSH built-ins keep dsh builtin; exactly the 5 Fishball-group entries have dsh fishball |
 * | OWN-05 | EP | GET state and the first SSE frame have features {approvals, messages, plugins, watching}, all true |
 * | OWN-06 | EP (Fishball / managed session) | Fishball's request lists its own tools but not message_fishball; a managed session's request lists message_fishball and none of Fishball's own tools (rev11a: the session is handed over in setup) |
 * | OWN-10 ×4 | DT (user × own plugin × off then on, idle) | 200, no prompt; off: changedBy user, applied off, features false, tools plugin-off, absent from the next request; on: no prompt, tools visible (trusted, never unchecked), features true |
 * | OWN-11 ×3 | DT (Fishball × own plugin × off, Reject, Allow once) | off: ok, no prompt, same turn keeps the tools, the next request lacks them, changedBy fishball; on+Reject: one prompt naming "Fishball asks to turn on" and the title shown on the tab, {ok:false, code:'rejected'}, stays off; on+Allow once: ok, on, tools back, no unchecked |
 * | OWN-12 | DT (Fishball × own plugin × on, unavailable) | Session watching: {ok:false, code:'rejected'}, stays off |
 * | OWN-13 | ST (Fishball turns Plugin management off) | ok, no prompt; next request lacks the 6 tools; features.plugins false; a set_plugin_enabled call is a tool error and changes nothing; the user turns it on again (no prompt) |
 * | OWN-14 ×2 | DT (Fishball × Messenger look / ask-user × on) | no prompt, ok (not under the own-plugins rule) |
 * | OWN-15 ×6 | DT (remove × own plugin) | POST plugins/remove: 409 refused for the five; remove_plugin: not-removable without a prompt |
 * | OWN-16 ×3 | BVA (near-miss keys) | builtin:session-message, builtin:Session-messages, fishball:session-messages: 409 unknown |
 * | OWN-17 | EP (Fishball × own plugin already on × on) | nothing to ask: no prompt, ok, stays on |
 * | OWN-18 | ST (your off arrives while Fishball's turn runs, before its set_plugin_enabled(on)) | your off holds: either one prompt (Reject → rejected) or ask-first without a prompt; stays off |
 * | OWN-19 ×6 | ST (race: your off POSTed as Fishball's set_plugin_enabled(on) of an on plugin runs) | whatever the order, the off holds without an Allow once: the answer is ok (your off came after), rejected after a prompt, or ask-first without a prompt; the plugin ends off |
 * | OWN-20 | ST (user off while Fishball is held in a turn) | on false at once, applied still true; features.messages stays true and the managed session keeps message_fishball until the turn ends, then both are off (rev11a: per managed agent, not global) |
 * | OWN-21 | ST (user on while held) | applied stays off and Send to Fishball answers 409 feature-off until the turn ends; then features.messages true, message_fishball back in the managed session, Send 200 |
 * | OWN-30 | EP (invariant over every collected SSE frame) | features[f] === entry.applied for each own plugin (coordinator's correction: effects follow the applied state only) |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  ACTION, API, BUILTINS, CHANGED_BY, CODE, DSH_STATE, FEATURE_KEYS, FEATURE_OFF, FISHBALL_GROUP_KEYS, INBOUND_TOOL, KIND, MESSENGER, OUTCOME,
  OWN_ASK, OWN_PLUGINS, PLUGIN_STATUS, PRESET, TOOL_STATUS,
} from './support/constants.mjs'
import {
  HOOK, T, makeManaged, callScript, callTool, resultOfCall, catalogSettled, holdFishball, listPlugins, nextTools, pluginIn, removePlugin, setPlugin, settle, settledIdle, toolIn, toolNames, turn, untilCatalog,
} from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const LONG = { timeout: 150000 }
const ALL_OWN_TOOLS = Object.values(OWN_PLUGINS).flatMap((p) => p.tools)
/** Fishball's own tools that Fishball itself sees (message_fishball is for other sessions only). */
const visibleTools = (p) => p.tools.filter((n) => n !== INBOUND_TOOL)
const expectedStatus = (name) => (name === INBOUND_TOOL ? TOOL_STATUS.otherSessions : TOOL_STATUS.visible)

describe('Revision 10c Fishball\'s own plugins: catalog and switches', () => {
  let host
  let fb
  let bare
  let stream
  const toggle = (plugin, on) => host.post(API.plugins, { plugin, on })
  const entry = async (key) => pluginIn((await host.state()).catalog, key)
  const features = async () => (await host.state()).features
  const approvalsFor = async () => (await host.call('approvals', { sessionId: fb })).length
  const ordinaryTools = async () => toolNames((await turn(host, bare, [[{ text: 'hi' }]])).requests.at(-1))

  before(async () => {
    const booted = await bootLive(newHome('own-plugins'))
    host = booted.host
    fb = booted.state?.sessionId
    stream = await host.sse()
    bare = (await host.call('ordinary', { preset: PRESET.bare, folder: 'own-bare' })).sessionId
    await settle(host)
    await settledIdle(host, fb)
    // rev11a: message_fishball exists only in managed sessions (DESIGN §5e), so the session that checks it is handed over.
    await makeManaged(host, fb, bare)
  }, HOOK)
  after(async () => { stream?.close(); await host?.stop() }, HOOK)

  const group = [...Object.values(OWN_PLUGINS), { key: MESSENGER.key, title: MESSENGER.title, tools: [] }]
  for (const spec of group) {
    it('OWN-01 ' + spec.key + ' is a Fishball-group built-in, on by default, with exactly its tools', T, async () => {
      const p = pluginIn(await catalogSettled(host), spec.key)
      assert.ok(p, spec.key + ' listed')
      assert.equal(p.title, spec.title)
      assert.equal(p.kind, KIND.builtin)
      assert.equal(p.dsh, DSH_STATE.fishball)
      assert.equal(p.status, PLUGIN_STATUS.builtin)
      assert.equal(p.on, true)
      assert.equal(p.applied, true)
      assert.deepEqual(p.actions, [ACTION.disable])
      assert.equal(p.removing, false)
      assert.equal(p.changedBy, null)
      assert.equal(p.lastError, null)
      assert.deepEqual(p.tools.map((t) => t.name).sort(), [...spec.tools].sort())
    })
  }

  it('OWN-02 own tools are visible to Fishball; message_fishball has status other-sessions', T, async () => {
    const catalog = await catalogSettled(host)
    for (const spec of Object.values(OWN_PLUGINS)) {
      for (const name of spec.tools) assert.equal(toolIn(catalog, spec.key, name)?.status, expectedStatus(name), spec.key + '/' + name)
    }
  })

  it('OWN-03 otherTools holds none of Fishball\'s own tools; each sits under exactly one plugin', T, async () => {
    const catalog = await catalogSettled(host)
    const others = catalog.otherTools.map((t) => t.name)
    for (const name of ALL_OWN_TOOLS) {
      assert.equal(others.includes(name), false, name + ' in otherTools: ' + JSON.stringify(others))
      const owners = catalog.plugins.filter((p) => p.tools.some((t) => t.name === name)).map((p) => p.plugin)
      assert.equal(owners.length, 1, name + ' owners ' + JSON.stringify(owners))
    }
    // The same through Fishball's own catalog tool.
    const listed = await listPlugins(host, fb)
    for (const name of ALL_OWN_TOOLS) assert.equal(listed.otherTools.some((t) => t.name === name), false, 'list_plugins otherTools lists ' + name)
    assert.equal(toolIn(listed, OWN_PLUGINS.messages.key, INBOUND_TOOL)?.status, TOOL_STATUS.otherSessions)
  })

  it('OWN-04 the DSH built-ins keep dsh builtin; exactly the five Fishball-group entries report dsh fishball', T, async () => {
    const catalog = await catalogSettled(host)
    for (const key of Object.keys(BUILTINS)) assert.equal(pluginIn(catalog, key)?.dsh, DSH_STATE.builtin, key)
    assert.deepEqual(catalog.plugins.filter((p) => p.dsh === DSH_STATE.fishball).map((p) => p.plugin).sort(), [...FISHBALL_GROUP_KEYS].sort())
  })

  it('OWN-05 the snapshot has features with all four true by default (GET state and the first SSE frame)', T, async () => {
    const s = await host.state()
    assert.deepEqual(Object.keys(s.features ?? {}).sort(), FEATURE_KEYS)
    assert.deepEqual(s.features, { approvals: true, messages: true, plugins: true, watching: true })
    assert.ok(await until(() => stream.frames.length > 0, 3000, 50), 'a first frame')
    assert.deepEqual(stream.frames[0].features, { approvals: true, messages: true, plugins: true, watching: true })
  })

  it('OWN-06 Fishball has its own tools but not message_fishball; a managed session has only message_fishball', T, async () => {
    const fbNames = await nextTools(host, fb)
    for (const spec of Object.values(OWN_PLUGINS)) for (const n of visibleTools(spec)) assert.ok(fbNames.includes(n), 'Fishball lacks ' + n)
    assert.equal(fbNames.includes(INBOUND_TOOL), false)
    const names = await ordinaryTools()
    assert.ok(names.includes(INBOUND_TOOL), 'managed session lacks ' + INBOUND_TOOL)
    for (const n of ALL_OWN_TOOLS.filter((x) => x !== INBOUND_TOOL)) assert.equal(names.includes(n), false, 'managed session has ' + n)
  })

  for (const spec of Object.values(OWN_PLUGINS)) {
    it('OWN-10 the user turns ' + spec.key + ' off then on, freely, while Fishball is idle', LONG, async () => {
      await settledIdle(host, fb)
      const asked = await approvalsFor()
      const off = await toggle(spec.key, false)
      assert.equal(off.status, 200, off.text)
      assert.equal(off.json?.ok, true)
      let catalog = await catalogSettled(host)
      let p = pluginIn(catalog, spec.key)
      assert.equal(p.on, false)
      assert.equal(p.applied, false, 'applied at once while idle')
      assert.equal(p.changedBy, CHANGED_BY.user)
      assert.deepEqual(p.actions, [ACTION.enable])
      assert.equal((await features())[spec.feature], false, 'features.' + spec.feature)
      for (const n of visibleTools(spec)) assert.equal(toolIn(catalog, spec.key, n)?.status, TOOL_STATUS.pluginOff, n)
      const names = await nextTools(host, fb)
      for (const n of visibleTools(spec)) assert.equal(names.includes(n), false, 'Fishball request still lists ' + n)
      const on = await toggle(spec.key, true)
      assert.equal(on.status, 200, on.text)
      catalog = await catalogSettled(host)
      p = pluginIn(catalog, spec.key)
      assert.equal(p.on, true)
      assert.equal(p.applied, true)
      assert.equal(p.changedBy, CHANGED_BY.user)
      assert.equal((await features())[spec.feature], true)
      for (const n of spec.tools) assert.equal(toolIn(catalog, spec.key, n)?.status, expectedStatus(n), n + ' trusted again, never unchecked')
      const back = await nextTools(host, fb)
      for (const n of visibleTools(spec)) assert.ok(back.includes(n), 'Fishball request lacks ' + n)
      assert.equal(await approvalsFor(), asked, 'the user is never asked')
    })
  }

  for (const spec of [OWN_PLUGINS.messages, OWN_PLUGINS.watching, OWN_PLUGINS.approvals]) {
    describe('OWN-11 Fishball switches ' + spec.key, () => {
      it('off: free, applies when the turn ends', LONG, async () => {
        const r = await setPlugin(host, fb, spec.key, false)
        assert.equal(r.json?.ok, true, r.result.text)
        assert.equal(r.json?.on, false)
        assert.equal(r.approvals.length, 0, 'no prompt for off')
        assert.equal(r.asked, 0)
        const sameTurn = toolNames(r.requests.at(-1))
        for (const n of visibleTools(spec)) assert.ok(sameTurn.includes(n), 'same turn still has ' + n)
        const names = await nextTools(host, fb)
        for (const n of visibleTools(spec)) assert.equal(names.includes(n), false, 'next request still lists ' + n)
        const p = await entry(spec.key)
        assert.equal(p.on, false)
        assert.equal(p.changedBy, CHANGED_BY.fishball)
        assert.equal((await features())[spec.feature], false)
      })
      it('on, Reject: one prompt "' + OWN_ASK + ' …", rejected, stays off', LONG, async (t) => {
        const r = await setPlugin(host, fb, spec.key, true, OUTCOME.reject)
        assert.equal(r.approvals.length, 1, 'one prompt: ' + JSON.stringify(r.approvals))
        t.diagnostic('prompt tool ' + r.approvals[0].toolName + ', reason ' + JSON.stringify(r.approvals[0].reason))
        assert.ok(String(r.approvals[0].reason).includes(OWN_ASK), 'reason: ' + r.approvals[0].reason)
        // Review follow-up: the prompt names the title shown on the tab.
        assert.ok(String(r.approvals[0].reason).includes(spec.title), 'the prompt names ' + spec.title + ': ' + r.approvals[0].reason)
        assert.equal(r.json?.ok, false, r.result.text)
        assert.equal(r.json?.code, CODE.rejected)
        await settle(host)
        const p = await entry(spec.key)
        assert.equal(p.on, false, 'nothing changes')
        assert.equal(p.changedBy, CHANGED_BY.fishball, 'still Fishball\'s own off')
        assert.equal((await features())[spec.feature], false)
        const names = await nextTools(host, fb)
        for (const n of visibleTools(spec)) assert.equal(names.includes(n), false, n + ' still absent')
      })
      if (spec === OWN_PLUGINS.watching) {
        it('on, unavailable (OWN-12): only Allow once grants', LONG, async () => {
          const r = await setPlugin(host, fb, spec.key, true, OUTCOME.unavailable)
          assert.equal(r.approvals.length, 1)
          assert.equal(r.json?.ok, false, r.result.text)
          assert.equal(r.json?.code, CODE.rejected)
          await settle(host)
          assert.equal((await entry(spec.key)).on, false)
        })
      }
      it('on, Allow once: on after the turn, tools back, nothing unchecked', LONG, async () => {
        const r = await setPlugin(host, fb, spec.key, true, OUTCOME.allow)
        assert.equal(r.approvals.length, 1, 'one prompt')
        assert.ok(String(r.approvals[0].reason).includes(OWN_ASK))
        for (const n of spec.tools) assert.equal(String(r.approvals[0].reason).includes('- ' + n + ':'), false, 'the prompt lists no unchecked tool ' + n)
        assert.equal(r.json?.ok, true, r.result.text)
        assert.equal(r.json?.on, true)
        assert.ok(!r.json.unchecked || r.json.unchecked.length === 0, 'no unchecked tools: ' + JSON.stringify(r.json.unchecked))
        const names = await nextTools(host, fb)
        for (const n of visibleTools(spec)) assert.ok(names.includes(n), 'next request lacks ' + n)
        const catalog = await catalogSettled(host)
        const p = pluginIn(catalog, spec.key)
        assert.equal(p.on, true)
        assert.equal(p.applied, true)
        assert.equal(p.changedBy, CHANGED_BY.fishball)
        for (const n of spec.tools) assert.equal(toolIn(catalog, spec.key, n)?.status, expectedStatus(n), n)
        assert.equal((await features())[spec.feature], true)
      })
    })
  }

  it('OWN-13 Fishball turns Plugin management off; it cannot turn it back on; the user can', LONG, async () => {
    const spec = OWN_PLUGINS.plugins
    const r = await setPlugin(host, fb, spec.key, false)
    assert.equal(r.json?.ok, true, r.result.text)
    assert.equal(r.approvals.length, 0)
    const names = await nextTools(host, fb)
    for (const n of spec.tools) assert.equal(names.includes(n), false, 'next request still lists ' + n)
    assert.equal((await features()).plugins, false)
    // Only its tools: the other own plugins keep running.
    assert.deepEqual(await features(), { approvals: true, messages: true, plugins: false, watching: true })
    const catalog = await catalogSettled(host)
    for (const n of spec.tools) assert.equal(toolIn(catalog, spec.key, n)?.status, TOOL_STATUS.pluginOff, n)
    const asked = await approvalsFor()
    const { result } = await callTool(host, fb, 'set_plugin_enabled', { plugin: spec.key, on: true })
    assert.equal(result.isError, true, 'a masked tool is refused: ' + result.text)
    assert.equal(await approvalsFor(), asked, 'no prompt from a refused call')
    await settle(host)
    assert.equal((await entry(spec.key)).on, false, 'the refused call changed nothing')
    const on = await toggle(spec.key, true)
    assert.equal(on.status, 200, on.text)
    assert.equal(await approvalsFor(), asked)
    const back = await nextTools(host, fb)
    for (const n of spec.tools) assert.ok(back.includes(n), 'back: ' + n)
    assert.equal((await features()).plugins, true)
  })

  for (const [key, label] of [[MESSENGER.key, 'the Messenger look'], ['builtin:ask-user', 'a DSH built-in']]) {
    it('OWN-14 Fishball turns ' + label + ' on without a prompt (not under the own-plugins rule)', LONG, async () => {
      if ((await entry(key)).on) assert.equal((await toggle(key, false)).status, 200)
      await catalogSettled(host)
      const r = await setPlugin(host, fb, key, true, OUTCOME.reject)
      assert.equal(r.json?.ok, true, r.result.text)
      assert.equal(r.approvals.length, 0, 'no prompt')
      await settle(host)
      assert.equal((await entry(key)).on, true)
      if (key === 'builtin:ask-user') assert.equal((await toggle(key, false)).status, 200)
    })
  }

  for (const key of FISHBALL_GROUP_KEYS) {
    it('OWN-15 POST plugins/remove refuses ' + key, T, async () => {
      const r = await host.post(API.pluginsRemove, { plugin: key })
      assert.equal(r.status, 409, r.text)
      assert.equal(r.json?.code, CODE.refused)
      assert.ok(await entry(key), 'still listed')
    })
  }
  it('OWN-15 remove_plugin answers not-removable for an own plugin, without a prompt', T, async () => {
    const r = await removePlugin(host, fb, OWN_PLUGINS.watching.key, OUTCOME.allow)
    assert.equal(r.json?.ok, false, r.result.text)
    assert.equal(r.json?.code, CODE.notRemovable)
    assert.equal(r.approvals.length, 0)
    assert.equal((await entry(OWN_PLUGINS.watching.key)).on, true)
  })

  for (const key of ['builtin:session-message', 'builtin:Session-messages', 'fishball:session-messages']) {
    it('OWN-16 near-miss key ' + key + ' is unknown', T, async () => {
      const r = await toggle(key, false)
      assert.equal(r.status, 409, r.text)
      assert.equal(r.json?.code, CODE.unknown)
      assert.equal((await features()).messages, true)
    })
  }

  describe('Your off against Fishball\'s on (review M1)', () => {
    const spec = OWN_PLUGINS.watching
    let n = 0
    const ensureOn = async () => {
      if (!(await entry(spec.key)).on) assert.equal((await toggle(spec.key, true)).status, 200)
      assert.ok(await untilCatalog(host, (c) => pluginIn(c, spec.key).on && pluginIn(c, spec.key).applied), 'precondition: on and applied')
      await settledIdle(host, fb)
    }
    /** Start a Fishball turn whose model calls set_plugin_enabled(on), held before the model answers. */
    const heldCall = async () => {
      const callId = 'call_own_race_' + ++n
      await settledIdle(host, fb)
      await host.call('setApprover', { outcome: OUTCOME.reject })
      await host.call('holdNext', { sessionId: fb })
      await host.call('driveStart', { sessionId: fb, text: 'turn it on', script: callScript('set_plugin_enabled', { plugin: spec.key, on: true }, callId) })
      assert.ok(await until(() => host.call('isHeld', { sessionId: fb }), 5000, 50), 'precondition: held')
      return callId
    }
    const outcomeOf = async (callId, asked) => {
      const r = await resultOfCall(host, fb, callId, 15000)
      await settledIdle(host, fb)
      const prompts = (await host.call('approvals', { sessionId: fb })).length - asked
      await settle(host)
      return { json: r?.json, text: r?.text, prompts, on: (await entry(spec.key)).on }
    }

    it('OWN-17 Fishball turning on an own plugin that is already on asks nothing', LONG, async () => {
      await ensureOn()
      const r = await setPlugin(host, fb, spec.key, true, OUTCOME.reject)
      assert.equal(r.approvals.length, 0, 'nothing to ask')
      assert.equal(r.json?.ok, true, r.result.text)
      await settle(host)
      assert.equal((await entry(spec.key)).on, true)
    })

    it('OWN-18 your off that arrives during Fishball\'s turn, before its call, holds', LONG, async (t) => {
      await ensureOn()
      const asked = await approvalsFor()
      const callId = await heldCall()
      try {
        assert.equal((await toggle(spec.key, false)).status, 200)
      } finally {
        await host.call('releaseHold', { sessionId: fb })
      }
      const o = await outcomeOf(callId, asked)
      t.diagnostic('answer ' + JSON.stringify(o.json) + ', prompts ' + o.prompts)
      if (o.json?.code === CODE.askFirst) assert.equal(o.prompts, 0, 'ask-first comes without a prompt')
      else {
        assert.equal(o.prompts, 1, 'one prompt for turning on: ' + o.text)
        assert.equal(o.json?.code, CODE.rejected, o.text)
      }
      assert.equal(o.json?.ok, false)
      assert.equal(o.on, false, 'your off holds')
    })

    for (let i = 0; i < 6; i++) {
      it('OWN-19 race ' + (i + 1) + ': your off POSTed as Fishball\'s call runs still holds without an Allow once', LONG, async (t) => {
        await ensureOn()
        const asked = await approvalsFor()
        const callId = await heldCall()
        // Release the held model answer and post the off together, with a growing offset, to land at different points of the call.
        const release = host.call('releaseHold', { sessionId: fb })
        await new Promise((resolve) => setTimeout(resolve, i * 15))
        const off = await toggle(spec.key, false)
        await release
        assert.equal(off.status, 200, off.text)
        const o = await outcomeOf(callId, asked)
        t.diagnostic('offset ' + i * 15 + ' ms: answer ' + JSON.stringify(o.json) + ', prompts ' + o.prompts)
        if (o.json?.ok === true) assert.equal(o.prompts, 0, 'an ok without a prompt means the plugin was on when written; your off came after')
        else if (o.json?.code === CODE.askFirst) assert.equal(o.prompts, 0, 'ask-first comes without a prompt')
        else {
          assert.equal(o.json?.code, CODE.rejected, 'only ok, ask-first or rejected: ' + o.text)
          assert.equal(o.prompts, 1)
        }
        assert.equal(o.on, false, 'the plugin ends off')
      })
    }
    after(async () => { await ensureOn() }, HOOK)
  })

  describe('Session messages switched while Fishball is inside a turn', () => {
    const spec = OWN_PLUGINS.messages
    // rev11a: message_fishball is registered per managed agent, not globally; the managed session's next request shows it.
    const globalHas = async () => (await ordinaryTools()).includes(INBOUND_TOOL)
    const assertFormula = async (label) => {
      const s = await host.state()
      const p = pluginIn(s.catalog, spec.key)
      assert.equal(s.features.messages, p.applied, label + ': features.messages follows applied (on ' + p.on + ', applied ' + p.applied + ')')
    }

    it('OWN-20 off while held: message_fishball stays until the turn ends, then is gone', LONG, async () => {
      assert.ok(await globalHas(), 'precondition: registered')
      await holdFishball(host, fb)
      try {
        const r = await toggle(spec.key, false)
        assert.equal(r.status, 200, r.text)
        const p = await entry(spec.key)
        assert.equal(p.on, false)
        assert.equal(p.applied, true, 'not applied mid-turn')
        await assertFormula('pending off')
        assert.equal((await features()).messages, true, 'the feature keeps working until the apply')
        assert.ok(await globalHas(), 'still registered while the turn runs')
      } finally {
        await host.call('releaseHold', { sessionId: fb })
      }
      await settledIdle(host, fb)
      assert.ok(await untilCatalog(host, (c) => pluginIn(c, spec.key).applied === false), 'applied when the turn ends')
      assert.ok(await until(async () => !(await globalHas()), 5000, 100), 'message_fishball unregistered')
      assert.equal((await features()).messages, false)
      assert.equal((await ordinaryTools()).includes(INBOUND_TOOL), false, 'other sessions no longer have it')
    })

    it('OWN-21 on while held: still off until the turn ends, then message_fishball and Send to Fishball are back', LONG, async () => {
      const target = (await host.call('ordinary', { preset: PRESET.bare, folder: 'own-send' })).sessionId
      await turn(host, target, [[{ text: 'a last answer' }]])
      await holdFishball(host, fb)
      try {
        const r = await toggle(spec.key, true)
        assert.equal(r.status, 200, r.text)
        const p = await entry(spec.key)
        assert.equal(p.on, true)
        assert.equal(p.applied, false, 'not applied mid-turn')
        await assertFormula('pending on')
        assert.equal((await features()).messages, false)
        const send = await host.post(API.send, { sessionId: target, note: '' })
        assert.equal(send.status, 409, 'Send to Fishball while the plugin is not yet applied: ' + send.text)
        assert.equal(send.json?.code, FEATURE_OFF)
        assert.equal(await globalHas(), false, 'not registered before the apply')
      } finally {
        await host.call('releaseHold', { sessionId: fb })
      }
      await settledIdle(host, fb)
      assert.ok(await untilCatalog(host, (c) => pluginIn(c, spec.key).applied === true), 'applied when the turn ends')
      assert.equal((await features()).messages, true)
      assert.ok(await until(globalHas, 5000, 100), 'message_fishball registered again')
      assert.ok((await ordinaryTools()).includes(INBOUND_TOOL))
      const send = await host.post(API.send, { sessionId: target, note: '' })
      assert.equal(send.status, 200, send.text)
      await settledIdle(host, fb)
    })
  })

  it('OWN-30 in every collected frame, each feature is its plugin\'s applied state', T, async () => {
    const withCatalog = stream.frames.filter((f) => f.catalog)
    assert.ok(withCatalog.length > 10, 'frames collected: ' + withCatalog.length)
    for (const [i, f] of withCatalog.entries()) {
      assert.deepEqual(Object.keys(f.features ?? {}).sort(), FEATURE_KEYS, 'frame ' + i + ' features keys')
      for (const spec of Object.values(OWN_PLUGINS)) {
        const p = pluginIn(f.catalog, spec.key)
        assert.equal(f.features[spec.feature], Boolean(p?.applied), 'frame ' + i + ' ' + spec.feature)
      }
    }
  })
})

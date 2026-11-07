/**
 * Revision 11 rev11a: managed status across agent re-creation, plugin switches and a restart (DESIGN §5b, §5e
 * "Tools per session", "Durable", "Which Fishball plugin", §7a.1, §9, §10d, §10e; Q-r11-plugins-off; S34).
 * In rev11a the per-agent registration holds message_fishball only (the user's amendment).
 * Host boots with FBTEST_APPROVER_AFTER=1 (the scripted answerer stands in for the stock prompt after the
 * broker). One home; the cases run in order; the restart and the bundle switch come last.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | DUR-01  | ST (managed –agent disposed→ –resume→ new agent) | a new agent is created; its next request has message_fishball again |
 * | DUR-02  | DT (Session messages off × managed / yours × route) | features.messages false; the managed entry is kept unchanged; the managed session's next request lacks message_fishball; Hand over and Take back answer 409 feature-off and change nothing; the managed session's permission request still reaches Fishball (Permission requests is on) |
 * | DUR-03  | ST (Session messages back on) | the still-managed session's next request has message_fishball again; Hand over works again |
 * | DUR-04  | DT (Permission requests off × managed) | the managed session's permission request reaches its stock prompt at once with zero Fishball steps; it stays managed and keeps message_fishball; back on: its request reaches Fishball again |
 * | DUR-05  | EP (Fishball archived, not live) | POST managed answers 409 unavailable and changes nothing; after unarchive + retry the managed entries are unchanged |
 * | DUR-06  | ST (restart) | the snapshot lists the same managed entries (same since and by); resumed managed sessions have message_fishball and their requests reach Fishball; a taken-back session and a session that is yours have none and reach the stock prompt |
 * | DUR-07  | ST (Fishball's bundle off → on) | while off, a managed session's next request lacks message_fishball; back on, the session is still managed and has it again |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { APPROVER_AFTER_ENV, ASK_REASON, ASK_TOOL, FEATURE_OFF, INBOUND_TOOL, MANAGED_BY, MANAGED_CODE, OUTCOME, OWN_PLUGINS, PACKAGE_NAME, PRESET, STATUS, API, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import {
  HOOK, T, askSettled, fishballCall, managedEntry, managedNow, pluginIn, requestMessages, setManaged, settledIdle, startAsk, toolNames, turn, untilCatalog, waitRequest,
} from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'DUR' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
const AT_ONCE_MS = 1000
const QUIET_MS = 1200
const LONG = { timeout: 150000 }
const hasInbound = (req) => toolNames(req).includes(INBOUND_TOOL)

describe('Revision 11 rev11a: managed status is durable', { skip: NEEDS_INSTANCE_STUB }, () => {
  let host
  let home
  let fb
  const seenFor = async (text) => (await host.call('approvals', {})).filter((a) => a.reason === ASK_REASON(text))
  const boot = async () => {
    host = await bootHost(home, { env: APPROVER_AFTER_ENV })
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'live: ' + JSON.stringify(st?.status))
    fb = st.sessionId
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
  }
  async function userSession(folder) {
    const sid = (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
    await turn(host, sid, [[{ text: 'hello' }]], 'first words')
    return sid
  }
  async function handOver(sid) {
    const r = await setManaged(host, sid, true)
    assert.equal(r.status, 200, r.text)
    await sleep(300)
    await settledIdle(host, fb)
  }
  const nextRequest = async (sid) => (await turn(host, sid, [[{ text: 'next' }]])).requests.at(-1)
  const toggle = async (plugin, on) => {
    await settledIdle(host, fb)
    const r = await host.post(API.plugins, { plugin, on })
    assert.equal(r.status, 200, r.text)
    assert.ok(await untilCatalog(host, (c) => pluginIn(c, plugin)?.applied === on), plugin + ' applied ' + on)
  }
  async function expectStock(sid) {
    await settledIdle(host, fb)
    await settledIdle(host, sid)
    const text = tok('stock')
    const fbBefore = (await host.call('requests', { sessionId: fb })).length
    await startAsk(host, sid, ASK_TOOL, { text })
    const done = await askSettled(host, text, 5000)
    assert.equal(done?.outcome, OUTCOME.reject)
    const seen = await seenFor(text)
    assert.equal(seen.length, 1, 'the stock prompt was asked once')
    assert.ok(seen[0].at - done.askedAt < AT_ONCE_MS, 'at once: ' + (seen[0].at - done.askedAt) + ' ms')
    await sleep(QUIET_MS)
    assert.deepEqual(await requestMessages(host, fb, text), [], 'Fishball is not told')
    assert.equal((await host.call('requests', { sessionId: fb })).length, fbBefore, 'zero Fishball model steps')
    await settledIdle(host, sid)
  }
  async function expectFishball(sid) {
    await settledIdle(host, fb)
    await settledIdle(host, sid)
    const text = tok('tofb')
    await startAsk(host, sid, ASK_TOOL, { text })
    const req = await waitRequest(host, fb, text)
    assert.ok(req, 'a permission request reached Fishball')
    assert.equal(req.block?.fields?.session_id, sid)
    assert.deepEqual(await seenFor(text), [], 'not at the stock prompt while Fishball decides')
    await host.call('cancel', { sessionId: sid })
    await askSettled(host, text)
    await settledIdle(host, sid)
    await settledIdle(host, fb)
  }

  // The sessions the restart case reads back.
  let handed
  let messaged
  let takenBack
  let mine

  before(async () => {
    home = newHome('managed-durable')
    await boot()
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('DUR-01 a managed session whose agent is re-created by resume has message_fishball again', T, async () => {
    const { sessionId: sid } = await host.call('createKept', { folder: 'dur01' })
    await turn(host, sid, [[{ text: 'hello' }]], 'first words')
    await handOver(sid)
    assert.ok(hasInbound(await nextRequest(sid)), 'precondition: managed agent has the tool')
    const created = (await host.call('lifecycle')).filter((e) => e.type === 'created' && e.id === sid).length
    const d = await host.call('disposeKept', { sessionId: sid })
    assert.equal(d.disposed, true)
    assert.equal(d.live, false, 'the agent is gone')
    const r = await host.call('resume', { sessionId: sid })
    assert.equal(r.live, true, JSON.stringify(r))
    assert.equal((await host.call('lifecycle')).filter((e) => e.type === 'created' && e.id === sid).length, created + 1, 'a new agent was created')
    assert.ok(hasInbound(await nextRequest(sid)), 'the new agent has ' + INBOUND_TOOL)
    assert.equal((await managedEntry(host, sid))?.by, MANAGED_BY.handOver)
  })

  describe('Session messages off and on', () => {
    const spec = OWN_PLUGINS.messages
    let m
    let u
    let entryBefore
    before(async () => {
      m = await userSession('dur02-managed')
      u = await userSession('dur02-yours')
      await handOver(m)
      entryBefore = await managedEntry(host, m)
      await toggle(spec.key, false)
    }, HOOK)

    it('DUR-02 off: managed status kept, the tool gone, Hand over / Take back refused feature-off, requests still reach Fishball', T, async () => {
      const s = await host.state()
      assert.equal(s.features.messages, false, 'features.messages false (the client hides Hand over / Take back)')
      assert.deepEqual(await managedEntry(host, m), entryBefore, 'still managed, entry unchanged')
      assert.equal(hasInbound(await nextRequest(m)), false, 'message_fishball removed from the managed session')
      for (const [sid, managed] of [[u, true], [m, false]]) {
        const before = await managedNow(host)
        const r = await setManaged(host, sid, managed)
        assert.equal(r.status, 409, r.text)
        assert.equal(r.json?.code, FEATURE_OFF)
        assert.deepEqual(await managedNow(host), before, 'nothing changed')
      }
      assert.equal(await managedEntry(host, u), undefined)
      await expectFishball(m)
    })

    it('DUR-03 on again: the still-managed session has message_fishball again; Hand over works', T, async () => {
      await toggle(spec.key, true)
      assert.equal((await host.state()).features.messages, true)
      assert.deepEqual(await managedEntry(host, m), entryBefore)
      assert.ok(hasInbound(await nextRequest(m)), 'message_fishball back')
      assert.equal((await setManaged(host, u, true)).status, 200)
      await settledIdle(host, fb)
      assert.equal((await managedEntry(host, u))?.by, MANAGED_BY.handOver)
    })
  })

  it('DUR-04 Permission requests off: a managed session\'s request reaches its stock prompt; back on, Fishball again', T, async () => {
    const spec = OWN_PLUGINS.approvals
    const m = await userSession('dur04')
    await handOver(m)
    await toggle(spec.key, false)
    try {
      await expectStock(m)
      assert.ok(await managedEntry(host, m), 'still managed')
      assert.ok(hasInbound(await nextRequest(m)), 'message_fishball stays (it belongs to Session messages)')
    } finally {
      await toggle(spec.key, true)
    }
    await expectFishball(m)
  })

  it('DUR-05 Fishball not live: POST managed answers 409 unavailable', LONG, async () => {
    const u = await userSession('dur05')
    const before = await managedNow(host)
    const archived = await host.call('archive', { sessionId: fb, stopActivity: true })
    assert.equal(archived.ok, true, JSON.stringify(archived))
    try {
      await host.waitStatus(STATUS.archived)
      const r = await setManaged(host, u, true)
      assert.equal(r.status, 409, r.text)
      assert.equal(r.json?.code, MANAGED_CODE.unavailable)
    } finally {
      await host.call('unarchive', { sessionId: fb })
      const rec = await host.post(API.recovery, { action: 'retry' })
      assert.equal(rec.status, 200, rec.text)
      await host.waitStatus(STATUS.live)
      await settledIdle(host, fb)
    }
    assert.deepEqual(await managedNow(host), before, 'managed entries unchanged')
  })

  it('DUR-06 managed status survives a restart', LONG, async () => {
    handed = await userSession('dur06-handed')
    await handOver(handed)
    messaged = await userSession('dur06-messaged')
    const { json } = await fishballCall(host, fb, 'message_session', { session_id: messaged, message: tok('06') })
    assert.equal(json?.ok, true, JSON.stringify(json))
    await settledIdle(host, messaged)
    takenBack = await userSession('dur06-taken')
    await handOver(takenBack)
    assert.equal((await setManaged(host, takenBack, false)).status, 200)
    mine = await userSession('dur06-mine')
    await settledIdle(host, fb)
    const entries = await managedNow(host)
    const byId = Object.fromEntries(entries.map((e) => [e.sessionId, e]))
    assert.equal(byId[handed]?.by, MANAGED_BY.handOver)
    assert.equal(byId[messaged]?.by, MANAGED_BY.message)
    assert.equal(byId[takenBack], undefined)
    for (const sid of [handed, messaged, takenBack, mine]) await host.call('flush', { sessionId: sid })

    await host.stop()
    await boot()

    const after = await managedNow(host)
    const sort = (list) => [...list].sort((a, b) => a.sessionId.localeCompare(b.sessionId))
    assert.deepEqual(sort(after), sort(entries), 'the same entries, same since and by')
    for (const sid of [handed, messaged, takenBack, mine]) {
      const r = await host.call('resume', { sessionId: sid })
      assert.equal(r.live, true, sid + ': ' + JSON.stringify(r))
    }
    for (const sid of [handed, messaged]) assert.ok(hasInbound(await nextRequest(sid)), sid + ' lacks ' + INBOUND_TOOL + ' after the restart')
    for (const sid of [takenBack, mine]) assert.equal(hasInbound(await nextRequest(sid)), false, sid + ' has ' + INBOUND_TOOL + ' after the restart')
    await expectFishball(handed)
    await expectFishball(messaged)
    await expectStock(takenBack)
    await expectStock(mine)
  })

  it('DUR-07 turning Fishball\'s plugin off removes message_fishball everywhere; back on, it returns', LONG, async () => {
    await settledIdle(host, fb)
    const entries = await managedNow(host)
    assert.ok(entries.some((e) => e.sessionId === handed), 'precondition: managed (DUR-06)')
    const off = await host.call('setBundleEnabled', { name: PACKAGE_NAME, enabled: false }, 90000)
    assert.equal(off.error, null, JSON.stringify(off))
    assert.ok(await until(async () => !hasInbound(await nextRequest(handed)), 15000, 500), 'message_fishball gone from the managed session')
    assert.equal(hasInbound(await nextRequest(messaged)), false)
    const on = await host.call('setBundleEnabled', { name: PACKAGE_NAME, enabled: true }, 90000)
    assert.equal(on.error, null, JSON.stringify(on))
    assert.equal((await host.waitStatus(STATUS.live))?.status, STATUS.live)
    await settledIdle(host, fb)
    assert.ok((await managedNow(host)).some((e) => e.sessionId === handed), 'still managed')
    assert.ok(await until(async () => hasInbound(await nextRequest(handed)), 15000, 500), 'message_fishball back in the managed session')
    assert.equal(hasInbound(await nextRequest(mine)), false, 'and still not in yours')
  })
})

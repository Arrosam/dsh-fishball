/**
 * P8 X2 (unload), X7: enabled/disabled across Fishball's states and its plugin choices, onEnabled,
 * a Fishball-only source plugin, and sources of a plugin that unloads. One host with the source
 * fixtures (FBTEST_SOURCES=1), transitions in order.
 *
 * | id     | technique | req | expected |
 * |--------|-----------|-----|----------|
 * | ENA-01 | EP (live, plugin on) | X7 | enabled true; state lists it enabled |
 * | ENA-02 | ST on -user off (POST plugins)-> off | X7 | enabled false; publish 'disabled' with intakeId null; nothing stored or delivered; state enabled false; a host row's source stays enabled |
 * | ENA-03 | ST off -> register | X7 | a source registered while the plugin is off starts disabled |
 * | ENA-04 | ST off -user on-> on | X7 | enabled again; onEnabled called once for each source of that plugin; the key refused earlier is now accepted (nothing was stored) |
 * | ENA-05 | ST on -set_plugin_enabled off (Fishball, applied after its turn)-> off -set_plugin_enabled on-> on | X7 | disabled after Fishball's turn, enabled after the next; onEnabled once more |
 * | ENA-06 | EP (onEnabled's return value) | X7 | after calling the function onEnabled returned, the listener is not called again |
 * | ENA-07 | ST live -archive-> archived -unarchive+retry-> live | X7 | every source disabled while archived (publish 'disabled', nothing stored); state lists them disabled; enabled again when live, onEnabled called |
 * | ENA-08 | ST starting -> live (the first setup request held 6 s) -user on-> on | X7, plugin statuses | while starting: enabled false and publish 'disabled'; once live it stays disabled (a new install starts the profile plugin off in Fishball); after the user turns it on: enabled, onEnabled once |
 * | ENA-09 | EP (an onEnabled listener that throws, one that rejects) | X7 review | the plugin off and on again: DSH keeps running, the other listeners are still called, publish works |
 * | ONL-01 | ST (Fishball-only plugin off) | X1, X8 | its row never ran; no context; no source listed |
 * | ONL-02 | ST off -user on-> on | X2, X3 | its row runs and gets the service; a source's identity is '<bundle>/<bundle row id>/<id>', as if it ran for everyone (guide, A89) with plugin = the bundle; publish accepted and delivered, item kind plugin |
 * | ONL-03 | ST on -user off-> off | X2 | its row is disposed; its source leaves state; publish rejects FISHBALL_SOURCE_DISPOSED; enabled false |
 * | ONL-03b | EP (registerSource on the service object the row kept from before it unloaded) | X10 guide | FISHBALL_UNKNOWN_PLUGIN; no source listed (A91) |
 * | ONL-04 | ST off -on again-> on | X2, X6 | the same id registers again (the old one was removed); the earlier dedupe key is 'duplicate' |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, PLUGIN_INTAKE_KIND, PUBLISH_STATUS, SOURCE_BUNDLES, SOURCE_ERR, SOURCE_IDENTITY, SOURCE_ROW, SOURCES_ENV, STATUS } from './support/constants.mjs'
import { HOOK, T, callScript, intakeNow, pluginNotices, publish, register, scriptedTurn, settle, settledIdle, sourceIn, sourcesNow, untilSeen } from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

const A = SOURCE_BUNDLES.profile
const O = SOURCE_BUNDLES.only
const LA = A.rows.a.label
const LB = A.rows.b.label
const LO = O.rows.a.label
let seq = 0
const tok = (label) => 'TOK' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 8)
const LONG = { timeout: 120000 }
const event = (over = {}) => ({ dedupeKey: tok('key'), title: tok('title'), body: tok('body'), ...over })
const IDENT = (id, entry = A.rows.a.id, bundle = A.name) => SOURCE_IDENTITY(bundle, entry, id)

describe('P8 enabled and disabled', () => {
  let host
  let fb
  const state = (key) => host.call('sourceState', { key })
  const toggle = (plugin, on) => host.post(API.plugins, { plugin, on })
  const itemsOf = async (identity) => (await intakeNow(host)).items.filter((i) => i.sourceIdentity === identity)
  /** Disabled publish: status disabled, intakeId null, nothing stored for the identity, nothing delivered. */
  const assertDisabled = async (key, identity) => {
    const before = (await itemsOf(identity)).length
    const ev = event()
    const r = await publish(host, key, ev)
    assert.equal(r.ok, true, JSON.stringify(r.error))
    assert.deepEqual(r.value, { intakeId: null, status: PUBLISH_STATUS.disabled })
    await sleep(1000)
    assert.equal((await itemsOf(identity)).length, before, 'nothing stored')
    if (fb && (await host.call('agentStatus', { sessionId: fb })) !== null) assert.equal((await pluginNotices(host, fb, ev.body)).length, 0, 'nothing delivered')
    return ev
  }
  const waitEnabled = (key, want, ms = 8000) => until(async () => (await state(key))?.enabled === want, ms, 50)

  before(async () => {
    host = await bootHost(newHome('src-enabled'), { env: SOURCES_ENV })
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'precondition: live')
    fb = st.sessionId
    // Plugin statuses: fbtest-source is enabled in the profile but starts off in Fishball on a new install;
    // ENA-01..07 start from it being on, so the user turns it on first.
    assert.equal((await toggle(A.name, true)).status, 200, 'precondition: fbtest-source on for Fishball')
    await settle(host)
    await settledIdle(host, fb)
    await host.call('settingsUpdate', { patch: { wakeupsPerHour: 0 } })
    for (const [label, id, key] of [[LA, 'ena-a', 'a'], [LB, 'ena-b', 'b'], [SOURCE_ROW.label, 'ena-row', 'row']]) assert.equal((await register(host, label, { id, title: 'Enabled ' + key }, key)).ok, true)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('ENA-01 live with the plugin on: enabled', T, async () => {
    assert.equal((await state('a')).enabled, true)
    assert.equal((await sourceIn(host, IDENT('ena-a')))?.enabled, true)
  })

  let refused
  it('ENA-02 the user turns the plugin off for Fishball: disabled, publish answers disabled, nothing stored', T, async () => {
    const res = await toggle(A.name, false)
    assert.equal(res.status, 200, res.text)
    assert.ok(await waitEnabled('a', false), 'enabled became false')
    assert.equal((await state('b')).enabled, false, 'the bundle\'s other row too')
    refused = await assertDisabled('a', IDENT('ena-a'))
    assert.ok(await until(async () => (await sourceIn(host, IDENT('ena-a')))?.enabled === false, 3000, 50), 'state lists it disabled')
    assert.equal((await state('row')).enabled, true, 'a host row no plugin owns stays enabled')
    const rows = await host.call('sourceRow', { label: LA })
    assert.equal(rows.captured, true, 'a profile-wide plugin keeps running')
    assert.equal(rows.events.includes('dispose'), false)
  })

  it('ENA-03 a source registered while the plugin is off starts disabled', T, async () => {
    const r = await register(host, LA, { id: 'ena-late', title: 'Late' }, 'late')
    assert.equal(r.ok, true)
    assert.equal(r.enabled, false)
  })

  it('ENA-04 the user turns it on: enabled again, onEnabled once per source, and the refused key is accepted', T, async () => {
    const before = { a: (await state('a')).enabledCalls, b: (await state('b')).enabledCalls, late: (await state('late')).enabledCalls, row: (await state('row')).enabledCalls }
    assert.equal((await toggle(A.name, true)).status, 200)
    assert.ok(await waitEnabled('a', true), 'enabled again')
    await sleep(500)
    for (const k of ['a', 'b', 'late']) assert.equal((await state(k)).enabledCalls, before[k] + 1, k + ' onEnabled once')
    assert.equal((await state('row')).enabledCalls, before.row, 'a source that never became disabled is not called')
    const r = await publish(host, 'a', refused)
    assert.equal(r.value?.status, PUBLISH_STATUS.accepted, 'a disabled publish stored nothing')
    assert.ok(await untilSeen(host, fb, refused.body))
  })

  it('ENA-05 Fishball turns the plugin off and on with set_plugin_enabled', LONG, async () => {
    const calls = (await state('a')).enabledCalls
    await settledIdle(host, fb)
    const off = await scriptedTurn(host, fb, callScript('set_plugin_enabled', { plugin: A.name, on: false }))
    assert.equal(off.results.length, 1)
    assert.ok(await waitEnabled('a', false), 'disabled once Fishball\'s turn ended')
    await assertDisabled('a', IDENT('ena-a'))
    await settledIdle(host, fb)
    const on = await scriptedTurn(host, fb, callScript('set_plugin_enabled', { plugin: A.name, on: true }))
    assert.equal(on.results.length, 1)
    assert.ok(await waitEnabled('a', true), 'enabled again')
    await sleep(300)
    assert.equal((await state('a')).enabledCalls, calls + 1)
  })

  it('ENA-06 the function onEnabled returns removes the listener', T, async () => {
    assert.equal(await host.call('sourceOffEnabled', { key: 'b' }), true)
    const calls = (await state('b')).enabledCalls
    await toggle(A.name, false)
    assert.ok(await waitEnabled('b', false))
    await toggle(A.name, true)
    assert.ok(await waitEnabled('b', true))
    await sleep(500)
    assert.equal((await state('b')).enabledCalls, calls)
  })

  it('ENA-07 archived: every source disabled; live again: enabled and onEnabled called', LONG, async () => {
    await settledIdle(host, fb)
    const calls = { a: (await state('a')).enabledCalls, row: (await state('row')).enabledCalls }
    assert.equal((await host.call('archive', { sessionId: fb, stopActivity: true })).ok, true)
    assert.equal((await host.waitStatus(STATUS.archived))?.status, STATUS.archived)
    for (const k of ['a', 'row']) assert.ok(await waitEnabled(k, false), k + ' disabled while archived')
    await assertDisabled('row', null)
    const listed = (await sourcesNow(host))?.sources ?? []
    assert.ok(listed.length > 0)
    for (const s of listed) assert.equal(s.enabled, false, 'listed disabled: ' + JSON.stringify(s))
    await host.call('unarchive', { sessionId: fb })
    assert.equal((await host.post(API.recovery, { action: 'retry' })).status, 200)
    assert.equal((await host.waitStatus(STATUS.live))?.status, STATUS.live)
    for (const k of ['a', 'row']) assert.ok(await waitEnabled(k, true), k + ' enabled when live')
    await sleep(300)
    assert.equal((await state('a')).enabledCalls, calls.a + 1)
    assert.equal((await state('row')).enabledCalls, calls.row + 1)
    const ev = event()
    assert.equal((await publish(host, 'row', ev)).value?.status, PUBLISH_STATUS.accepted)
    assert.ok(await untilSeen(host, fb, ev.body))
  })

  it('ENA-09 an onEnabled listener that throws or rejects is never fatal', T, async () => {
    assert.equal((await register(host, LA, { id: 'ena-bad', title: 'Bad listeners' }, 'bad')).ok, true)
    assert.equal((await register(host, LA, { id: 'ena-bad2', title: 'Bad listeners 2' }, 'bad2')).ok, true)
    await host.call('sourceBadListener', { key: 'bad', mode: 'throw' })
    await host.call('sourceBadListener', { key: 'bad2', mode: 'reject' })
    const good = (await state('a')).enabledCalls
    await toggle(A.name, false)
    assert.ok(await waitEnabled('bad', false))
    await toggle(A.name, true)
    assert.ok(await waitEnabled('bad', true))
    await sleep(500)
    assert.equal(await host.call('sourceBadCalls', { key: 'bad' }), 1, 'the throwing listener ran')
    assert.equal(await host.call('sourceBadCalls', { key: 'bad2' }), 1, 'the rejecting listener ran')
    assert.equal((await state('bad')).enabledCalls, 1, 'a listener added before it on the same source still ran')
    assert.equal((await state('a')).enabledCalls, good + 1, 'other sources\' listeners ran')
    assert.equal(host.exited, null, 'DSH keeps running')
    assert.equal((await host.state()).status, STATUS.live)
    const ev = event()
    assert.equal((await publish(host, 'bad', ev)).value?.status, PUBLISH_STATUS.accepted)
  })

  describe('a Fishball-only source plugin', () => {
    let first
    it('ONL-01 while off for Fishball its row never runs and it has no source', T, async () => {
      const row = await host.call('sourceRow', { label: LO })
      assert.equal(row.captured, false)
      assert.deepEqual(row.events, [])
      assert.equal(((await sourcesNow(host))?.sources ?? []).some((s) => s.identity.startsWith(O.name + '/')), false)
    })

    it('ONL-02 turned on: its row runs, its source is named after the bundle and its private row, and an event arrives', T, async (t) => {
      const res = await toggle(O.name, true)
      assert.equal(res.status, 200, res.text)
      assert.ok(await until(async () => (await host.call('sourceRow', { label: LO })).captured, 10000, 100), 'its row got the service')
      const r = await register(host, LO, { id: 'only-src', title: 'Only' }, 'only1')
      assert.equal(r.ok, true, JSON.stringify(r.error))
      assert.equal(r.enabled, true)
      const listed = ((await sourcesNow(host))?.sources ?? []).find((s) => s.identity.startsWith(O.name + '/'))
      t.diagnostic('identity: ' + listed?.identity)
      assert.equal(listed?.plugin, O.name)
      assert.ok(listed.identity.endsWith('/only-src'))
      // The author guide: the identity is the same whether the plugin runs for everyone or Fishball only, so the entry id is the bundle's own row id (A89).
      assert.equal(listed.identity, SOURCE_IDENTITY(O.name, O.rows.a.id, 'only-src'))
      first = event()
      const p = await publish(host, 'only1', first)
      assert.equal(p.value?.status, PUBLISH_STATUS.accepted)
      assert.ok(await untilSeen(host, fb, first.body))
      const item = (await intakeNow(host)).items.find((i) => i.intakeId === p.value.intakeId)
      assert.equal(item?.kind, PLUGIN_INTAKE_KIND)
      assert.equal(item?.sourceIdentity, listed.identity)
    })

    it('ONL-03 turned off: its row unmounts, its source is removed and publish rejects FISHBALL_SOURCE_DISPOSED', T, async () => {
      assert.equal((await toggle(O.name, false)).status, 200)
      assert.ok(await until(async () => (await host.call('sourceRow', { label: LO })).events.includes('dispose'), 10000, 100), 'its row was disposed')
      assert.equal((await host.call('sourceRow', { label: LO })).captured, false)
      assert.ok(await until(async () => !((await sourcesNow(host))?.sources ?? []).some((s) => s.identity.startsWith(O.name + '/')), 3000, 50), 'source removed from the state')
      const r = await publish(host, 'only1', event())
      assert.equal(r.ok, false)
      assert.equal(r.error?.code, SOURCE_ERR.disposed)
      assert.equal((await state('only1')).enabled, false)
    })

    it('ONL-03b registerSource after the row unloaded (kept service object) is refused FISHBALL_UNKNOWN_PLUGIN', T, async () => {
      const r = await host.call('sourceRegisterStale', { label: LO, def: { id: 'stale', title: 'Stale' } })
      assert.notEqual(r.error?.code, 'FBTEST_NO_CONTEXT', 'precondition: the row released its context')
      assert.equal(r.ok, false)
      assert.equal(r.error?.code, 'FISHBALL_UNKNOWN_PLUGIN', JSON.stringify(r.error))
      assert.equal(((await sourcesNow(host))?.sources ?? []).some((x) => x.identity.endsWith('/stale')), false)
    })

    it('ONL-04 turned on again: the same id registers again, and the earlier key is duplicate', T, async () => {
      assert.equal((await toggle(O.name, true)).status, 200)
      assert.ok(await until(async () => (await host.call('sourceRow', { label: LO })).captured, 10000, 100))
      const r = await register(host, LO, { id: 'only-src', title: 'Only' }, 'only2')
      assert.equal(r.ok, true, JSON.stringify(r.error))
      const again = await publish(host, 'only2', first)
      assert.equal(again.value?.status, PUBLISH_STATUS.duplicate, JSON.stringify(again))
    })
  })
})

describe('P8 sources before Fishball is live', () => {
  let host
  before(async () => {
    host = await bootHost(newHome('src-starting'), { env: { ...SOURCES_ENV, FBTEST_FIRST_REQUEST_DELAY_MS: '6000' } })
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('ENA-08 while the setup turn runs (starting, not live): disabled; live but off for Fishball: disabled; turned on: enabled with onEnabled once', T, async (t) => {
    await until(() => host.call('sourceRow', { label: LA }).then((r) => r.captured), 10000, 50)
    const r = await register(host, LA, { id: 'early', title: 'Early' }, 'early')
    assert.equal(r.ok, true, JSON.stringify(r.error))
    const st = await host.state()
    const p = await publish(host, 'early', event())
    const after = await host.state()
    t.diagnostic('status ' + st?.status + '→' + after?.status + '; enabled ' + r.enabled + '; publish ' + JSON.stringify(p.value ?? p.error))
    assert.equal(st?.status, STATUS.starting, 'precondition: the setup turn is still held')
    assert.equal(after?.status, STATUS.starting, 'precondition: still starting after the publish')
    assert.equal(r.enabled, false)
    assert.deepEqual(p.value, { intakeId: null, status: PUBLISH_STATUS.disabled })
    await host.waitStatus(STATUS.live, 20000)
    await sleep(1500)
    assert.equal((await host.call('sourceState', { key: 'early' })).enabled, false, 'live, but the plugin starts off in Fishball')
    assert.equal((await host.post(API.plugins, { plugin: A.name, on: true })).status, 200)
    assert.ok(await until(async () => (await host.call('sourceState', { key: 'early' })).enabled, 5000, 50), 'enabled once on for Fishball')
    await sleep(300)
    assert.equal((await host.call('sourceState', { key: 'early' })).enabledCalls, 1, 'onEnabled once')
  })
})

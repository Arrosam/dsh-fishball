/**
 * P5 M12: the Fishball notice about unchecked tools of plugins already on.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | UNC-01 | ST (first start → live) | exactly one notice (fishball-notice/notice) listing every unchecked fbtest-tools tool with its plugin and naming set_plugin_enabled; never a hidden name; intake item fishball/unchecked-tools, kind system, consumed; Fishball read it |
 * | UNC-02 | ST (restart, same tools) | no second notice |
 * | UNC-03 | ST (changed parameter schema at runtime) | one new notice naming the changed tool |
 * | UNC-04 | ST (the same changed schema registered again) | no further notice (same tool version) |
 * | UNC-05 | ST (a profile bundle installed and enabled while DSH runs) | one new notice naming its tool and plugin |
 * | UNC-06 | ST (restart after the changes) | no notice repeats |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ADDED_BUNDLE_C, FIXTURE_BUNDLE, FIXTURE_HIDDEN, FIXTURE_UNCHECKED, IDENTITY, NOTICE, STATUS } from './support/constants.mjs'
import { GENERIC_PARAMETERS } from './support/fixture-tools.mjs'
import { HOOK, T, intakeNow, settledIdle, turn } from './support/expect.mjs'
import { bootHost, bootLive, newHome, sleep, until } from './support/host.mjs'

const LONG = { timeout: 150000 }
const isUnchecked = (e) => e.type === 'user/message' && e.source?.kind === NOTICE.kind && e.source?.summary !== 'Fishball is set up'

describe('P5 unchecked-tools notice', () => {
  let host
  let home
  let fb
  const notices = async () => ((await host.call('inspect', { sessionId: fb, events: true })).events ?? []).filter(isUnchecked)
  const reboot = async () => { await host.stop(); host = await bootHost(home); return host.waitStatus(STATUS.live) }

  before(async () => {
    home = newHome('unchecked')
    ;({ host } = await bootLive(home))
    fb = (await host.state()).sessionId
    await sleep(1500)
    await settledIdle(host, fb)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('UNC-01 going live gives one notice listing every unchecked tool and its plugin', T, async () => {
    const got = await notices()
    assert.equal(got.length, 1, JSON.stringify(got.map((n) => n.source)))
    assert.equal(got[0].source.form, NOTICE.form)
    const text = got[0].text
    for (const n of FIXTURE_UNCHECKED) {
      const line = text.split('\n').find((l) => new RegExp('\\b' + n + '\\b').test(l))
      assert.ok(line, 'lists ' + n)
      assert.ok(line.includes(FIXTURE_BUNDLE.name), n + ' with its plugin: ' + line)
    }
    for (const n of FIXTURE_HIDDEN) assert.equal(new RegExp('^- ' + n + '\\b', 'm').test(text), false, 'hidden ' + n + ' is not offered')
    assert.ok(text.includes('set_plugin_enabled'))
    const item = (await intakeNow(host)).items.find((i) => i.sourceIdentity === IDENTITY.unchecked)
    assert.equal(item?.kind, 'system')
    assert.equal(item?.status, 'consumed')
    const read = (await host.call('requests', { sessionId: fb })).some((r) => r.texts.includes(FIXTURE_UNCHECKED[0]) && r.texts.includes('set_plugin_enabled'))
    assert.ok(read, 'Fishball read the notice')
  })

  it('UNC-02 a restart with the same tools gives no second notice', LONG, async () => {
    assert.equal((await reboot())?.status, STATUS.live)
    await sleep(2000)
    assert.equal((await notices()).length, 1)
  })

  const CHANGED = 'demo_echo'
  const changedSchema = { ...GENERIC_PARAMETERS, properties: { ...GENERIC_PARAMETERS.properties, fbtest_extra: { type: 'string' } } }
  it('UNC-03 a changed parameter schema gives a new notice naming that tool', T, async () => {
    await host.call('reregisterFixture', { name: CHANGED, parameters: changedSchema })
    assert.ok(await until(async () => (await notices()).length === 2, 15000, 200), 'a second notice')
    assert.match((await notices())[1].text, new RegExp('\\b' + CHANGED + '\\b'))
    await settledIdle(host, fb)
  })

  it('UNC-04 registering the same changed schema again gives no further notice', T, async () => {
    await host.call('reregisterFixture', { name: CHANGED, parameters: changedSchema })
    await sleep(4000)
    assert.equal((await notices()).length, 2)
  })

  it('UNC-05 a profile plugin installed while DSH runs gives a notice naming its tool', LONG, async () => {
    const r = await host.call('installBundle', { spec: ADDED_BUNDLE_C.dir, enabled: true }, 120000)
    assert.equal(r.error, null, JSON.stringify(r))
    const named = async () => (await notices()).some((n) => n.text.includes(ADDED_BUNDLE_C.tool))
    if (!(await until(named, 30000, 250))) {
      // Diagnose: does a Fishball turn (which refreshes its catalog, A34) produce the notice?
      await turn(host, fb, [[{ text: 'ok' }]], 'any news?')
      await sleep(3000)
      await settledIdle(host, fb)
      assert.fail('no notice named ' + ADDED_BUNDLE_C.tool + ' within 30 s of the install; after one Fishball turn: ' + ((await named()) ? 'it appeared' : 'still none'))
    }
    const n = (await notices()).find((x) => x.text.includes(ADDED_BUNDLE_C.tool))
    assert.ok(n.text.split('\n').some((l) => l.includes(ADDED_BUNDLE_C.tool) && l.includes(ADDED_BUNDLE_C.name)), 'with its plugin')
    await settledIdle(host, fb)
  })

  it('UNC-06 a restart after the changes repeats no notice', LONG, async () => {
    const before = await notices()
    assert.equal((await reboot())?.status, STATUS.live)
    await sleep(2500)
    await settledIdle(host, fb)
    const now = await notices()
    // The fixture's boot registration restores demo_echo's original schema, a version already announced,
    // so only a first notice for fbtest-added-c may appear (when UNC-05 found none while running).
    const fresh = now.slice(before.length)
    const addedBefore = before.some((n) => n.text.includes(ADDED_BUNDLE_C.tool))
    for (const n of fresh) assert.ok(!addedBefore && n.text.includes(ADDED_BUNDLE_C.tool) && !FIXTURE_UNCHECKED.some((x) => new RegExp('^- ' + x + '\\b', 'm').test(n.text)), 'a repeated notice: ' + n.text.slice(0, 300))
    assert.ok(now.filter((n) => n.text.includes(ADDED_BUNDLE_C.tool)).length <= 1, 'fbtest-added-c announced at most once')
  })
})

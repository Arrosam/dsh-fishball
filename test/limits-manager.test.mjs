/**
 * Revision 11 rev11-limits: the plugin-manager fields (DESIGN §16 "Today's constants":
 * pluginHistoryShown 10, settingsPromptValueBytes 200). One host with the settings fixtures
 * (MANAGER_ENV); cases run in order, each going default -> changed -> default without a restart.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | L60    | ST (pluginHistoryShown 10 -> 3 -> 1 -> 10) | after 4 changes the plugin page's history shows 4, then the newest 3, then the newest 1, then 4 |
 * | L61    | ST (settingsPromptValueBytes 200 -> 50 -> 200) | set_plugin_settings' prompt shows a 152-byte new value whole by default, cut to <= 50 bytes (a prefix) at 50, whole again after |
 * | L62    | ST (no restart) | Fishball is the same agent, never disposed, status live |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, LIMITS_R11, MANAGER_BUNDLES, MANAGER_ENV, OUTCOME, SETTINGS_FIXTURE, SETTINGS_TOOLS, STATUS } from './support/constants.mjs'
import { HOOK, T, auditRows, bytes, detailOf, fishballTool, pluginIn, promptLine, settle, settledIdle, untilCatalog } from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const SET = MANAGER_BUNDLES.settings
const DSH = MANAGER_BUNDLES.dsh
const D = Object.fromEntries(Object.entries(LIMITS_R11).map(([k, v]) => [k, v.default]))
const LONG = { timeout: 120000 }

describe('rev11-limits: plugin-manager fields', () => {
  let host
  let home
  let fb
  let agentTag

  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, 'update refused: ' + JSON.stringify(r.error)) }

  before(async () => {
    home = newHome('limits-manager')
    const booted = await bootLive(home, { env: MANAGER_ENV })
    host = booted.host
    fb = booted.state?.sessionId
    agentTag = fb ? (await host.call('inspect', { sessionId: fb })).agentTag : null
    await settle(host)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('L60 pluginHistoryShown: 4 changes show 4, then the newest 3, then the newest 1, then 4 again', LONG, async () => {
    const history = async () => (await detailOf(host, DSH.name)).history
    const made = []
    for (let i = 0; i < 4; i++) {
      const on = i % 2 === 0
      const before = auditRows(home).length
      const r = await host.post(API.plugins, { plugin: DSH.name, on })
      assert.equal(r.status, 200, r.text)
      made.push(on ? 'on' : 'off')
      await until(() => auditRows(home).length > before, 5000, 50)
      await settle(host)
    }
    const newest = made.slice().reverse()
    assert.deepEqual((await history()).map((e) => e.action), newest, 'default: all 4, newest first')
    await setLimit({ pluginHistoryShown: 3 })
    assert.deepEqual((await history()).map((e) => e.action), newest.slice(0, 3))
    await setLimit({ pluginHistoryShown: 1 })
    assert.deepEqual((await history()).map((e) => e.action), newest.slice(0, 1))
    await setLimit({ pluginHistoryShown: D.pluginHistoryShown })
    assert.deepEqual((await history()).map((e) => e.action), newest)
  })

  it('L61 settingsPromptValueBytes: a 152-byte value is whole by default, cut to 50 bytes at 50, whole after', LONG, async () => {
    assert.equal((await host.post(API.plugins, { plugin: SET.name, on: true })).status, 200, 'precondition: fbtest-settings on')
    assert.ok(await untilCatalog(host, (c) => pluginIn(c, SET.name)?.applied === true, 10000), 'precondition: mounted')
    await settledIdle(host, fb)
    const greeting = 'g'.repeat(150)
    const prompt = async () => {
      const r = await fishballTool(host, fb, SETTINGS_TOOLS.set, { plugin: SET.name, row: SET.rows.main, values: { greeting }, reason: 'fbtest limits' }, OUTCOME.reject)
      assert.equal(r.approvals.length, 1, 'one prompt: ' + r.result?.text?.slice(0, 300))
      const line = promptLine(r.approvals[0].reason, 'greeting')
      assert.ok(line, 'the greeting line:\n' + r.approvals[0].reason)
      assert.equal(line.old, JSON.stringify(SETTINGS_FIXTURE.base.greeting))
      return line.new
    }
    assert.equal(await prompt(), JSON.stringify(greeting), 'default: shown whole')
    await setLimit({ settingsPromptValueBytes: 50 })
    const cut = await prompt()
    assert.ok(bytes(cut) <= 50, 'cut to ' + bytes(cut) + ' bytes')
    assert.ok(cut.startsWith('"ggg'), 'a prefix of the value: ' + cut)
    await setLimit({ settingsPromptValueBytes: D.settingsPromptValueBytes })
    assert.equal(await prompt(), JSON.stringify(greeting), 'whole again')
  })

  it('L62 none of the changes restarted Fishball', T, async () => {
    const now = await host.call('inspect', { sessionId: fb })
    assert.equal(now.agentTag, agentTag, 'same agent object')
    assert.equal((await host.call('lifecycle')).filter((e) => e.id === fb && e.type === 'disposed').length, 0, 'not disposed')
    assert.equal((await host.state()).status, STATUS.live)
  })
})

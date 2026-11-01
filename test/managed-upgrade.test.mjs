/**
 * Revision 11 rev11a on an EXISTING install (Q-r11-upgrade, DESIGN §5e "Existing sessions at the first start"):
 * a home first booted with the version before rev11a (PRE_REV11A, extracted under .runtime with git archive, as
 * own-plugins-upgrade does), where Fishball messaged one session, started another (both in the outbox) and a
 * third session called the then-global message_fishball; then booted with this version.
 * Host boots with FBTEST_APPROVER_AFTER=1 both times.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | UPM-00 | precondition | the old version has outbox entries for the messaged and the started session, and no managed field |
 * | UPM-01 | ST (first start of rev11a) | snapshot managed is [] |
 * | UPM-02 | EP (outbox sessions and an old message_fishball caller) | each resumed session's next request lacks message_fishball |
 * | UPM-03 | EP | an outbox session's permission request reaches its own stock prompt at once, with zero Fishball steps |
 * | UPM-04 | ST (yours –Hand over→ managed, after the upgrade) | 200; entry by hand-over; the tool is there at the next request |
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { APPROVER_AFTER_ENV, ASK_REASON, ASK_TOOL, INBOUND_TOOL, MANAGED_BY, OUTCOME, PRE_REV11A, PRESET, REPO, STATUS, TEST_HOMES } from './support/constants.mjs'
import { HOOK, T, askSettled, callScript, fishballCall, managedEntry, managedNow, requestMessages, setManaged, settledIdle, startAsk, toolNames, turn } from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

const LONG = { timeout: 150000 }
const hasInbound = (req) => toolNames(req).includes(INBOUND_TOOL)

describe('Revision 11 rev11a on an existing install', () => {
  let host
  let home
  let fb
  let oldDir
  let oldState
  const sessions = {}

  const boot = async (env = {}) => {
    host = await bootHost(home, { env: { ...APPROVER_AFTER_ENV, ...env } })
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'live: ' + JSON.stringify(st?.status))
    fb = st.sessionId
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
  }
  const nextRequest = async (sid) => (await turn(host, sid, [[{ text: 'next' }]])).requests.at(-1)

  before(async () => {
    oldDir = path.join(path.dirname(TEST_HOMES), 'fbtest-prerev11a-' + process.pid)
    fs.rmSync(oldDir, { recursive: true, force: true })
    fs.mkdirSync(oldDir, { recursive: true })
    const tar = oldDir + '.tar'
    execFileSync('git', ['-C', REPO, 'archive', '--output', tar, PRE_REV11A.commit])
    execFileSync('tar', ['-x', '-f', tar, '-C', oldDir])
    fs.rmSync(tar, { force: true })
    home = newHome('managed-upgrade')
    await boot({ FBTEST_PLUGIN_DIR: oldDir })
    // Fishball messages one session and starts another; a third session calls the old global message_fishball.
    sessions.messaged = (await host.call('ordinary', { preset: PRESET.bare, folder: 'upm-messaged' })).sessionId
    await turn(host, sessions.messaged, [[{ text: 'hello' }]])
    assert.equal((await fishballCall(host, fb, 'message_session', { session_id: sessions.messaged, message: 'fbtest old message' })).json?.ok, true)
    await settledIdle(host, sessions.messaged)
    const folder = path.join(home, 'work', 'upm-started')
    fs.mkdirSync(folder, { recursive: true })
    // The previous version's start_session (PRE_REV11A) has no title argument: this call is made to that version, so it passes none.
    const started = await fishballCall(host, fb, 'start_session', { folder, message: 'fbtest old start' })
    assert.equal(started.json?.ok, true, started.result.text)
    sessions.started = started.json.sessionId
    await settledIdle(host, sessions.started)
    sessions.caller = (await host.call('ordinary', { preset: PRESET.bare, folder: 'upm-caller' })).sessionId
    await turn(host, sessions.caller, callScript(INBOUND_TOOL, { message: 'fbtest old inbound' }))
    await settledIdle(host, fb)
    oldState = await host.state()
    for (const sid of Object.values(sessions)) await host.call('flush', { sessionId: sid })
    await host.stop()
    await boot()
  }, { timeout: 240000 })
  after(async () => {
    await host?.stop()
    if (oldDir && path.basename(path.dirname(oldDir)) === '.runtime') fs.rmSync(oldDir, { recursive: true, force: true })
  }, HOOK)

  it('UPM-00 precondition: the old version has outbox entries and no managed field', T, () => {
    const targets = (oldState.outbox?.entries ?? []).map((e) => e.targetSessionId)
    assert.ok(targets.includes(sessions.messaged), 'messaged session in the outbox')
    assert.ok(targets.includes(sessions.started), 'started session in the outbox')
    assert.equal(Object.hasOwn(oldState, 'managed'), false)
  })

  it('UPM-01 no session is managed at the first start of rev11a', T, async () => {
    assert.deepEqual(await managedNow(host), [])
  })

  it('UPM-02 outbox sessions and the old caller stay yours: no message_fishball', LONG, async () => {
    for (const [label, sid] of Object.entries(sessions)) {
      const r = await host.call('resume', { sessionId: sid })
      assert.equal(r.live, true, label + ': ' + JSON.stringify(r))
      assert.equal(hasInbound(await nextRequest(sid)), false, label + ' lists ' + INBOUND_TOOL)
      assert.equal(await managedEntry(host, sid), undefined, label + ' is managed')
    }
  })

  it('UPM-03 an outbox session\'s permission request reaches its own stock prompt', T, async () => {
    const sid = sessions.messaged
    await settledIdle(host, sid)
    const text = 'UPM03x' + Math.random().toString(36).slice(2, 8)
    const fbBefore = (await host.call('requests', { sessionId: fb })).length
    await startAsk(host, sid, ASK_TOOL, { text })
    const done = await askSettled(host, text, 5000)
    assert.equal(done?.outcome, OUTCOME.reject)
    const seen = (await host.call('approvals', {})).filter((a) => a.reason === ASK_REASON(text))
    assert.equal(seen.length, 1)
    assert.ok(seen[0].at - done.askedAt < 1000, 'at once')
    await sleep(1200)
    assert.deepEqual(await requestMessages(host, fb, text), [])
    assert.equal((await host.call('requests', { sessionId: fb })).length, fbBefore, 'zero Fishball model steps')
  })

  it('UPM-04 Hand over works after the upgrade', T, async () => {
    const sid = sessions.started
    await settledIdle(host, sid)
    const r = await setManaged(host, sid, true)
    assert.equal(r.status, 200, r.text)
    await until(async () => (await managedEntry(host, sid)) !== undefined, 3000, 100)
    assert.equal((await managedEntry(host, sid))?.by, MANAGED_BY.handOver)
    await settledIdle(host, fb)
    assert.ok(hasInbound(await nextRequest(sid)))
  })
})

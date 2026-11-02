/**
 * R-SINGLETON (first start, restarts, archive guard) and the package/bundle shape.
 *
 * | id     | technique              | requirement                                             | expected |
 * |--------|------------------------|---------------------------------------------------------|----------|
 * | PKG-01 | EP                     | repo is an ESM npm package named dsh-fishball           | package.json name/type |
 * | PKG-02 | EP                     | bundle patch inserts two host rows (P3 amendment)       | listBundles rows == [fishball-attribution/dsh-fishball/attribution, fishball/dsh-fishball]; exports './attribution' |
 * | SGL-01 | EP (first start)       | exactly one Fishball session is created                 | 1 session with agentPreset fishball:assistant; 1 session in the folder; state.sessionId matches |
 * | SGL-02 | EP (folder missing)    | cwd is <DSH_HOME>/fishball/assistant, created if missing | folder exists; header cwd and state.cwd equal it |
 * | SGL-03 | EP                     | no DSH workspace registered for the folder              | no workspace path == realpath(folder); state.workspaceId null |
 * | SGL-04 | EP                     | session pinned                                          | pinnedSessionIds includes it |
 * | SGL-05 | EP                     | header agentPreset fishball:assistant, no such preset    | header ok; agentPresets.list() lacks it |
 * | SGL-06 | EP                     | read-only + ask written into the log at creation        | sandbox/mode read-only and approval/policy ask events; resolved values match |
 * | SGL-07 | State (start->live)    | agent live right after start                            | ctx.agents.get defined; status live; error null |
 * | SGL-08 | EP                     | controller resolves the live Fishball agent             | sessionController.resolveAgent(id).agent === live agent |
 * | SGL-09 | Decision (no stopActivity) | archive guard while live                            | WorkspaceActiveSessionError, activity kind fishball; not archived; still live |
 * | SGL-10 | State (first creation) | one setup turn at first creation (P5 amended)          | one turn/start..turn/end; one user/message source fishball-notice/notice/'Fishball is set up', text says set up; model requests = 1 + other Fishball notices (P5: the unchecked-tools notice of the fixture tools wakes one more request), at most 1 such notice |
 * | SGL-11 | State (restart)        | restart resumes the same session, no setup turn         | same id; 1 sentinel session; no new setup notice and no second unchecked-tools notice (same tool version); 0 model requests |
 * | SGL-12 | BVA (N = 3 boots)      | still exactly one session across N restarts             | 1 sentinel session, same id; still pinned, read-only, ask |
 * | SGL-13 | State (starting->live), EP (folder exists) | live only after setup turn ended; existing folder reused | status != live while setup request is held; live after; cwd is the existing folder |
 * | SGL-16 | State (restart -> live -> turn) | the resumed agent is usable (inferred, CASES.md A13) | a turn after a restart makes 1 model request and ends with reason completed |
 * | SGL-14 | Decision (retry x starting), BVA (answer time ~2 s) | retry during the setup turn is a no-op and does not hang | status starting with a sessionId; POST retry answers 200 {ok:true} with that sessionId within 2.5 s, before the held request is released; one session; one setup request |
 * | SGL-15 | State (stored blank session -start-> live) | a resumed session that never had a turn gets the setup turn | the stored id is resumed (no new session); one setup request and one fishball-notice; live after it; pinned |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { API, ATTRIBUTION_ROW, MS, PACKAGE_NAME, REPO, ROW_ID, SENTINEL_PRESET, SETUP_SOURCE, STATUS, STORE, assistantDir } from './support/constants.mjs'
import { HOOK, T, realpath } from './support/expect.mjs'
import { bootHost, bootLive, newHome, sleep, until } from './support/host.mjs'

/**
 * P5: the fixture bundle registers unchecked profile-wide tools, so when Fishball goes live it also
 * receives one "unchecked tools" Fishball notice (once per tool version, ever), which costs one more
 * model request. Setup cases therefore count setup notices and turns, and allow exactly one model
 * request per other Fishball notice.
 */
const isNotice = (e) => e.type === 'user/message' && e.source?.kind === SETUP_SOURCE.kind
const isSetup = (e) => isNotice(e) && e.source?.summary === SETUP_SOURCE.summary
function noticeCounts(events) {
  return { setup: events.filter(isSetup).length, other: events.filter((e) => isNotice(e) && !isSetup(e)).length, turns: events.filter((e) => e.type === 'turn/start').length }
}

describe('R-SINGLETON first start', () => {
  let host
  let home
  let state
  let sid
  let first

  before(async () => {
    home = newHome('singleton')
    assert.equal(fs.existsSync(assistantDir(home)), false, 'precondition: folder missing before first start')
    ;({ host, state } = await bootLive(home))
    sid = state?.sessionId
    first = sid ? await host.call('inspect', { sessionId: sid, events: true }) : undefined
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('PKG-01 the repo is an ESM npm package named dsh-fishball', T, () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'))
    assert.equal(pkg.name, PACKAGE_NAME)
    assert.equal(pkg.type, 'module')
  })

  it('PKG-02 the bundle patch inserts the attribution row, then the fishball row (P3)', T, async () => {
    const bundles = await host.call('bundles')
    assert.equal(bundles.length, 1, 'bundle dsh-fishball listed once')
    assert.equal(bundles[0].enabled, true)
    assert.deepEqual(bundles[0].rows.map((r) => [r.rowId, r.moduleName]), [[ATTRIBUTION_ROW.id, ATTRIBUTION_ROW.module], [ROW_ID, PACKAGE_NAME]])
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'))
    assert.ok(Object.hasOwn(pkg.exports ?? {}, './attribution'), 'exports ./attribution')
  })

  it('SGL-07 Fishball is live right after start without user action', T, async () => {
    assert.equal(state?.status, STATUS.live, 'state: ' + JSON.stringify(state))
    assert.equal(state.error, null)
    assert.equal(typeof sid, 'string')
    assert.equal(first.live, true, 'ctx.agents.get(sessionId) is defined')
  })

  it('SGL-01 exactly one Fishball session exists and the state names it', T, async () => {
    const sentinel = await host.call('sentinelSessions')
    assert.deepEqual(sentinel.map((s) => s.id), [sid])
    const inDir = await host.call('sessionsInDir', { dir: assistantDir(home) })
    assert.deepEqual(inDir.map((s) => s.id), [sid], 'one session in the assistant folder')
  })

  it('SGL-02 cwd is <DSH_HOME>/fishball/assistant and the folder was created', T, () => {
    const dir = assistantDir(home)
    assert.ok(fs.statSync(dir).isDirectory())
    assert.equal(realpath(first.header.cwd), realpath(dir))
    assert.equal(realpath(state.cwd), realpath(dir))
  })

  it('SGL-03 no DSH workspace is registered for the assistant folder; workspaceId is null', T, async () => {
    const ws = await host.call('workspaces')
    const dir = realpath(assistantDir(home))
    const owning = ws.list.filter((w) => { try { return realpath(w.path) === dir } catch { return w.path === dir } })
    assert.deepEqual(owning, [])
    assert.equal(state.workspaceId, null)
  })

  it('SGL-04 the session is pinned', T, async () => {
    const ws = await host.call('workspaces')
    assert.ok(ws.pinned.includes(sid), 'pinned: ' + JSON.stringify(ws.pinned))
  })

  it('SGL-05 header agentPreset is fishball:assistant and no such preset is registered', T, async () => {
    assert.equal(first.header.agentPreset, SENTINEL_PRESET)
    const presets = await host.call('presets')
    assert.ok(presets.length > 0, 'precondition: presets are listed')
    assert.equal(presets.includes(SENTINEL_PRESET), false)
  })

  it('SGL-06 sandbox read-only and approval ask are written into the log', T, () => {
    const events = first.events
    const modes = events.filter((e) => e.type === 'sandbox/mode').map((e) => e.mode)
    const policies = events.filter((e) => e.type === 'approval/policy').map((e) => e.policy)
    assert.ok(modes.includes('read-only'), 'sandbox/mode events: ' + JSON.stringify(modes))
    assert.ok(policies.includes('ask'), 'approval/policy events: ' + JSON.stringify(policies))
    assert.equal(first.sandboxMode, 'read-only')
    assert.equal(first.approvalOverride, 'ask')
  })

  it('SGL-08 DSH session controller resolves the live Fishball agent', T, async () => {
    const now = await host.call('inspect', { sessionId: sid })
    assert.equal(now.controllerSame, true)
  })

  it('SGL-10 first creation runs exactly one setup turn with a fishball-notice message', T, async () => {
    // P5: the unchecked-tools notice may land just after live; read the log once it has settled.
    await sleep(1500)
    first = await host.call('inspect', { sessionId: sid, events: true })
    const requests = await host.call('requests', { sessionId: sid })
    const counts = noticeCounts(first.events)
    assert.ok(counts.other <= 1, 'at most one other Fishball notice (unchecked tools): ' + counts.other)
    assert.equal(requests.length, 1 + counts.other, 'model requests: one for setup, one per other notice')
    const types = first.events.map((e) => e.type)
    // The setup turn is one turn holding the setup notice; the unchecked-tools notice may join it or start one more.
    const starts = types.filter((t) => t === 'turn/start').length
    assert.ok(starts >= 1 && starts <= 1 + counts.other, 'turns: ' + starts)
    const firstEnd = types.indexOf('turn/end')
    const setupAt = first.events.findIndex(isSetup)
    assert.ok(types.indexOf('turn/start') < setupAt && setupAt < firstEnd, 'the setup notice belongs to the first turn')
    const notices = first.events.filter(isSetup)
    assert.equal(notices.length, 1)
    assert.deepEqual({ kind: notices[0].source.kind, form: notices[0].source.form, summary: notices[0].source.summary }, SETUP_SOURCE)
    assert.match(notices[0].text, /set up/i)
  })

  it('SGL-09 archiving the live session without stopActivity is refused (activity fishball)', T, async () => {
    const r = await host.call('archive', { sessionId: sid, stopActivity: false })
    assert.equal(r.ok, false, 'archive must be refused')
    assert.equal(r.activeSessionError, true, 'WorkspaceActiveSessionError: ' + JSON.stringify(r.error))
    assert.ok(r.activityKinds.includes('fishball'), 'activity kinds: ' + JSON.stringify(r.activityKinds))
    const ws = await host.call('workspaces')
    assert.equal(ws.archived.includes(sid), false)
    assert.equal((await host.call('inspect', { sessionId: sid })).live, true)
    assert.equal((await host.state()).status, STATUS.live)
  })

  describe('restarts with the same DSH_HOME', () => {
    it('SGL-11 a restart resumes the same session and runs no setup turn', T, async () => {
      await host.stop()
      host = await bootHost(home)
      const st = await host.waitStatus(STATUS.live)
      assert.equal(st?.status, STATUS.live, 'state: ' + JSON.stringify(st))
      assert.equal(st.sessionId, sid)
      await sleep(500)
      const now = await host.call('inspect', { sessionId: sid, events: true })
      assert.equal(now.live, true)
      assert.equal(noticeCounts(now.events).setup, 1, 'no second setup notice')
      assert.equal(noticeCounts(now.events).other, noticeCounts(first.events).other, 'no second unchecked-tools notice for the same tool version')
      assert.deepEqual(await host.call('requests', { sessionId: sid }), [], 'no model request at resume')
      assert.deepEqual((await host.call('sentinelSessions')).map((s) => s.id), [sid])
    })

    it('SGL-12 after N = 3 boots there is still exactly one Fishball session', T, async () => {
      await host.stop()
      host = await bootHost(home)
      const st = await host.waitStatus(STATUS.live)
      assert.equal(st?.sessionId, sid)
      assert.deepEqual((await host.call('sentinelSessions')).map((s) => s.id), [sid])
      assert.deepEqual((await host.call('sessionsInDir', { dir: assistantDir(home) })).map((s) => s.id), [sid])
      const now = await host.call('inspect', { sessionId: sid })
      assert.equal(now.sandboxMode, 'read-only')
      assert.equal(now.approvalOverride, 'ask')
      assert.ok((await host.call('workspaces')).pinned.includes(sid))
    })

    it('SGL-16 after a restart a turn reaches the model and completes', T, async () => {
      const r = await host.call('drive', { sessionId: sid, script: [[{ text: 'after restart' }]] })
      assert.equal(r.idle, true)
      assert.equal(r.requests.length, 1, 'model requests; turn ends: ' + JSON.stringify(r.turnEnds))
      assert.deepEqual(r.turnEnds.map((e) => e?.kind), ['completed'])
    })
  })
})

describe('R-SINGLETON status during the setup turn', () => {
  let host
  let home
  const HOLD_MS = 3000

  before(async () => {
    home = newHome('singleton-starting')
    // EP: the assistant folder already exists before the first start.
    fs.mkdirSync(assistantDir(home), { recursive: true })
    host = await bootHost(home, { env: { FBTEST_FIRST_REQUEST_DELAY_MS: String(HOLD_MS) } })
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('SGL-13 status is not live while the setup request is held, and live after it ends', T, async (t) => {
    // Every snapshot is paired with whether the held request was still held AFTER the snapshot was read.
    const whileHeld = []
    let st
    await until(async () => {
      st = await host.state()
      const times = await host.call('modelTimes')
      if (times.delayStartedAt !== null && times.delayReleasedAt === null) whileHeld.push(st)
      return st?.status === STATUS.live
    }, MS.live, 20)
    for (const s of whileHeld) {
      assert.notEqual(s?.status, STATUS.live, 'state while the setup request was held: ' + JSON.stringify(s))
      assert.ok(Object.values(STATUS).includes(s?.status), 'a documented status: ' + JSON.stringify(s))
    }
    if (whileHeld.length === 0) t.diagnostic('inconclusive: the HTTP API was not reachable while the setup request was held')
    assert.equal(st?.status, STATUS.live)
    const times = await host.call('modelTimes')
    assert.ok(times.delayStartedAt !== null, 'the setup turn reached the model')
    assert.ok(times.delayReleasedAt !== null, 'live was reported only after the held request was released')
    assert.equal(realpath(st.cwd), realpath(assistantDir(home)))
    assert.deepEqual((await host.call('sentinelSessions')).map((s) => s.id), [st.sessionId])
  })
})

describe('R-SINGLETON recovery retry during the setup turn', () => {
  let host
  const HOLD_MS = 5000
  const ANSWER_MS = 2500

  before(async () => {
    host = await bootHost(newHome('singleton-retry-starting'), { env: { FBTEST_FIRST_REQUEST_DELAY_MS: String(HOLD_MS) } })
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('SGL-14 retry while starting answers at once, keeps the session and adds no setup turn', T, async () => {
    assert.ok(await until(async () => (await host.call('modelTimes')).delayStartedAt, MS.live, 20), 'the setup turn reached the model')
    const during = await host.state()
    assert.equal(during?.status, STATUS.starting, 'state while the setup request is held: ' + JSON.stringify(during))
    assert.equal(typeof during.sessionId, 'string', 'the session exists while starting')
    const t0 = Date.now()
    const res = await host.post(API.recovery, { action: 'retry' })
    const elapsed = Date.now() - t0
    const times = await host.call('modelTimes')
    assert.ok(elapsed < ANSWER_MS, 'POST recovery answered in ' + elapsed + ' ms')
    assert.equal(times.delayReleasedAt, null, 'answered while the setup request was still held')
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    assert.equal(res.json?.state?.sessionId, during.sessionId)
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.sessionId, during.sessionId)
    assert.deepEqual((await host.call('sentinelSessions')).map((x) => x.id), [during.sessionId])
    const events = (await host.call('inspect', { sessionId: during.sessionId, events: true })).events
    const counts = noticeCounts(events)
    assert.equal(counts.setup, 1, 'one setup notice')
    assert.ok(counts.other <= 1, 'at most one unchecked-tools notice')
    assert.equal((await host.call('requests', { sessionId: during.sessionId })).length, 1 + counts.other, 'one setup request, plus one per other notice')
  })
})

describe('R-SINGLETON resume of a session that never had a turn', () => {
  let host
  let home
  const BLANK_ID = 'session-fbtest-blank-0001'

  before(async () => {
    home = newHome('singleton-blank')
    // Seed: with the plugin installed but off, store a blank session with Fishball's preset id in Fishball's folder,
    // then record it as Fishball's session in the plugin's store (the record DESIGN.md §9 describes).
    const seeder = await bootHost(home, { env: { FBTEST_PLUGIN: 'off' } })
    try {
      const seeded = await seeder.call('seedBlankSession', { sessionId: BLANK_ID, cwd: assistantDir(home), agentPreset: SENTINEL_PRESET })
      assert.equal(seeded.types.includes('turn/start'), false, 'precondition: the seeded session never had a turn')
    } finally {
      await seeder.stop()
    }
    fs.mkdirSync(path.dirname(STORE.file(home)), { recursive: true })
    fs.writeFileSync(STORE.file(home), JSON.stringify({ unit: { name: STORE.name, version: STORE.version }, global: { sessionId: BLANK_ID, workspaceId: null, cwd: assistantDir(home), createdAt: new Date().toISOString() }, tables: {} }, null, 2))
    host = await bootHost(home)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('SGL-15 the blank session is resumed and given the setup turn', T, async () => {
    const st = await host.waitStatus([STATUS.live, STATUS.recovery, STATUS.failed, STATUS.archived, STATUS.stopped])
    assert.equal(st?.status, STATUS.live, 'state: ' + JSON.stringify(st))
    assert.equal(st.sessionId, BLANK_ID, 'the stored session is resumed, not replaced')
    assert.deepEqual((await host.call('sentinelSessions')).map((x) => x.id), [BLANK_ID])
    // Wait out the unchecked-tools notice, which may arrive just after live.
    await sleep(1500)
    const now = await host.call('inspect', { sessionId: BLANK_ID, events: true })
    const counts = noticeCounts(now.events)
    assert.ok(counts.other <= 1, 'at most one unchecked-tools notice')
    assert.equal((await host.call('requests', { sessionId: BLANK_ID })).length, 1 + counts.other, 'one setup request plus one per other notice; turn ends: ' + JSON.stringify(now.events.filter((e) => e.type === 'turn/end').map((e) => e.reason)))
    const types = now.events.map((e) => e.type)
    assert.ok(types.includes('turn/start') && types.includes('turn/end'), 'the setup turn ended before live')
    assert.equal(now.events.filter((e) => e.type === 'turn/end')[0]?.reason?.kind, 'completed', 'the setup turn completed')
    for (const e of now.events.filter((x) => x.type === 'turn/end')) assert.equal(e.reason?.kind, 'completed')
    assert.equal(counts.setup, 1)
    assert.ok((await host.call('workspaces')).pinned.includes(BLANK_ID), 'pinned after resume')
  })
})

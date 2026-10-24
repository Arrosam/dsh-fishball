/**
 * R-SINGLETON state transitions: recovery (retry / adopt) and archive.
 *
 * States: live, recovery, archived. Events: restart, session store lost, session restored,
 * POST recovery retry, POST recovery adopt, archive with stopActivity, unarchive.
 *
 * | id     | technique                 | transition / requirement                                   | expected |
 * |--------|---------------------------|------------------------------------------------------------|----------|
 * | LIF-01 | State (live -restart, store lost-> recovery) | stored session cannot be resumed    | status recovery; error.code non-empty string; no new Fishball session; no agent |
 * | LIF-02 | State (recovery -retry, still lost-> recovery) | retry that cannot succeed          | still recovery; no session created |
 * | LIF-03 | State (recovery -retry, restored-> live) | retry resumes the stored session         | 200 {ok:true,state.status live}; same session id; agent live; error null |
 * | LIF-04 | State (recovery -adopt-> live) | adopt creates and records a new session            | 200 {ok:true,state.status live}; new id != old; exactly one Fishball session; agent live; read-only + ask; pinned |
 * | LIF-05 | State (live -restart-> live) | adopted session is the one resumed afterwards        | same id as adopted; one Fishball session |
 * | ARC-01 | State (live -archive stopActivity-> archived) | user archive stops the agent       | status archived; agent not live |
 * | ARC-02 | State (archived -restart-> archived) | archived session is not resumed on start      | status archived; agent not live; no new Fishball session |
 * | ARC-03 | State (archived -unarchive, retry-> live) | retry after unarchive resumes it         | 200 {ok:true,state.status live}; same id; agent live |
 * | PIN-01 | State (live -unpin, restart-> live) | pin removed through the registry while running | pinned again after the restart |
 * | PIN-02 | State (down -pin removed from the registry store-> live) | pin removed while DSH is down | pinned again after the start |
 * | FAIL-01..03 | EP store partitions: malformed JSON / future version / schema-invalid record | store cannot be read | status failed; error.code store-unreadable; no session created; store file byte-identical |
 * | FAIL-04 | Decision (retry x failed) | recovery retry while failed                         | 409 {ok:false,code:'unavailable'}; no session; status failed |
 * | FAIL-05 | Decision (adopt x failed) | recovery adopt while failed                         | 409 {ok:false,code:'unavailable'}; no session; status failed |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { API, CONFLICT_CODE, ERROR_CODE, SETTLED, STATUS, STORE, assistantDir } from './support/constants.mjs'
import { HOOK, T, sessionArtifacts } from './support/expect.mjs'
import { bootHost, bootLive, newHome, sleep, until } from './support/host.mjs'

/** Move a session's stored artifacts aside (or back), so the store can lose and regain it. */
function moveArtifacts(home, sessionId, direction) {
  const aside = path.join(home, 'aside')
  if (direction === 'away') {
    const moved = []
    for (const p of sessionArtifacts(home, sessionId)) {
      const rel = path.relative(home, p)
      const target = path.join(aside, rel)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.renameSync(p, target)
      moved.push(rel)
    }
    fs.writeFileSync(path.join(aside, 'moved.json'), JSON.stringify(moved))
    return moved
  }
  const moved = JSON.parse(fs.readFileSync(path.join(aside, 'moved.json'), 'utf8'))
  for (const rel of moved) fs.renameSync(path.join(aside, rel), path.join(home, rel))
  return moved
}

describe('R-SINGLETON recovery', () => {
  let host
  let home
  let sid1

  before(async () => {
    home = newHome('recovery')
    const booted = await bootLive(home)
    sid1 = booted.state?.sessionId
    await booted.host.stop()
    assert.ok(sid1, 'precondition: first start produced a session')
    assert.ok(moveArtifacts(home, sid1, 'away').length > 0, 'precondition: the session store had the session')
    host = await bootHost(home)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('LIF-01 an unresumable stored session gives status recovery and no new session', T, async () => {
    const st = await host.waitStatus(SETTLED)
    assert.equal(st?.status, STATUS.recovery, 'state: ' + JSON.stringify(st))
    assert.equal(typeof st.error?.code, 'string')
    assert.ok(st.error.code.length > 0)
    await sleep(500)
    assert.deepEqual(await host.call('sentinelSessions'), [], 'no Fishball session was created silently')
    assert.deepEqual(await host.call('sessionsInDir', { dir: st.cwd }), [])
    assert.equal((await host.call('inspect', { sessionId: sid1 })).live, false)
  })

  it('LIF-02 retry while the session is still missing stays in recovery and creates nothing', T, async () => {
    await host.post(API.recovery, { action: 'retry' })
    await sleep(500)
    const st = await host.state()
    assert.equal(st?.status, STATUS.recovery, 'state: ' + JSON.stringify(st))
    assert.deepEqual(await host.call('sentinelSessions'), [])
  })

  it('LIF-03 retry after the session is restored resumes the same session', T, async () => {
    // DSH's JSONL store looks a session up on disk at every open, so restoring the files is enough.
    moveArtifacts(home, sid1, 'back')
    const res = await host.post(API.recovery, { action: 'retry' })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'state: ' + JSON.stringify(st))
    assert.equal(st.sessionId, sid1)
    assert.equal(st.error, null)
    assert.equal((await host.call('inspect', { sessionId: sid1 })).live, true)
    assert.deepEqual((await host.call('sentinelSessions')).map((s) => s.id), [sid1])
  })

  it('LIF-04 adopt from recovery creates and records one new session', T, async () => {
    await host.stop()
    fs.rmSync(path.join(home, 'aside'), { recursive: true, force: true })
    moveArtifacts(home, sid1, 'away')
    host = await bootHost(home)
    assert.equal((await host.waitStatus(STATUS.recovery))?.status, STATUS.recovery)
    const res = await host.post(API.recovery, { action: 'adopt' })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    assert.equal(typeof res.json?.state, 'object')
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'state: ' + JSON.stringify(st))
    assert.equal(typeof st.sessionId, 'string')
    assert.notEqual(st.sessionId, sid1)
    const sentinel = await host.call('sentinelSessions')
    assert.deepEqual(sentinel.map((s) => s.id), [st.sessionId])
    const now = await host.call('inspect', { sessionId: st.sessionId })
    assert.equal(now.live, true)
    assert.equal(now.sandboxMode, 'read-only')
    assert.equal(now.approvalOverride, 'ask')
    assert.ok((await host.call('workspaces')).pinned.includes(st.sessionId))
  })

  it('LIF-05 the adopted session is the one resumed on the next start', T, async () => {
    const adopted = (await host.state()).sessionId
    await host.stop()
    host = await bootHost(home)
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.sessionId, adopted)
    assert.deepEqual((await host.call('sentinelSessions')).map((s) => s.id), [adopted])
  })
})

describe('R-SINGLETON archive', () => {
  let host
  let home
  let sid

  before(async () => {
    home = newHome('archive')
    const booted = await bootLive(home)
    host = booted.host
    sid = booted.state?.sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('ARC-01 archiving with stopActivity stops the agent and reports archived', T, async () => {
    const r = await host.call('archive', { sessionId: sid, stopActivity: true })
    assert.equal(r.ok, true, JSON.stringify(r))
    const st = await host.waitStatus(STATUS.archived)
    assert.equal(st?.status, STATUS.archived, 'state: ' + JSON.stringify(st))
    assert.ok(await until(async () => !(await host.call('inspect', { sessionId: sid })).live, 10000, 100), 'agent stopped')
  })

  it('ARC-02 a restart does not resume an archived session', T, async () => {
    await host.stop()
    host = await bootHost(home)
    const st = await host.waitStatus(SETTLED)
    assert.equal(st?.status, STATUS.archived, 'state: ' + JSON.stringify(st))
    await sleep(500)
    assert.equal((await host.call('inspect', { sessionId: sid })).live, false)
    assert.deepEqual((await host.call('sentinelSessions')).map((s) => s.id), [sid], 'no new session')
  })

  it('ARC-03 after unarchiving, retry resumes the same session', T, async () => {
    await host.call('unarchive', { sessionId: sid })
    const res = await host.post(API.recovery, { action: 'retry' })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'state: ' + JSON.stringify(st))
    assert.equal(st.sessionId, sid)
    assert.equal((await host.call('inspect', { sessionId: sid })).live, true)
  })
})

describe('R-SINGLETON pin is restored on every start', () => {
  let host
  let home
  let sid

  before(async () => {
    home = newHome('pin')
    const booted = await bootLive(home)
    host = booted.host
    sid = booted.state?.sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('PIN-01 a pin removed through the registry is restored by the next start', T, async () => {
    const pinned = await host.call('unpin', { sessionId: sid })
    assert.equal(pinned.includes(sid), false, 'precondition: unpinned')
    await host.stop()
    host = await bootHost(home)
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.sessionId, sid)
    assert.ok(await until(async () => (await host.call('workspaces')).pinned.includes(sid), 5000, 100), 'pinned again')
  })

  it('PIN-02 a pin removed from the registry store while DSH is down is restored by the next start', T, async () => {
    await host.stop()
    const file = path.join(home, 'storages', 'workspace.json')
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.ok(doc.global.pinnedSessionIds.includes(sid), 'precondition: pinned in the stored registry')
    doc.global.pinnedSessionIds = doc.global.pinnedSessionIds.filter((id) => id !== sid)
    fs.writeFileSync(file, JSON.stringify(doc, null, 2))
    host = await bootHost(home)
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.sessionId, sid)
    assert.ok(await until(async () => (await host.call('workspaces')).pinned.includes(sid), 5000, 100), 'pinned again')
  })
})

/** Store contents Fishball cannot read, by partition (written before the first start of a fresh home). */
const UNREADABLE_STORES = [
  ['FAIL-01 malformed JSON', () => '{"unit": {"name": "fishball", "version": 1}, "global": '],
  ['FAIL-02 a future store version', (home) => JSON.stringify({ unit: { name: STORE.name, version: STORE.version + 1 }, global: { sessionId: 'session-fbtest-future', workspaceId: null, cwd: assistantDir(home), createdAt: new Date(0).toISOString() }, tables: {} }, null, 2)],
  ['FAIL-03 a record that breaks the schema', () => JSON.stringify({ unit: { name: STORE.name, version: STORE.version }, global: { sessionId: 42, workspaceId: 7, cwd: false, createdAt: 'not a date' }, tables: {} }, null, 2)],
]

describe('R-SINGLETON unreadable store', () => {
  for (const [label, content] of UNREADABLE_STORES) {
    describe(label, () => {
      let host
      let home
      let written

      before(async () => {
        home = newHome('store-' + label.slice(0, 7).toLowerCase())
        written = content(home)
        fs.mkdirSync(path.dirname(STORE.file(home)), { recursive: true })
        fs.writeFileSync(STORE.file(home), written)
        host = await bootHost(home)
      }, HOOK)
      after(async () => { await host?.stop() }, HOOK)

      it(label + ': status failed with error.code store-unreadable and no session', T, async () => {
        const st = await host.waitStatus(SETTLED)
        assert.equal(st?.status, STATUS.failed, 'state: ' + JSON.stringify(st))
        assert.equal(st.error?.code, ERROR_CODE.storeUnreadable)
        await sleep(500)
        assert.deepEqual(await host.call('sentinelSessions'), [])
        assert.deepEqual(await host.call('sessionsInDir', { dir: assistantDir(home) }), [])
        assert.equal(fs.readFileSync(STORE.file(home), 'utf8'), written, 'the unreadable store is not overwritten')
      })

      for (const [id, action] of [['FAIL-04', 'retry'], ['FAIL-05', 'adopt']]) {
        it(id + ' ' + label + ': recovery ' + action + ' answers 409 unavailable and creates nothing', T, async () => {
          const res = await host.post(API.recovery, { action })
          assert.equal(res.status, 409, res.text)
          assert.deepEqual(res.json, { ok: false, code: CONFLICT_CODE.unavailable })
          await sleep(300)
          assert.deepEqual(await host.call('sentinelSessions'), [])
          assert.equal((await host.state())?.status, STATUS.failed)
          assert.equal(fs.readFileSync(STORE.file(home), 'utf8'), written)
        })
      }
    })
  }
})

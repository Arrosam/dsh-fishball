/**
 * R-HTTP: /api/fishball/state, /api/fishball/events and POST /api/fishball/recovery.
 *
 * | id     | technique          | requirement                                          | expected |
 * |--------|--------------------|------------------------------------------------------|----------|
 * | HTP-01 | EP                 | GET state returns the JSON snapshot                  | 200 application/json; exactly the 11 documented keys (P3 catalog, P4 contextWindow, P5 intake and outbox) with the documented types |
 * | HTP-02 | EP                 | hiddenTools is the documented list (19 names with message_fishball), sorted | deepEqual(the 19 names, in this literal sorted order) |
 * | HTP-03 | EP (no cookie)     | routes sit behind DSH browser auth                   | GET state without cookie is not 200 |
 * | HTP-04 | EP                 | events is an SSE stream; first frame immediately      | 200 text/event-stream; a frame within 3 s equal to GET state |
 * | HTP-05 | State (change)     | a new frame follows each change                       | after a limit update, a frame with the new limit arrives |
 * | HTP-06 | Decision table     | recovery body validation                              | see rows below: 400 {ok:false,code:'bad-body'} |
 * |        |   - not JSON       |                                                      | 400 bad-body |
 * |        |   - JSON array     |                                                      | 400 bad-body |
 * |        |   - {} (no action) |                                                      | 400 bad-body |
 * |        |   - action unknown ("restart") |                                          | 400 bad-body |
 * |        |   - action wrong case ("ADOPT") |                                         | 400 bad-body |
 * |        |   - action not a string (1)    |                                          | 400 bad-body |
 * | HTP-07 | Decision (adopt, live) | adopt while live                                  | 409 {ok:false,code:'not-in-recovery'}; same session; one Fishball session |
 * | HTP-08 | Decision (retry, live) | retry while live is a valid request               | 200 {ok:true,state}; status live; same session |
 * | HTP-09 | EP (no cookie)     | POST recovery requires auth                           | not 200; nothing changes |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, CATALOG_KEYS, CONFLICT_CODE, LIMITS, LIMITS_R11, LIMITS_R11B, LIMITS_R11C, MS, PREFERENCES, STATE_HIDDEN_TOOLS, STATE_KEYS, STATE_KEYS_OPTIONAL, STATUS } from './support/constants.mjs'
import { HOOK, T } from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

// P3 adds 'catalog', P4 'contextWindow', P5 'intake' and 'outbox' (STATE_KEYS; see messaging.test.mjs for their content).

describe('R-HTTP', () => {
  let host
  let sid

  before(async () => {
    const booted = await bootLive(newHome('http'))
    host = booted.host
    sid = booted.state?.sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('HTP-01 GET state returns the documented JSON snapshot', T, async () => {
    const res = await host.get(API.state)
    assert.equal(res.status, 200)
    assert.match(res.contentType, /^application\/json/)
    const s = res.json
    assert.deepEqual(Object.keys(s).filter((k) => !STATE_KEYS_OPTIONAL.includes(k)).sort(), STATE_KEYS)
    assert.ok(Object.values(STATUS).includes(s.status))
    assert.equal(s.status, STATUS.live)
    assert.equal(typeof s.sessionId, 'string')
    assert.equal(s.workspaceId, null)
    assert.equal(typeof s.cwd, 'string')
    assert.equal(s.error, null)
    // rev11-limits: the 12 original limit fields plus the 16 moved from constants (DESIGN §16, §3 `Config`); rev11b adds 2.
    assert.deepEqual(Object.keys(s.limits).sort(), Object.keys({ ...LIMITS, ...LIMITS_R11, ...LIMITS_R11B, ...LIMITS_R11C }).sort())
    for (const v of Object.values(s.limits)) assert.ok(Number.isInteger(v))
    assert.deepEqual(Object.keys(s.catalog ?? {}).sort(), CATALOG_KEYS, 'catalog is not null while live')
    // Brand icon feature: preferences = {brandStyle}, 'fishball' by default.
    assert.deepEqual(Object.keys(s.preferences ?? {}).sort(), PREFERENCES.keys)
    assert.equal(s.preferences.brandStyle, PREFERENCES.defaultStyle)
  })

  it('HTP-02 hiddenTools lists exactly the hidden names, sorted', T, async () => {
    const s = (await host.get(API.state)).json
    assert.deepEqual(s.hiddenTools, [...STATE_HIDDEN_TOOLS].sort())
    // The literal list from the requirement, so a typo in the shared constant cannot hide a gap (P5 adds message_fishball).
    assert.deepEqual(s.hiddenTools, ['code_review_report', 'create_worktree', 'diff_approval_annotate', 'edit', 'git_worktree', 'image_generate', 'interrupt_agent', 'message_fishball', 'mover_move_session', 'plugin_manager', 'ralph', 'send_message', 'spawn_teammate', 'str_replace_editor', 'subagent', 'subagent_fork', 'video_generate', 'workflow', 'write'])
  })

  it('HTP-03 GET state without the browser cookie is refused', T, async () => {
    const res = await fetch(host.origin + API.state)
    await res.text()
    assert.notEqual(res.status, 200)
  })

  it('HTP-04/05 events streams the snapshot at once and a new frame after each change', T, async () => {
    const stream = await host.sse()
    try {
      assert.equal(stream.status, 200)
      assert.match(stream.contentType, /^text\/event-stream/)
      assert.ok(await until(() => stream.frames.length > 0, MS.sseFirstFrame, 20), 'first frame arrives immediately')
      // P3: tool changes also emit frames, so compare the first frame without the live catalog churn.
      const { catalog: _c, ...first } = stream.frames[0]
      const { catalog: _n, ...now } = (await host.get(API.state)).json
      assert.deepEqual(first, now)
      const count = stream.frames.length
      const r = await host.call('settingsUpdate', { patch: { maxActiveWatches: 7 } })
      assert.equal(r.ok, true, JSON.stringify(r.error))
      const changed = await until(() => stream.frames.slice(count).find((f) => f.limits?.maxActiveWatches === 7), MS.sseChange, 20)
      assert.ok(changed, 'a frame with the new limit arrives')
      assert.deepEqual(Object.keys(changed).filter((k) => !STATE_KEYS_OPTIONAL.includes(k)).sort(), STATE_KEYS)
    } finally {
      stream.close()
      await host.call('settingsUpdate', { patch: { maxActiveWatches: LIMITS.maxActiveWatches.default } })
    }
  })

  const badBodies = [
    ['not JSON', '{action:', true],
    ['a JSON array', '["retry"]', true],
    ['an object without action', {}, false],
    ['an unknown action', { action: 'restart' }, false],
    ['a wrong-case action', { action: 'ADOPT' }, false],
    ['a non-string action', { action: 1 }, false],
  ]
  for (const [label, body, raw] of badBodies) {
    it('HTP-06 recovery with ' + label + ' answers 400 bad-body', T, async () => {
      const res = await host.post(API.recovery, body, { raw })
      assert.equal(res.status, 400, res.text)
      assert.deepEqual(res.json, { ok: false, code: 'bad-body' })
    })
  }

  it('HTP-07 adopt while live answers 409 not-in-recovery and changes nothing', T, async () => {
    const res = await host.post(API.recovery, { action: 'adopt' })
    assert.equal(res.status, 409, res.text)
    assert.deepEqual(res.json, { ok: false, code: CONFLICT_CODE.notInRecovery })
    const s = await host.state()
    assert.equal(s.status, STATUS.live)
    assert.equal(s.sessionId, sid)
    assert.deepEqual((await host.call('sentinelSessions')).map((x) => x.id), [sid])
  })

  it('HTP-08 retry while live is accepted and keeps the same session', T, async () => {
    const res = await host.post(API.recovery, { action: 'retry' })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    assert.equal(res.json?.state?.sessionId, sid)
    const s = await host.waitStatus(STATUS.live)
    assert.equal(s.sessionId, sid)
    assert.deepEqual((await host.call('sentinelSessions')).map((x) => x.id), [sid])
  })

  it('HTP-09 POST recovery without the browser cookie is refused', T, async () => {
    const res = await fetch(host.origin + API.recovery, { method: 'POST', headers: { origin: host.origin, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'adopt' }) })
    await res.text()
    assert.notEqual(res.status, 200)
    assert.equal((await host.state()).sessionId, sid)
  })
})
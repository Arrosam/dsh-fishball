/**
 * dshConnectorSessions.start / startInput (host-services/sessions.d.ts; the user, 2026-11-21: "close
 * Watchdog's window at session creation"): a main-DSH plugin starts a session for the principal its
 * contributed tool's call came from, exactly as that principal's session_start, and its
 * afterManaged(sessionId, managed) runs after the session is managed and before its first message is
 * delivered. On a real DSH through the worker's serviceStart / startInput ops (extension.mjs), which
 * call the service as a plugin would. Techniques: UC, EP, BVA, DT, ST.
 */
import assert from 'node:assert/strict'
import { IX, K1, PAYLOAD_LIMITS, REFUSAL, SURFACE, TOOL } from 'dsh-connector-test-helpers/connector-world/interactions-constants'
import { row } from 'dsh-connector-test-helpers/connector-world/rows'
import { call, eventually, okCall, principal, tok, world } from 'dsh-connector-test-helpers/connector-world/interactions'

const S = IX.start
const startArgs = (folder, extra = {}) => ({ folder, title: 'IX start ' + tok('t'), message: tok('first'), attachments: [], ...extra })
const serviceStart = (w, p, args, after = S.mode.record) => w.call('serviceStart', { principalKey: p.principalKey, args, after })
const managersOf = async (w, sid) => (await w.service(SURFACE.service.handover, 'managed')).value.filter((m) => m.sessionId === sid).map((m) => m.principal.key)
/** The session's user messages carrying `text` (DSH's log), once one arrived. */
async function delivered(w, sid, text) {
  let found = []
  await eventually(async () => { found = (await w.call('session', { sessionId: sid })).events.filter((e) => e.type === IX.dsh.userMessage && e.text.includes(text)); return found.length > 0 })
  return found
}
const SUCCESS_KEYS = Object.freeze(['managed', 'ok', 'running', 'sessionId'])
const OPTIONAL_KEYS = Object.freeze(['titleError', 'workspaceError'])
const keysOf = (r) => Object.keys(r).filter((k) => !OPTIONAL_KEYS.includes(k)).sort()

export function registerStartCases(sdk) {
  row(sdk, 'SRV-START-01', 'EP (startInput)', 'startInput deep-equals K1 TOOLS\' session_start inputSchema and is frozen', async () => {
    const w = await world(sdk)
    const s = await w.call('startInput')
    assert.equal(s.type, 'object')
    assert.deepEqual(s.schema, JSON.parse(JSON.stringify(K1.toolDefinition(TOOL.sessionStart).inputSchema)))
    assert.equal(s.frozen, true, 'startInput is not frozen')
  })

  row(sdk, 'SRV-START-02', 'UC + ST (start → managed → afterManaged → first message)', 'start({principalKey, args, afterManaged}) → {ok, sessionId, managed: true, running: boolean}; managerOf = principalKey (P\'s sessions_list lists it); afterManaged(sessionId, true) ran once, after the session was managed and while it had no user message and no model request — still none after it waited; then the first message is delivered and a turn runs', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const folder = await w.call('folder', { name: tok('srvstart') })
    const args = startArgs(folder)
    const r = await serviceStart(w, p, args)
    assert.ok(r.value, JSON.stringify(r))
    const v = r.value
    assert.deepEqual([v.ok, typeof v.sessionId, v.managed, typeof v.running], [true, 'string', true, 'boolean'], JSON.stringify(v))
    assert.deepEqual(keysOf(v), SUCCESS_KEYS, JSON.stringify(v))
    assert.deepEqual(await managersOf(w, v.sessionId), [p.principalKey])
    const listed = (await okCall(p.client, TOOL.sessionsList, { limit: PAYLOAD_LIMITS.sessionsListed })).sessions.map((s) => s.sessionId)
    assert.ok(listed.includes(v.sessionId), 'the principal\'s sessions_list does not list the started session')
    assert.equal(r.calls.length, 1, 'afterManaged was not called exactly once: ' + JSON.stringify(r.calls))
    const [c] = r.calls
    assert.deepEqual([c.sessionId, c.managed], [v.sessionId, true])
    assert.equal(c.at.manager, p.principalKey, 'inside afterManaged the session is not managed by the principal')
    assert.deepEqual([c.at.userMessages, c.at.requests], [0, 0], 'the first message was delivered before afterManaged: ' + JSON.stringify(c.at))
    assert.notEqual(c.at.status, IX.dsh.running, 'the first turn had started inside afterManaged')
    assert.deepEqual([c.later?.userMessages, c.later?.requests], [0, 0], 'afterManaged was not awaited before the first message: ' + JSON.stringify(c.later))
    assert.equal((await delivered(w, v.sessionId, args.message)).length, 1, 'the first message was not delivered once')
    await w.call('waitIdle', { sessionId: v.sessionId })
    assert.ok((await w.call('requests', { sessionId: v.sessionId })).length >= 1, 'the first message started no turn')
  })

  row(sdk, 'SRV-START-03', 'BVA (title of one visible character; no afterManaged)', 'a one-character title and no afterManaged → ok, managed: true; the first message is delivered', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const args = startArgs(await w.call('folder', { name: tok('srvstart') }), { title: 'x' })
    const r = await serviceStart(w, p, args, S.mode.none)
    assert.deepEqual([r.value?.ok, r.value?.managed], [true, true], JSON.stringify(r))
    assert.deepEqual(r.calls, [])
    assert.equal((await delivered(w, r.value.sessionId, args.message)).length, 1)
    await w.call('waitIdle', { sessionId: r.value.sessionId })
  })

  // DT over afterManaged's failure → the answer is unchanged, the session starts, the failure is logged.
  for (const mode of [S.mode.throws, S.mode.rejects]) {
    row(sdk, 'SRV-START-04', `DT (afterManaged ${mode})`, `an afterManaged that ${mode} → still {ok, managed: true}; the session is the principal's and its first message is delivered; the failure is logged`, async (t) => {
      const w = await world(sdk)
      const p = await principal(t, w)
      const args = startArgs(await w.call('folder', { name: tok('srvstart') }))
      const logged = (await w.call('logs')).length
      const r = await serviceStart(w, p, args, mode)
      assert.ok(r.value, 'start threw: ' + JSON.stringify(r))
      assert.deepEqual([r.value.ok, r.value.managed, typeof r.value.running], [true, true, 'boolean'], JSON.stringify(r.value))
      assert.equal(r.calls.length, 1)
      assert.deepEqual(await managersOf(w, r.value.sessionId), [p.principalKey])
      assert.equal((await delivered(w, r.value.sessionId, args.message)).length, 1, 'the first message was not delivered after a failing afterManaged')
      const lines = (await w.call('logs')).slice(logged)
      // "logged" only: the connector need not repeat the plugin's own error text (it logs a warning naming the failed step).
      assert.ok(lines.some((l) => S.logTypes.includes(l.type) && l.name !== S.bootNoiseLogger), 'the afterManaged failure was not logged: ' + JSON.stringify(lines.slice(-10)))
      await w.call('waitIdle', { sessionId: r.value.sessionId })
    })
  }

  // DT over the arguments → the K1 refusal code; nothing is created and afterManaged is never called.
  const REFUSALS = [
    ['missing attachments', (f) => { const { attachments, ...rest } = startArgs(f); return rest }, REFUSAL.invalidArguments],
    ['an unknown field', (f) => startArgs(f, { fbixExtra: true }), REFUSAL.invalidArguments],
    ['a title of the wrong type', (f) => startArgs(f, { title: 5 }), REFUSAL.invalidArguments],
    ['attachments of the wrong type', (f) => startArgs(f, { attachments: 'x' }), REFUSAL.invalidArguments],
    ['an empty folder', () => startArgs(''), REFUSAL.invalidArguments],
    ['a title with no visible character', (f) => startArgs(f, { title: '\u200b\u200b' }), REFUSAL.limitExceeded],
    ['an empty title', (f) => startArgs(f, { title: '' }), REFUSAL.limitExceeded],
    [`${PAYLOAD_LIMITS.attachmentsPerMessage + 1} attachments`, (f) => startArgs(f, { attachments: Array.from({ length: PAYLOAD_LIMITS.attachmentsPerMessage + 1 }, (_, i) => 'fbix-ref-' + i) }), REFUSAL.limitExceeded],
    ['an absolute folder that does not exist', (f) => startArgs(f + '-fbix-missing'), REFUSAL.unknownSession],
    ['a relative folder', () => startArgs('relative/fbix-folder'), REFUSAL.forbidden],
    ['an unknown model', (f) => startArgs(f, { model: 'fbtest-no-such-model' }), REFUSAL.invalidDecision],
  ]
  row(sdk, 'SRV-START-05', 'DT (refusals before creation)', 'schema violations and an empty folder → invalid-arguments; an invisible or empty title and too many attachments → limit-exceeded; a missing folder → unknown-session; a relative one → forbidden; an unknown model → invalid-decision; each creates no session and never calls afterManaged', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const folder = await w.call('folder', { name: tok('srvstart') })
    for (const [label, args, code] of REFUSALS) {
      const before = await w.call('sessionIds')
      const r = await serviceStart(w, p, args(folder))
      assert.deepEqual(r.value, { ok: false, code }, label + ': ' + JSON.stringify(r))
      assert.deepEqual(r.calls, [], label + ': afterManaged was called')
      assert.deepEqual(await w.call('sessionIds'), before, label + ': a session was created')
    }
  })

  row(sdk, 'SRV-START-06', 'EP (regression: the core session_start)', 'session_start over MCP still answers {ok, sessionId, managed: true, running: boolean} (+ optional titleError / workspaceError), the same keys as start(); an unknown field is still invalid-arguments', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const core = await okCall(p.client, TOOL.sessionStart, startArgs(await w.call('folder', { name: tok('srvstart') })))
    assert.deepEqual(keysOf(core), SUCCESS_KEYS, JSON.stringify(core))
    for (const k of Object.keys(core).filter((x) => OPTIONAL_KEYS.includes(x))) assert.equal(typeof core[k], 'string', k)
    assert.equal(core.managed, true)
    const viaService = (await serviceStart(w, p, startArgs(await w.call('folder', { name: tok('srvstart') })), S.mode.none)).value
    assert.deepEqual(keysOf(viaService), keysOf(core))
    const refused = await call(p.client, TOOL.sessionStart, startArgs(await w.call('folder', { name: tok('srvstart') }), { fbixExtra: true }))
    assert.deepEqual([refused.ok, refused.code], [false, REFUSAL.invalidArguments])
    await w.call('waitIdle', { sessionId: core.sessionId })
    await w.call('waitIdle', { sessionId: viaService.sessionId })
  })
}

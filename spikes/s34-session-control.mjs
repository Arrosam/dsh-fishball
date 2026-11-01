/**
 * S34 (revision 11):
 * Q1 managed-only tools: visible only in sessions Fishball manages, toggled on a live session,
 *    effective at its next model request, other sessions untouched, a hidden tool's call refused.
 *    Also: what a managed / unmanaged session's subagent sees; survival across agent re-creation.
 * Q2 a plugin-triggered stop ends a running turn as the Stop button does; a pending approval
 *    request and a pending ask_user_question are cancelled and their signals abort.
 * Q3 after the stop a followup starts a new turn (redirect_session).
 */
import fs from 'node:fs'
import path from 'node:path'
import { FAKE_MODEL, FAKE_PROVIDER, RUNTIME, bootDsh, drive, eventTypes, hostPkg, hostRow, message, model, ordinarySession, runSpike, sleep, stage, until } from './harness.mjs'
import { MANAGED_TOOLS, createSessionControl } from './fixtures/session-control.mjs'

const { scopeOf } = await hostPkg('dsh-scope')

const toolsOf = (request) => (request?.tools ?? []).map((t) => t.name)
const hasManaged = (names) => MANAGED_TOOLS.filter((n) => names.includes(n))
// Only the agent loop's requests: DSH's session-title request reuses the session id and sends no tools.
const agentRequests = (sessionId) => model.requestsFor(sessionId).filter((r) => (r.tools ?? []).length > 0)
const lastRequestTools = (sessionId) => toolsOf(agentRequests(sessionId).at(-1))
const results = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'tool/result').map((e) => ({ callId: e.data.message.toolCallId, text: e.data.message.content.map((b) => b.text ?? '').join(''), isError: e.data.message.isError === true, error: e.data.error?.code }))
const turnEnds = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'turn/end').map((e) => e.data.reason?.kind ?? e.data.reason)
const turnStarts = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'turn/start').length

// The harness hard-codes rc.2 in its record; name the result file and runtime after the host actually booted.
const RUNTIME_VERSION = /versions\/([^/]+)\//.exec(RUNTIME)?.[1] ?? 'unknown'
const RESULT_ID = 'S34-session-control' + (RUNTIME_VERSION === '0.2.1-rc.2' ? '' : '-' + RUNTIME_VERSION)

await runSpike(RESULT_ID, async () => {
  const { ctx, home } = await bootDsh('s34')
  const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })
  const out = { Q1: {}, Q2: {}, Q3: {} }

  stage('host row')
  const approvalsSeen = []
  const questionsSeen = []
  let control
  await hostRow(ctx, 'fishball-spike-s34', ['tools', 'agents', 'sessionController', 'approval'], (c) => {
    control = createSessionControl(c)
    // Mid-turn toggle: a global tool whose body connects its own session between steps.
    c.tools.register({
      name: 'spike_connect_me', description: 'S34: connect my own session',
      parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
      async execute(_args, exec) { control.connect(exec.agent.id); return 'connected' },
    })
    // A tool that needs approval through the tools pipeline (as bash does under hooks).
    c.tools.register({
      name: 'needs_ok', description: 'S34: needs approval',
      parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
      async execute() { return 'needs_ok ran' },
    })
    c.on('tools/pre-execute', (exec, next) => (exec.name === 'needs_ok' ? { kind: 'ask', reason: 'S34 asks' } : next()))
    // Record each approval request and its signal, then pass it on to DSH's own answerers
    // (with no browser connected the gateway holds it pending, as a showing prompt).
    c.on('approval/request', (req, next) => { approvalsSeen.push({ tool: req.toolName, session: req.agent.id, signal: req.signal }); return next() }, { prepend: true })
    c.on('user-questions/request', (req, next) => { questionsSeen.push({ session: req.agent?.id, signal: req.signal }); return next() }, { prepend: true })
  })
  // An alternative mechanism, checked only through the registry view: global tool + live restrict.
  ctx.tools.register({ name: 'alt_global_tool', description: 'S34 alt', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] }, async execute() { return 'alt' } })

  // ---------------- Q1 ----------------
  stage('Q1 two live sessions')
  const a = await ordinarySession(ctx, ws)
  const b = await ordinarySession(ctx, ws)
  await drive(a, 'a1'); await drive(b, 'b1')
  out.Q1.baseline = { a: hasManaged(lastRequestTools(a.id)), b: hasManaged(lastRequestTools(b.id)) }

  stage('Q1 connect A')
  control.connect(a.id)
  await drive(a, 'a2'); await drive(b, 'b2')
  out.Q1.afterConnect = { a: hasManaged(lastRequestTools(a.id)), b: hasManaged(lastRequestTools(b.id)), registryB: hasManaged(ctx.tools.schemas(scopeOf(b.ctx)).map((t) => t.name)), registryGlobal: hasManaged(ctx.tools.schemas().map((t) => t.name)) }

  stage('Q1 managed call works in A, refused in B')
  model.queue(a.id, [{ tool: 'ask_fishball', id: 'call_a_ask', args: { text: 'hi' } }], [{ text: 'ok' }])
  await drive(a, 'a3')
  model.queue(b.id, [{ tool: 'ask_fishball', id: 'call_b_ask', args: { text: 'hi' } }], [{ text: 'ok' }])
  await drive(b, 'b3')
  out.Q1.callInA = results(a).find((r) => r.callId === 'call_a_ask')
  out.Q1.callInB = results(b).find((r) => r.callId === 'call_b_ask')

  stage('Q1 subagent of managed A and of unmanaged B')
  const childTools = async (parent, callId) => {
    const before = new Set(model.requests.map((r) => r.sessionId))
    model.queue(parent.id, [{ tool: 'subagent', id: callId, args: { description: 'probe', prompt: 'say done' } }], [{ text: 'ok' }])
    await drive(parent, 'spawn', 30000)
    // The subagent runs in the background; wait for its first agent request.
    await until(() => model.requests.some((r) => (r.tools ?? []).length > 0 && !before.has(r.sessionId) && ![parent.id, a.id, b.id].includes(r.sessionId)), 10000)
    const child = model.requests.find((r) => (r.tools ?? []).length > 0 && r.sessionId !== parent.id && !before.has(r.sessionId) && r.sessionId !== a.id && r.sessionId !== b.id)
    return { childSession: child?.sessionId, managedToolsSeen: child ? hasManaged(toolsOf(child)) : null, result: results(parent).find((r) => r.callId === callId)?.text.slice(0, 200) }
  }
  out.Q1.subagentOfManaged = await childTools(a, 'call_sub_a')
  out.Q1.subagentOfUnmanaged = await childTools(b, 'call_sub_b')

  stage('Q1 subagent opt-in variant (tools follow a managed root)')
  const subRow = await hostRow(ctx, 'fishball-spike-s34-subagents', ['tools', 'agents', 'sessionController'])
  const subCtl = createSessionControl(subRow, { subagents: true })
  const p = await ordinarySession(ctx, ws)
  subCtl.connect(p.id)
  out.Q1.subagentOptIn = await childTools(p, 'call_sub_p')
  await subRow.fiber.dispose()

  stage('Q1 disconnect A')
  control.disconnect(a.id)
  model.queue(a.id, [{ tool: 'ask_fishball', id: 'call_a_after', args: { text: 'hi' } }], [{ text: 'ok' }])
  await drive(a, 'a4')
  out.Q1.afterDisconnect = { requestTools: hasManaged(toolsOf(agentRequests(a.id).at(-2))), call: results(a).find((r) => r.callId === 'call_a_after'), fixtureCalls: control.calls.map((x) => [x.name, x.session === a.id ? 'A' : x.session === b.id ? 'B' : x.session]) }

  stage('Q1 mid-turn toggle (step 1 connects, step 2 request)')
  const m = await ordinarySession(ctx, ws)
  model.queue(m.id, [{ tool: 'spike_connect_me', id: 'call_m_connect' }], [{ text: 'ok' }])
  await drive(m, 'm1')
  const mReqs = agentRequests(m.id)
  out.Q1.midTurn = { step1: hasManaged(toolsOf(mReqs.at(-2))), step2: hasManaged(toolsOf(mReqs.at(-1))) }

  stage('Q1 re-created agent (dispose + resume) keeps managed tools via agent/created')
  const rid = 'session-s34-recreate'
  const opts = { provider: FAKE_PROVIDER, model: FAKE_MODEL }
  const h1 = await ctx.agents.create({ sessionId: rid, meta: { cwd: ws }, agentOptions: opts })
  control.connect(rid)
  await drive(h1.agent, 'r1')
  const before = hasManaged(lastRequestTools(rid))
  await h1.dispose()
  const h2 = await ctx.agents.resume({ resumeSessionId: rid, agentOptions: opts })
  await drive(h2.agent, 'r2')
  out.Q1.recreated = { beforeDispose: before, afterResume: hasManaged(lastRequestTools(rid)), newAgent: h2.agent !== h1.agent }
  control.disconnect(rid)
  await h2.dispose()

  stage('Q1 ownership: registrations when the plugin row stops')
  const visibleManaged = (agent) => hasManaged(ctx.tools.schemas(scopeOf(agent.ctx)).map((t) => t.name))
  out.Q1.ownership = {}
  for (const owner of ['plugin', 'agent']) {
    const sess = await ordinarySession(ctx, ws)
    const rowCtx = await hostRow(ctx, 'fishball-spike-s34-owner-' + owner, ['tools', 'agents', 'sessionController'])
    const ctl = createSessionControl(rowCtx, { owner })
    ctl.connect(sess.id)
    const during = visibleManaged(sess)
    await rowCtx.fiber.dispose()
    await sleep(100)
    out.Q1.ownership[owner] = { during, afterPluginStop: visibleManaged(sess), otherSession: visibleManaged(b) }
  }

  stage('Q1 alternative: global tool + live restrict toggle')
  const altVisible = (agent) => ctx.tools.schemas(scopeOf(agent.ctx)).some((t) => t.name === 'alt_global_tool')
  const lift = b.ctx.tools.restrict({ deny: ['alt_global_tool'] })
  const altDenied = altVisible(b); const altOtherDuring = altVisible(a)
  lift()
  out.Q1.altRestrict = { visibleWhileDenied: altDenied, otherWhileDenied: altOtherDuring, visibleAfterLift: altVisible(b) }

  // ---------------- Q2 / Q3 ----------------
  stage('Q2 stop with a pending approval')
  const s = await ordinarySession(ctx, ws)
  model.queue(s.id, [{ tool: 'needs_ok', id: 'call_s_ok' }], [{ text: 'should not run' }])
  s.steer(message('do it'))
  await until(() => eventTypes(s.session).includes('approval/asked'), 10000)
  await sleep(300)
  const pending = approvalsSeen.find((x) => x.session === s.id)
  out.Q2.approval = { asked: eventTypes(s.session).includes('approval/asked'), statusBefore: s.status, signalAbortedBefore: pending?.signal?.aborted }
  const ack = control.stop(s.id)
  await until(() => s.status === 'idle', 10000)
  out.Q2.approval = {
    ...out.Q2.approval, ack, statusAfter: s.status, signalAbortedAfter: pending?.signal?.aborted, signalReason: String(pending?.signal?.reason?.kind ?? pending?.signal?.reason),
    decided: s.session.snapshotEvents().filter((e) => e.type === 'approval/decided').map((e) => e.data.outcome),
    toolResult: results(s).find((r) => r.callId === 'call_s_ok'), turnEnds: turnEnds(s),
    leftoverQueued: model.queues.get(s.id)?.length ?? 0,
  }

  stage('Q3 followup after stop starts a new turn')
  const startsBefore = turnStarts(s)
  model.queues.set(s.id, [[{ text: 'new turn answer' }]])
  s.followup(message('next instruction'))
  await until(() => s.status === 'running', 3000, 5)
  await until(() => s.status === 'idle', 10000)
  out.Q3.followupAfterStop = { newTurn: turnStarts(s) === startsBefore + 1, turnEnds: turnEnds(s), lastText: s.session.snapshotEvents().filter((e) => e.type === 'assistant/message').at(-1)?.data.message.content.map((x) => x.text).join('') }

  stage('Q2 stop with a pending ask_user_question')
  const q = await ordinarySession(ctx, ws)
  model.queue(q.id, [{ tool: 'ask_user_question', id: 'call_q_ask', args: { questions: [{ id: 'q1', question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] }] } }], [{ text: 'should not run' }])
  q.steer(message('ask me'))
  await until(() => questionsSeen.some((x) => x.session === q.id), 10000)
  await sleep(300)
  const pq = questionsSeen.find((x) => x.session === q.id)
  const projection = () => ctx.get('sessionProjections')?.stateOf(q.session, 'userQuestions')?.questions?.active?.map((x) => ({ callId: x.callId, state: x.state }))
  out.Q2.question = { statusBefore: q.status, signalAbortedBefore: pq?.signal?.aborted, projectionBefore: projection() }
  control.stop(q.id)
  await until(() => q.status === 'idle', 10000)
  out.Q2.question = { ...out.Q2.question, statusAfter: q.status, signalAbortedAfter: pq?.signal?.aborted, toolResult: results(q).find((r) => r.callId === 'call_q_ask'), turnEnds: turnEnds(q), projectionAfter: projection() }

  stage('Q3 redirect while running (stop + immediate followup)')
  const r = await ordinarySession(ctx, ws)
  model.queue(r.id, [{ tool: 'needs_ok', id: 'call_r_ok' }], [{ text: 'old turn should not continue' }])
  r.steer(message('long work'))
  await until(() => eventTypes(r.session).includes('approval/asked'), 10000)
  model.queues.set(r.id, [[{ text: 'redirected answer' }]])
  const rStarts = turnStarts(r)
  control.redirect(r.id, message('do this instead'))
  await until(() => turnStarts(r) === rStarts + 1 && r.status === 'idle', 10000)
  out.Q3.redirect = {
    turnEnds: turnEnds(r), newTurn: turnStarts(r) === rStarts + 1,
    decided: r.session.snapshotEvents().filter((e) => e.type === 'approval/decided').map((e) => e.data.outcome),
    lastUser: r.session.snapshotEvents().filter((e) => e.type === 'user/message').at(-1)?.data.content.map((x) => x.text).join(''),
    lastText: r.session.snapshotEvents().filter((e) => e.type === 'assistant/message').at(-1)?.data.message.content.map((x) => x.text).join(''),
  }

  stage('Q2 stop keeps a message queued before it (keepInbox, as the Stop button)')
  const k = await ordinarySession(ctx, ws)
  model.queue(k.id, [{ tool: 'needs_ok', id: 'call_k_ok' }], [{ text: 'old turn should not continue' }])
  k.steer(message('work'))
  await until(() => eventTypes(k.session).includes('approval/asked'), 10000)
  k.followup(message('queued by the user'))
  model.queues.set(k.id, [[{ text: 'queued message ran' }]])
  const kStarts = turnStarts(k)
  control.stop(k.id)
  await until(() => k.status === 'idle', 10000)
  await sleep(1500)
  await until(() => k.status === 'idle', 10000)
  out.Q2.keptInbox = {
    turnsStartedAfterStop: turnStarts(k) - kStarts, turnEnds: turnEnds(k), inboxNextTurn: k.inbox.nextTurn.map((x) => x.content.map((y) => y.text).join('')), inboxNextStep: k.inbox.nextStep.length,
    lastUser: k.session.snapshotEvents().filter((e) => e.type === 'user/message').at(-1)?.data.content.map((x) => x.text).join(''),
    lastText: k.session.snapshotEvents().filter((e) => e.type === 'assistant/message').at(-1)?.data.message.content.map((x) => x.text).join(''),
  }

  stage('Q3 redirect when the session already holds a queued message')
  const userTexts = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'user/message' && e.data.source?.kind !== 'context').map((e) => e.data.content.map((x) => x.text).join('')).filter((t) => !t.startsWith('Time sampled'))
  model.queues.set(k.id, [[{ text: 'turn A' }], [{ text: 'turn B' }]])
  const k2Starts = turnStarts(k)
  // k is idle with the user's message still parked; start a running turn first, then redirect.
  model.queues.get(k.id).unshift([{ tool: 'needs_ok', id: 'call_k2_ok' }])
  k.steer(message('more work'))
  await until(() => eventTypes(k.session).filter((x) => x === 'approval/asked').length >= 2, 10000)
  control.redirect(k.id, message('redirect instruction'))
  await until(() => turnStarts(k) >= k2Starts + 1 && k.status === 'idle', 10000)
  await sleep(1500)
  await until(() => k.status === 'idle', 10000)
  out.Q3.redirectWithQueued = { turnsStarted: turnStarts(k) - k2Starts, userMessagesInOrder: userTexts(k).slice(-4), inboxNextTurn: k.inbox.nextTurn.map((x) => x.content.map((y) => y.text).join('')), turnEnds: turnEnds(k) }

  stage('Q2 stop on an idle session')
  try { out.Q2.idleStop = { ack: control.stop(b.id), status: b.status, turnEnds: turnEnds(b).length } } catch (e) { out.Q2.idleStop = { error: String(e) } }

  const v = {
    Q1_hidden_by_default: out.Q1.baseline.a.length === 0 && out.Q1.baseline.b.length === 0,
    Q1_connect_next_request: out.Q1.afterConnect.a.length === 3 && out.Q1.afterConnect.b.length === 0 && out.Q1.afterConnect.registryGlobal.length === 0,
    Q1_call_in_managed_runs: out.Q1.callInA?.text === 'ask_fishball ran',
    Q1_call_in_unmanaged_refused: out.Q1.callInB !== undefined && out.Q1.callInB.text !== 'ask_fishball ran',
    Q1_disconnect_removes: out.Q1.afterDisconnect.requestTools.length === 0 && out.Q1.afterDisconnect.call?.text !== 'ask_fishball ran',
    Q1_survives_recreate: out.Q1.recreated.beforeDispose.length === 3 && out.Q1.recreated.afterResume.length === 3 && out.Q1.recreated.newAgent,
    Q1_plugin_owned_unwinds: out.Q1.ownership.plugin.during.length === 3 && out.Q1.ownership.plugin.afterPluginStop.length === 0,
    Q1_mid_turn_next_step: out.Q1.midTurn.step1.length === 0 && out.Q1.midTurn.step2.length === 3,
    Q2_approval_cancelled: out.Q2.approval.signalAbortedAfter === true && out.Q2.approval.decided.includes('cancelled') && out.Q2.approval.statusAfter === 'idle',
    Q2_question_aborted: out.Q2.question.signalAbortedAfter === true && out.Q2.question.statusAfter === 'idle',
    Q3_followup_new_turn: out.Q3.followupAfterStop.newTurn && out.Q3.followupAfterStop.lastText === 'new turn answer',
    Q3_redirect: out.Q3.redirect.newTurn && out.Q3.redirect.lastText === 'redirected answer',
  }
  return { pass: Object.values(v).every(Boolean), host: RUNTIME_VERSION, verdict: v, ...out }
})

/**
 * S11 broker recovers a call's arguments from the asking session's log by callId,
 *     for a native call and for an inner call inside run_code.
 * S12 a prepended host-level approval/request listener runs first; next() reaches later answerers;
 *     a session with policy 'never' never reaches it.
 * S17 a tool body asking ctx.approval.request() reaches the waterfall even with a pre-execute 'allow' listener.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, drive, eventTypes, hostPkg, hostRow, message, model, ordinarySession, runSpike, stage, until } from './harness.mjs'

const { scopeOf } = await hostPkg('dsh-scope')
const { setApprovalPolicy } = await hostPkg('dsh-user-approval')
const { setSandboxMode } = await hostPkg('dsh-sandbox-policy')

/** Find the model-requested arguments of one call id in a session's durable log. */
function argumentsFor(session, callId) {
  for (const event of session.snapshotEvents()) {
    if (event.type === 'assistant/message') {
      for (const block of event.data.message.content) if (block.type === 'tool-call' && block.id === callId) return { kind: 'native', name: block.name, arguments: block.arguments }
    }
    if (event.type === 'tool/ptc-dispatch-start' && event.data.subCallId === callId) return { kind: 'ptc', name: event.data.name, arguments: event.data.arguments }
  }
  return undefined
}

await runSpike('S11-S12-S17', async () => {
  const { ctx, home } = await bootDsh('s11', [
    // The standard preset asks for approval only through hooks; make the 'ask_me' tool's pre-execute ask.
  ])
  const out = { S11: {}, S12: {}, S17: {} }
  stage('row')
  const seen = []
  const laterSeen = []
  const row = await hostRow(ctx, 'fishball-spike-broker', ['approval', 'tools'], (c) => {
    // A later, non-prepended listener standing in for the browser forwarder's position.
    c.on('approval/request', (req, next) => { laterSeen.push({ tool: req.toolName, callId: req.callId }); return 'rejected' })
    c.on('approval/request', (req, next) => {
      const session = req.agent.session
      seen.push({ tool: req.toolName, callId: req.callId, reason: req.reason, args: req.callId ? argumentsFor(session, req.callId) : undefined })
      return req.toolName === 'pass_me' ? next() : 'allowed-once'
    }, { prepend: true })
    // Tools: 'ask_me' asks inside its body (as add_plugin will); 'pass_me' too but the broker passes it on.
    for (const name of ['ask_me', 'pass_me']) {
      c.tools.register({
        name, description: 'spike tool that asks for approval in its body',
        parameters: { type: 'object', properties: { what: { type: 'string' } }, required: ['what'] },
        output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
        async execute(args, exec) {
          const outcome = await c.approval.request({ agent: exec.agent, toolName: name, callId: exec.callId, reason: 'spike asks: ' + args.what, signal: exec.signal })
          return 'outcome=' + outcome
        },
      })
    }
    // A pre-execute listener that ALLOWS everything first (stand-in for Auto review).
    c.on('tools/pre-execute', (exec, next) => (exec.name === 'ask_me' ? { kind: 'allow' } : next()))
  })

  const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })
  const lastResult = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'tool/result').map((e) => e.data.message.content.map((b) => b.text).join('')).at(-1)

  stage('A native call, pre-execute allow listener present')
  const a = await ordinarySession(ctx, ws)
  model.queue(a.id, [{ tool: 'ask_me', id: 'call_native_1', args: { what: 'native' } }], [{ text: 'ok' }])
  await drive(a, 'please')
  out.S17.nativeResult = lastResult(a)

  stage('B run_code inner call (ptc preset)')
  const b = await ordinarySession(ctx, ws, 'ptc')
  out.S11.ptcHasRunCode = ctx.tools.schemas(scopeOf(b.ctx)).some((t) => t.name === 'run_code')
  // This harness itself runs inside a macOS sandbox, and sandbox-exec cannot nest: run this throwaway session's program unwrapped.
  setSandboxMode(b.session, 'danger-full-access')
  model.queue(b.id, [{ tool: 'run_code', id: 'call_ptc_1', args: { code: "return await tools.ask_me({ what: 'inner' })", description: 'spike' } }], [{ text: 'ok' }])
  await drive(b, 'again')
  out.S11.innerResult = lastResult(b)

  stage('C broker passes on with next()')
  const c = await ordinarySession(ctx, ws)
  model.queue(c.id, [{ tool: 'pass_me', id: 'call_pass_1', args: { what: 'pass' } }], [{ text: 'ok' }])
  c.steer(message('third'))
  await until(() => eventTypes(c.session).includes('approval/asked'), 10000)
  await new Promise((r) => setTimeout(r, 3000))
  const types = eventTypes(c.session)
  out.S12.afterNext = { asked: types.includes('approval/asked'), decided: types.includes('approval/decided'), status: c.status, laterSeen: [...laterSeen] }
  c.cancel({ kind: 'user' })
  await until(() => c.status === 'idle', 10000)
  out.S12.afterCancel = { decided: c.session.snapshotEvents().filter((e) => e.type === 'approval/decided').map((e) => e.data.outcome), result: lastResult(c) }

  stage('D policy never')
  const d = await ordinarySession(ctx, ws)
  setApprovalPolicy(d.session, 'never')
  const before = seen.length
  model.queue(d.id, [{ tool: 'ask_me', id: 'call_never_1', args: { what: 'never' } }], [{ text: 'ok' }])
  await drive(d, 'fourth')
  out.S12.never = { reachedBroker: seen.length !== before, result: lastResult(d) }

  out.S11.seen = seen
  const native = seen.find((s) => s.callId === 'call_native_1')
  const inner = seen.find((s) => s.tool === 'ask_me' && s.callId !== 'call_native_1' && s.callId !== 'call_never_1')
  out.verdict = {
    S11_native: native?.args?.arguments === JSON.stringify({ what: 'native' }),
    S11_inner: inner?.args?.kind === 'ptc' && JSON.stringify(inner.args.arguments).includes('inner'),
    S12_prepended_first: seen.some((s) => s.tool === 'pass_me'),
    S12_next_reaches_forwarder: out.S12.afterNext.asked && !out.S12.afterNext.decided && out.S12.afterNext.laterSeen.length === 0,
    S12_never: !out.S12.never.reachedBroker,
    S17_body_ask_despite_allow: native !== undefined && out.S17.nativeResult === 'outcome=allowed-once',
  }
  out.innerCallId = inner?.callId
  return { pass: Object.values(out.verdict).every(Boolean), ...out }
})
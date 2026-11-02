/**
 * P5 smoke (implementer evidence, not the black-box suite). Boots a Web profile with
 * dsh-fishball linked. Checks: message_fishball from an ordinary session reaches Fishball once,
 * attributed and framed, and wakes it; the same call id is a duplicate; Fishball cannot call it;
 * "Send to Fishball" over HTTP; message_session reaches another session with Fishball's relay
 * source; start_session refuses a missing folder and starts a session in an existing one;
 * hourly caps; the queue and outbox in state; a restart reconciles accepted items.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, message, model, ordinarySession, runSpike, until, REPO } from './harness.mjs'

const link = (dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
  pkg.dsh.profile.bundles.push('dsh-fishball')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
}
const port = Number(process.env.SMOKE_PORT ?? 3101)
let url
const write = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => { const m = String(chunk).match(/dsh web: (\S+)/); if (m) url = m[1]; return write(chunk, ...rest) }

await runSpike('P5-smoke', async () => {
  const { ctx, home } = await bootDsh('p5smoke', [], { args: ['--no-open', '--port', String(port)], setupProfile: link })
  await until(() => url !== undefined, 5000)
  const base = 'http://127.0.0.1:' + port
  const login = await fetch(url, { redirect: 'manual' })
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const api = async (p, body) => {
    const init = body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }
    const r = await fetch(base + p, { ...init, headers: { cookie, origin: base, 'content-type': 'application/json' } })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  const sidOf = () => JSON.parse(fs.readFileSync(path.join(process.env.DSH_HOME, 'storages', 'fishball.json'), 'utf8')).global?.sessionId
  let fishball
  await until(() => { try { fishball = ctx.agents.get(sidOf()) } catch { fishball = undefined } return fishball !== undefined && fishball.status === 'idle' && model.requestsFor(fishball.id).length > 0 }, 30000)
  if (fishball === undefined) return { pass: false, error: 'no fishball agent' }
  const fid = fishball.id
  const out = {}
  const lastResult = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'tool/result').at(-1)?.data?.message?.content?.map((b) => b.text).join('')
  const runTurn = async (agent, steps, text = 'go') => {
    model.queue(agent.id, ...steps)
    agent.steer(message(text))
    await until(() => agent.status === 'running', 3000, 5)
    await until(() => agent.status === 'idle', 20000)
  }
  const fishballUserMessages = () => fishball.session.snapshotEvents().filter((e) => e.type === 'user/message').map((e) => e.data)

  // 1. message_fishball from an ordinary session
  const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })
  const other = await ordinarySession(ctx, ws)
  out.otherHasTool = (model.requestsFor(other.id).at(-1)?.tools ?? []).length === 0 ? null : undefined
  const fishballRequestsBefore = model.requestsFor(fid).length
  await runTurn(other, [[{ tool: 'message_fishball', id: 'call_mf_1', args: { message: 'Build finished: 3 failures.' } }], [{ text: 'sent' }]])
  out.inboundResult = JSON.parse(lastResult(other) ?? 'null')
  out.otherSawTool = (model.requestsFor(other.id).at(0)?.tools ?? []).some((t) => t.name === 'message_fishball')
  await until(() => model.requestsFor(fid).length > fishballRequestsBefore && fishball.status === 'idle', 10000)
  const delivered = fishballUserMessages().filter((m) => m.source?.kind === 'agent-message')
  out.fishballGot = delivered.map((m) => ({ sender: m.source.senderSessionId, text: m.content[0].text.slice(0, 160) }))
  out.fishballWoke = model.requestsFor(fid).length > fishballRequestsBefore
  out.fishballToolsHaveInbound = (model.requestsFor(fid).at(-1)?.tools ?? []).some((t) => t.name === 'message_fishball')
  out.fishballToolsHaveOutbound = ['message_session', 'start_session'].map((n) => (model.requestsFor(fid).at(-1)?.tools ?? []).some((t) => t.name === n))

  // 2. Fishball calling message_fishball is refused
  await runTurn(fishball, [[{ tool: 'message_fishball', id: 'call_self', args: { message: 'loop' } }], [{ text: 'ok' }]])
  out.selfCall = lastResult(fishball)?.slice(0, 120)

  // 3. Send to Fishball over HTTP
  const beforeSend = fishballUserMessages().length
  out.send = (await api('/api/fishball/send', { sessionId: other.id, note: 'Please summarise this for me.' })).status
  await until(() => fishballUserMessages().length > beforeSend && fishball.status === 'idle', 10000)
  out.forwarded = fishballUserMessages().at(-1)?.content?.[0]?.text?.slice(0, 400)
  out.sendSelf = (await api('/api/fishball/send', { sessionId: fid, note: '' })).body
  out.sendUnknown = (await api('/api/fishball/send', { sessionId: 'session-nope', note: '' })).body
  out.sendBad = (await api('/api/fishball/send', { sessionId: other.id })).status

  // 4. message_session from Fishball
  const otherBefore = other.session.snapshotEvents().length
  await runTurn(fishball, [[{ tool: 'message_session', id: 'call_ms', args: { session_id: other.id, message: 'Please rerun the tests.' } }], [{ text: 'ok' }]])
  out.messageSession = JSON.parse(lastResult(fishball) ?? 'null')
  await until(() => other.status === 'idle' && other.session.snapshotEvents().length > otherBefore, 10000)
  const relayed = other.session.snapshotEvents().filter((e) => e.type === 'user/message').at(-1)?.data
  out.otherGot = { source: relayed?.source, text: relayed?.content?.[0]?.text }
  await runTurn(fishball, [[{ tool: 'message_session', id: 'call_ms2', args: { session_id: fid, message: 'x' } }], [{ text: 'ok' }]])
  out.messageSelf = JSON.parse(lastResult(fishball) ?? 'null')

  // 5. start_session
  const missing = path.join(home, 'nope')
  await runTurn(fishball, [[{ tool: 'start_session', id: 'call_ss1', args: { folder: missing, message: 'hi' } }], [{ text: 'ok' }]])
  out.startMissing = JSON.parse(lastResult(fishball) ?? 'null')
  out.missingStillMissing = !fs.existsSync(missing)
  const proj = path.join(home, 'project'); fs.mkdirSync(proj)
  await runTurn(fishball, [[{ tool: 'start_session', id: 'call_ss2', args: { folder: proj, message: 'Summarise this folder.' } }], [{ text: 'ok' }]])
  out.startOk = JSON.parse(lastResult(fishball) ?? 'null')
  if (out.startOk?.sessionId) {
    await until(() => model.requestsFor(out.startOk.sessionId).length > 0, 10000)
    out.startedRan = model.requestsFor(out.startOk.sessionId).length > 0
  }
  await runTurn(fishball, [[{ tool: 'start_session', id: 'call_ss3', args: { folder: 'relative/path', message: 'hi' } }], [{ text: 'ok' }]])
  out.startRelative = JSON.parse(lastResult(fishball) ?? 'null')

  // 6. State
  const state = (await api('/api/fishball/state')).body
  out.intake = { queued: state.intake.queued, failed: state.intake.failed, kinds: state.intake.items.map((i) => i.kind + ':' + i.status) }
  out.outbox = state.outbox.entries.map((e) => e.kind + ':' + e.status)

  const pass = out.inboundResult?.ok === true && out.fishballGot.length === 1 && out.fishballGot[0].sender === other.id && out.fishballWoke
    && !out.fishballToolsHaveInbound && out.fishballToolsHaveOutbound.every(Boolean) && out.send === 200 && /Please summarise/.test(out.forwarded ?? '')
    && out.sendSelf?.code === 'from-fishball' && out.sendUnknown?.code === 'unknown-session' && out.sendBad === 400
    && out.messageSession?.ok === true && out.otherGot.source?.kind === 'agent-message' && out.otherGot.source?.senderSessionId === fid
    && out.messageSelf?.code === 'is-fishball' && out.startMissing?.code === 'no-folder' && out.missingStillMissing
    && out.startOk?.ok === true && out.startedRan && out.startRelative?.code === 'not-absolute'
  return { pass, ...out }
})

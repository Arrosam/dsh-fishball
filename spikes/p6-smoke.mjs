/**
 * P6 smoke (implementer evidence, not the black-box suite). Watches: GUI watch over HTTP, a
 * 'finished' notice once after the target's turn ends and it is idle, never on interrupted, a
 * per-turn watch, watch_session/list_watches/unwatch_session/read_session, notify_when_finished
 * from message_session and message_fishball, refusals, and catch-up after a restart.
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

await runSpike('P6-smoke', async () => {
  const { ctx, home } = await bootDsh('p6smoke', [], { args: ['--no-open', '--port', String(port)], setupProfile: link })
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
  const runTurn = async (agent, steps, text = 'go') => {
    model.queue(agent.id, ...steps)
    agent.steer(message(text))
    await until(() => agent.status === 'running', 3000, 5)
    await until(() => agent.status === 'idle', 20000)
  }
  const lastResult = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'tool/result').at(-1)?.data?.message?.content?.map((b) => b.text).join('')
  const watchNotices = () => fishball.session.snapshotEvents().filter((e) => e.type === 'user/message' && String(e.data?.content?.[0]?.text ?? '').includes('a session you are watching'))
  const settle = async () => { await new Promise((r) => setTimeout(r, 400)); await until(() => fishball.status === 'idle', 15000) }

  const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })
  const target = await ordinarySession(ctx, ws)

  // 1. GUI watch, then the target finishes a turn: one notice
  out.add = await api('/api/fishball/watches', { sessionId: target.id })
  out.addAgain = (await api('/api/fishball/watches', { sessionId: target.id })).body?.state?.watches?.active
  await runTurn(target, [[{ text: 'Target answer one.' }]])
  await settle()
  out.noticesAfterOne = watchNotices().length
  out.noticeText = watchNotices().at(-1)?.data?.content?.[0]?.text?.slice(0, 300)
  out.watchClosed = (await api('/api/fishball/state')).body.watches.watches.find((w) => w.targetSessionId === target.id)?.status
  await runTurn(target, [[{ text: 'Target answer two.' }]])
  await settle()
  out.noticesAfterTwo = watchNotices().length

  // 2. Refusals
  out.selfWatch = (await api('/api/fishball/watches', { sessionId: fid })).body
  out.unknownWatch = (await api('/api/fishball/watches', { sessionId: 'session-nope' })).body
  out.badBody = (await api('/api/fishball/watches', {})).status

  // 3. Fishball's tools: per-turn repeat watch, list, read_session, unwatch
  await runTurn(fishball, [[{ tool: 'watch_session', id: 'c_w1', args: { session_id: target.id, condition: 'per-turn', mode: 'repeat' } }], [{ text: 'ok' }]])
  out.toolWatch = JSON.parse(lastResult(fishball) ?? 'null')
  await runTurn(target, [[{ text: 'Target answer three.' }]]); await settle()
  await runTurn(target, [[{ text: 'Target answer four.' }]]); await settle()
  out.noticesAfterPerTurn = watchNotices().length
  await runTurn(fishball, [[{ tool: 'list_watches', id: 'c_l', args: {} }], [{ text: 'ok' }]])
  out.list = JSON.parse(lastResult(fishball) ?? 'null')?.watches?.map((w) => w.condition + ':' + w.mode + ':' + w.status)
  await runTurn(fishball, [[{ tool: 'read_session', id: 'c_r', args: { session_id: target.id } }], [{ text: 'ok' }]])
  const readText = lastResult(fishball) ?? ''
  out.read = readText.slice(0, 400)
  out.readHasLatest = readText.includes('Target answer four')
  const stranger = await ordinarySession(ctx, ws)
  await runTurn(fishball, [[{ tool: 'read_session', id: 'c_r2', args: { session_id: stranger.id } }], [{ text: 'ok' }]])
  out.readStranger = JSON.parse(lastResult(fishball) ?? 'null')
  await runTurn(fishball, [[{ tool: 'unwatch_session', id: 'c_u', args: { watch_id: out.toolWatch?.watch?.id } }], [{ text: 'ok' }]])
  out.unwatch = JSON.parse(lastResult(fishball) ?? 'null')

  // 4. notify_when_finished from message_session
  const other = await ordinarySession(ctx, ws)
  const before = watchNotices().length
  model.queue(other.id, [{ text: 'Done with your request.' }])
  await runTurn(fishball, [[{ tool: 'message_session', id: 'c_ms', args: { session_id: other.id, message: 'Please do X.', notify_when_finished: true } }], [{ text: 'ok' }]])
  out.msWatch = JSON.parse(lastResult(fishball) ?? 'null')
  await until(() => other.status === 'idle' && model.requestsFor(other.id).length > 0, 15000)
  await settle()
  out.noticesAfterMs = watchNotices().length - before

  // 4b. A target whose turn ends at once (its model errors): the notice still comes (review H1)
  const fast = await ordinarySession(ctx, ws)
  // A raw error finish: the turn ends at once with reason 'error' (no retry: a non-retryable code).
  model.queue(fast.id, [{ type: 'finish', reason: { kind: 'error', failure: { message: 'boom', code: 'INVALID_REQUEST' } } }])
  const before3 = watchNotices().length
  await runTurn(fishball, [[{ tool: 'message_session', id: 'c_fast', args: { session_id: fast.id, message: 'Quick one.', notify_when_finished: true } }], [{ text: 'ok' }]])
  await until(() => fast.status === 'idle', 15000)
  await settle()
  out.fastNotices = watchNotices().length - before3
  out.fastReason = watchNotices().at(-1)?.data?.content?.[0]?.text?.match(/reason: "([^"]+)"/)?.[1]

  // 5. message_fishball with notify_when_finished (the caller's own session)
  const caller = await ordinarySession(ctx, ws)
  const before2 = watchNotices().length
  await runTurn(caller, [[{ tool: 'message_fishball', id: 'c_mf', args: { message: 'Starting a long job.', notify_when_finished: true } }], [{ text: 'job done' }]])
  out.mfResult = JSON.parse(caller.session.snapshotEvents().filter((e) => e.type === 'tool/result').at(-1)?.data?.message?.content?.map((b) => b.text).join('') ?? 'null')
  await settle()
  out.noticesAfterMf = watchNotices().length - before2

  const pass = out.add.status === 200 && out.addAgain === 1 && out.noticesAfterOne === 1 && out.watchClosed === 'closed' && out.noticesAfterTwo === 1
    && out.selfWatch?.code === 'is-fishball' && out.unknownWatch?.code === 'unknown-session' && out.badBody === 400
    && out.toolWatch?.ok && out.noticesAfterPerTurn === 3 && out.readHasLatest && out.readStranger?.code === 'not-related'
    && out.unwatch?.ok && out.msWatch?.watch?.id && out.noticesAfterMs === 1 && out.mfResult?.watch?.id && out.noticesAfterMf === 1 && out.fastNotices === 1
  return { pass, ...out }
})

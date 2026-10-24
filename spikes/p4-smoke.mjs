/**
 * P4 smoke (implementer evidence, not the black-box suite). Boots a Web profile with
 * dsh-fishball linked and a fake model whose window is 200,000. Checks: unset = the model's
 * window; saving 20,000 derives the policy, remounts Fishball's compaction with it, caps
 * every request's reply length, compacts Fishball at the derived threshold through
 * Fishball's summary prompt, and leaves an ordinary session untouched; invalid values are
 * refused with a reason; clearing restores the defaults.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, eventTypes, message, model, ordinarySession, runSpike, until, REPO } from './harness.mjs'

const big = (n) => 'x'.repeat(n)
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

await runSpike('P4-smoke', async () => {
  process.env.SPIKE_CONTEXT_WINDOW = '200000'
  const { ctx, home } = await bootDsh('p4smoke', [], { args: ['--no-open', '--port', String(port)], setupProfile: link })
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
  let agent
  await until(() => { try { agent = ctx.agents.get(sidOf()) } catch { agent = undefined } return agent !== undefined && agent.status === 'idle' && model.requestsFor(agent.id).length > 0 }, 30000)
  if (agent === undefined) return { pass: false, error: 'no fishball agent' }
  const sid = agent.id
  const cw = async () => (await api('/api/fishball/state')).body.contextWindow
  const out = { unset: await cw() }
  const turn = async (text, answer) => {
    model.queue(sid, [{ text: answer }])
    agent.steer(message(text))
    await until(() => agent.status === 'running', 3000, 5)
    await until(() => agent.status === 'idle', 20000)
  }
  out.tooSmall = await api('/api/fishball/context-window', { contextWindowTokens: 1000, maxOutputTokens: null })
  out.outputTooLarge = await api('/api/fishball/context-window', { contextWindowTokens: 20000, maxOutputTokens: 30000 })
  out.badBody = await api('/api/fishball/context-window', { contextWindowTokens: 2.5, maxOutputTokens: null })
  out.set = await api('/api/fishball/context-window', { contextWindowTokens: 20000, maxOutputTokens: null })
  // The new policy remounts compaction in the idle phase; give it a moment.
  await new Promise((r) => setTimeout(r, 500))
  out.afterSet = await cw()
  const engineRow = [...ctx.loader.entries()].find((e) => e.options.name === 'dsh-fishball/compaction')
  out.engineConfig = engineRow?.fiber?.config ?? engineRow?.options.config
  const before = model.requestsFor(sid).length
  for (let i = 0; i < 6; i++) await turn('turn ' + i + ' ' + big(8000), 'answer ' + i + ' ' + big(8000))
  const requests = model.requestsFor(sid).slice(before)
  out.maxTokensSeen = [...new Set(requests.map((r) => r.maxTokens))]
  const summaryCalls = requests.filter((r) => r.purpose === 'compaction')
  out.summaryCalls = summaryCalls.length
  out.summaryUsedFishballPrompt = summaryCalls.some((r) => JSON.stringify(r.messages.at(-1)).includes('Standing permissions'))
  out.compactions = eventTypes(agent.session).filter((t) => t === 'compaction/summary').length
  out.afterTurns = await cw()
  const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })
  const other = await ordinarySession(ctx, ws)
  for (let i = 0; i < 6; i++) {
    model.queue(other.id, [{ text: 'answer ' + i + ' ' + big(8000) }])
    other.steer(message('turn ' + i + ' ' + big(8000)))
    await until(() => other.status === 'running', 2000, 5)
    await until(() => other.status === 'idle', 15000)
  }
  out.otherCompactions = eventTypes(other.session).filter((t) => t === 'compaction/summary').length
  out.otherMaxTokens = [...new Set(model.requestsFor(other.id).map((r) => r.maxTokens))]
  out.cleared = await api('/api/fishball/context-window', { contextWindowTokens: null, maxOutputTokens: null })
  await new Promise((r) => setTimeout(r, 500))
  out.afterClear = await cw()
  // The reply cap follows each save (test-author finding: DSH carries the logged maxTokens).
  const lastMax = () => model.requestsFor(sid).filter((r) => r.purpose === undefined).at(-1)?.maxTokens
  await turn('after clear', 'ok'); out.capAfterClear = lastMax()
  await api('/api/fishball/context-window', { contextWindowTokens: 40000, maxOutputTokens: null })
  await turn('at 40000', 'ok'); out.capAt40000 = lastMax()
  await api('/api/fishball/context-window', { contextWindowTokens: 40000, maxOutputTokens: 7000 })
  await turn('at 7000', 'ok'); out.capAt7000 = lastMax()
  out.tiny = await api('/api/fishball/context-window', { contextWindowTokens: 7, maxOutputTokens: null })
  // Ceiling: one message far above 20,000 - 2,500, with nothing older to compact.
  await api('/api/fishball/context-window', { contextWindowTokens: 20000, maxOutputTokens: null })
  await new Promise((r) => setTimeout(r, 500))
  model.queue(sid, [{ text: 'big answered' }])
  agent.steer(message('huge ' + big(90000)))
  await until(() => agent.status === 'running', 3000, 5)
  await until(() => agent.status === 'idle', 30000)
  const tail = agent.session.snapshotEvents().slice(-12)
  out.ceilingTail = tail.map((e) => e.type)
  // The fake model answers the summary call from the same session queue, so the reply text
  // is not checked; the turn must complete with an answer and the big message kept.
  out.ceilingAnswer = tail.filter((e) => e.type === 'assistant/message').at(-1)?.data.message.content.map((b) => b.text).join('')
  // Overflow compaction may summarize the big message itself (retain 0), but it stays in the log.
  out.ceilingKeptMessage = agent.session.snapshotEvents().some((e) => e.type === 'user/message' && JSON.stringify(e.data).includes('huge '))
  out.ceilingCompacted = tail.some((e) => e.type === 'compaction/summary')
  out.ceilingAnswered = tail.some((e) => e.type === 'assistant/message') && tail.at(-1)?.type === 'turn/end' && tail.at(-1)?.data?.reason?.kind === 'completed'
  out.ceilingTurnError = tail.find((e) => e.type === 'turn/end')?.data?.outcome ?? tail.find((e) => e.type === 'turn/end')?.data
  out.stored = JSON.parse(fs.readFileSync(path.join(process.env.DSH_HOME, 'storages', 'fishball.json'), 'utf8')).tables?.settings ?? null
  const pass = out.unset.effectiveWindow === 200000 && out.tooSmall.status === 409 && out.outputTooLarge.status === 409 && out.badBody.status === 400
    && out.set.status === 200 && out.afterSet.effectiveWindow === 20000 && out.maxTokensSeen.every((m) => m <= 2500)
    && out.compactions >= 1 && out.summaryUsedFishballPrompt && out.otherCompactions === 0 && out.afterClear.effectiveWindow === 200000
    && out.capAfterClear === 4096 && out.capAt40000 === 5000 && out.capAt7000 === 7000 && out.tiny.status === 409 && out.ceilingAnswered && out.ceilingKeptMessage && out.ceilingCompacted
  return { pass, ...out }
})

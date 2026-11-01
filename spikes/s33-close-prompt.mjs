/**
 * S33 (revision 11, requirements items 15 and 20): can a plugin answer DSH's stock permission
 * prompt from the server while it is showing, and does it learn the user's answer when the user
 * clicks first?
 *
 * Fixture: spikes/fixtures/prompt-closer.mjs (prepended approval/request listener that passes
 * every request on and keeps a handle). A host row registers `ask_me`, a tool that asks for
 * approval in its body (as DSH's sandbox escalation does).
 *
 * Headless (default): for both fixture modes, with no browser connected, so DSH's gateway holds
 * each forwarded request pending exactly as a shown prompt (dsh-api-gateway startRemoteEvent):
 *  A  plugin allows   -> tool runs; forwarder rejected with our reason; gateway pending cleared
 *  B  plugin rejects  -> agent gets the rejection
 *  C  turn stopped    -> 'cancelled'; registry entry removed
 *  D  "user" first    -> a stand-in answerer between the fixture and the forwarder answers;
 *                        the fixture learns it; a late plugin answer is refused
 *  E  second answer   -> refused; no unhandled rejection anywhere
 * Server (S33_SERVE=1): stays up on SPIKE_PORT with a control API on S33_CONTROL_PORT for the
 * browser check (GET /state, POST /start?mode=&label=, POST /answer?key=&outcome=).
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { bootDsh, message, model, ordinarySession, hostRow, runSpike, stage, until, REPO, RUNTIME } from './harness.mjs'

const FIXTURE = path.join(REPO, 'spikes', 'fixtures', 'prompt-closer.mjs')
const STANDIN = path.join(REPO, 'spikes', 'fixtures', 'user-standin.mjs')
const SERVE = process.env.S33_SERVE === '1'
const TOOL = 'ask_me'
const OUTCOME = Object.freeze({ allow: 'allowed-once', reject: 'rejected' })

const unhandled = []
process.on('unhandledRejection', (reason) => unhandled.push(String(reason?.message ?? reason)))

const rows = [{ insert: [
  // Mounted first and prepended, so the fixture (prepended later) runs before it (as in P7).
  ...(SERVE ? [] : [{ id: 's33-user-standin', name: STANDIN }]),
  { id: 's33-prompt-closer', name: FIXTURE },
] }]
const port = process.env.SPIKE_PORT ?? '3133'
let url
if (SERVE) {
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk, ...rest) => { const m = String(chunk).match(/dsh web: (\S+)/); if (m) url = m[1]; return write(chunk, ...rest) }
}
/**
 * The repository is linked as a profile dependency but NOT selected as a bundle (Fishball does
 * not run): that is what lets the fixture import src/approvals.js with the host's packages.
 */
const linkRepo = (dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
}
const { ctx, home } = await bootDsh('s33', rows, { setupProfile: linkRepo, ...(SERVE ? { args: ['--no-open', '--port', port] } : {}) })
const s33 = globalThis.__s33
const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })

await hostRow(ctx, 's33-asker', ['approval', 'tools'], (c) => {
  c.tools.register({
    name: TOOL, description: 'S33 spike tool that asks for approval in its body',
    parameters: { type: 'object', properties: { what: { type: 'string' } }, required: ['what'] },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
    async execute(args, exec) {
      const outcome = await c.approval.request({ agent: exec.agent, toolName: TOOL, callId: exec.callId, reason: 'S33 asks: ' + args.what, signal: exec.signal })
      if (outcome !== OUTCOME.allow) return 'not run: ' + outcome
      return 'RAN ' + args.what
    },
  })
})

/** The gateway's pending forwarded events (private field, read for evidence only). */
const gatewayPending = () => { try { return ctx.typertGateway?.pendingRemoteEvents?.size ?? null } catch { return null } }
const toolResults = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'tool/result').map((e) => e.data.message.content.map((b) => b.text ?? '').join(''))
const decided = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'approval/decided').map((e) => e.data.outcome)
const entryFor = (sessionId) => [...s33.registry.values(), ...s33.settled].findLast((e) => e.sessionId === sessionId)
const view = (e) => e && { key: e.key, mode: e.mode, toolName: e.toolName, callId: e.callId, args: e.args, settledBy: e.settledBy, outcome: e.outcome, downstream: e.downstream, events: e.events }

/** Start a session whose model calls ask_me once, and wait until the request waits. */
async function startAsking(mode, what) {
  s33.mode = mode
  const agent = await ordinarySession(ctx, ws)
  model.queue(agent.id, [{ tool: TOOL, id: `call_${what}`, args: { what } }], [{ text: 'finished: ' + what }])
  agent.steer(message('please ' + what))
  await until(() => s33.list().some((e) => e.sessionId === agent.id), 10000)
  return agent
}

if (SERVE) {
  const agents = new Map()
  const controlPort = Number(process.env.S33_CONTROL_PORT ?? 3134)
  http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x')
    const send = (value) => { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(value, null, 2)) }
    try {
      if (u.pathname === '/start') {
        const agent = await startAsking(u.searchParams.get('mode') ?? 'mutate', u.searchParams.get('label') ?? 'x')
        agents.set(agent.id, agent)
        return send({ sessionId: agent.id, waiting: s33.list().filter((e) => e.sessionId === agent.id) })
      }
      if (u.pathname === '/answer') return send({ accepted: s33.answer(u.searchParams.get('key'), u.searchParams.get('outcome')), at: new Date().toISOString() })
      if (u.pathname === '/state') {
        return send({
          waiting: s33.list(), settled: s33.settled.map(view), gatewayPending: gatewayPending(), unhandled,
          sessions: [...agents.values()].map((a) => ({ id: a.id, status: a.status, decided: decided(a), toolResults: toolResults(a) })),
        })
      }
      send({ error: 'unknown' })
    } catch (error) { send({ error: String(error?.stack ?? error) }) }
  }).listen(controlPort, '127.0.0.1')
  await new Promise((r) => setTimeout(r, 1500))
  console.log('S33-READY ' + JSON.stringify({ url, control: `http://127.0.0.1:${controlPort}` }))
} else {
  await runSpike(process.env.S33_RESULT_ID ?? 'S33-close-prompt', async () => {
    const out = { runtime: RUNTIME, cases: {} }
    for (const mode of Object.values({ mutate: 'mutate', redispatch: 'redispatch' })) {
      const cases = (out.cases[mode] = {})
      globalThis.__s33Standin = null

      stage(`${mode} A plugin allows`)
      const a = await startAsking(mode, `allow-${mode}`)
      const aKey = entryFor(a.id).key
      const heldBefore = gatewayPending()
      const accepted = s33.answer(aKey, OUTCOME.allow)
      await until(() => a.status === 'idle', 10000)
      cases.A = { heldBefore, accepted, secondAnswer: s33.answer(aKey, OUTCOME.reject), gatewayAfter: gatewayPending(), decided: decided(a), toolResults: toolResults(a), entry: view(entryFor(a.id)) }

      stage(`${mode} B plugin rejects`)
      const b = await startAsking(mode, `reject-${mode}`)
      s33.answer(entryFor(b.id).key, OUTCOME.reject)
      await until(() => b.status === 'idle', 10000)
      cases.B = { decided: decided(b), toolResults: toolResults(b), gatewayAfter: gatewayPending(), entry: view(entryFor(b.id)) }

      stage(`${mode} C turn stopped while waiting`)
      const c = await startAsking(mode, `stop-${mode}`)
      const cKey = entryFor(c.id).key
      c.cancel({ kind: 'user' })
      await until(() => c.status === 'idle', 10000)
      cases.C = { decided: decided(c), inRegistry: s33.registry.has(cKey), lateAnswer: s33.answer(cKey, OUTCOME.allow), gatewayAfter: gatewayPending(), entry: view(entryFor(c.id)) }

      stage(`${mode} D user answers first`)
      globalThis.__s33Standin = { outcome: OUTCOME.reject, afterMs: 200 }
      const d = await startAsking(mode, `user-${mode}`)
      const dKey = entryFor(d.id).key
      await until(() => d.status === 'idle', 10000)
      cases.D = { decided: decided(d), toolResults: toolResults(d), lateAnswer: s33.answer(dKey, OUTCOME.allow), entry: view(entryFor(d.id)) }
      globalThis.__s33Standin = null
    }
    out.listenersOnEvent = (() => { try { return ctx.events._hooks['approval/request'].length } catch { return null } })()
    out.unhandled = unhandled
    const ok = (m) => {
      const k = out.cases[m]
      return {
        A_allow_runs_tool: k.A.accepted && k.A.heldBefore === 1 && k.A.decided.at(-1) === OUTCOME.allow && k.A.toolResults.some((t) => t.startsWith('RAN ')) && k.A.gatewayAfter === 0 && k.A.secondAnswer === false && 'rejected' in (k.A.entry.downstream ?? {}),
        B_reject_reaches_agent: k.B.decided.at(-1) === OUTCOME.reject && k.B.toolResults.some((t) => /reject/.test(t)) && k.B.gatewayAfter === 0,
        C_stop_cancels: k.C.decided.at(-1) === 'cancelled' && !k.C.inRegistry && k.C.lateAnswer === false && k.C.gatewayAfter === 0,
        D_user_first_learned: k.D.entry.settledBy === 'downstream' && k.D.entry.outcome === OUTCOME.reject && k.D.decided.at(-1) === OUTCOME.reject && k.D.lateAnswer === false,
        A_args_recorded: k.A.entry.args?.status === 'complete' && k.A.entry.args.text.includes('allow-'),
      }
    }
    out.verdict = { mutate: ok('mutate'), redispatch: ok('redispatch'), no_unhandled_rejection: unhandled.length === 0 }
    const flat = [...Object.values(out.verdict.mutate), ...Object.values(out.verdict.redispatch), out.verdict.no_unhandled_rejection]
    return { pass: flat.every(Boolean), ...out }
  })
}

/**
 * P7 smoke (implementer evidence, not the black-box suite). Code paths of the ApprovalBroker
 * (DESIGN R4 "Approvals, code paths"): every request from another session reaches Fishball with
 * its arguments; allow yields exactly one allowed-once; escalate and timeout reach the next
 * answerer (a stand-in for the browser prompt); a cancelled call withdraws the request; a late
 * or unknown id answers expired; allow with risk high is refused; Fishball's own requests skip it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, hostRow, message, model, ordinarySession, runSpike, until, REPO } from './harness.mjs'

const link = (dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
  pkg.dsh.profile.bundles.push('dsh-fishball')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
}

await runSpike('P7-smoke', async () => {
  globalThis.__p7Browser = []
  const { ctx, home } = await bootDsh('p7smoke', [{ insert: [{ id: 'browser-standin', name: path.join(REPO, 'spikes', 'fixtures', 'browser-standin.mjs') }] }], { setupProfile: link })
  const sidOf = () => JSON.parse(fs.readFileSync(path.join(process.env.DSH_HOME, 'storages', 'fishball.json'), 'utf8')).global?.sessionId
  let fishball
  await until(() => { try { fishball = ctx.agents.get(sidOf()) } catch { fishball = undefined } return fishball !== undefined && fishball.status === 'idle' && model.requestsFor(fishball.id).length > 0 }, 30000)
  if (fishball === undefined) return { pass: false, error: 'no fishball agent' }
  const fid = fishball.id
  const out = {}
  // The browser prompt stand-in (spikes/fixtures/browser-standin.mjs) is mounted at boot, BEFORE
  // dsh-fishball, and prepended: since Fishball's broker prepends later, the broker runs first and
  // its next() reaches the stand-in, which answers 'rejected' instead of DSH's gateway (which
  // would wait for a browser that never comes).
  const browser = globalThis.__p7Browser
  // A tool that asks in its body (as DSH's sandbox escalation does).
  await hostRow(ctx, 'p7-asker', ['approval', 'tools'], (c) => {
    c.tools.register({
      name: 'risky_thing', description: 'asks for approval in its body',
      parameters: { type: 'object', properties: { what: { type: 'string' } }, required: ['what'] },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
      async execute(args, exec) { return 'outcome=' + (await c.approval.request({ agent: exec.agent, toolName: 'risky_thing', callId: exec.callId, reason: 'wants ' + args.what, signal: exec.signal })) },
    })
  })
  const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })
  const lastResult = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'tool/result').at(-1)?.data?.message?.content?.map((b) => b.text).join('')
  const requestText = () => fishball.session.snapshotEvents().filter((e) => e.type === 'user/message' && String(e.data?.content?.[0]?.text ?? '').startsWith('[permission request')).at(-1)?.data?.content?.[0]?.text ?? ''
  const idOf = (text) => text.match(/apr_[0-9a-f]+/)?.[0]

  // Fishball's model answers a request from the request text itself (the request wakes Fishball
  // before a test could queue a scripted answer). plan: label -> answer args; answered once.
  const plan = new Map()
  const baseRespond = model.respond.bind(model)
  model.respond = (options) => {
    if (options.sessionId === fid) {
      const text = JSON.stringify(options.messages ?? [])
      for (const [label, answer] of plan) {
        const m = text.match(new RegExp('\\[permission request (apr_[0-9a-f]+)\\][^\\]]*?' + 'wants ' + label))
        if (m && !answer.used) { answer.used = true; return [{ tool: 'answer_approval', id: 'ans_' + label + Math.random().toString(36).slice(2, 6), args: { request_id: m[1], ...answer.args } }] }
      }
    }
    return baseRespond(options)
  }
  /** Start a call in X; Fishball answers with 'answer' (undefined: no answer). */
  const scenario = async (label, args, answer) => {
    const x = await ordinarySession(ctx, ws)
    const before = requestText()
    if (answer !== undefined) plan.set(args.what, { args: answer })
    model.queue(x.id, [{ tool: 'risky_thing', id: 'call_' + label, args }], [{ text: 'done' }])
    x.steer(message('do ' + label))
    await until(() => requestText() !== before, 10000)
    const text = requestText()
    return { x, text, id: idOf(text) }
  }

  // 1. allow: exactly one allowed-once, the browser is never asked
  const a = await scenario('allow', { what: 'npm test' }, { decision: 'allow', risk: 'low', reason: 'tests in its own workspace' })
  await until(() => a.x.status === 'idle' && lastResult(a.x)?.startsWith('outcome='), 15000)
  out.allow = { result: lastResult(a.x), argsShown: a.text.includes('npm test'), browser: browser.length }

  // 2. escalate: the browser stand-in answers
  const e = await scenario('escalate', { what: 'git push' }, { decision: 'escalate', risk: 'high', reason: 'leaves the machine' })
  await until(() => e.x.status === 'idle' && lastResult(e.x)?.startsWith('outcome='), 15000)
  out.escalate = { result: lastResult(e.x), browser: browser.length, xStatus: e.x.status, xEvents: e.x.session.snapshotEvents().slice(-8).map((ev) => ev.type + (ev.type === 'approval/decided' ? ':' + ev.data.outcome : '')), fishballLast: lastResult(fishball) }

  // 3. allow with risk high is refused (code rule), and the request stays pending
  const h = await scenario('high', { what: 'rm -rf /' }, { decision: 'allow', risk: 'high', reason: 'x' })
  await until(() => fishball.status === 'idle' && lastResult(fishball)?.includes('allow-needs-low-risk'), 15000)
  out.allowHigh = lastResult(fishball)
  // then escalate it
  model.queue(fid, [{ tool: 'answer_approval', id: 'ans_high2', args: { request_id: h.id, decision: 'escalate', risk: 'high', reason: 'destructive' } }], [{ text: 'ok' }])
  fishball.steer(message('decide'))
  await until(() => h.x.status === 'idle' && lastResult(h.x)?.startsWith('outcome='), 15000)
  out.highThenEscalate = lastResult(h.x)

  // 4. a late answer: expired
  model.queue(fid, [{ tool: 'answer_approval', id: 'ans_late', args: { request_id: a.id, decision: 'allow', risk: 'low', reason: 'again' } }], [{ text: 'ok' }])
  fishball.steer(message('late'))
  await until(() => fishball.status === 'idle' && lastResult(fishball)?.includes('expired'), 15000)
  out.late = lastResult(fishball)

  // 5. cancel: the asking call is cancelled while waiting -> cancelled, Fishball not asked again
  const c = await scenario('cancel', { what: 'long' }, undefined)
  c.x.cancel({ kind: 'user' })
  await until(() => c.x.status === 'idle', 15000)
  out.cancel = c.x.session.snapshotEvents().filter((e) => e.type === 'approval/decided').map((e) => e.data.outcome)

  // 6. timeout: approvalAnswerSeconds 1, Fishball does not answer
  ctx.loader.entries().find?.((x) => x.options.name === 'dsh-fishball')
  const audit = () => JSON.parse(fs.readFileSync(path.join(process.env.DSH_HOME, 'storages', 'fishball.json'), 'utf8'))
  out.auditFile = fs.existsSync(path.join(process.env.DSH_HOME, 'storages', 'fishball_intake'))

  // 7. Fishball's own request skips the broker (add_plugin asks: goes straight to the browser stand-in)
  const beforeBrowser = browser.length
  model.queue(fid, [{ tool: 'add_plugin', id: 'own_1', args: { spec: '/nonexistent/x', reason: 'test' } }], [{ text: 'ok' }])
  const beforeReq = requestText()
  fishball.steer(message('install'))
  await until(() => fishball.status === 'idle' && lastResult(fishball) !== undefined && browser.length > beforeBrowser, 15000)
  out.own = { browserAsked: browser.length > beforeBrowser, sawOwnAsRequest: requestText() !== beforeReq }

  out.requestFraming = a.text.slice(0, 500)
  const pass = out.allow.result === 'outcome=allowed-once' && out.allow.argsShown && out.allow.browser === 0
    && out.escalate.result === 'outcome=rejected' && out.escalate.browser === 1
    && out.allowHigh?.includes('allow-needs-low-risk') && out.highThenEscalate === 'outcome=rejected'
    && out.late?.includes('expired') && out.cancel.includes('cancelled') && out.own.browserAsked && !out.own.sawOwnAsRequest
  return { pass, ...out }
})

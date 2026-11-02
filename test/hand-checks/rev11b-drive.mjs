/**
 * Hand-check driver for rev11b (the test session's own script, not part of the suite).
 * Boots a real DSH (the suite's worker: real host, this checkout's plugin, fake model, a scripted
 * stand-in for the stock prompt) and plays the ten cases from the hand-off notes, printing what the
 * agent, Fishball and the stores actually showed. Fishball's answers are real answer_approval calls.
 * Run: /opt/homebrew/bin/node test/hand-checks/rev11b-drive.mjs [ptc]
 */
import { API, APPROVER_AFTER_ENV, ASK_FISHBALL, OUTCOME, OWN_PLUGINS, STATUS, DECISIONS_TABLE, REQUEST_PLACEHOLDER } from '../support/constants.mjs'
import {
  askStep, callStep, auditOf, fishballCall, jsonOf, managedSession, requestMessages, resultById, resultOfCall, roundsOf, settledIdle, setManaged,
  stockSeen, storedRows, turn, waitRequest, step, untrustedBlock,
} from '../support/expect.mjs'
import { bootHost, newHome, sleep, until } from '../support/host.mjs'

const mode = process.argv[2] ?? 'main'
const out = []
const note = (k, v) => { out.push([k, v]); console.log('## ' + k + '\n' + (typeof v === 'string' ? v : JSON.stringify(v, null, 1) ?? 'undefined').slice(0, 2500) + '\n') }
let seq = 0
const tok = (l) => 'HC' + l + 'x' + (++seq) + Math.random().toString(36).slice(2, 6)

const home = newHome('rev11b-hand-' + mode)
const host = await bootHost(home, { env: { ...APPROVER_AFTER_ENV, ...(mode === 'ptc' ? { DSH_TOOLS_MODE: 'ptc' } : {}) } })
const fb = (await host.waitStatus(STATUS.live))?.sessionId
await settledIdle(host, fb)
await host.call('setApprover', { outcome: OUTCOME.reject })
note('home', home)

const answer = async (requestId, args) => {
  await settledIdle(host, fb)
  const { json, result } = await fishballCall(host, fb, 'answer_approval', { request_id: requestId, ...args })
  return json ?? result?.text
}
const setLimit = async (patch) => (await host.call('settingsUpdate', { patch })).ok
const start = (sid, script, text = 'please go') => host.call('driveStart', { sessionId: sid, script, text })
async function waiting(sid, text, steps, userText, count = 1) {
  await settledIdle(host, sid)
  await start(sid, [...steps, [{ text: 'done' }]], userText)
  await until(async () => (await requestMessages(host, fb, text)).length >= count, 10000, 50)
  const m = (await requestMessages(host, fb, text)).at(-1)
  const req = m && { ...m, id: /^\[permission request (apr_[0-9a-f]+)\]/.exec(m.text)?.[1], block: untrustedBlock(m.text) }
  await settledIdle(host, fb)
  return req
}
const res = async (sid, id, t = 15000) => (await resultOfCall(host, sid, id, t))
const ask = (args, why = 'because') => ({ tool: 'fbtest_ask', arguments: args, quote: [], why })
const show = (req) => req && { id: req.id, header: req.block?.header?.slice(0, 200), fields: req.block?.fields }

try {
  if (mode === 'ptc') {
    const x = await managedSession(host, fb, 'x')
    const code = (a) => 'try { return await tools.fbtest_ask(' + JSON.stringify(a) + ') } catch (e) { return "THREW: " + e.message }'
    for (const [label, plan] of [['allow', { decision: 'allow', risk: 'low', reason: 'fine' }], ['reject', { decision: 'reject', risk: 'high', reason: 'outside workspace' }], ['ask', { decision: 'ask', risk: 'high', reason: 'unclear', question: 'what for?' }]]) {
      const text = tok('ptc' + label)
      await host.call('planApproval', { sessionId: fb, needle: text, args: plan })
      await settledIdle(host, x)
      const id = 'call_' + tok('r')
      const r = await turn(host, x, [step('run_code', { code: code({ text }), description: 'hand' }, id), [{ text: 'done' }]])
      const last = r.requests.at(-1).last
      note('4 inside run_code: ' + label, { result: resultById(r, id)?.text, nextRequest: last.map((m) => [m.role, m.source, m.text.slice(0, 260)]) })
    }
  } else if (mode === 'off') {
    const x = await managedSession(host, fb, 'x')
    const togglePerm = async (on) => { await host.post(API.plugins, { plugin: OWN_PLUGINS.approvals.key, on }); await until(async () => (await host.state()).features?.approvals === on, 10000, 100) }
    const t1 = tok('offa')
    await waiting(x, t1, [askStep(ask({ text: t1 }), 'call_a'), callStep({ text: t1 }, 'call_a_run')], 'ask then off')
    await togglePerm(false)
    note('7 ask waiting, Permission requests turned off', { ask: (await res(x, 'call_a'))?.text, thenCall: (await res(x, 'call_a_run'))?.text, stock: (await stockSeen(host, t1)).length })
    await host.call('waitIdle', { sessionId: x }); await togglePerm(true); await settledIdle(host, fb)
    const t2 = tok('offd')
    await waiting(x, t2, [callStep({ text: t2 }, 'call_d')], 'direct then off')
    await togglePerm(false)
    note('7 direct waiting, Permission requests turned off', { result: (await res(x, 'call_d'))?.text, stock: (await stockSeen(host, t2)).length })
    await host.call('waitIdle', { sessionId: x }); await togglePerm(true); await settledIdle(host, fb)
    // Fishball stopped
    const t3 = tok('arch')
    await waiting(x, t3, [askStep(ask({ text: t3 }), 'call_s'), callStep({ text: t3 }, 'call_s_run')], 'ask then archive')
    note('7 archive Fishball', (await host.call('archive', { sessionId: fb, stopActivity: true })).ok)
    note('7 ask waiting, Fishball stopped', { ask: (await res(x, 'call_s'))?.text, thenCall: (await res(x, 'call_s_run'))?.text, stock: (await stockSeen(host, t3)).length })
    await host.call('waitIdle', { sessionId: x })
    const t4 = tok('arch2')
    const t0 = Date.now()
    const r4 = await turn(host, x, [askStep(ask({ text: t4 }), 'call_s2'), [{ text: 'done' }]], 'ask while stopped')
    note('7 ask while Fishball stopped', { text: resultById(r4, 'call_s2')?.text, ms: Date.now() - t0 })
    const t5 = tok('arch3')
    const r5 = await turn(host, x, [callStep({ text: t5 }, 'call_s3'), [{ text: 'done' }]], 'direct while stopped')
    note('7 direct while Fishball stopped', { text: resultById(r5, 'call_s3')?.text, stock: (await stockSeen(host, t5)).length })
    await host.call('unarchive', { sessionId: fb }); await host.post(API.recovery, { action: 'retry' }); await host.waitStatus(STATUS.live); await settledIdle(host, fb)
    const t6 = tok('back')
    const reqB = await waiting(x, t6, [askStep(ask({ text: t6 }), 'call_b')], 'back live')
    note('7 Fishball live again: request reaches it', !!reqB)
    await answer(reqB.id, { decision: 'allow', risk: 'low', reason: 'ok' })
  } else {
    const x = await managedSession(host, fb, 'x')
    const mine = (await host.call('ordinary', { preset: 'fbtest-bare', folder: 'mine' })).sessionId
    await turn(host, mine, [[{ text: 'hello' }]], 'my own session')
    const sandbox = await host.call('inspect', { sessionId: mine })
    const toolsMine = (await turn(host, mine, [[{ text: 'again' }]])).requests.at(-1)
    const toolsX = (await turn(host, x, [[{ text: 'again' }]], 'more words')).requests.at(-1)
    note('0 tools offered: user-owned vs managed', { mine: toolsMine.tools.map((t) => t.name).filter((n) => /fishball|user_messages/.test(n)), managed: toolsX.tools.map((t) => t.name).filter((n) => /fishball|user_messages/.test(n)) })
    // user-owned session raising a request: Fishball must see nothing.
    const t0 = tok('own')
    const before = (await requestMessages(host, fb, t0)).length
    await host.call('setApprover', { outcome: OUTCOME.allow })
    const rOwn = await turn(host, mine, [callStep({ text: t0 }, 'call_own'), [{ text: 'done' }]], 'own call')
    await host.call('setApprover', { outcome: OUTCOME.reject })
    note('0 own session request', { result: resultById(rOwn, 'call_own')?.text, fishballNotices: (await requestMessages(host, fb, t0)).length - before, stockSaw: (await stockSeen(host, t0)).length })

    // ---- case 1
    for (const w of ['second thing I said', 'third thing: QUOTE-ME is the one that matters ' + 'p'.repeat(40)]) await turn(host, x, [[{ text: 'ok' }]], w)
    const log = await host.call('userMessageLog', { sessionId: x })
    note('1 user message log of x (id, kind)', log.map((m) => [m.id, m.kind, m.text.slice(0, 60)]))
    const l1 = await turn(host, x, [step('list_user_messages', {}, 'call_list1'), [{ text: 'done' }]])
    note('1 list_user_messages (default limits)', resultById(l1, 'call_list1')?.text)
    const userMsgs = log.filter((m) => m.kind === 'user')
    const quoteId = userMsgs.at(-1).id
    const tq = tok('quote')
    const req1 = await waiting(x, tq, [askStep(ask({ text: tq }), 'call_q')], 'do the quoted thing')
    // the quote needs the id in args; redo with the id
    note('1 escalate answer', await answer(req1.id, { decision: 'escalate', risk: 'high', reason: 'user decides' }))
    note('1 first ask result', (await res(x, 'call_q'))?.text)
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, x)
    const tq2 = tok('quote2')
    const reqQ = await waiting(x, tq2, [askStep({ ...ask({ text: tq2 }), quote: [quoteId] }, 'call_q2')], 'do the quoted thing again')
    note('1 notice with quote', show(reqQ) ?? { missing: true, result: (await res(x, 'call_q2', 3000))?.text, quoteId, xStatus: await host.call('agentStatus', { sessionId: x }), pending: (await host.state()).approvals, fbReqs: (await requestMessages(host, fb, '')).map((m) => m.text.slice(0, 2500)) })
    await answer(reqQ.id, { decision: 'escalate', risk: 'high', reason: 'user decides' })
    note('1 quoted ask result (escalate -> to-user)', (await res(x, 'call_q2'))?.text)
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, x)
    // a non-user message id: the Fishball notice/relay in x's log
    const logNow = await host.call('userMessageLog', { sessionId: x })
    const notUser = logNow.find((m) => m.kind !== 'user')
    note('1 non-user entries in x log', logNow.filter((m) => m.kind !== 'user').map((m) => [m.id, m.kind, m.text.slice(0, 80)]))
    const tn = tok('notuser')
    const fbBefore = (await requestMessages(host, fb, tn)).length
    await settledIdle(host, x)
    const rn = await turn(host, x, [askStep({ ...ask({ text: tn }), quote: [notUser?.id ?? 'msg_bogus'] }, 'call_nu'), [{ text: 'done' }]], 'quote a non-user message')
    note('1 not-user-message', { result: resultById(rn, 'call_nu')?.text, fishballNoticesAdded: (await requestMessages(host, fb, tn)).length - fbBefore, usedKind: notUser?.kind })
    // limits live
    note('1 set limits', await setLimit({ userMessagesListed: 2, userMessageExcerptChars: 5 }))
    const l2 = await turn(host, x, [step('list_user_messages', {}, 'call_list2'), [{ text: 'done' }]])
    note('1 list after limits 2/5 (no restart)', resultById(l2, 'call_list2')?.text)
    await setLimit({ userMessagesListed: 20, userMessageExcerptChars: 1000 })

    // ---- case 2
    const ta = tok('allow')
    const reqA = await waiting(x, ta, [askStep(ask({ text: ta }), 'call_a'), callStep({ text: ta }, 'call_a_run')], 'allow flow')
    note('2 allow: answer', await answer(reqA.id, { decision: 'allow', risk: 'low', reason: 'safe enough' }))
    note('2 allow: ask result', (await res(x, 'call_a'))?.text)
    note('2 allow: identical call then', { result: (await res(x, 'call_a_run'))?.text, stockPrompts: (await stockSeen(host, ta)).length, notices: (await requestMessages(host, fb, ta)).length })
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)
    note('2 allow audit', auditOf(home, reqA.id))

    const tr = tok('rej')
    const reqR = await waiting(x, tr, [askStep(ask({ text: tr }), 'call_r')], 'reject flow')
    note('2 reject without reason', await answer(reqR.id, { decision: 'reject', risk: 'high', reason: '' }))
    note('2 reject: pending still', (await host.state()).approvals.pending.map((p) => p.id).includes(reqR.id))
    note('2 reject with reason', await answer(reqR.id, { decision: 'reject', risk: 'high', reason: 'deletes things' }))
    note('2 reject result', (await res(x, 'call_r'))?.text)
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)

    // ask: 3+ rounds
    const tk = tok('ask')
    const reqK = await waiting(x, tk, [askStep(ask({ text: tk }), 'call_k0'), askStep({ request_id: REQUEST_PLACEHOLDER, reply: 'reply one' }, 'call_k1'), askStep({ request_id: REQUEST_PLACEHOLDER, reply: 'reply two' }, 'call_k2'), askStep({ request_id: REQUEST_PLACEHOLDER, reply: 'reply three' }, 'call_k3'), callStep({ text: tk }, 'call_k_run')], 'ask flow')
    const rounds = []
    for (let i = 1; i <= 4; i++) {
      const a = await answer(reqK.id, i < 4 ? { decision: 'ask', risk: 'high', reason: 'need more', question: 'question ' + i } : { decision: 'allow', risk: 'low', reason: 'ok now' })
      rounds.push({ fishballAnswer: a?.decision ?? a, agentSaw: (await res(x, 'call_k' + (i - 1)))?.text })
      await until(async () => (await roundsOf(host, fb, reqK.id)).length >= i + 1 || i === 4, 8000, 100)
      await settledIdle(host, fb)
    }
    note('2 ask rounds', rounds)
    note('2 ask: thread on last round', (await roundsOf(host, fb, reqK.id)).map((m) => ({ thread: m.block?.fields?.thread })).slice(-1))
    note('2 ask: final call', { result: (await res(x, 'call_k_run'))?.text, stock: (await stockSeen(host, tk)).length })
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)

    // escalate
    const te = tok('esc')
    const reqE = await waiting(x, te, [askStep(ask({ text: te }), 'call_e'), callStep({ text: te }, 'call_e_run')], 'escalate flow')
    const nBefore = (await requestMessages(host, fb, te)).length
    await host.call('setApprover', { outcome: OUTCOME.allow })
    await answer(reqE.id, { decision: 'escalate', risk: 'high', reason: 'user decides' })
    note('2 escalate: ask result', (await res(x, 'call_e'))?.text)
    note('2 escalate: stock prompt result', (await res(x, 'call_e_run'))?.text)
    await host.call('setApprover', { outcome: OUTCOME.reject })
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)
    note('2 escalate: stock prompts / new notices', { stock: (await stockSeen(host, te)).length, newNotices: (await requestMessages(host, fb, te)).length - nBefore })
    // case 10 (part): click on stock prompt after escalate -> decisions row
    note('10 decisions rows for escalate request', storedRows(home, DECISIONS_TABLE).filter((d) => d.target === reqE.id))

    // ---- case 3 pass / changed arg / unused pass
    const tp = tok('pass')
    const reqP = await waiting(x, tp, [askStep(ask({ text: tp }), 'call_p'), callStep({ text: tp + '-CHANGED' }, 'call_p_other')], 'pass flow')
    await answer(reqP.id, { decision: 'allow', risk: 'low', reason: 'ok' })
    const changed = await waitRequest(host, fb, tp + '-CHANGED', 8000)
    note('3 changed argument went to Fishball as', { header: changed?.block?.header?.slice(0, 160), kind: changed?.block?.fields?.kind })
    if (changed) await answer(changed.id, { decision: 'reject', risk: 'high', reason: 'different call' })
    note('3 changed arg result', (await res(x, 'call_p_other'))?.text)
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)
    // unused pass: allow then no call; next turn same call
    const tu = tok('unused')
    const reqU = await waiting(x, tu, [askStep(ask({ text: tu }), 'call_u')], 'unused pass')
    await answer(reqU.id, { decision: 'allow', risk: 'low', reason: 'ok' })
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)
    await sleep(50)
    const reqU2 = await waiting(x, tu, [callStep({ text: tu }, 'call_u_next')], 'next turn same call', 2)
    note('3 unused pass: next turn reached Fishball again', { notices: (await requestMessages(host, fb, tu)).length, firstId: reqU.id, secondId: reqU2?.id })
    await answer(reqU2.id, { decision: 'reject', risk: 'high', reason: 'no pass' })
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)

    // ---- case 4 direct call with hint
    const td = tok('direct')
    const reqD = await waiting(x, td, [callStep({ text: td }, 'call_d')], 'the user turn text for direct')
    note('4 direct notice', show(reqD))
    await answer(reqD.id, { decision: 'allow', risk: 'low', reason: 'fine' })
    note('4 direct allowed result', (await res(x, 'call_d'))?.text)
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)
    // ---- case 5 retry after reject
    const t5 = tok('retry')
    const req5 = await waiting(x, t5, [callStep({ text: t5 }, 'call_5a'), callStep({ text: t5 }, 'call_5b')], 'retry flow')
    await answer(req5.id, { decision: 'reject', risk: 'high', reason: 'not now' })
    note('5 first result', (await res(x, 'call_5a'))?.text)
    const req5b = await until(async () => (await requestMessages(host, fb, t5)).length >= 2, 8000, 100) && (await requestMessages(host, fb, t5)).at(-1)
    note('5 identical retry reached Fishball again', { notices: (await requestMessages(host, fb, t5)).length, ids: (await requestMessages(host, fb, t5)).map((m) => /apr_[0-9a-f]+/.exec(m.text)?.[0]) })
    await settledIdle(host, fb)
    const id5b = /apr_[0-9a-f]+/.exec(req5b.text)?.[0]
    await answer(id5b, { decision: 'reject', risk: 'high', reason: 'still no' })
    note('5 second result', (await res(x, 'call_5b'))?.text)
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)

    // ---- case 6 direct ask then continued
    const t6 = tok('dask')
    const req6 = await waiting(x, t6, [callStep({ text: t6 }, 'call_6a'), askStep({ request_id: REQUEST_PLACEHOLDER, reply: 'it is for the build' }, 'call_6b'), callStep({ text: t6 }, 'call_6c')], 'direct ask flow')
    await answer(req6.id, { decision: 'ask', risk: 'high', reason: 'unclear', question: 'what is this for?' })
    note('6 direct call answered with ask', { isError: (await res(x, 'call_6a'))?.isError, text: (await res(x, 'call_6a'))?.text })
    await until(async () => (await roundsOf(host, fb, req6.id)).length >= 2, 8000, 100); await settledIdle(host, fb)
    note('6 reply round', (await roundsOf(host, fb, req6.id)).at(-1)?.block?.fields?.thread)
    await answer(req6.id, { decision: 'allow', risk: 'low', reason: 'good reason' })
    note('6 reply result', (await res(x, 'call_6b'))?.text)
    note('6 identical call then', { text: (await res(x, 'call_6c'))?.text, stock: (await stockSeen(host, t6)).length })
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)

    // ---- case 7 unavailable / timeout
    const t7 = tok('timeout')
    await setLimit({ approvalAnswerSeconds: 5 })
    const t0s = Date.now()
    await settledIdle(host, x)
    await start(x, [askStep(ask({ text: t7 }), 'call_7a'), callStep({ text: t7 }, 'call_7a_run'), [{ text: 'done' }]], 'slow flow')
    note('7 timeout ask result', { text: (await res(x, 'call_7a', 20000))?.text, seconds: (Date.now() - t0s) / 1000 })
    await host.call('setApprover', { outcome: OUTCOME.reject })
    note('7 then stock prompt', (await res(x, 'call_7a_run', 10000))?.text)
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)
    const t7d = tok('timeoutd')
    const t1 = Date.now()
    await start(x, [callStep({ text: t7d }, 'call_7d'), [{ text: 'done' }]], 'slow direct')
    note('7 timeout direct: stock prompt result', { text: (await res(x, 'call_7d', 20000))?.text, seconds: (Date.now() - t1) / 1000, stock: (await stockSeen(host, t7d)).length })
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)
    await setLimit({ approvalAnswerSeconds: 120 })
    // Permission requests off
    await host.post(API.plugins, { plugin: OWN_PLUGINS.approvals.key, on: false })
    await until(async () => (await host.state()).features?.approvals === false, 10000, 100)
    const t7o = tok('off')
    const tOff0 = Date.now()
    const rOff = await turn(host, x, [askStep(ask({ text: t7o }), 'call_7o'), [{ text: 'done' }]], 'permission requests off')
    note('7 Permission requests off: ask_fishball', { text: resultById(rOff, 'call_7o')?.text, ms: Date.now() - tOff0 })
    const t7o2 = tok('off2')
    const rOff2 = await turn(host, x, [callStep({ text: t7o2 }, 'call_7o2'), [{ text: 'done' }]], 'direct while off')
    note('7 off: direct call', { text: resultById(rOff2, 'call_7o2')?.text, stock: (await stockSeen(host, t7o2)).length, fishballNotices: (await requestMessages(host, fb, t7o2)).length })
    await host.post(API.plugins, { plugin: OWN_PLUGINS.approvals.key, on: true })
    await until(async () => (await host.state()).features?.approvals === true, 10000, 100)
    await settledIdle(host, fb)

    // ---- case 8 take back while waiting
    const z = await managedSession(host, fb, 'z')
    const t8 = tok('takeback')
    const req8 = await waiting(z, t8, [askStep(ask({ text: t8 }), 'call_8')], 'take back flow')
    note('8 setManaged false', (await setManaged(host, z, false)).status)
    note('8 result', (await res(z, 'call_8'))?.text)
    await host.call('waitIdle', { sessionId: z }); await settledIdle(host, fb)
    note('8 audit', auditOf(home, req8.id).map((r) => r.answer))

    // ---- case 9 too-large
    await setLimit({ maxMessageBytes: 2000 })
    const t9 = tok('big')
    const big = 'B'.repeat(2500)
    const r9a = await turn(host, x, [[{ text: 'ok' }]], big)
    const log9 = (await host.call('userMessageLog', { sessionId: x })).filter((m) => m.kind === 'user')
    const bigId = log9.find((m) => m.text === big)?.id
    const before9 = (await requestMessages(host, fb, t9)).length
    const t90 = Date.now()
    const r9 = await turn(host, x, [askStep({ ...ask({ text: t9 }), quote: [bigId] }, 'call_9'), [{ text: 'done' }]], 'quote the big one')
    note('9 too-large', { text: resultById(r9, 'call_9')?.text, ms: Date.now() - t90, noticeAdded: (await requestMessages(host, fb, t9)).length - before9 })
    await setLimit({ maxMessageBytes: 65536 })

    // ---- case 10: clicks on the stock prompt after escalate / timeout
    const t10 = tok('click')
    const req10 = await waiting(x, t10, [askStep(ask({ text: t10 }), 'call_10'), callStep({ text: t10 }, 'call_10_run')], 'clicks flow')
    // the scripted stock prompt stands in for the user's click: allow-once
    await host.call('setApprover', { outcome: OUTCOME.allow })
    await answer(req10.id, { decision: 'escalate', risk: 'high', reason: 'user decides' })
    await res(x, 'call_10')
    await res(x, 'call_10_run')
    await host.call('setApprover', { outcome: OUTCOME.reject })
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)
    note('10 allow-once click: decisions', storedRows(home, DECISIONS_TABLE).filter((d) => d.target === req10.id))
    const t10b = tok('clickr')
    const req10b = await waiting(x, t10b, [askStep(ask({ text: t10b }), 'call_10b'), callStep({ text: t10b }, 'call_10b_run')], 'reject click flow')
    await answer(req10b.id, { decision: 'escalate', risk: 'high', reason: 'user decides' })
    await res(x, 'call_10b'); await res(x, 'call_10b_run')
    await host.call('waitIdle', { sessionId: x }); await settledIdle(host, fb)
    note('10 reject click: decisions', storedRows(home, DECISIONS_TABLE).filter((d) => d.target === req10b.id))
  }
} catch (e) {
  note('DRIVER ERROR', String(e?.stack ?? e))
} finally {
  await host.stop?.()
  process.exit(0)
}

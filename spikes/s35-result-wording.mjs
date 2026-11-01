/**
 * S35 (revision 11, spec spikes C and D): what the agent sees after the plugin answers an approval.
 *
 * Q1 managed session, direct call, Fishball allows / rejects: can the result carry an ask_fishball hint?
 * Q2 Fishball's own call that needs approval: can it return at once with "waiting for your approval
 *    (card <id>)" instead of DSH's "the user rejected tool X"? For Fishball's own body-asking tool
 *    (add_plugin) and for another plugin's tools (pre-execute `ask`, and a body that asks).
 * Q3 after Allow, is an identical retry (new call id) approved by a one-time pass, and a different call not?
 *
 * Fixture: spikes/fixtures/s35-broker.mjs. Run: spikes/run.sh spikes/s35-result-wording.mjs
 * (DSH_RUNTIME_ROOT=<0.2.1-rc.3>/node_modules S35_ID=S35-result-wording-rc3 for the other host).
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, drive, eventTypes, hostRow, message, model, ordinarySession, runSpike, stage, RUNTIME } from './harness.mjs'
import { S35, mountS35Broker, registerS35Tools } from './fixtures/s35-broker.mjs'

const ID = process.env.S35_ID ?? 'S35-result-wording'
const MANAGED_ALLOW = 'allow-me'
const MANAGED_REASON = 'deleting files outside the workspace is high risk'
const { tools: T } = S35

/** The text the session log records for one call's result. */
const resultText = (agent, callId) => agent.session.snapshotEvents()
  .filter((e) => e.type === 'tool/result' && JSON.stringify(e.data).includes(callId))
  .map((e) => e.data.message.content.map((b) => b.text ?? '').join(''))
  .at(-1)

/** What the model was sent for one call id, in the next request (the agent-visible text), plus any extra context messages after it. */
function modelSaw(sessionId, callId) {
  for (const req of model.requestsFor(sessionId)) {
    const i = req.messages.findIndex((m) => JSON.stringify(m).includes(callId) && m.role !== 'assistant')
    if (i < 0) continue
    const m = req.messages[i]
    return { role: m.role, text: m.content.map((b) => b.text ?? b.content?.map?.((x) => x.text).join('') ?? '').join(''), isError: m.isError ?? m.content.find((b) => 'isError' in b)?.isError, raw: JSON.stringify(m).slice(0, 600) }
  }
  return undefined
}

/** One scripted turn: the agent calls `tool` with `args` under `callId`, then says 'ok'. */
async function callIn(agent, tool, args, callId, prompt = 'go') {
  model.queue(agent.id, [{ tool, id: callId, args }], [{ text: 'ok' }])
  const t0 = Date.now()
  await drive(agent, prompt)
  return { callId, ms: Date.now() - t0, status: agent.status, log: resultText(agent, callId), model: modelSaw(agent.id, callId) }
}

await runSpike(ID, async () => {
  const { ctx, home } = await bootDsh('s35')
  const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })
  const out = { runtimeRoot: RUNTIME, Q1: {}, Q2: {}, Q3: {} }
  let fishball
  let variantB = false
  stage('rows')
  let broker
  await hostRow(ctx, 'fishball-s35-broker', ['approval', 'tools'], (c) => {
    broker = mountS35Broker(c, {
      fishballId: () => fishball?.id,
      decideManaged: (_req, args) => (args?.spec === MANAGED_ALLOW ? { decision: 'allow' } : { decision: 'reject', reason: MANAGED_REASON }),
      variantB: () => variantB,
    })
  })
  await hostRow(ctx, 'other-plugin-s35', ['approval', 'tools'], (c) => registerS35Tools(c, broker))

  const managed = await ordinarySession(ctx, ws)
  fishball = await ordinarySession(ctx, ws) // stand-in for Fishball's session: the broker treats it as Fishball

  stage('Q1 managed session, direct calls')
  out.Q1.allowGated = await callIn(managed, T.gated, { spec: MANAGED_ALLOW }, 'call_m_allow')
  out.Q1.rejectGated = await callIn(managed, T.gated, { spec: 'rm -rf ~/x' }, 'call_m_reject')
  out.Q1.rejectBodyAsk = await callIn(managed, T.bodyAsk, { spec: 'rm -rf ~/x' }, 'call_m_reject_body')

  stage('Q2 Fishball own tool (body asks)')
  out.Q2.addPlugin = await callIn(fishball, T.add, { spec: 'pkg-a' }, 'call_f_add_1')
  out.Q2.addPlugin.cardsPending = [...broker.cards].filter(([, k]) => k.state === 'pending').map(([id]) => id)
  out.Q2.keepsHandling = await (async () => { model.queue(fishball.id, [{ text: 'answered another message' }]); const t0 = Date.now(); await drive(fishball, 'another message'); return { ms: Date.now() - t0, status: fishball.status, cardStillPending: broker.cards.get('card_1')?.state === 'pending' } })()

  stage('Q2 another plugin, pre-execute ask (service + post-execute rewrite)')
  out.Q2.gated = await callIn(fishball, T.gated, { spec: 'x', flag: true }, 'call_f_gated_1')
  stage('Q2 another plugin, pre-execute ask (variant B: pre-execute deny)')
  variantB = true
  out.Q2.gatedVariantB = await callIn(fishball, T.gated, { spec: 'y' }, 'call_f_gated_b1')
  variantB = false
  out.Q2.gatedVariantB.approvalAudited = fishball.session.snapshotEvents().some((e) => e.type === 'approval/asked' && JSON.stringify(e.data).includes('call_f_gated_b1'))
  out.Q2.gated.approvalAudited = fishball.session.snapshotEvents().filter((e) => e.type.startsWith('approval/') && JSON.stringify(e.data).includes('call_f_gated_1')).map((e) => [e.type, e.data.outcome].filter(Boolean).join(':'))
  stage('Q2 another plugin, body asks')
  out.Q2.bodyAsk = await callIn(fishball, T.bodyAsk, { spec: 'z' }, 'call_f_body_1')
  out.dshRawTexts = broker.seenRaw

  stage('Q3 Allow -> identical retry under a one-time pass')
  const cardOf = (callId) => [...broker.cards].find(([, k]) => k.callId === callId)?.[0]
  const addCard = cardOf('call_f_add_1')
  broker.allow(addCard)
  out.Q3.wakeText = S35.text.approvedWake(addCard, T.add)
  out.Q3.retryIdentical = await callIn(fishball, T.add, { spec: 'pkg-a' }, 'call_f_add_retry', out.Q3.wakeText)
  out.Q3.retryDifferent = await callIn(fishball, T.add, { spec: 'pkg-b' }, 'call_f_add_other')
  out.Q3.retryIdenticalAgain = await callIn(fishball, T.add, { spec: 'pkg-a' }, 'call_f_add_again')

  const gatedCard = cardOf('call_f_gated_1')
  broker.allow(gatedCard)
  out.Q3.gatedDifferent = await callIn(fishball, T.gated, { spec: 'x', flag: false }, 'call_f_gated_diff', S35.text.approvedWake(gatedCard, T.gated))
  out.Q3.gatedReordered = await callIn(fishball, T.gated, { flag: true, spec: 'x' }, 'call_f_gated_retry')
  broker.allow(cardOf('call_f_body_1'))
  out.Q3.bodyAskRetry = await callIn(fishball, T.bodyAsk, { spec: 'z' }, 'call_f_body_retry')
  out.Q3.cards = Object.fromEntries([...broker.cards].map(([id, k]) => [id, { tool: k.tool, args: k.args, state: k.state, session: k.sessionId === fishball.id ? 'fishball' : 'managed' }]))
  out.fishballEvents = eventTypes(fishball.session).filter((t) => t.startsWith('approval/') || t === 'turn/end').length

  const has = (s, sub) => typeof s === 'string' && s.includes(sub)
  const waitingFor = (r) => has(r.model?.text, 'Waiting for your approval (card ')
  out.verdict = {
    Q1_allow_hint: has(out.Q1.allowGated.model?.text, 'gated ran with') && has(out.Q1.allowGated.model?.text, S35.text.hint),
    Q1_reject_reason_hint: has(out.Q1.rejectGated.model?.text, MANAGED_REASON) && has(out.Q1.rejectGated.model?.text, S35.text.hint) && !has(out.Q1.rejectGated.model?.text, 'the user rejected'),
    Q1_reject_body_ask: has(out.Q1.rejectBodyAsk.model?.text, MANAGED_REASON) && !has(out.Q1.rejectBodyAsk.model?.text, 'approval rejected'),
    Q2_add_plugin_waiting: waitingFor(out.Q2.addPlugin) && out.Q2.addPlugin.status === 'idle' && out.Q2.addPlugin.cardsPending.length === 1,
    Q2_keeps_handling: out.Q2.keepsHandling.status === 'idle' && out.Q2.keepsHandling.cardStillPending,
    Q2_gated_waiting: waitingFor(out.Q2.gated) && !has(out.Q2.gated.model?.text, 'the user rejected'),
    Q2_gated_variantB: waitingFor(out.Q2.gatedVariantB) && !out.Q2.gatedVariantB.approvalAudited,
    Q2_body_ask_waiting: waitingFor(out.Q2.bodyAsk),
    Q3_identical_retry_runs: has(out.Q3.retryIdentical.model?.text, 'installed pkg-a'),
    Q3_different_call_not: waitingFor(out.Q3.retryDifferent),
    Q3_pass_one_time: waitingFor(out.Q3.retryIdenticalAgain),
    Q3_gated_different_not: waitingFor(out.Q3.gatedDifferent),
    Q3_gated_key_order: has(out.Q3.gatedReordered.model?.text, 'gated ran with x'),
    Q3_body_ask_retry_runs: has(out.Q3.bodyAskRetry.model?.text, 'body-ask ran with z'),
  }
  return { pass: Object.values(out.verdict).every(Boolean), ...out }
})

/**
 * S36-attachWait (DESIGN.md §7a.10, rev11g's first step): can the question router hold a timed
 * `ask_user_question` foreground wait with `ctx.userQuestions.attachWait` past the tool's own
 * timeout, through Fishball's answer time (`approvalAnswerSeconds`), and on after the question
 * moves to the pile, so that the answer resumes the same turn? And what do Stop and a released
 * hold leave behind?
 *
 * Real DSH 0.2.1-rc.2 with the fake model; the session's card is spikes/fixtures/gateway-browser.mjs
 * on DSH's real gateway, which copies the real card's claim and countdown
 * (dsh-client-ui-user-questions `answerQuestion` + `PendingQuestion.timeout`).
 *
 *   SPIKE_STDIN_SECONDS=200 SPIKE_DEADLINE_MS=180000 spikes/run.sh spikes/s36-attachwait.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { bootDsh, hostRow, message, model, ordinarySession, runSpike, sleep, stage, until } from './harness.mjs'
import { QuestionRouter, HOLD, STATE, composeAnswer } from './fixtures/question-router.mjs'
import { GatewayBrowser, compose } from './fixtures/gateway-browser.mjs'

/** Stand-ins: the tool's own timeout is short; Fishball's answer time is longer. */
const T = Object.freeze({
  toolTimeoutS: 10,
  answerMs: 30000, // approvalAnswerSeconds stand-in: then the question "moves to the pile"
  afterPileMs: 10000, // keep holding this long after the pile, then answer
  stopAtMs: 15000, // Stop / release while holding, past the tool's timeout
  sampleMs: 1000,
  waitMs: 15000,
  preset: 'spike-timed',
})
const QUESTIONS = [
  { id: 'color', question: 'Which colour?', options: [{ label: 'Red' }, { label: 'Blue' }] },
  { id: 'note', question: 'Anything to add?' },
]
const CHOICES = { color: { selected: ['Blue'] }, note: { custom: 'held answer' } }
const DRAFTS = [{ selected: ['Red'], custom: '', skipped: false }, { selected: [], custom: 'from the card', skipped: false }]

const timedPresetRow = {
  insert: [{
    id: 'preset-spike-timed',
    name: '@deepseek-ai/dsh-agent-preset',
    config: { id: T.preset, order: 90, plugins: [{ id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user', config: { mode: 'timed', timeout: 120 } }] },
  }],
}

const askCall = (callId) => ({ tool: 'ask_user_question', id: callId, args: { questions: QUESTIONS, timeout: T.toolTimeoutS } })
function resultOf(agent, callId) {
  const event = agent.session.snapshotEvents().find((e) => e.type === 'tool/result' && e.data.message.toolCallId === callId)
  if (event === undefined) return undefined
  return { text: event.data.message.content.map((b) => b.text ?? '').join(''), isError: event.data.message.isError === true, error: event.data.error }
}
/** A tool result is an answer batch, the pending payload, or an error. */
const kindOf = (r) => r === undefined ? 'none' : r.isError ? 'error' : r.text.includes('"answers"') ? 'answer' : 'pending'
const repliesOf = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'user/message' && e.data.source?.kind === 'user-question-reply').length
const countOf = (agent, type) => agent.session.snapshotEvents().filter((e) => e.type === type).length
const userMessagesOf = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'user/message').map((e) => e.data.source?.kind)
const projectionRow = (ctx, agent, callId) => {
  const q = ctx.sessionProjections.stateOf(agent.session, 'userQuestions')?.questions
  const active = q?.active.find((r) => r.callId === callId)
  return active?.state ?? (q?.settled.some((r) => r.callId === callId) ? 'settled' : 'none')
}
const claimsOf = (ctx, agent, callId) => ctx.userQuestions.waits.get(agent)?.get(callId)?.claims.size ?? null

async function boot() {
  const { ctx, home } = await bootDsh('s36aw', [timedPresetRow])
  const holds = new Map()
  let router
  await hostRow(ctx, 'fishball-spike-question-router', ['userQuestions'], (c) => {
    router = new QuestionRouter(c, {
      isManaged: (id) => holds.has(id),
      resolveAgent: async (id) => (await ctx.sessionController.agents.resolveAgent(id)).agent,
      holdTimed: (id) => holds.get(id),
    })
  })
  const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })
  return { ctx, holds, router: () => router, ws }
}

/**
 * One held question in its own session. `script(c)` runs while it waits and ends it.
 * Samples the turn every second: status, tool result, projection row, claims on the wait, card.
 */
async function heldCase(env, browser, { name, hold, script }) {
  const { ctx } = env
  const callId = 'call_' + name
  const agent = await ordinarySession(ctx, env.ws, T.preset)
  env.holds.set(agent.id, hold)
  model.queue(agent.id, [askCall(callId)], { text: 'after the answer' }, { text: 'after a late reply' })
  const t0 = Date.now()
  agent.steer(message('go'))
  const entryFor = () => [...env.router().entries.values()].find((e) => e.callId === callId)
  await until(() => entryFor() !== undefined && (browser === undefined || browser.openCard(agent.id) !== undefined), T.waitMs)
  const entry = entryFor()
  const card = browser?.openCard(agent.id)
  const samples = []
  let resultAtMs
  const sample = (mark) => {
    const r = resultOf(agent, callId)
    if (r !== undefined && resultAtMs === undefined) resultAtMs = Date.now() - t0
    samples.push({ t: Math.round((Date.now() - t0) / 100) / 10, ...(mark ? { mark } : {}), status: agent.status, toolResult: kindOf(r), projection: projectionRow(ctx, agent, callId), claims: claimsOf(ctx, agent, callId), card: card === undefined ? 'no-browser' : (card.closed || 'open'), router: entry.state })
  }
  const timer = setInterval(sample, T.sampleMs)
  const c = { ctx, agent, callId, entry, card, t0, sample, at: (ms) => sleep(Math.max(0, t0 + ms - Date.now())) }
  const ended = await script(c)
  await until(() => agent.status === 'idle', T.waitMs)
  clearInterval(timer)
  sample('end')
  const claimEndedAt = await Promise.race([entry.claimEnded ?? Promise.resolve(null), sleep(2000).then(() => 'still-held')])
  const modelRequests = model.requestsFor(agent.id)
  return {
    name, hold, sessionId: agent.id, ...ended,
    entry: { state: entry.state, by: entry.by, history: entry.history, holdAtClaim: entry.hold },
    toolResultAtMs: resultAtMs ?? null,
    result: resultOf(agent, callId),
    sameTurn: { turnStarts: countOf(agent, 'turn/start'), turnEnds: countOf(agent, 'turn/end'), userMessages: userMessagesOf(agent), lateReplies: repliesOf(agent), modelRequests: modelRequests.length },
    leaks: {
      waitsForAgent: ctx.userQuestions.waits.has(agent),
      routerClaimEnded: typeof claimEndedAt === 'number' ? 'released' : String(claimEndedAt),
      gatewayPending: [...ctx.typertGateway.pendingRemoteEvents.values()].filter((p) => p.frame.agentId === agent.id).length,
      card: card === undefined ? 'no-browser' : card.closed || 'open',
      projection: projectionRow(ctx, agent, callId),
    },
    samples,
  }
}

/** Hold through the answer time, mark the pile, hold on, then let `answer(c)` end it. */
const holdThenAnswer = (answer) => async (c) => {
  await c.at(T.toolTimeoutS * 1000 + 2000); c.sample('past-tool-timeout')
  await c.at(T.answerMs); c.sample('moves-to-pile')
  await c.at(T.answerMs + T.afterPileMs); c.sample('before-answer')
  return { answered: await answer(c) }
}

async function main() {
  const env = await boot()
  const { ctx } = env
  const browser = await new GatewayBrowser(ctx).connect()
  const out = { timings: T, cases: {} }
  const browserBatch = compose(QUESTIONS, DRAFTS)
  const fishball = (c) => env.router().answer(c.entry.id, composeAnswer(c.entry.questions, CHOICES))

  stage('parallel cases with the session card open')
  const withCard = await Promise.all([
    // L1: §7a.10 as written - claim only; the card's own countdown is running.
    heldCase(env, browser, { name: 'l1', hold: HOLD.claim, script: async (c) => {
      await until(() => resultOf(c.agent, c.callId) !== undefined, T.answerMs)
      c.sample('tool-result')
      return { endedBy: c.card.closed }
    } }),
    // A1-A4: claim, and the card gets the request without `wait.timed`.
    heldCase(env, browser, { name: 'a1', hold: HOLD.claimUntimed, script: holdThenAnswer(fishball) }),
    heldCase(env, browser, { name: 'a2', hold: HOLD.claimUntimed, script: holdThenAnswer(async (c) => { browser.answer(c.card.eventId, browserBatch); return 'card' }) }),
    heldCase(env, browser, { name: 'a3', hold: HOLD.claimUntimed, script: async (c) => {
      await c.at(T.stopAtMs); c.sample('stop')
      c.agent.cancel({ kind: 'user' })
      await until(() => resultOf(c.agent, c.callId) !== undefined, T.waitMs)
      return { fishballAfterStop: await fishball(c) }
    } }),
    heldCase(env, browser, { name: 'a4', hold: HOLD.claimUntimed, script: async (c) => {
      await c.at(T.stopAtMs); c.sample('release-hold')
      env.router().releaseHold(c.entry.id)
      await until(() => resultOf(c.agent, c.callId) !== undefined, T.waitMs)
      await until(() => c.agent.status === 'idle', T.waitMs)
      const late = await fishball(c) // continued now: Fishball answers through userQuestions.answer
      await until(() => repliesOf(c.agent) > 0, T.waitMs)
      return { fishballAfterRelease: late }
    } }),
  ])
  for (const r of withCard) out.cases[r.name] = r

  stage('no browser: claim only')
  browser.disconnect()
  await sleep(200)
  out.cases.l0 = await heldCase(env, undefined, { name: 'l0', hold: HOLD.claim, script: holdThenAnswer(fishball) })
  out.liveClientDuringL0 = false

  const { l0, l1, a1, a2, a3, a4 } = out.cases
  const heldUntil = (r, ms) => r.samples.filter((s) => s.t * 1000 <= ms).every((s) => s.toolResult === 'none' && s.status === 'running' && s.projection === 'open')
  const answeredSameTurn = (r, batch) => kindOf(r.result) === 'answer'
    && r.sameTurn.lateReplies === 0 && r.sameTurn.turnStarts === 1 && isDeepStrictEqual(JSON.parse(r.result.text).answers, batch.answers)
  const clean = (r) => r.leaks.waitsForAgent === false && r.leaks.routerClaimEnded === 'released' && r.leaks.gatewayPending === 0
  const holdEnd = T.answerMs + T.afterPileMs - 500
  const fishballBatch = composeAnswer(QUESTIONS, CHOICES)
  out.verdict = {
    claim_only_holds_without_card: heldUntil(l0, holdEnd) && answeredSameTurn(l0, fishballBatch) && clean(l0),
    claim_only_with_card_ends_at_tool_timeout: kindOf(l1.result) === 'pending' && l1.toolResultAtMs < T.toolTimeoutS * 1000 + 3000 && l1.entry.state === STATE.continued,
    untimed_card_holds_past_timeout_and_pile: heldUntil(a1, holdEnd) && heldUntil(a2, holdEnd),
    untimed_fishball_answer_same_turn: answeredSameTurn(a1, fishballBatch) && a1.leaks.card === 'cancel' && clean(a1),
    untimed_card_answer_same_turn: answeredSameTurn(a2, browserBatch) && a2.entry.by === 'user' && clean(a2),
    stop_while_held_ends_clean: a3.entry.state === STATE.closed && a3.fishballAfterStop.ok === false && a3.leaks.card === 'cancel' && clean(a3) && a3.leaks.projection === 'none',
    released_hold_becomes_continued: kindOf(a4.result) === 'pending' && a4.fishballAfterRelease.path === 'reply' && a4.sameTurn.lateReplies === 1 && clean(a4),
  }
  return { pass: Object.values(out.verdict).every(Boolean), ...out }
}

await runSpike('S36-attachWait', main)

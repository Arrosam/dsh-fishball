/**
 * S36 (revision 11, items 25-26): can Fishball answer `ask_user_question` and plan reviews from
 * a managed session in exactly the browser's shape, while the session's own card stays open and
 * the first answer wins?
 *
 * Fixtures: spikes/fixtures/question-router.mjs (the candidate router) and
 * spikes/fixtures/gateway-browser.mjs (a browser tab on DSH's real gateway; DSH's client logic
 * is the oracle for the answer shape).
 *
 * Phases (run in order; the second boots the first's home again):
 *   spikes/run.sh spikes/s36-question-routing.mjs
 *   S36_PHASE=restart spikes/run.sh spikes/s36-question-routing.mjs
 * Set DSH_RUNTIME_ROOT to another installed host's node_modules to check it too.
 */
import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { bootDsh, hostRow, message, model, ordinarySession, runSpike, sleep, stage, until, REPO, RUNTIME, SPIKE_ROOT } from './harness.mjs'
import { QuestionRouter, STATE, BY, REFUSAL, composeAnswer, planDecision } from './fixtures/question-router.mjs'
import { GatewayBrowser, compose } from './fixtures/gateway-browser.mjs'

const S36 = Object.freeze({
  phase: process.env.S36_PHASE ?? 'main',
  runtime: path.basename(path.dirname(RUNTIME)),
  timedPreset: 'spike-timed',
  restartFile: path.join(SPIKE_ROOT, `s36-restart-${path.basename(path.dirname(RUNTIME))}.json`),
  waitMs: 15000,
  plan: '# Spike plan\n\nShip the S36 fixture.',
  feedback: 'Add a restart test first.',
})

/** Five questions covering every kind: single, multi + custom, free text, custom replacing a choice, skipped. */
const BATCH = [
  { id: 'color', question: 'Which colour?', options: [{ label: 'Red (Recommended)' }, { label: 'Blue' }] },
  { id: 'parts', question: 'Which parts?', multi_select: true, options: [{ label: 'Docs' }, { label: 'Tests' }, { label: 'Code' }] },
  { id: 'name', question: 'Name for the branch?' },
  { id: 'size', question: 'Which size?', options: [{ label: 'S' }, { label: 'M' }] },
  { id: 'skip', question: 'Anything else?', options: [{ label: 'No' }] },
]
/** What the user clicks/types in the browser card, per question (browser draft vocabulary). */
const DRAFTS = [
  { selected: ['Blue'], custom: '', skipped: false },
  { selected: ['Docs', 'Code'], custom: 'and CI', skipped: false },
  { selected: [], custom: 'fix/s36', skipped: false },
  { selected: ['S'], custom: 'XL', skipped: false },
  { selected: [], custom: '', skipped: true },
]
/** The same choices as Fishball would make them (router vocabulary; 'skip' omitted = skipped). */
const CHOICES = { color: { selected: ['Blue'] }, parts: { selected: ['Docs', 'Code'], custom: 'and CI' }, name: { custom: 'fix/s36' }, size: { custom: 'XL' } }

const timedPresetRow = {
  insert: [{
    id: 'preset-spike-timed',
    name: '@deepseek-ai/dsh-agent-preset',
    config: { id: S36.timedPreset, order: 90, plugins: [{ id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user', config: { mode: 'timed', timeout: 120 } }] },
  }],
}

/** Text of the tool result for one call id. */
function resultOf(agent, callId) {
  for (const event of agent.session.snapshotEvents()) {
    if (event.type !== 'tool/result' || event.data.message.toolCallId !== callId) continue
    return { text: event.data.message.content.map((b) => b.text ?? '').join(''), isError: event.data.message.isError === true, error: event.data.error }
  }
  return undefined
}
const repliesOf = (agent) => agent.session.snapshotEvents().filter((e) => e.type === 'user/message' && e.data.source?.kind === 'user-question-reply').map((e) => ({ source: e.data.source, text: e.data.content.map((b) => b.text).join('') }))
const settledOf = (ctx, agent) => ctx.sessionProjections.stateOf(agent.session, 'userQuestions')?.questions
const askCall = (callId, questions = BATCH, timeout) => ({ tool: 'ask_user_question', id: callId, args: { questions, ...(timeout === undefined ? {} : { timeout }) } })

async function boot() {
  const { ctx, home } = await bootDsh('s36', [timedPresetRow])
  const managed = new Set()
  const changes = []
  let router
  await hostRow(ctx, 'fishball-spike-question-router', ['userQuestions'], (c) => {
    router = new QuestionRouter(c, {
      isManaged: (id) => managed.has(id),
      resolveAgent: async (id) => (await ctx.sessionController.agents.resolveAgent(id)).agent,
      onChange: (entry, what) => changes.push({ id: entry.id, session: entry.sessionId, what }),
    })
  })
  const browser = await new GatewayBrowser(ctx).connect()
  const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })
  return { ctx, home, ws, managed, router, browser, changes }
}

/** Start the call in a fresh session and wait until the router (managed) or the browser (not) has it. */
async function startQuestion(env, { callId, managed = true, preset, steps, after = [{ text: 'ok' }] }) {
  const agent = await ordinarySession(env.ctx, env.ws, preset)
  if (managed) env.managed.add(agent.id)
  model.queue(agent.id, steps, ...after)
  agent.steer(message('go'))
  await until(() => env.browser.openCard(agent.id) !== undefined && (!managed || entryFor(env, callId) !== undefined), S36.waitMs)
  return { agent, card: env.browser.openCard(agent.id), entry: entryFor(env, callId) }
}
const entryFor = (env, callId) => [...env.router.entries.values()].find((e) => e.callId === callId)
const settle = (agent) => until(() => agent.status === 'idle', S36.waitMs)
const pendingGateway = (ctx) => ctx.typertGateway.pendingRemoteEvents.size

async function main() {
  const env = await boot()
  const { ctx, router, browser } = env
  const out = { runtime: S36.runtime, cases: {} }
  const browserBatch = compose(BATCH.map((q) => ({ ...q, multiSelect: q.multi_select })), DRAFTS)

  stage('A legacy batch, Fishball answers first')
  {
    const callId = 'call_a'
    const { agent, card, entry } = await startQuestion(env, { callId, steps: [askCall(callId)] })
    const questions = entry.questions
    const bad = await router.answer(entry.id, { answers: [{ id: 'color', selected: ['Red (Recommended)', 'Blue'] }] })
    const badSingle = await router.answer(entry.id, composeAnswer(questions, { ...CHOICES, color: { selected: ['Red (Recommended)', 'Blue'] } }))
    const fishballBatch = composeAnswer(questions, CHOICES)
    const good = await router.answer(entry.id, fishballBatch)
    await settle(agent)
    out.cases.A = {
      requestCarried: { timed: entry.timed, callIdInRequest: entry.callId ?? null, questions },
      refusedIncomplete: bad, refusedTwoLabelsOnSingle: badSingle, accepted: good,
      fishballBatchEqualsBrowserBatch: isDeepStrictEqual(fishballBatch, browserBatch),
      browserCard: card.closed, gatewayPending: pendingGateway(ctx), result: resultOf(agent, callId), entry: { state: entry.state, by: entry.by },
    }
  }

  stage('B legacy batch, user answers in the session first')
  {
    const callId = 'call_b'
    const { agent, card, entry } = await startQuestion(env, { callId, steps: [askCall(callId)] })
    browser.answer(card.eventId, browserBatch)
    await until(() => entry.state !== STATE.open, S36.waitMs)
    const late = await router.answer(entry.id, composeAnswer(entry.questions, CHOICES))
    await settle(agent)
    out.cases.B = { entry: { state: entry.state, by: entry.by, learntAnswerEqualsBrowser: isDeepStrictEqual(entry.answer, browserBatch) }, fishballLate: late, result: resultOf(agent, callId) }
  }

  stage('C unmanaged session: router stays out')
  {
    const callId = 'call_c'
    const seenBefore = router.seen.length
    const entriesBefore = router.entries.size
    const { agent, card } = await startQuestion(env, { callId, managed: false, steps: [askCall(callId)] })
    browser.answer(card.eventId, browserBatch)
    await settle(agent)
    out.cases.C = { routerSaw: router.seen.slice(seenBefore), entriesAdded: router.entries.size - entriesBefore, result: resultOf(agent, callId) }
  }

  stage('E managed, turn stopped while open')
  {
    const callId = 'call_e'
    const { agent, card, entry } = await startQuestion(env, { callId, steps: [askCall(callId)] })
    agent.cancel({ kind: 'user' })
    await settle(agent)
    await until(() => card.closed, 3000)
    out.cases.E = { entry: { state: entry.state, history: entry.history }, fishballAfter: await router.answer(entry.id, composeAnswer(entry.questions, CHOICES)), browserCard: card.closed, gatewayPending: pendingGateway(ctx), result: resultOf(agent, callId) }
  }

  stage('F1 timed, Fishball answers inside the window')
  {
    const callId = 'call_f1'
    const { agent, card, entry } = await startQuestion(env, { callId, preset: S36.timedPreset, steps: [askCall(callId, BATCH, 60)] })
    const answered = await router.answer(entry.id, composeAnswer(entry.questions, CHOICES))
    await settle(agent)
    out.cases.F1 = { request: { timed: entry.timed, callId: entry.callId }, browserClaimedMs: card.remainingMs, answered, browserCard: card.closed, result: resultOf(agent, callId), projection: settledOf(ctx, agent) }
  }

  stage('F2 timed, browser countdown ends -> continued; Fishball answers')
  {
    const callId = 'call_f2'
    const { agent, card, entry } = await startQuestion(env, { callId, preset: S36.timedPreset, steps: [askCall(callId, BATCH, 1)], after: [{ text: 'working meanwhile' }, { text: 'thanks for the answer' }] })
    await until(() => entry.state === STATE.continued, S36.waitMs)
    await settle(agent)
    const pendingResult = resultOf(agent, callId)
    const activeBefore = settledOf(ctx, agent)?.active
    const answered = await router.answer(entry.id, composeAnswer(entry.questions, CHOICES))
    await until(() => repliesOf(agent).length > 0, S36.waitMs)
    await settle(agent)
    const browserLate = browser.answerContinued(agent.id, callId, browserBatch)
    out.cases.F2 = {
      browserCard: card.closed, entry: { state: entry.state, by: entry.by, history: entry.history }, pendingResult, activeBefore, answered,
      replies: repliesOf(agent), browserLateAccepted: browserLate, projection: settledOf(ctx, agent),
      modelSawReply: JSON.stringify(model.requestsFor(agent.id).at(-1)?.messages ?? []).includes('answer_to_pending_question'),
    }
  }

  stage('F3 timed, continued; user answers in the session first')
  {
    const callId = 'call_f3'
    const { agent, entry } = await startQuestion(env, { callId, preset: S36.timedPreset, steps: [askCall(callId, BATCH, 1)], after: [{ text: 'working meanwhile' }, { text: 'thanks' }] })
    await until(() => entry.state === STATE.continued, S36.waitMs)
    await settle(agent)
    const accepted = browser.answerContinued(agent.id, callId, browserBatch)
    await until(() => entry.state !== STATE.continued, S36.waitMs)
    const late = await router.answer(entry.id, composeAnswer(entry.questions, CHOICES))
    await settle(agent)
    out.cases.F3 = { browserAccepted: accepted, entry: { state: entry.state, by: entry.by, learntAnswerEqualsBrowser: isDeepStrictEqual(entry.answer, browserBatch) }, fishballLate: late, replies: repliesOf(agent), projection: settledOf(ctx, agent) }
  }

  stage('F4 timed, no browser open: host timer -> continued; Fishball answers')
  {
    browser.disconnect()
    await sleep(100)
    const callId = 'call_f4'
    const agent = await ordinarySession(ctx, env.ws, S36.timedPreset)
    env.managed.add(agent.id)
    model.queue(agent.id, [askCall(callId, BATCH, 1)], { text: 'working meanwhile' }, { text: 'thanks' })
    agent.steer(message('go'))
    await until(() => entryFor(env, callId)?.state === STATE.continued, S36.waitMs)
    const entry = entryFor(env, callId)
    await settle(agent)
    const answered = await router.answer(entry.id, composeAnswer(entry.questions, CHOICES))
    await until(() => repliesOf(agent).length > 0, S36.waitMs)
    await settle(agent)
    out.cases.F4 = { liveClient: ctx.typertGateway.hasLiveClient(), entry: { state: entry.state, by: entry.by, history: entry.history }, pendingResult: resultOf(agent, callId), answered, replies: repliesOf(agent), gatewayPending: pendingGateway(ctx) }
    env.browser = await new GatewayBrowser(ctx).connect()
  }
  const b2 = env.browser

  stage('P plan reviews')
  const planSession = async (callId, managed = true) => {
    const agent = await ordinarySession(ctx, env.ws)
    if (managed) env.managed.add(agent.id)
    // plan-mode's service is isolated inside the preset; enter through its /plan command as a user does.
    const set = JSON.stringify(await ctx.commands.execute(agent, '/plan', [], new AbortController().signal))
    model.queue(agent.id, [{ tool: 'exit_plan_mode', id: callId, args: { plan: S36.plan } }], { text: 'ok' })
    agent.steer(message('plan it'))
    await until(() => b2.openCard(agent.id) !== undefined && (!managed || entryFor(env, callId) !== undefined), S36.waitMs)
    if (entryFor(env, callId) === undefined) throw new Error('plan review did not reach the router: ' + JSON.stringify({ set, result: resultOf(agent, callId), types: agent.session.snapshotEvents().map((e) => e.type) }))
    return { agent, set, card: b2.openCard(agent.id), entry: entryFor(env, callId) }
  }
  /** '/plan off' answers "already inactive" when the review left plan mode, "Plan mode off." when it was still on. */
  const planState = async (agent) => JSON.stringify(await ctx.commands.execute(agent, '/plan off', [], new AbortController().signal))
  {
    const p1 = await planSession('call_p1')
    const question = p1.entry.questions[0]
    const approve = planDecision(question, { approve: true })
    const browserApprove = { answers: [{ id: question.id, selected: [question.intent.approve] }] } // PlanReviewPanel `decide(review.approve.label)`
    out.cases.P1 = { planModeSet: p1.set, request: { kind: p1.entry.kind, intent: question.intent, hasDetail: question.detail === S36.plan, waitInRequest: p1.card.request.wait ?? null }, approveEqualsBrowser: isDeepStrictEqual(approve, browserApprove), answered: await router.answer(p1.entry.id, approve) }
    await settle(p1.agent)
    Object.assign(out.cases.P1, { browserCard: p1.card.closed, result: resultOf(p1.agent, 'call_p1'), planActiveAfter: await planState(p1.agent) })

    const p2 = await planSession('call_p2')
    const reject = planDecision(p2.entry.questions[0], { approve: false, feedback: S36.feedback })
    const rejectGeneric = compose(p2.entry.questions, [{ selected: ['Keep planning'], custom: S36.feedback, skipped: false }]) // the generic card's shape for "Other" text
    out.cases.P2 = { rejectEqualsGenericBrowser: isDeepStrictEqual(reject, rejectGeneric), answered: await router.answer(p2.entry.id, reject) }
    await settle(p2.agent)
    Object.assign(out.cases.P2, { browserCard: p2.card.closed, result: resultOf(p2.agent, 'call_p2'), planActiveAfter: await planState(p2.agent) })

    const p3 = await planSession('call_p3')
    b2.answer(p3.card.eventId, { answers: [{ id: 'plan-review', selected: ['Approve'] }] })
    await settle(p3.agent)
    out.cases.P3 = { entry: { state: p3.entry.state, by: p3.entry.by, answer: p3.entry.answer }, fishballLate: await router.answer(p3.entry.id, approve), result: resultOf(p3.agent, 'call_p3') }

    const p4 = await planSession('call_p4')
    b2.reject(p4.card.eventId, 'ASK_CANCELLED') // "Discuss": close the review to reply in own words
    await settle(p4.agent)
    out.cases.P4 = { entry: { state: p4.entry.state, history: p4.entry.history }, result: resultOf(p4.agent, 'call_p4'), planActiveAfter: await planState(p4.agent) }
  }

  stage('K live child agent asks')
  {
    const parent = await ordinarySession(ctx, env.ws)
    env.managed.add(parent.id)
    const known = new Set(model.queues.keys())
    const base = model.respond.bind(model)
    let childId
    const childScript = [[askCall('call_child', [BATCH[0]])], [{ text: 'child done' }]]
    model.respond = (options) => {
      if (!known.has(options.sessionId) && !model.queues.has(options.sessionId) && childScript.length > 0) { childId = options.sessionId; return childScript.shift() }
      return base(options)
    }
    const seenBefore = router.seen.length
    model.queue(parent.id, [{ tool: 'subagent', id: 'call_sub', args: { description: 'spike child', prompt: 'ask the user' } }], { text: 'ok' })
    parent.steer(message('delegate'))
    await until(() => childId !== undefined && childScript.length === 0, S36.waitMs)
    await settle(parent)
    model.respond = base
    const child = ctx.agents.get(childId)
    const childEvents = child?.session.snapshotEvents() ?? (await ctx.sessionQuery?.observeSession?.(childId))?.events ?? []
    const childResult = childEvents.filter((e) => e.type === 'tool/result').map((e) => JSON.stringify(e.data)).find((t) => t.includes('call_child'))
    out.cases.K = { childId, routerSawAnything: router.seen.length - seenBefore, childResult: childResult?.slice(0, 600), parentResult: resultOf(parent, 'call_sub')?.text?.slice(0, 400) }
  }

  stage('R set up questions left open across a restart')
  {
    const legacy = await startQuestion(env, { callId: 'call_rl', steps: [askCall('call_rl')] })
    const timedOpen = await startQuestion(env, { callId: 'call_rt', preset: S36.timedPreset, steps: [askCall('call_rt', BATCH, 3600)] })
    const timedContinued = await ordinarySession(ctx, env.ws, S36.timedPreset)
    env.managed.add(timedContinued.id)
    model.queue(timedContinued.id, [askCall('call_rc', BATCH, 1)], { text: 'working meanwhile' })
    timedContinued.steer(message('go'))
    await until(() => entryFor(env, 'call_rc')?.state === STATE.continued, S36.waitMs)
    await settle(timedContinued)
    const plan = await planSession('call_rp')
    const sessions = { legacy: legacy.agent.id, timedOpen: timedOpen.agent.id, timedContinued: timedContinued.id, plan: plan.agent.id }
    await sleep(500)
    fs.writeFileSync(S36.restartFile, JSON.stringify({ home: env.home, sessions }, null, 2))
    out.restartSetup = { sessions, states: Object.fromEntries(Object.entries({ call_rl: 0, call_rt: 0, call_rc: 0, call_rp: 0 }).map(([id]) => [id, entryFor(env, id)?.state])) }
  }

  const c = out.cases
  const sameAsBrowser = (r) => r?.text === c.B.result?.text
  out.verdict = {
    Q1_fishball_answer_equals_browser_answer: c.A.fishballBatchEqualsBrowserBatch && sameAsBrowser(c.A.result) && sameAsBrowser(c.C.result) && sameAsBrowser(c.F1.result),
    Q1_bad_answers_refused: c.A.refusedIncomplete.code === REFUSAL.badAnswer && c.A.refusedTwoLabelsOnSingle.code === REFUSAL.badAnswer,
    Q1_continued_answer_by_fishball: c.F2.answered.path === 'reply' && c.F2.replies.length === 1 && c.F2.modelSawReply && c.F2.browserLateAccepted === false && c.F4.answered.path === 'reply',
    Q1_other_sessions_untouched: c.C.entriesAdded === 0 && c.C.routerSaw.every((s) => !s.managed),
    Q2_fishball_first_closes_session_card: c.A.browserCard === 'cancel' && c.A.gatewayPending === 0 && c.F1.browserCard === 'cancel',
    Q2_user_first_learnt_and_fishball_refused: c.B.entry.by === BY.user && c.B.entry.learntAnswerEqualsBrowser && c.B.fishballLate.code === REFUSAL.settled,
    Q2_user_first_continued_learnt: c.F3.entry.by === BY.user && c.F3.entry.learntAnswerEqualsBrowser && c.F3.fishballLate.ok === false,
    Q2_stopped_turn_closes_both: c.E.entry.state === STATE.closed && c.E.fishballAfter.code === REFUSAL.settled && c.E.browserCard !== false,
    Q3_plan_approve: c.P1.approveEqualsBrowser && c.P1.answered.ok && c.P1.browserCard === 'cancel' && c.P1.result?.text === c.P3.result?.text,
    Q3_plan_reject_with_feedback: c.P2.rejectEqualsGenericBrowser && c.P2.answered.ok && (c.P2.result?.text ?? '').includes(S36.feedback),
    Q3_plan_user_first: c.P3.entry.by === BY.user && c.P3.fishballLate.code === REFUSAL.settled,
    Q5_child_never_reaches_router: c.K.routerSawAnything === 0 && (c.K.childResult ?? '').includes('owned by another live agent'),
  }
  return { pass: Object.values(out.verdict).every(Boolean), ...out }
}

async function restart() {
  const saved = JSON.parse(fs.readFileSync(S36.restartFile, 'utf8'))
  process.env.SPIKE_REUSE_HOME = saved.home
  const env = await boot()
  const { ctx, router, browser } = env
  for (const id of Object.values(saved.sessions)) env.managed.add(id)
  const out = { runtime: S36.runtime, home: saved.home, sessions: saved.sessions, recovered: {} }
  stage('resume each managed session and rebuild the pile from the projection')
  const agents = {}
  for (const [key, id] of Object.entries(saved.sessions)) {
    agents[key] = (await ctx.sessionController.agents.resolveAgent(id)).agent
    const found = router.recover(agents[key])
    out.recovered[key] = { found: found.map((e) => ({ callId: e.callId, kind: e.kind })), projection: settledOf(ctx, agents[key]), lastResult: resultOf(agents[key], { legacy: 'call_rl', timedOpen: 'call_rt', timedContinued: 'call_rc', plan: 'call_rp' }[key]) }
  }
  await sleep(500)
  out.browserWaterfallsAfterRestart = browser.frames.filter((f) => f.type === 'waterfall').length
  stage('Fishball answers a recovered question')
  const entry = [...router.entries.values()].find((e) => e.callId === 'call_rt')
  model.queue(saved.sessions.timedOpen, { text: 'thanks after restart' })
  out.answered = entry === undefined ? null : await router.answer(entry.id, composeAnswer(entry.questions, CHOICES))
  await until(() => repliesOf(agents.timedOpen).length > 0, S36.waitMs)
  await until(() => agents.timedOpen.status === 'idle', S36.waitMs)
  out.replies = repliesOf(agents.timedOpen).map((r) => ({ source: r.source, answersEqualFishball: isDeepStrictEqual(JSON.parse(r.text).answers, composeAnswer(entry.questions, CHOICES).answers) }))
  out.projectionAfter = settledOf(ctx, agents.timedOpen)
  out.modelSawReply = JSON.stringify(model.requestsFor(saved.sessions.timedOpen).at(-1)?.messages ?? []).includes('answer_to_pending_question')
  const r = out.recovered
  out.verdict = {
    Q4_timed_questions_survive_as_continued: r.timedOpen.found.length === 1 && r.timedContinued.found.length === 1,
    Q4_blocking_question_and_plan_review_end: r.legacy.found.length === 0 && r.plan.found.length === 0 && r.legacy.lastResult !== undefined && r.plan.lastResult !== undefined,
    Q4_no_waterfall_replayed: out.browserWaterfallsAfterRestart === 0,
    Q4_fishball_answers_recovered: out.answered?.path === 'reply' && out.replies.length === 1 && out.replies[0].answersEqualFishball && out.modelSawReply,
  }
  return { pass: Object.values(out.verdict).every(Boolean), ...out }
}

const suffix = S36.runtime === '0.2.1-rc.2' ? '' : '-' + S36.runtime
await runSpike(S36.phase === 'restart' ? `S36-question-routing-restart${suffix}` : `S36-question-routing${suffix}`, S36.phase === 'restart' ? restart : main)

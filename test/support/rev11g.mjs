/**
 * Shared set-up for the rev11g files (questions and plan reviews in managed sessions; DESIGN §7a.10, §9, §10e, §11;
 * requirements items 25-27; S36): the rev11c host (scripted stock prompt after the broker, Fishball live) plus the
 * browser's question card stand-in (FBTEST_QUESTIONS=1: a host listener after Fishball's router that keeps the
 * session's own card OPEN until a test answers or discusses it, or its signal aborts, as the gateway closes a card).
 * Expected values come from the requirements and DESIGN, never from the implementation.
 */
import assert from 'node:assert/strict'
import { ANSWER_QUESTION, ASK_USER_QUESTION, CARD_KIND, PLAN, PLAN_REVIEW_ID, PRESET, QUESTION_API, QUESTION_MODE } from './constants.mjs'
import { fishballCall, managedSession, resultOfCall, settledIdle, step, storedRows } from './expect.mjs'
import { AT_ONCE_MS, QUIET_MS, boot, pileHost, pileTools, sleep, tokens, until } from './rev11c.mjs'

export { AT_ONCE_MS, QUIET_MS, boot, sleep, tokens, until }

/** Question sets. Option labels are plain, so a label can never be mistaken for an id. */
export const Q = {
  single: (text) => [{ id: 'color', question: 'Which colour? ' + text, options: [{ label: 'Red' }, { label: 'Blue' }] }],
  mixed: (text) => [
    { id: 'color', question: 'Which colour? ' + text, options: [{ label: 'Red' }, { label: 'Blue' }] },
    { id: 'parts', question: 'Which parts? ' + text, multi_select: true, options: [{ label: 'Docs' }, { label: 'Tests' }, { label: 'Code' }] },
    { id: 'name', question: 'Branch name? ' + text },
  ],
}
/** Valid answers for those sets, in the browser's batch shape (item per question: id, selected, custom only when typed). */
export const A = {
  single: [{ id: 'color', selected: ['Blue'] }],
  mixed: [{ id: 'color', selected: ['Blue'] }, { id: 'parts', selected: ['Docs', 'Code'], custom: 'and CI' }, { id: 'name', selected: [], custom: 'fix/x' }],
}
/** The tool result text for an answer batch (dsh-tool-ask-user renders JSON.stringify({answers})). */
export const resultText = (answers) => JSON.stringify({ answers })
export const planText = (text) => '# Plan ' + text + '\n\nStep one. Step two.'

export const qHost = (label, env = {}) => pileHost(label, { env: { FBTEST_QUESTIONS: '1', ...env } })

/** The id a pile card is answered by (§10e: `questionId`; tolerant of the card also carrying it as requestId/id). */
export const cardId = (card) => card?.questionId ?? card?.requestId ?? card?.id
/** A question or plan-review card (the builder's cards carry kind 'question' or 'plan-review'; the design's §9 names only 'question'). */
export const isQuestionCard = (c) => c?.kind === CARD_KIND.question || c?.kind === 'plan-review'
/** A card whose JSON mentions this token. */
export const cardMentions = (card, token) => JSON.stringify(card ?? {}).includes(token)

export function qTools(ctx, names) {
  const t = pileTools(ctx, names)
  const host = () => ctx.host
  const q = {
    t,
    session: (folder, preset = PRESET.ask) => managedSession(ctx.host, ctx.fb, folder, preset),
    /** A session of the user's (not managed) with one plain turn behind it. */
    async yours(folder, preset = PRESET.ask) {
      const sid = (await ctx.host.call('ordinary', { preset, folder })).sessionId
      await ctx.host.call('drive', { sessionId: sid, script: [[{ text: 'hello' }]], text: 'first words' })
      return sid
    },
    setMode: (mode) => ctx.host.post(QUESTION_API.mode, { mode }),
    cards: (sid) => ctx.host.call('qCards', { sessionId: sid }),
    /** Make the session idle before a case starts a turn in it: a case that failed halfway must not hold the next one up. */
    async free(sid) {
      if ((await ctx.host.call('agentStatus', { sessionId: sid })) !== 'idle') { await ctx.host.call('cancel', { sessionId: sid }); await ctx.host.call('waitIdle', { sessionId: sid }).catch(() => {}) }
      await settledIdle(ctx.host, sid)
    },
    /** The newest stand-in card of the session (the session's own question card), waiting for it up to timeoutMs. */
    async ownCard(sid, timeoutMs = 10000, after = 0) {
      return until(async () => (await q.cards(sid)).filter((c) => c.index >= after).at(-1) ?? false, timeoutMs, 50)
    },
    /** The count of stand-in cards so far (so a later ownCard(…, after) waits for a new one). */
    cardCount: async () => (await ctx.host.call('qCards', {})).length,
    /**
     * Start a turn in sid whose model calls ask_user_question once (then `after` steps and a closing text) and wait until
     * the session's own card is open. Returns the stand-in card.
     */
    async ask(sid, text, id, { questions = Q.single(text), timeout, after = [], waitCard = true } = {}) {
      await q.free(sid)
      const first = await q.cardCount()
      await ctx.host.call('driveStart', { sessionId: sid, text: 'ask ' + text, script: [step(ASK_USER_QUESTION, { questions, ...(timeout === undefined ? {} : { timeout }) }, id), ...after, [{ text: 'done' }]] })
      if (!waitCard) return undefined
      const card = await q.ownCard(sid, 10000, first)
      assert.ok(card, 'the session\'s own question card opened for ' + text)
      return card
    },
    /** Enter plan mode (/plan) and start a turn that presents a plan; waits for the session's own plan-review card. */
    async plan(sid, text, id, { after = [] } = {}) {
      await q.free(sid)
      const out = await ctx.host.call('planCommand', { sessionId: sid })
      assert.equal(out.kind, 'success', 'plan mode on: ' + JSON.stringify(out))
      const first = await q.cardCount()
      await ctx.host.call('driveStart', { sessionId: sid, text: 'plan ' + text, script: [step(PLAN.exit, { plan: planText(text) }, id), ...after, [{ text: 'done' }]] })
      const card = await q.ownCard(sid, 10000, first)
      assert.ok(card?.planReview, 'the session\'s own plan-review card opened: ' + JSON.stringify(card))
      return card
    },
    planOff: (sid) => ctx.host.call('planCommand', { sessionId: sid, off: true }),
    /** The question id Fishball's notice carries for a question whose text contains `text`. */
    async questionId(text, timeoutMs = 10000) {
      return until(async () => {
        const events = (await ctx.host.call('inspect', { sessionId: ctx.fb, events: true })).events ?? []
        return events.filter((e) => e.type === 'user/message' && e.source?.kind === 'fishball-notice' && e.text.includes(text)).map((e) => /qst_[\w-]+/.exec(e.text)?.[0]).filter(Boolean).at(-1) ?? false
      }, timeoutMs, 100)
    },
    /** Fishball's notices (user messages of source fishball-notice) containing text. */
    async notices(text) {
      const events = (await ctx.host.call('inspect', { sessionId: ctx.fb, events: true })).events ?? []
      return events.filter((e) => e.type === 'user/message' && e.source?.kind === 'fishball-notice' && e.text.includes(text))
    },
    /** Let Fishball answer the question whose notice contains `text` with these answer_question arguments. */
    planAnswer: (text, args, callId) => ctx.host.call('planQuestion', { sessionId: ctx.fb, needle: text, args, ...(callId ? { callId } : {}) }),
    /** Fishball calls answer_question in a turn of its own. */
    async fbAnswer(args) {
      const r = await fishballCall(ctx.host, ctx.fb, ANSWER_QUESTION, args)
      return r
    },
    /** The final result {json, text, isError} of the call with this id in the asking session. */
    async result(sid, id, timeoutMs = 15000) { return resultOfCall(ctx.host, sid, id, timeoutMs) },
    /** The question card of this session in the pile, or false. */
    async pileCard(sid, timeoutMs = 10000) {
      return until(async () => ((await ctx.host.state())?.pile ?? []).find((c) => c.sessionId === sid && isQuestionCard(c)) ?? false, timeoutMs, 50)
    },
    async noPileCard(sid, timeoutMs = 10000) {
      return Boolean(await until(async () => !((await ctx.host.state())?.pile ?? []).some((c) => c.sessionId === sid && isQuestionCard(c)), timeoutMs, 50))
    },
    pile: async () => (await ctx.host.state())?.pile ?? [],
    /** POST /api/fishball/questions/answer. */
    route: (body, opts) => ctx.host.post(QUESTION_API.answer, body, opts),
    /** Fishball's model-request count and intake item count: a question Fishball was not told about moves neither. */
    async fbWork() { return { steps: (await ctx.host.call('requests', { sessionId: ctx.fb })).length, items: ((await ctx.host.state())?.intake?.items ?? []).length } },
    tagsOf: (callId) => storedRows(ctx.home, 'tags').filter((r) => r.callId === callId),
    untilTag: (callId, timeoutMs = 8000) => until(() => q.tagsOf(callId)[0] ?? false, timeoutMs, 100),
    allEvents: async (sid) => (await ctx.host.call('inspect', { sessionId: sid, events: true })).events ?? [],
    /** Stop the turn of a session the way the Stop button does. */
    stop: (sid) => t.stop(sid),
    /** Set the question mode, asserting the route took it. */
    async mode(mode) { const r = await q.setMode(mode); assert.equal(r.status, 200, r.text); return r },
    /** The decisions rows (Fishball's and your decisions) that target this question id. */
    decisionsFor: (qid) => storedRows(ctx.home, 'decisions').filter((d) => d.target === qid),
  }
  return q
}

/** A refused answer_question: the tool said ok:false, or the call itself came back an error. */
export const refused = ({ json, result }) => json?.ok === false || result?.isError === true
export const MODES = QUESTION_MODE
export { PLAN_REVIEW_ID }

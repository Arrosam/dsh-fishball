/**
 * Shared set-up for the rev11e files (prompts already showing, answer_prompt as the fifth way in, cards for direct
 * calls; DESIGN §7a.1, §7a.6, §7a.9, §9, §10e; requirements items 2, 15 and 20): the rev11c host (scripted stock
 * prompt after the broker, Fishball live) where the scripted prompt can be HELD, standing in for a prompt that is
 * showing in a browser until someone clicks. A held prompt reports `closed` in the 'approvals' records once its
 * signal aborts (the plugin answered it, S33) and leaves the held list. Expected values come from the requirements
 * and DESIGN, never from the implementation.
 */
import assert from 'node:assert/strict'
import { APPROVER_HOLDS, OUTCOME, PROMPT_TOOLS } from './constants.mjs'
import { callStep, fishballCall, intakeNow, jsonOf, managedEntry, settledIdle, stockSeen } from './expect.mjs'
import { pileHost, pileTools, tokens, until } from './rev11c.mjs'

export { AT_ONCE_MS, QUIET_MS, boot, sleep, until } from './rev11c.mjs'

export { pileHost, pileTools, tokens }

/** A session of the user's (not managed) with one plain turn behind it. */
export async function yoursSession(ctx, folder) {
  const sid = (await ctx.host.call('ordinary', { preset: 'fbtest-bare', folder })).sessionId
  await ctx.host.call('drive', { sessionId: sid, script: [[{ text: 'hello' }]], text: 'first words' })
  return sid
}

export function promptTools(ctx, names) {
  const t = pileTools(ctx, names)
  const p = {
    t,
    /**
     * A turn in sid whose fbtest_ask call asks DSH for approval; the stock prompt is held (it "shows"). Returns when
     * the prompt has arrived: {id, text, seen}. The turn stays open until the prompt is answered.
     */
    async show(sid, text, id, extra = {}) {
      await settledIdle(ctx.host, sid)
      await ctx.host.call('setApprover', { outcome: APPROVER_HOLDS })
      try {
        await ctx.host.call('driveStart', { sessionId: sid, script: [callStep({ text, ...extra }, id), [{ text: 'done' }]] })
        const seen = await until(async () => (await stockSeen(ctx.host, text))[0] ?? false, 10000, 50)
        assert.ok(seen, 'the stock prompt is showing for ' + text)
      } finally { await ctx.host.call('setApprover', { outcome: OUTCOME.reject }) }
      return { sid, id, text }
    },
    /** The stock prompt records for this text (each with `closed`). */
    prompts: (text) => stockSeen(ctx.host, text),
    /** Your own click in the session's stock prompt: answers the oldest held prompt. */
    click: async (outcome) => { const ok = await ctx.host.call('releaseApproval', { outcome }); assert.equal(ok, true, 'a prompt was showing to click'); },
    held: () => ctx.host.call('heldApprovals', {}),
    /** The final result {text, isError} of the call with this id, after the session's turn ends. */
    async result(sid, id) {
      await ctx.host.call('waitIdle', { sessionId: sid })
      const events = (await ctx.host.call('inspect', { sessionId: sid, events: true })).events
      const e = events.find((x) => x.type === 'tool/result' && x.result.callId === id)
      assert.ok(e, 'a result for ' + id)
      return e.result
    },
    /** Fishball's model-request count and intake item count: a prompt Fishball was not told about moves neither. */
    async fbWork() { return { steps: (await ctx.host.call('requests', { sessionId: ctx.fb })).length, items: ((await intakeNow(ctx.host))?.items ?? []).length } },
    /** list_frozen_sessions: {json, result, entries} where entries are the objects in the answer's lists. */
    async frozen() {
      const { json, result } = await fishballCall(ctx.host, ctx.fb, PROMPT_TOOLS.list, {})
      return { json, result, entries: entriesOf(json) }
    },
    /** answer_prompt: {json, result}. `risk` and `reason` are given for allow; a reject needs a reason. */
    async answerPrompt(args) {
      const { json, result } = await fishballCall(ctx.host, ctx.fb, PROMPT_TOOLS.answer, args)
      return { json, result }
    },
    managed: (sid) => managedEntry(ctx.host, sid),
    /** Free a session whose turn waits on a prompt nobody answers: stop the turn. */
    stop: (sid) => t.stop(sid),
  }
  return p
}

/** Every object inside a list anywhere in a tool answer (the design leaves the answer's key names open). */
export function entriesOf(json) {
  const found = []
  const walk = (x, depth) => {
    if (!x || typeof x !== 'object' || depth > 5) return
    if (Array.isArray(x)) { for (const v of x) { if (v && typeof v === 'object' && !Array.isArray(v)) found.push(v); walk(v, depth + 1) } return }
    for (const v of Object.values(x)) walk(v, depth + 1)
  }
  walk(json, 0)
  return found
}
export const idOf = (e) => e?.prompt_id ?? e?.promptId ?? e?.id
export const toolOf = (e) => e?.tool ?? e?.tool_name ?? e?.toolName
export const argsOf = (e) => { const a = e?.arguments ?? e?.args; if (typeof a !== 'string') return a; try { return JSON.parse(a) } catch { return a } }
/** The listed entry whose text mentions this token, or undefined. */
export const entryFor = (entries, token) => entries.find((e) => JSON.stringify(e).includes(token))
/** An answer that was refused: the tool said ok:false, or the call itself came back an error. */
export const refused = ({ json, result }) => json?.ok === false || (json === undefined && result?.isError === true) || result?.isError === true
export { jsonOf }

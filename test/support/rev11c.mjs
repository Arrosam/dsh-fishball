/**
 * Shared set-up for the rev11c files (your pile, buttons, tags; DESIGN §7a.6, §10e, §9): one booted host with the
 * scripted stock prompt after the broker (FBTEST_APPROVER_AFTER=1), Fishball live, and helpers that bring a
 * managed session's ask_fishball request into the pile (Fishball's fake model escalates it from a plan).
 * Expected values come from the requirements and DESIGN, never from the implementation.
 */
import assert from 'node:assert/strict'
import { ANSWER_TOOL, APPROVER_AFTER_ENV, ASK_TOOL, LIMITS, OUTCOME, STATUS } from './constants.mjs'
import { askStep, auditOf, callStep, fishballCall, jsonOf, managedSession, requestMessages, resultOfCall, settledIdle, stockSeen, storedRows, turn, untilCard, waitRequest } from './expect.mjs'
import { bootHost, newHome, sleep, until } from './host.mjs'

/** Something that must NOT happen is watched this long. */
export const QUIET_MS = 1000
/** An answer that comes "at once" (no Fishball step) arrives well inside this. */
export const AT_ONCE_MS = 3000

/** Unique tokens per file: `prefix` + label + counter + random suffix. */
export function tokens(prefix) {
  let seq = 0
  const tok = (label) => prefix + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
  return { tok, cid: (label) => 'call_' + tok(label) }
}

/** Boot a host in a fresh home and return the context every rev11c file uses. */
export async function pileHost(label, { env = {} } = {}) {
  const home = newHome(label)
  const ctx = { home, env: { ...APPROVER_AFTER_ENV, ...env } }
  await boot(ctx)
  return ctx
}

/** Boot (or reboot, after a restart) the host of ctx on its home; sets ctx.host and ctx.fb. */
export async function boot(ctx) {
  ctx.host = await bootHost(ctx.home, { env: ctx.env })
  ctx.fb = (await ctx.host.waitStatus(STATUS.live))?.sessionId
  await settledIdle(ctx.host, ctx.fb)
  await ctx.host.call('setApprover', { outcome: OUTCOME.reject })
  return ctx
}

/** The helpers bound to one ctx (host and fb are read at call time, so a reboot is followed). */
export function pileTools(ctx, { tok, cid }) {
  const t = {
    setLimit: async (patch) => { const r = await ctx.host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) },
    plan: (needle, args) => ctx.host.call('planApproval', { sessionId: ctx.fb, needle, args }),
    session: (folder) => managedSession(ctx.host, ctx.fb, folder),
    askArgs: (args, { quote = [], why = 'fbtest why' } = {}) => ({ tool: ASK_TOOL, arguments: args, quote, why }),
    /** Fishball answers a request in a turn of its own (answer_approval); returns the parsed answer. */
    async answer(requestId, args) {
      await settledIdle(ctx.host, ctx.fb)
      const { json, result } = await fishballCall(ctx.host, ctx.fb, ANSWER_TOOL, { request_id: requestId, ...args })
      assert.ok(json, 'answer_approval answered JSON: ' + result?.text)
      return json
    },
    /** The final result of the call with this id in a session started with driveStart. */
    async answered(sid, id) { const r = await resultOfCall(ctx.host, sid, id, 15000); assert.ok(r, 'a result for ' + id); return r.json },
    /** Start a turn whose ask_fishball waits for Fishball (no plan); returns the request id once its notice arrived. */
    async waiting(sid, text, id, after = [], opts) {
      await settledIdle(ctx.host, sid)
      await ctx.host.call('driveStart', { sessionId: sid, script: [askStep(t.askArgs({ text }, { why: 'why ' + text, ...opts }), id), ...after, [{ text: 'done' }]] })
      const req = await waitRequest(ctx.host, ctx.fb, text)
      assert.ok(req, 'the request reached Fishball: ' + (await requestMessages(ctx.host, ctx.fb)).at(-1)?.text?.slice(0, 800))
      await settledIdle(ctx.host, ctx.fb)
      return req.id
    },
    /**
     * Like waiting(), but Fishball escalates it (a plan), so it becomes a card. `after` are the agent's later steps,
     * `note` is Fishball's reason. Returns the request id and its card from the snapshot.
     */
    async escalated(sid, text, id, { after = [], note = 'fbtest note ' + text, ...opts } = {}) {
      await t.plan(text, { decision: 'escalate', risk: 'high', reason: note })
      const requestId = await t.waiting(sid, text, id, after, opts)
      const card = await untilCard(ctx.host, requestId)
      assert.ok(card, 'the escalated request is a card in the pile: ' + JSON.stringify((await ctx.host.state()).pile))
      return { requestId, card }
    },
    /** Run the stock prompt with this outcome for fn, then back to reject. */
    async withStock(outcome, fn) {
      await ctx.host.call('setApprover', { outcome })
      try { return await fn() } finally { await ctx.host.call('setApprover', { outcome: OUTCOME.reject }) }
    },
    run: (sid, steps, text) => turn(ctx.host, sid, [...steps, [{ text: 'done' }]], text),
    /** Stop a still-waiting session so it is free again. */
    async stop(sid) { await ctx.host.call('cancel', { sessionId: sid }); await ctx.host.call('waitIdle', { sessionId: sid }); await settledIdle(ctx.host, sid) },
    decisionsFor: (requestId) => storedRows(ctx.home, 'decisions').filter((d) => d.target === requestId),
    answersOf: (requestId) => auditOf(ctx.home, requestId).map((r) => r.answer),
    callStep: (text, id) => callStep({ text }, id),
    stockSeen: (text) => stockSeen(ctx.host, text),
  }
  return t
}

export { LIMITS, askStep, fishballCall, jsonOf, sleep, until }

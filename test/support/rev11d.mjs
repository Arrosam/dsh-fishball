/**
 * Shared set-up for the rev11d files (standing grants; DESIGN §7a.3, §7a.8, §9, §10e; requirements items 17-19):
 * the rev11c host (scripted stock prompt after the broker, Fishball live) with the shell fixture tools asking for
 * approval in their body (FBTEST_ASKING_TOOLS), plus helpers that make a managed session's direct call reach
 * Fishball, answer it, and tell a covered call (no Fishball step, no prompt) from an uncovered one.
 * Expected values come from the requirements and DESIGN, never from the implementation.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ANSWER_TOOL, ASKING_SHELL_ENV, DECISION, GRANTS_TABLE, GRANT_DECISION, OUTCOME, STORE } from './constants.mjs'
import { fishballCall, requestMessages, settledIdle, step, storedRows, turn, waitRequest } from './expect.mjs'
import { pileHost, pileTools, tokens } from './rev11c.mjs'

export { QUIET_MS, AT_ONCE_MS, boot, sleep, until } from './rev11c.mjs'

/** A time `ms` from now as the ISO text a grant's end time is given in. */
export const iso = (ms) => new Date(Date.now() + ms).toISOString()
export const HOUR = 3600 * 1000
export const YEAR = 365 * 24 * HOUR

export async function grantHost(label, { env = {} } = {}) {
  return pileHost(label, { env: { ...ASKING_SHELL_ENV, ...env } })
}

/** The grants table with its keys (the key is the grant id, §9). */
export function grantEntries(home) {
  try { return Object.entries(JSON.parse(fs.readFileSync(STORE.file(home), 'utf8')).tables?.[GRANTS_TABLE] ?? {}) } catch { return [] }
}

export function grantTools(ctx, names) {
  const t = pileTools(ctx, names)
  const g = {
    t,
    /** A model step that runs a shell-like tool with this command text. */
    cmd: (tool, command, id) => step(tool, { command }, id),
    /** Fishball's model-request count: a covered call must not add one (it takes no Fishball step). */
    fbSteps: async () => (await ctx.host.call('requests', { sessionId: ctx.fb })).length,
    notices: (needle) => requestMessages(ctx.host, ctx.fb, needle),
    snapshotGrants: async () => (await ctx.host.state()).grants,
    /** A direct call by sid: starts the turn, waits for Fishball's notice; returns the request id. The turn stays open. */
    direct: (sid, tool, command, id) => g.directWith(sid, tool, { command }, command, id),
    /** Like direct(), for any arguments; `needle` is a unique text inside them. */
    async directWith(sid, tool, args, needle, id) {
      await settledIdle(ctx.host, sid)
      await ctx.host.call('driveStart', { sessionId: sid, script: [step(tool, args, id), [{ text: 'done' }]] })
      const req = await waitRequest(ctx.host, ctx.fb, needle)
      assert.ok(req, 'the call with "' + needle + '" reached Fishball')
      await settledIdle(ctx.host, ctx.fb)
      return req.id
    },
    /** Answer a request; returns Fishball's parsed result. */
    answer: (requestId, args) => t.answer(requestId, args),
    /** Fishball rejects the request so the agent's turn can finish; returns the agent's result for the call id. */
    async finishRejected(requestId, sid, id) {
      const j = await g.answer(requestId, { decision: DECISION.reject, risk: 'high', reason: 'fbtest: done with ' + requestId })
      assert.equal(j.ok, true, JSON.stringify(j))
      await ctx.host.call('waitIdle', { sessionId: sid })
      await settledIdle(ctx.host, sid)
    },
    /** A direct call that creates a grant: returns {requestId, json, grantId}. */
    async create(sid, tool, command, grant, { id = 'call_' + command.replace(/\W+/g, '_') + Math.random().toString(36).slice(2, 6), finish = true, extra = {} } = {}) {
      const requestId = await g.direct(sid, tool, command, id)
      const json = await g.answer(requestId, { decision: GRANT_DECISION, risk: 'low', reason: 'fbtest: the user allowed this', grant, ...extra })
      if (finish && json.ok !== false) { await ctx.host.call('waitIdle', { sessionId: sid }); await settledIdle(ctx.host, sid) }
      let grantId = grantIdOf(json)
      // The design does not name the result's id field; fall back to the stored row (its key is the grant id, §9).
      if (!grantId && json.ok !== false) grantId = grantEntries(ctx.home).filter(([, v]) => v.sessionId === sid && v.toolName === tool && (grant.prefix === undefined || v.prefix === grant.prefix)).at(-1)?.[0]
      return { requestId, json, id, grantId }
    },
    /** One run of a call that is expected to be covered; returns the call's result text. */
    async covered(sid, tool, command, id = 'call_c' + Math.random().toString(36).slice(2, 8)) {
      await settledIdle(ctx.host, sid)
      const steps = await g.fbSteps()
      const noticesBefore = (await g.notices(command)).length
      const stock = (await ctx.host.call('approvals', {})).length
      const r = await turn(ctx.host, sid, [g.cmd(tool, command, id), [{ text: 'done' }]])
      const res = r.results.find((x) => x.callId === id)
      assert.match(res?.text ?? '', /allowed-once/, 'a covered call runs: ' + res?.text)
      assert.equal((await g.notices(command)).length, noticesBefore, 'no notice reached Fishball for "' + command + '"')
      assert.equal(await g.fbSteps(), steps, 'Fishball took no step')
      assert.equal((await ctx.host.call('approvals', {})).length, stock, 'no stock prompt')
      return { id, text: res.text }
    },
    /** A call that is expected NOT to be covered: reaches Fishball; it is rejected so the turn ends. Returns the request id. */
    async uncovered(sid, tool, command) {
      const id = 'call_u' + Math.random().toString(36).slice(2, 8)
      const requestId = await g.direct(sid, tool, command, id)
      await g.finishRejected(requestId, sid, id)
      return requestId
    },
  }
  return g
}

/** The grant id in an answer_approval / grant tool result (the design does not fix the key name). */
export function grantIdOf(json) {
  return json?.grant_id ?? json?.grantId ?? json?.grant?.grant_id ?? json?.grant?.grantId ?? json?.grant?.id ?? json?.id
}

/** A snapshot grant's id, whichever of the two usual key names it carries. */
export const snapId = (g) => g.grantId ?? g.id ?? g.grant_id
/** Active entries of the snapshot's grants for a session (an entry without a status counts as active). */
export const activeFor = (grants, sid) => (grants ?? []).filter((g) => g.sessionId === sid && (g.status === undefined || g.status === 'active'))
/** The end time of a snapshot or stored grant as epoch ms. */
export const endsAt = (g) => { const v = g.expiresAt ?? g.expires_at; return typeof v === 'number' ? v : Date.parse(v) }
export { ANSWER_TOOL, DECISION, OUTCOME, fishballCall, settledIdle, storedRows, tokens }

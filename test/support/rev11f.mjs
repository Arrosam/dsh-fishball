/**
 * Shared set-up for the rev11f files (Fishball's own requests; DESIGN §7a.11, §9 `own_requests`, §10e, §14, §16;
 * requirements items 21-24; S35). One booted host in a fresh home with the scripted stock prompt after the broker
 * (so a request that wrongly reaches the stock prompt is seen), Fishball live, and helpers to call one of
 * Fishball's tools, find the card the call filed, click Allow/Reject, and let Fishball's woken turn retry.
 * Expected values come from the requirements and DESIGN, never from the implementation.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ADDED_BUNDLE, APPROVER_AFTER_ENV, OUTCOME, OWN_REQUEST, STATUS, STORE, WITHDRAW_TOOL } from './constants.mjs'
import { answerCard, callTool, cardArguments, fishballMessages, jsonOf, pileNow, resultOfCall, settledIdle, turn } from './expect.mjs'
import { bootHost, newHome, sleep, until } from './host.mjs'

export { cardArguments, sleep, until }
export const QUIET_MS = 1000
/** A tool call that returns "at once": it files a card instead of waiting for the user (nothing installs, nothing prompts). */
export const AT_ONCE_MS = 10000
export const INSTALL_MS = 90000

export const tokens = (prefix) => {
  let seq = 0
  const tok = (label) => prefix + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
  return { tok, cid: (label) => 'call_' + tok(label) }
}

/** Boot a host (fresh home) for the rev11f files; `env` adds worker environment. Sets ctx.host and ctx.fb. */
export async function ownHost(label, env = {}) {
  const ctx = { home: newHome(label), env: { ...APPROVER_AFTER_ENV, ...env } }
  return bootOwn(ctx)
}
export async function bootOwn(ctx) {
  ctx.host = await bootHost(ctx.home, { env: ctx.env })
  ctx.fb = (await ctx.host.waitStatus(STATUS.live))?.sessionId
  await settledIdle(ctx.host, ctx.fb)
  await ctx.host.call('setApprover', { outcome: OUTCOME.reject })
  return ctx
}

/** The cards of Fishball's own requests in the snapshot (the asking session is Fishball's own). */
export const ownCards = async (ctx) => ((await pileNow(ctx.host)) ?? []).filter((c) => c.sessionId === ctx.fb)

/** The detail list of a card as entries: an array as given, or a text split at line ends. */
export function detailEntries(card) {
  const d = card?.detail
  if (Array.isArray(d)) return d.map(String)
  if (typeof d === 'string') return d.split('\n').filter((l) => l !== '')
  return undefined
}
/** The shown size of a detail list: its entries joined with a line end, in UTF-8 bytes, without a closing "and N more". */
export const detailBytes = (entries) => Buffer.byteLength(entries.join('\n'), 'utf8')

/** The own_requests table (key = request id) with its keys. */
export function ownRows(home) {
  try { return Object.entries(JSON.parse(fs.readFileSync(STORE.file(home), 'utf8')).tables?.[OWN_REQUEST.table] ?? {}) } catch { return [] }
}
export const ownRow = (home, requestId) => ownRows(home).find(([k, v]) => k === requestId || v?.requestId === requestId)?.[1]

/** The helpers bound to one ctx (host, fb and home are read at call time, so a reboot is followed). */
export function ownTools(ctx, { tok, cid }) {
  const t = {
    setLimit: async (patch) => { const r = await ctx.host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) },
    fbSteps: async () => (await ctx.host.call('requests', { sessionId: ctx.fb })).length,
    stockAsked: async () => (await ctx.host.call('approvals', { sessionId: ctx.fb })).length,
    /**
     * One Fishball turn that calls `tool` once. Returns the parsed result, the raw result and the card it filed
     * (the new card of Fishball's session in the pile, or undefined), plus how long the turn took.
     */
    async call(tool, args, id = cid('c')) {
      await settledIdle(ctx.host, ctx.fb)
      const had = new Set((await ownCards(ctx)).map((c) => c.requestId))
      const t0 = Date.now()
      const { result, requests } = await callTool(ctx.host, ctx.fb, tool, args)
      const took = Date.now() - t0
      const card = (await ownCards(ctx)).find((c) => !had.has(c.requestId))
      return { json: jsonOf(result), result, requests, card, took, id }
    },
    /** True when the result is the "waiting for your approval" answer. */
    isWaiting: (r) => r.json?.code === OWN_REQUEST.code || OWN_REQUEST.waiting.test(r.result?.text ?? ''),
    /**
     * Click Allow once / Reject on a card. With `retry` ({tool, args, id}), Fishball's woken turn is scripted to make
     * that call as its first step (it is woken by the "run it again" notice; the pass lasts as long as that turn);
     * an array of calls is made in order. Returns the route's answer and, with `retry`, the retry's parsed result (an array
     * for an array) once Fishball is idle again.
     */
    async click(requestId, decision, { retry, note } = {}) {
      await settledIdle(ctx.host, ctx.fb)
      const retries = [].concat(retry ?? [])
      if (retries.length) await ctx.host.call('queueMarker', { marker: requestId, script: [...retries.map((r) => [{ tool: r.tool, args: r.args, id: r.id }]), [{ text: 'done' }]] })
      const answer = await answerCard(ctx.host, requestId, decision, note)
      if (!retries.length) return { answer }
      const got = []
      for (const r of retries) got.push(await resultOfCall(ctx.host, ctx.fb, r.id, INSTALL_MS))
      await settledIdle(ctx.host, ctx.fb, INSTALL_MS)
      return { answer, retry: Array.isArray(retry) ? got : got[0], retries: got }
    },
    /** Fishball's user messages that name this request id. */
    notices: (requestId) => fishballMessages(ctx.host, ctx.fb, requestId),
    /** Withdraw a card with Fishball's tool. */
    withdraw: (requestId) => t.call(WITHDRAW_TOOL, { request_id: requestId }),
    /** A new add_plugin call for the fixture package; `reason` makes calls differ (the pass key covers every argument). */
    add: (reason, spec = ADDED_BUNDLE.dir) => t.call('add_plugin', { spec, reason }, cid('add')),
    /** Wait until the pile has no card of Fishball's session left. */
    async clearOwn() {
      for (const c of await ownCards(ctx)) await answerCard(ctx.host, c.requestId, 'reject')
      await until(async () => (await ownCards(ctx)).length === 0, 5000, 50)
      await settledIdle(ctx.host, ctx.fb)
    },
    /** Another message to Fishball: a plain turn; returns it. */
    another: (text) => turn(ctx.host, ctx.fb, [[{ text: 'ok' }]], text),
  }
  return t
}

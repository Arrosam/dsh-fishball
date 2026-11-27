/**
 * The one place that binds the C-WIRE-2 interaction cases to a real DSH: the C-WIRE world
 * (wire/world.mjs, one booted DSH per scenario and SDK, with this suite's worker extension) and the
 * stock MCP SDK client (wire/review/steps.mjs). No connector module is imported: the connector is
 * reached only as DSH and an MCP principal reach it.
 *
 * Steps state one oracle each. A "call" is one model tool call in a session's turn (the scripted
 * fake model answers each model request from the session's queue); its permission request reaches
 * the managing principal as a `permission` event, found by its DSH reason (the fixture's reason
 * names the call's unique text).
 */
import assert from 'node:assert/strict'
import { until } from '../wait.mjs'
import { call, connect, createToken, fresh, managedOf, okCall, refusedCall, saveTokens, tokensOf } from './steps.mjs'
import { scenario } from './world.mjs'
import { BUDGET, EVENT_TYPE, FIXTURE, IX, K1, RELAYED, SURFACE, TOOL, WORLD } from './interactions-constants.mjs'

export { call, connect, fresh, managedOf, okCall, refusedCall, saveTokens, tokensOf }

/** One booted DSH with the extension; `env` adds worker environment (e.g. PTC mode). */
export const world = (sdk, label = WORLD.scenario.main, env = {}) => scenario(sdk, label, { env: { [WORLD.envKey]: WORLD.extension, ...env } })

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const quiet = () => sleep(BUDGET.quietMs)
export const eventually = (predicate, ms = BUDGET.eventMs) => until(predicate, ms, BUDGET.pollMs)
let seq = 0
/** A unique token per case (fixed-width counter, so no token is a prefix of another). */
export const tok = (label) => FIXTURE.tokenPrefix + label + 'x' + String(++seq).padStart(4, '0') + Math.random().toString(36).slice(2, 7)
export const cid = (label) => 'call_' + tok(label)
export const bytes = (s) => Buffer.byteLength(String(s), 'utf8')
/** A text of exactly `n` UTF-8 bytes from `unit` (padded with one-byte characters). */
export function ofBytes(n, unit = FIXTURE.padUnit, head = '') {
  const room = n - bytes(head)
  const text = head + unit.repeat(Math.floor(room / bytes(unit))) + FIXTURE.padUnit.repeat(room % bytes(unit))
  assert.equal(bytes(text), n, 'harness: text size')
  return text
}

// ------------------------------------------------------------------------------------------------ principals

/** A paired principal: New token, a stock client, pair. `{made, id, client, principalKey, entryKey, value}` */
export async function principal(t, w, label = FIXTURE.label.p) {
  const made = await createToken(w, fresh(label))
  const id = fresh(FIXTURE.idBase)
  const client = await connect(t, w, { id, value: made.value })
  assert.equal((await okCall(client, TOOL.pair)).id, id)
  const row = (await w.service(SURFACE.service.handover, 'principals')).value.find((p) => p.id === id)
  assert.ok(row, 'the paired principal is not among principals()')
  return { made, id, client, principalKey: row.key, entryKey: made.entryKey, value: made.value }
}
/** The same principal through a new client (a reconnect, after a re-enable or a restart). */
export const reconnect = async (t, w, p) => ({ ...p, client: await connect(t, w, { id: p.id, value: p.value }) })

/** Every pending event of the caller, every page. */
export async function pending(client) {
  const events = []
  let cursor
  for (;;) {
    const page = await okCall(client, TOOL.inboxPoll, { limit: K1.MAILBOX.pageMax, ...(cursor ? { cursor } : {}) })
    events.push(...page.events)
    if (!page.hasMore) return events
    cursor = page.nextCursor
  }
}
/** Polls until `want(events)` returns a truthy value, and returns it. */
export async function waitEvents(client, want, what) {
  let found
  const ok = await eventually(async () => { found = want(await pending(client)); return found })
  assert.ok(ok, `${what} within ${BUDGET.eventMs} ms`)
  return found
}
/** Acks every pending event of the caller (frees the mailbox). */
export async function ackAll(client) {
  const events = await pending(client)
  if (events.length > 0) await okCall(client, TOOL.inboxAck, { receipts: events.map((e) => ({ eventId: e.eventId, payloadDigest: e.payloadDigest })) })
}
export const ofType = (events, type) => events.filter((e) => e.type === type)
export const settlementsOf = (events, approvalId) => ofType(events, EVENT_TYPE.settlement).filter((e) => e.payload.approvalId === approvalId)
export const retirementsOf = (events, eventId) => ofType(events, EVENT_TYPE.retirement).filter((e) => e.payload.retiredEventId === eventId)
export async function settlement(client, approvalId) {
  return waitEvents(client, (e) => settlementsOf(e, approvalId)[0], 'a settlement for ' + approvalId)
}
export async function retirement(client, event) {
  return waitEvents(client, (e) => retirementsOf(e, event.eventId)[0], 'a retirement of ' + event.eventId)
}

// ------------------------------------------------------------------------------------------------ sessions

/** A fresh session on `preset` (default: no tools of its own, so the fixture tools are what it sees). */
export const session = async (w, preset = IX.preset.bare) => (await w.call('createIn', { name: fresh(FIXTURE.folder), preset })).sessionId
export async function handOver(w, sessionId, p) {
  const r = await w.service(SURFACE.service.handover, 'handOver', sessionId, p.principalKey)
  assert.equal(r.value?.ok, true, 'Hand over: ' + JSON.stringify(r))
}
export async function takeBack(w, sessionId) {
  const r = await w.service(SURFACE.service.handover, 'takeBack', sessionId)
  assert.equal(r.value?.ok, true, 'Take back: ' + JSON.stringify(r))
}
/** A session on `preset` handed over to `p`. */
export async function managed(w, p, preset) {
  const sid = await session(w, preset)
  await handOver(w, sid, p)
  return sid
}
/** The session's title as sessions_list reports it to its manager `p` (the descriptor's `title` oracle). */
export async function titleOf(p, sid) {
  const row = (await okCall(p.client, TOOL.sessionsList, { limit: K1.PAYLOAD_LIMITS.sessionsListed })).sessions.find((s) => s.sessionId === sid)
  assert.ok(row, 'sessions_list does not list ' + sid)
  return row.title
}
/** Ends any running turn of `sid` so the next case's turn is not queued behind it. */
export async function free(w, sid) {
  if ((await w.call('status', { sessionId: sid })) === IX.dsh.running) await w.call('cancel', { sessionId: sid })
  await w.call('idle', { sessionId: sid })
}
/** A turn of `steps` (one model response each) and a closing text; waits until idle. */
export async function turn(w, sid, steps, text = tok('turn')) {
  await free(w, sid)
  await w.call('driveStart', { sessionId: sid, text, script: [...steps, [{ text: 'done' }]] })
  assert.ok(await w.call('idle', { sessionId: sid }), 'the turn did not end')
}
/** The arguments a fixture tool's call carries for `text` (terminal_send reads `text`, the shells `command`). */
export const argsFor = (tool, text) => (RELAYED.prefixTools[tool] ? { [RELAYED.prefixTools[tool]]: text } : { text })
/** One model step calling `tool` with `args` under call id `id`. */
export const step = (tool, args, id) => [{ tool, args, id }]

/** The final tool result of call `id` in `sid` (DSH's log). */
export async function resultOf(w, sid, id) {
  let found
  assert.ok(await eventually(async () => { found = (await w.call('results', { sessionId: sid })).find((r) => r.callId === id); return found }), 'no result for ' + id)
  return found
}
/** The JSON a tool result carries (its whole text, else the outermost {...} in it). */
export function jsonOf(result) {
  const text = result?.text ?? ''
  try { return JSON.parse(text) } catch { /* fall through */ }
  const start = text.indexOf('{')
  if (start < 0) return undefined
  try { return JSON.parse(text.slice(start, text.lastIndexOf('}') + 1)) } catch { return undefined }
}
/** Every result of call `id` in `sid` (a repeated call id has several). */
export const resultsOf = async (w, sid, id) => (await w.call('results', { sessionId: sid })).filter((r) => r.callId === id)
/** The fixture calls carrying `text` (in `sid` when given), oldest first. */
export const callsWith = async (w, text, sid) => (await w.call('calls')).filter((c) => c.text === text && (!sid || c.sessionId === sid))
/** The newest fixture call carrying `text` (in `sid`), once DSH answered its approval request. */
export async function decided(w, text, sid) {
  let found
  assert.ok(await eventually(async () => { found = (await callsWith(w, text, sid)).at(-1); return found?.outcome !== null && found !== undefined }), 'the call with ' + text + ' was never decided')
  return found
}
/** The stock prompts shown for the fixture call carrying `text` (its DSH reason). */
export const stockFor = async (w, text) => (await w.call('stock')).filter((s) => s.reason === IX.fixture.reason(text))
export async function untilStock(w, text) {
  assert.ok(await eventually(async () => (await stockFor(w, text)).length > 0), 'the stock prompt was not shown for ' + text)
  return stockFor(w, text)
}
/** The user clicks Allow once / Reject on the call's open stock prompt. */
export async function userClicks(w, text, outcome) {
  assert.equal(await w.call('releaseStock', { needle: IX.fixture.reason(text), outcome }), true, 'no open stock prompt for ' + text)
}

// ------------------------------------------------------------------------------------------------ permission requests

/**
 * Starts a turn in `sid` whose model calls `tool` once with the arguments for `text` (plus `extra`),
 * and returns the `permission` event the managing principal `p` gets for it:
 * `{event, d: descriptor, offer, id: the model's call id, text}`. The turn keeps waiting.
 */
export async function asked(w, p, sid, { tool = IX.fixture.askTool, text = tok('apr'), extra = {}, args, id = cid('apr') } = {}) {
  await free(w, sid)
  const seen = new Set((await pending(p.client)).map((e) => e.eventId))
  const callArgs = args ?? { ...argsFor(tool, text), ...extra }
  await w.call('driveStart', { sessionId: sid, text: tok('user'), script: [step(tool, callArgs, id), [{ text: 'done' }]] })
  const event = await waitEvents(p.client, (e) => ofType(e, EVENT_TYPE.permission).find((x) => !seen.has(x.eventId) && x.payload.reason === IX.fixture.reason(text)), 'a permission event for ' + text)
  return { event, d: event.payload, offer: event.offer, id, text, sid, tool, args: callArgs }
}
/** The permission events `p` got for the call carrying `text` so far. */
export const permissionsFor = async (p, text) => ofType(await pending(p.client), EVENT_TYPE.permission).filter((e) => e.payload.reason === IX.fixture.reason(text))
/** approval_answer on the request's current offer (or the given ids). */
export const answer = (p, r, a, ids = {}) => call(p.client, TOOL.approvalAnswer, {
  sessionId: ids.sessionId ?? r.sid, approvalId: ids.approvalId ?? r.d.approvalId, offerId: ids.offerId ?? r.offer.offerId, answer: a,
})
export const listed = async (p, sid) => (await okCall(p.client, TOOL.approvalsList, { sessionId: sid })).approvals
export const isListed = async (p, r) => (await listed(p, r.sid)).some((x) => x.approvalId === r.d.approvalId)
/** Answer shapes. */
export const A = Object.freeze({
  allow: (reason = FIXTURE.reason) => ({ decision: K1.APPROVAL_DECISION.allow, risk: K1.RISK.low, reason }),
  // Every decision but escalate names its risk (V2's rule, relayed for C-WIRE-2).
  reject: (reason = FIXTURE.otherReason) => ({ decision: K1.APPROVAL_DECISION.reject, risk: K1.RISK.high, reason }),
  escalate: () => ({ decision: K1.APPROVAL_DECISION.escalate }),
  grant: (grant, reason = FIXTURE.reason) => ({ decision: K1.APPROVAL_DECISION.grant, risk: K1.RISK.low, reason, grant }),
})
export const prefixGrant = (prefix, ms = FIXTURE.hourMs) => ({ kind: K1.GRANT_KIND.prefix, prefix, expiresAt: Date.now() + ms })
export const exactGrant = (ms = FIXTURE.hourMs) => ({ kind: K1.GRANT_KIND.exact, expiresAt: Date.now() + ms })

/** Ends a still-waiting request so its session is free: the user stops the turn. */
export const stop = (w, sid) => free(w, sid)

/**
 * A call that a standing grant should cover: it runs (allowed once) with no permission event for it
 * and no stock prompt.
 */
export async function assertCovered(w, p, sid, tool, text, args = argsFor(tool, text)) {
  const id = cid('cov')
  const offered = (await permissionsFor(p, text)).length
  const shown = (await stockFor(w, text)).length
  const before = (await callsWith(w, text, sid)).length
  await turn(w, sid, [step(tool, args, id)])
  assert.equal((await callsWith(w, text, sid)).length, before + 1, 'the call did not run: ' + text)
  assert.equal((await decided(w, text, sid)).outcome, IX.outcome.allowed, 'a covered call was not allowed: ' + text)
  await quiet()
  assert.equal((await permissionsFor(p, text)).length, offered, 'a covered call was offered: ' + text)
  assert.equal((await stockFor(w, text)).length, shown, 'a covered call showed the stock prompt: ' + text)
}
/** A call no grant covers: it is offered to `p`; it is then rejected so the turn ends. */
export async function assertOffered(w, p, sid, tool, text, args) {
  const r = await asked(w, p, sid, { tool, text, ...(args ? { args } : {}) })
  assert.equal((await answer(p, r, A.reject())).ok, true)
  await w.call('idle', { sessionId: sid })
  return r
}

// ------------------------------------------------------------------------------------------------ questions

/**
 * Starts a turn whose model calls ask_user_question; returns the `question` event for it and the open card.
 * `asks(args, id)` is the model step that asks (default: ask_user_question called directly).
 */
export async function questioned(w, p, sid, { text = tok('q'), questions = FIXTURE.single(text), extra = {}, id = cid('q'), asks = (args, callId) => step(IX.dsh.askTool, args, callId) } = {}) {
  await free(w, sid)
  const before = (await w.call('cards', { sessionId: sid })).length
  await w.call('driveStart', { sessionId: sid, text: tok('user'), script: [asks({ questions, ...extra }, id), [{ text: 'done' }]] })
  const event = await waitEvents(p.client, (e) => ofType(e, EVENT_TYPE.question).find((x) => JSON.stringify(x.payload.questions ?? []).includes(text)), 'a question event for ' + text)
  let card
  assert.ok(await eventually(async () => { card = (await w.call('cards', { sessionId: sid })).slice(before).at(-1); return card }), 'the session\'s own card did not open (q2)')
  return { event, d: event.payload, offer: event.offer, id, text, sid, card, questions }
}
/** Enters plan mode and starts a turn whose model presents a plan; returns the `plan-review` event and card. */
export async function planned(w, p, sid, { text = tok('plan'), id = cid('plan') } = {}) {
  await free(w, sid)
  assert.notEqual(await w.call('planCommand', { sessionId: sid }), null, 'no /plan command in this session')
  const before = (await w.call('cards', { sessionId: sid })).length
  await w.call('driveStart', { sessionId: sid, text: tok('user'), script: [step(IX.dsh.planTool, { plan: FIXTURE.planText(text) }, id), [{ text: 'done' }]] })
  const event = await waitEvents(p.client, (e) => ofType(e, EVENT_TYPE.planReview).find((x) => JSON.stringify(x.payload.questions ?? []).includes(text)), 'a plan-review event for ' + text)
  let card
  assert.ok(await eventually(async () => { card = (await w.call('cards', { sessionId: sid })).slice(before).at(-1); return card }), 'the plan review\'s own card did not open')
  return { event, d: event.payload, offer: event.offer, id, text, sid, card }
}
export const qAnswer = (p, r, rest, ids = {}) => call(p.client, TOOL.questionAnswer, {
  sessionId: ids.sessionId ?? r.sid, questionId: ids.questionId ?? r.d.approvalId, offerId: ids.offerId ?? r.offer.offerId, ...rest,
})
export const cardOf = async (w, r) => (await w.call('cards', { sessionId: r.sid })).find((c) => c.index === r.card.index)
/** The answer batch a question call returned (dsh-tool-ask-user renders `{answers}` as JSON). */
export const batchOf = (result) => jsonOf(result)?.answers

// ------------------------------------------------------------------------------------------------ settings

const S = SURFACE.settings
export const settingsValue = async (w) => (await w.settings())?.value ?? {}
export async function setLimit(t, w, field, value) {
  const was = (await settingsValue(w))[field]
  t.after(() => w.call('settingsUpdate', { patch: { [field]: was } }))
  const r = await w.call('settingsUpdate', { patch: { [field]: value } })
  assert.equal(r.ok, true, `${field} = ${value}: ${JSON.stringify(r)}`)
}
/** The user switches `p`'s entry off (or on) in the tokens list. */
export async function setEnabled(w, p, enabled) {
  const r = await saveTokens(w, (await tokensOf(w)).map((i) => (i.key === p.entryKey ? { ...i, enabled } : i)))
  assert.equal(r.ok, true, JSON.stringify(r))
}
export const tokensKey = S.tokens
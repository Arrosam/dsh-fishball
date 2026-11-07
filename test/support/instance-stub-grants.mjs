/**
 * Group C on H-STUB (docs/test-design/connector.md "H-STUB details"): standing grants, prompts already
 * showing (frozen prompts) and the cards of direct calls sent to the user. The in-process Fishball and its
 * tools are gone (slim-native-design §12); the stub instance now does what Fishball's tools did, through the
 * contract: `approval.answer` (with `decision:'grant'`), `grant.list`, `grant.revoke`, `prompt.list`,
 * `prompt.answer` and `session.release` (contract §4.2, §4.3), and it observes `approval.request`,
 * `approval.settled` and `approval.ran` (§5). Expected values come from the contract, DESIGN §7a and §9 and
 * the old files' header tables, never from the connector's code.
 *
 * The host runs the scripted stock prompt AFTER the connector's broker (FBTEST_APPROVER_AFTER=1) and the shell
 * fixture tools ask DSH for approval in their body (FBTEST_ASKING_TOOLS, ASKING_SHELL_ENV).
 */
import assert from 'node:assert/strict'
import { ENVELOPE, ERROR, EVENT, GRANT_KIND, OPERATION, RECORD_ITEM, RISK } from 'fishball-connector/contract'
import { APPROVER_AFTER_ENV, APPROVER_HOLDS, ASKING_SHELL_ENV, ASK_TOOL, OUTCOME, PRESET } from './constants.mjs'
import { approvalAudit, auditOf, settledIdle, step, stockSeen, storedRows, turn } from './expect.mjs'
import { bootStub, restartStub, userSession } from './instance-stub.mjs'
import { STUB } from './instance-stub-data.mjs'
import { grantEntries } from './rev11d.mjs'
import { sleep, until } from './util.mjs'

const HOUR_MS = 3600 * 1000

/** Group C vocabulary and timings (retired cases are listed in each file's header). */
export const GRANT_C = Object.freeze({
  hourMs: HOUR_MS,
  yearMs: 365 * 24 * HOUR_MS,
  /** A grant end time this close is still in the future when the answer reaches the connector. */
  shortGrantMs: 6000,
  /** Margin past an end time before a run is expected to go to the instance again. */
  pastEndMs: 800,
  /** How far a grant's reported end time may sit from the one given (epoch ms both sides, contract §3.1). */
  endToleranceMs: 1000,
  /** A timed-out request becomes a card "after about 1 s" (approvalAnswerSeconds 1): its lower bound. */
  answerSecondsMs: 1000,
  /** Something that must NOT happen is watched this long. */
  quietMs: STUB.quietMs,
  /** The tables of the connector store (DESIGN §9). */
  table: Object.freeze({ decisions: 'decisions', grants: 'grants' }),
  status: Object.freeze({ active: 'active', expired: 'expired', revoked: 'revoked', ended: 'ended' }),
  endedBy: Object.freeze({ fishball: 'fishball', expiry: 'expiry', takeBack: 'take-back', release: 'release' }),
  /** DESIGN §9 "Fishball's other decisions" actions and `by` values. */
  action: Object.freeze({ grant: 'grant', revoke: 'revoke', answerPrompt: 'answer-prompt', allowOnce: 'allow-once', reject: 'reject' }),
  by: Object.freeze({ fishball: 'fishball', user: 'user' }),
  /** DESIGN §9 Audit answers and kinds. */
  audit: Object.freeze({ grant: 'grant', used: 'grant-used', escalate: 'escalate', timeout: 'timeout', prompt: 'prompt' }),
  /** Contract §4.3: the exact keys of one prompt.list and one grant.list entry (`?` keys may be absent). */
  promptKeys: Object.freeze(['argumentsStatus', 'managed', 'promptId', 'sessionId', 'since', 'title', 'toolName']),
  grantKeys: Object.freeze(['expiresAt', 'grantId', 'kind', 'paused', 'sessionId', 'toolName', 'uses']),
  /** DESIGN §9 managed registry: the way a session became managed through prompt.answer. */
  promptManagedBy: 'prompt-answer',
  /** The instance's reason texts (any non-empty text). */
  reason: 'fbtest: the user allowed this',
  rejectReason: 'fbtest: done with this request',
  /** The terminal tool carries its command text in `text` (DESIGN §7a.8); the asking fixture tool too. */
  textArgTools: Object.freeze(['terminal_send', ASK_TOOL]),
})

/** A time `ms` from now as the epoch milliseconds the contract carries (§3.1). */
export const inMs = (ms) => Date.now() + ms

/** Unique tokens per file: prefix + label + counter + random suffix. */
export function tokens(prefix) {
  let seq = 0
  const tok = (label) => prefix + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
  return { tok, cid: (label) => 'call_' + tok(label) }
}

/** The arguments a shell-like fixture tool takes for one command text. */
export const argsFor = (tool, command) => (GRANT_C.textArgTools.includes(tool) ? { text: command } : { command })

/** The boot options of a group C host: the stock prompt after the broker, the asking shell tools. */
const hostEnv = (env) => ({ ...APPROVER_AFTER_ENV, ...ASKING_SHELL_ENV, ...env })

/** Boot a group C host; the stock prompt rejects by default so an unexpected prompt never hangs a turn. */
export async function grantStub(label, { env = {} } = {}) {
  const ctx = { env: hostEnv(env) }
  Object.assign(ctx, await bootStub(label, { env: ctx.env }))
  await ctx.host.call('setApprover', { outcome: OUTCOME.reject })
  return ctx
}

/** Restart DSH on ctx's home with the same env and attach again; the ctx object follows the new host. */
export async function restartGrantStub(ctx) {
  Object.assign(ctx, await restartStub(ctx, { env: ctx.env }))
  await ctx.host.call('setApprover', { outcome: OUTCOME.reject })
  return ctx
}

/**
 * Attach again when the connector closed the channel, so one failing case (a refusal that closed the channel
 * instead of answering an error frame) does not take the following cases down with it.
 */
export async function reattachIfClosed(ctx) {
  if (!(await ctx.stub.transportCalls()).closedByConnector) return false
  const a = await ctx.stub.attach()
  assert.ok(a.ok && a.handshake?.type === ENVELOPE.type.response, 'reattach: ' + JSON.stringify(a))
  return true
}

/**
 * Assert a refusal as contract §4.2/§4.3 name it: an `error` frame with that code, and the channel left open
 * (an operation's refusal is an ordinary error frame, §3.1).
 */
export async function assertRefused(ctx, reply, code) {
  const closed = (await ctx.stub.transportCalls()).closedByConnector
  assert.deepEqual({ type: reply.type, code: reply.payload?.code ?? reply.code, closed }, { type: ENVELOPE.type.error, code, closed: false }, 'refused with an error frame ' + code + ', channel open: ' + JSON.stringify(reply))
}

/**
 * A refusal where the contract allows either form (a limit over its bound, §8 "refused (limit-exceeded)", or a
 * payload missing a required key, §3.1 "a missing required key rejects the frame"): never a response.
 */
export function assertNotAccepted(reply) {
  assert.notEqual(reply.type, ENVELOPE.type.response, 'not accepted: ' + JSON.stringify(reply))
  if (reply.type === ENVELOPE.type.error) assert.ok(Object.values(ERROR).includes(reply.payload?.code), 'a contract code: ' + JSON.stringify(reply))
}

/** The grants table of the store as [grantId, row] pairs, and one row. */
export const grantRow = (ctx, grantId) => grantEntries(ctx.home).find(([k]) => k === grantId)?.[1]
export const grantRowCount = (ctx) => grantEntries(ctx.home).length
/** The decisions rows (DESIGN §9), all or about one target. */
export const decisions = (ctx, target) => storedRows(ctx.home, GRANT_C.table.decisions).filter((d) => target === undefined || d.target === target)
/** The stored end time of a grant row (ISO in the store) as epoch ms. */
export const rowEnd = (row) => Date.parse(row.expiresAt)

/** grant.list's entries; asserts the operation answered a response. */
export async function listedGrants(ctx) {
  const r = await ctx.stub.op(OPERATION.grantList, {})
  assert.equal(r.type, ENVELOPE.type.response, 'grant.list answers: ' + JSON.stringify(r))
  return r.payload.grants
}
export const listedGrant = async (ctx, grantId) => (await listedGrants(ctx)).find((g) => g.grantId === grantId)

/** approval.list of one session: the approval ids still offered (contract §4.2). */
export async function offeredIds(ctx, sid) {
  const r = await ctx.stub.op(OPERATION.approvalList, { sessionId: sid }, sid)
  assert.equal(r.type, ENVELOPE.type.response, 'approval.list answers: ' + JSON.stringify(r))
  return r.payload.approvals.map((a) => a.approvalId)
}

/** The approval.request descriptors for one call id received so far. */
export const requestsFor = async (ctx, callId) => (await ctx.stub.events(EVENT.approvalRequest)).filter((f) => f.payload.callId === callId).map((f) => f.payload)
/** The approval.settled payloads of one approval id. */
export const settledFor = async (ctx, approvalId) => (await ctx.stub.events(EVENT.approvalSettled)).filter((f) => f.payload.approvalId === approvalId).map((f) => f.payload)
/** The approval.ran payloads whose arguments equal args. */
export const ranFor = async (ctx, args) => (await ctx.stub.events(EVENT.approvalRan)).map((f) => f.payload).filter((p) => p.arguments !== undefined && JSON.stringify(JSON.parse(p.arguments)) === JSON.stringify(args))
/** inbox.push payloads from one session, card records left out (they record an ended card, not a notice). */
export const noticesFrom = async (ctx, sid) => (await ctx.stub.pushes()).map((f) => f.payload).filter((p) => p.sourceSessionId === sid && !RECORD_ITEM.pattern.test(p.text))

/** Start a turn in sid whose one step calls tool with args; the turn stays open while the call waits. */
export async function startCall(ctx, sid, tool, args, callId) {
  await settledIdle(ctx.host, sid)
  await ctx.host.call('driveStart', { sessionId: sid, script: [step(tool, args, callId), [{ text: 'done' }]] })
}

/** A direct call in a managed session that reaches the instance: returns its approval.request descriptor. */
export async function direct(ctx, sid, tool, args, callId) {
  // A previous case's refusal may have closed the channel (each such case asserts and reports that itself);
  // without an instance the call would go to the stock prompt, so attach again first.
  await reattachIfClosed(ctx)
  await startCall(ctx, sid, tool, args, callId)
  const frame = await ctx.stub.waitEvent(EVENT.approvalRequest, (p) => p.callId === callId)
  assert.ok(frame, 'the call ' + callId + ' reached the instance as approval.request')
  return frame.payload
}

/** approval.answer for one descriptor. */
export const answer = (ctx, sid, desc, a) => ctx.stub.op(OPERATION.approvalAnswer, { sessionId: sid, approvalId: desc.approvalId, offerId: desc.offerId, answer: a }, sid)

/** A grant answer with allow's rules met. */
export const grantAnswer = (grant, extra = {}) => ({ decision: 'grant', risk: RISK.low, reason: GRANT_C.reason, grant, ...extra })
export const prefixGrant = (prefix, ms = GRANT_C.hourMs) => ({ kind: GRANT_KIND.prefix, prefix, expiresAt: inMs(ms) })
export const exactGrant = (ms = GRANT_C.hourMs) => ({ kind: GRANT_KIND.exact, expiresAt: inMs(ms) })

/** The instance rejects the request so the agent's turn can end (and so proves it was still pending). */
export async function finishRejected(ctx, sid, desc) {
  await reattachIfClosed(ctx)
  const r = await answer(ctx, sid, desc, { decision: 'reject', risk: RISK.high, reason: GRANT_C.rejectReason })
  await ctx.host.call('waitIdle', { sessionId: sid })
  await settledIdle(ctx.host, sid)
  return r
}

/** A direct call answered with a grant: {desc, reply, grantId}. The turn is finished either way. */
export async function create(ctx, sid, tool, command, grant, callId) {
  const desc = await direct(ctx, sid, tool, argsFor(tool, command), callId)
  const reply = await answer(ctx, sid, desc, grantAnswer(grant))
  if (reply.type === ENVELOPE.type.response) { await ctx.host.call('waitIdle', { sessionId: sid }); await settledIdle(ctx.host, sid) } else await finishRejected(ctx, sid, desc)
  return { desc, reply, grantId: reply.payload?.grantId }
}

/** A session-specific turn running one call to its end; returns that call's result. */
async function runCall(ctx, sid, tool, args, callId) {
  await settledIdle(ctx.host, sid)
  const r = await turn(ctx.host, sid, [step(tool, args, callId), [{ text: 'done' }]])
  return r.results.find((x) => x.callId === callId)
}

/**
 * One run of a call a grant covers (DESIGN §7a.8): it runs (allowed-once) with no approval.request and no
 * notice to the instance and no stock prompt, and one approval.ran {via: grant} reports it (contract §5).
 */
export async function covered(ctx, sid, tool, args, callId) {
  const stock = (await ctx.host.call('approvals', {})).length
  const ranBefore = (await ranFor(ctx, args)).length
  const res = await runCall(ctx, sid, tool, args, callId)
  assert.match(res?.text ?? '', /allowed-once/, 'a covered call runs: ' + JSON.stringify(res))
  assert.deepEqual(await requestsFor(ctx, callId), [], 'no approval.request reached the instance')
  assert.equal((await ctx.host.call('approvals', {})).length, stock, 'no stock prompt')
  const ran = await until(async () => { const r = await ranFor(ctx, args); return r.length > ranBefore ? r : false }, STUB.waitMs, STUB.pollMs)
  assert.ok(ran, 'approval.ran reports the covered call')
  const last = ran.at(-1)
  assert.deepEqual({ via: last.via, by: last.by, toolName: last.toolName }, { via: 'grant', by: GRANT_C.by.fishball, toolName: tool })
  return res
}

/** A call no grant covers: it reaches the instance, which rejects it. Returns its descriptor. */
export async function uncovered(ctx, sid, tool, args, callId) {
  const desc = await direct(ctx, sid, tool, args, callId)
  await finishRejected(ctx, sid, desc)
  return desc
}

/** Grant-used audit rows of one grant (DESIGN §9 Audit). */
export const usedRows = (ctx, grantId) => approvalAudit(ctx.home).filter((a) => a.record.answer === GRANT_C.audit.used && a.record.grantId === grantId)
export { auditOf }

// ---- prompts already showing (DESIGN §7a.9) ----

/** A session that is the user's (not managed) with one plain turn behind it. */
export const yours = (ctx, folder) => userSession(ctx.host, folder, PRESET.bare)

/**
 * A turn in sid whose fbtest_ask call asks DSH; the scripted stock prompt is HELD (it "shows" until someone
 * clicks or the plugin closes it). Returns once the prompt shows; the turn stays open.
 */
export async function show(ctx, sid, text, callId, extra = {}) {
  await ctx.host.call('setApprover', { outcome: APPROVER_HOLDS })
  try {
    await startCall(ctx, sid, ASK_TOOL, { text, ...extra }, callId)
    assert.ok(await until(async () => (await stockSeen(ctx.host, text))[0] ?? false, STUB.waitMs, STUB.pollMs), 'the stock prompt shows for ' + text)
  } finally { await ctx.host.call('setApprover', { outcome: OUTCOME.reject }) }
}
/** The stock prompt record for this text (with `closed`), the newest. */
export const promptOf = async (ctx, text) => (await stockSeen(ctx.host, text)).at(-1)
/** Your own click in a session's stock prompt: answers the oldest held prompt. */
export async function click(ctx, outcome) { assert.equal(await ctx.host.call('releaseApproval', { outcome }), true, 'a prompt was showing to click') }
/** prompt.list's entries; asserts a response. */
export async function listedPrompts(ctx) {
  const r = await ctx.stub.op(OPERATION.promptList, {})
  assert.equal(r.type, ENVELOPE.type.response, 'prompt.list answers: ' + JSON.stringify(r))
  return r.payload.prompts
}
/** The listed prompts of one session. */
export const promptsOf = async (ctx, sid) => (await listedPrompts(ctx)).filter((p) => p.sessionId === sid)
/** prompt.answer for a listed prompt. */
export const answerPrompt = (ctx, sid, promptId, fields) => ctx.stub.op(OPERATION.promptAnswer, { sessionId: sid, promptId, ...fields }, sid)
/** The final result {callId, text, isError} of one call after its session's turn ends. */
export async function resultOf(ctx, sid, callId) {
  await ctx.host.call('waitIdle', { sessionId: sid })
  const events = (await ctx.host.call('inspect', { sessionId: sid, events: true })).events
  const e = events.find((x) => x.type === 'tool/result' && x.result.callId === callId)
  assert.ok(e, 'a result for ' + callId)
  return e.result
}
/** The snapshot's managed entry of one session. */
export const managedOf = async (ctx, sid) => ((await ctx.host.state())?.managed ?? []).find((e) => e.sessionId === sid)
/** Stop a waiting turn so the session is free again. */
export async function stopTurn(ctx, sid) {
  await ctx.host.call('cancel', { sessionId: sid })
  await ctx.host.call('waitIdle', { sessionId: sid })
  await settledIdle(ctx.host, sid)
}
/** A text (a reason or a prefix) of exactly n code points that starts with a token. */
export const sizedText = (n, token) => (token + ' ' + 'r'.repeat(n)).slice(0, n)

export { sleep, until }

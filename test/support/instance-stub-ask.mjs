/**
 * H-STUB group B: ask_fishball, list_user_messages, quotes, and the cards that go to the user (Allow once /
 * Reject on the ask_fishball row). Sources: DESIGN §7a.2, §7a.3, §7a.5, §7a.6, §9, §10e, §16; contract §4.2,
 * §5, §5.1, §9; docs/test-design/connector.md C1-EP-02, C1-DT-02; slim-native-design §12.
 *
 * The in-process Fishball is gone (slim §12): the fake instance answers through `approval.answer`, and what
 * used to be "Fishball's notice" is now an `inbox.push` of kind `approval` plus an `approval.request` event
 * (contract §4.5, §5). The pile UI went with it, but the snapshot keeps `pile`, and a card that goes to the
 * user is answered on its own session's ask_fishball row, which calls POST /api/fishball/requests/answer
 * (§10e "Host API"), so the route is what these cases click.
 *
 * One host per file (APPROVER_AFTER: the scripted stock prompt sits after the connector's broker, and the
 * asking fixture tool fbtest_ask asks DSH in its body). The scripted stock prompt answers `rejected` unless a
 * case sets another outcome, so an unexpected prompt never hangs a turn.
 */
import assert from 'node:assert/strict'
import { EVENT, SETTLED_BY } from 'fishball-connector/contract'
import { APPROVAL_ID, APPROVER_AFTER_ENV, ASK_CODE, ASK_OUTPUT, ASK_REFUSALS, ASK_TOOL, DECISIONS_TABLE, OUTCOME } from './constants.mjs'
import { answerCard, askStep, auditOf, callStep, resultOfCall, settledIdle, stockSeen, storedRows, turn, untilCard, untrustedBlock } from './expect.mjs'
import { ENVELOPE, KIND, OPERATION, STUB, bootStub, managedSession, restartStub, stopStub } from './instance-stub.mjs'
import { tokens } from './rev11c.mjs'
import { sleep, until } from './util.mjs'

export { tokens }

export const ASK_STUB = Object.freeze({
  /** Something that must NOT happen is watched this long. */
  quietMs: 1000,
  /** An answer that comes "at once" (no instance involved) arrives well inside this. */
  atOnceMs: 3000,
  /** The wait for a call's final result in a turn started with driveStart. */
  resultWaitMs: 15000,
  /** The wait for an offer (approval.request) or a card. */
  offerWaitMs: 10000,
  /** A thread of several rounds runs longer than one case's default. */
  long: Object.freeze({ timeout: 120000 }),
  /** The closing text step every scripted turn ends with. */
  closing: Object.freeze([{ text: 'done' }]),
  /** The default reason an agent gives on its ask_fishball. */
  why: 'fbtest why',
  /** The trusted head of a permission-request inbox item, and the request id in it (DESIGN §7a.2 "What Fishball is given"). */
  noticeHead: /^\[permission request (apr_[0-9a-f]+)\]/,
  noticePrefix: (requestId) => '[permission request ' + requestId + ']',
  /** The header says the session asked first (DESIGN §7a.2: "the kind (asked first, or a direct call)"). */
  askedFirst: /ask_fishball/,
  /** A well-formed request id nobody minted. */
  unknownRequestId: 'apr_0123456789abcdef',
  /** An Origin the same-origin fence must refuse (§10e "same-origin fence"). */
  foreignOrigin: 'http://fbtest-foreign.example',
  /** decisions rows written for your clicks (§9 "Your clicks are audited"). */
  by: SETTLED_BY,
  /** Who wrote a thread entry (DESIGN §9 "Request threads": from 'agent' | 'fishball'). */
  threadFrom: Object.freeze({ fishball: 'fishball', agent: 'agent' }),
  /** Agent status while its tool call waits. */
  running: 'running',
  /** Why a case of the old files is retired (slim-native-design §12). */
  retired: Object.freeze({
    fishballOwnTools: 'the in-process Fishball session and its own tools are deleted (slim-native-design §12); the instance has its own tool list',
    ownRequestCap: "Fishball's own requests (set_plugin_enabled and the other private-tree tools) are deleted with the in-process Fishball (slim-native-design §12); no instance operation files an own permission card",
    pileHeight: 'pileMaxHeightVh went with the pile UI (slim-native-design §12, conn-OQ-20: removed from the connector form)',
  }),
})

/** Boot one H-STUB host for a group-B file; ctx is {host, home, stub, env} and follows restarts. */
export async function askHost(label, { env = {} } = {}) {
  const ctx = { env: { ...APPROVER_AFTER_ENV, ...env } }
  Object.assign(ctx, await bootStub(label, { env: ctx.env }))
  await ctx.host.call('setApprover', { outcome: OUTCOME.reject })
  return ctx
}
/** Stop DSH and boot the same home again (the session cards must not survive, §7a.6 "Leaving"). */
export async function restartAsk(ctx) {
  Object.assign(ctx, await restartStub(ctx, { env: ctx.env }))
  await ctx.host.call('setApprover', { outcome: OUTCOME.reject })
  return ctx
}
export const stopAsk = (ctx) => stopStub(ctx)

/**
 * The shape every ask_fishball answer has (§7a.2 "Results"): a stable code, ok true only for allowed, and a
 * request id except on the refusals made before anything is sent.
 */
export function assertShape(json, code, label = '') {
  assert.equal(json?.code, code, label + JSON.stringify(json))
  assert.equal(json.ok, code === ASK_CODE.allowed, label + 'ok is true only for allowed')
  if (ASK_REFUSALS.includes(code)) assert.equal(json.request_id, undefined, label + 'a refusal carries no request id')
  else assert.match(json.request_id ?? '', APPROVAL_ID, label + 'request_id')
}

/** The helpers bound to one ctx (host and stub are read at call time, so a restart or re-attach is followed). */
export function askTools(ctx, { tok, cid }) {
  const t = {
    tok, cid,
    async setLimit(patch) { const r = await ctx.host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) },
    session: (folder) => managedSession(ctx.host, folder),
    askArgs: (args, { quote = [], why = ASK_STUB.why } = {}) => ({ tool: ASK_TOOL, arguments: args, quote, why }),
    /** One ask_fishball step for the asking tool with these arguments. */
    ask: (args, id, opts) => askStep(t.askArgs(args, opts), id),
    /** One ask_fishball step that continues a request (§7a.2 "question"); requestId may be REQUEST_PLACEHOLDER. */
    reply: (requestId, reply, id) => askStep({ request_id: requestId, reply }, id),
    /** One step making the call itself (the asking fixture tool; its body asks DSH). */
    call: (text, id) => callStep({ text }, id),
    /** A finished turn: the steps, then the closing text. */
    run: (sid, steps, text) => turn(ctx.host, sid, [...steps, ASK_STUB.closing], text),
    /** Start a turn and do not wait for it. */
    start: async (sid, steps, text) => { await settledIdle(ctx.host, sid); return ctx.host.call('driveStart', { sessionId: sid, script: [...steps, ASK_STUB.closing], ...(text ? { text } : {}) }) },
    /** The final result of the call with this id (a turn started with driveStart). */
    async answered(sid, id) { const r = await resultOfCall(ctx.host, sid, id, ASK_STUB.resultWaitMs); assert.ok(r, 'a result for ' + id); return r.json },
    rawResult: (sid, id) => resultOfCall(ctx.host, sid, id, ASK_STUB.resultWaitMs),
    status: (sid) => ctx.host.call('agentStatus', { sessionId: sid }),
    async stop(sid) { await ctx.host.call('cancel', { sessionId: sid }); await ctx.host.call('waitIdle', { sessionId: sid }); await settledIdle(ctx.host, sid) },
    waitIdle: (sid) => ctx.host.call('waitIdle', { sessionId: sid }),
    /** Run fn with the stock prompt answering outcome, then back to reject. */
    async withStock(outcome, fn) {
      await ctx.host.call('setApprover', { outcome })
      try { return await fn() } finally { await ctx.host.call('setApprover', { outcome: OUTCOME.reject }) }
    },
    stockSeen: (text) => stockSeen(ctx.host, text),

    // ---- the instance side (contract §4.2, §4.5, §5) ----
    /** Every approval.request payload received on the current attachment. */
    offers: async () => (await ctx.stub.events(EVENT.approvalRequest)).map((f) => f.payload),
    /** The offers whose arguments or reason carry needle (a token unique to one request). */
    offersFor: async (needle) => (await t.offers()).filter((p) => String(p.arguments ?? '').includes(needle) || String(p.reason ?? '').includes(needle)),
    /** Wait for an offer for needle that is not among seen offer ids; returns its payload or undefined. */
    async offerFor(needle, seen = []) {
      const pred = (p) => (String(p.arguments ?? '').includes(needle) || String(p.reason ?? '').includes(needle)) && !seen.includes(p.offerId)
      return (await ctx.stub.waitEvent(EVENT.approvalRequest, pred, { timeoutMs: ASK_STUB.offerWaitMs }))?.payload
    },
    /** Wait for a new offer of the same request (a continued thread is offered again, §7a.2 "question"). */
    async nextOffer(approvalId, seen) {
      const pred = (p) => p.approvalId === approvalId && !seen.includes(p.offerId)
      return (await ctx.stub.waitEvent(EVENT.approvalRequest, pred, { timeoutMs: ASK_STUB.offerWaitMs }))?.payload
    },
    /** approval.answer for one offer; resolves the reply frame {type, payload}. */
    answer: (sid, offer, answer) => ctx.stub.op(OPERATION.approvalAnswer, { sessionId: sid, approvalId: offer.approvalId, offerId: offer.offerId, answer }, sid),
    /** approval.answer that must be accepted. */
    async accepted(sid, offer, answer) {
      const r = await t.answer(sid, offer, answer)
      assert.equal(r.type, ENVELOPE.type.response, 'answer accepted: ' + JSON.stringify(r))
      assert.equal(r.payload?.accepted, true, JSON.stringify(r))
      return r
    },
    /**
     * approval.answer that must be refused with an error frame; returns its code. A reply that never came
     * because the connector closed the channel (a validation failure, contract §3.1) is re-attached at once,
     * so the cases after it still run, and the assertion reports what happened.
     */
    async refused(sid, offer, answer) {
      const r = await t.answer(sid, offer, answer)
      if (r.type === 'none' && r.code === STUB.noReply.closed) await t.reattach()
      assert.equal(r.type, ENVELOPE.type.error, 'answer refused with an error frame (contract §4.2), not ' + JSON.stringify(r))
      return r.payload?.code
    },
    /** The live offer of one request now (approval.list; a re-attach gives a new offerId, contract §5.1), or undefined. */
    async liveOffer(sid, approvalId) {
      const r = await ctx.stub.op(OPERATION.approvalList, { sessionId: sid }, sid)
      return r.payload?.approvals?.find((a) => a.approvalId === approvalId)
    },
    /** The approval-kind inbox items whose text carries needle. */
    notices: async (needle = '') => (await ctx.stub.pushes()).map((f) => f.payload).filter((p) => p.kind === KIND.approval && p.text.includes(needle)),
    /** The notices of one request, one per round, oldest first, each with its parsed untrusted block. */
    rounds: async (requestId) => (await t.notices(ASK_STUB.noticePrefix(requestId))).map((p) => ({ ...p, block: untrustedBlock(p.text) })),
    /** Every frame the instance got so far (all kinds), counted, to show that nothing more arrived. */
    frameCount: async () => (await ctx.stub.received()).length,
    /** approval.settled payloads of one request. */
    settled: async (requestId) => (await ctx.stub.events(EVENT.approvalSettled)).map((f) => f.payload).filter((p) => p.approvalId === requestId),
    ran: async (requestId) => (await ctx.stub.events(EVENT.approvalRan)).map((f) => f.payload).filter((p) => p.approvalId === requestId),
    /** Attach the stub again after a detach or a close (default descriptor and handshake). */
    async reattach() { const a = await ctx.stub.attach(); assert.equal(a.ok, true, 'attach again: ' + JSON.stringify(a)); return a },

    /**
     * Start a turn whose ask_fishball waits (the steps in after follow once it is answered); returns the
     * offer the instance received. The reason carries the text too, so the offer can be found when the
     * arguments are cut.
     */
    async waiting(sid, text, id, after = [], opts = {}) {
      await t.start(sid, [t.ask({ text }, id, { why: 'why ' + text, ...opts }), ...after])
      const offer = await t.offerFor(text)
      assert.ok(offer, 'the request was offered to the instance: ' + JSON.stringify((await t.offers()).at(-1)))
      return offer
    },
    /** Like waiting(), but the instance escalates it (§7a.3), so it becomes a card for the user. */
    async escalated(sid, text, id, { after = [], note = 'fbtest note ' + text, ...opts } = {}) {
      const offer = await t.waiting(sid, text, id, after, opts)
      await t.accepted(sid, offer, { decision: 'escalate', reason: note })
      const card = await untilCard(ctx.host, offer.approvalId, ASK_STUB.offerWaitMs)
      assert.ok(card, 'the escalated request is a card: ' + JSON.stringify((await ctx.host.state()).pile))
      return { offer, requestId: offer.approvalId, card }
    },

    // ---- the user's side and the audit (§9, §10e) ----
    /** Allow once / Reject on the ask_fishball row (the Host route it calls). */
    click: (requestId, decision, note) => answerCard(ctx.host, requestId, decision, note),
    decisionsFor: (requestId) => storedRows(ctx.home, DECISIONS_TABLE).filter((d) => d.target === requestId),
    answersOf: (requestId) => auditOf(ctx.home, requestId).map((r) => r.answer),
    auditOf: (requestId) => auditOf(ctx.home, requestId),
    /** Wait for the decisions row of your click and return it. */
    async decisionOf(requestId) {
      assert.ok(await until(() => t.decisionsFor(requestId).length > 0, ASK_STUB.offerWaitMs, 100), 'a decisions row for your click on ' + requestId)
      return t.decisionsFor(requestId)[0]
    },
    quiet: () => sleep(ASK_STUB.quietMs),
    /** The request id a notice names. */
    requestIdOf: (notice) => ASK_STUB.noticeHead.exec(notice?.text ?? '')?.[1],
    /** The ids approval.list reports for one managed session (contract §4.2: live requests only). */
    async pendingIds(sid) {
      const r = await ctx.stub.op(OPERATION.approvalList, { sessionId: sid }, sid)
      assert.equal(r.type, ENVELOPE.type.response, 'approval.list: ' + JSON.stringify(r))
      return r.payload.approvals.map((a) => a.approvalId)
    },
    /** After a quiet period, nothing about needle reached the instance: no offer and no approval notice. */
    async nothingSent(needle) {
      await t.quiet()
      assert.deepEqual(await t.offersFor(needle), [], 'no approval.request for ' + needle)
      assert.deepEqual(await t.notices(needle), [], 'no approval inbox item for ' + needle)
    },
    /**
     * The identical call made after a "make the call yourself" answer went to the session's stock prompt
     * (a to-you ticket, §7a.6): its result is the stock prompt's outcome, the prompt was asked once, and the
     * instance was offered nothing beyond `offers` requests for that text.
     */
    async expectStock(sid, text, callId, outcome, offers) {
      const r = await t.rawResult(sid, callId)
      assert.equal(r?.text, ASK_OUTPUT(outcome), "the stock prompt's answer: " + r?.text)
      assert.equal((await t.stockSeen(text)).length, 1, 'the stock prompt was asked once')
      await t.quiet()
      assert.equal(new Set((await t.offersFor(text)).map((o) => o.approvalId)).size, offers, 'the call did not come back to the instance')
    },
  }
  return t
}

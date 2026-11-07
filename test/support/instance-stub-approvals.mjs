/**
 * Group A (approvals) on the H-STUB harness: the vocabulary and helpers shared by the approvals-* and
 * rev11b-{direct,pass,ptc} files. The stub stands in for the instance: it receives `approval.request`,
 * the `approval` inbox item (the request notice the in-process Fishball used to read) and
 * `approval.settled` / `approval.ran`, and it answers with `approval.answer` (contract §4.2, §5).
 * The scripted stock prompt sits after the connector's broker (FBTEST_APPROVER_AFTER=1), so "the user
 * is asked in the session" is observable as a record of the scripted answerer.
 */
import assert from 'node:assert/strict'
import { CARD_CLOSED, DECISION, EVENT, OPERATION, RECORD_ITEM, RISK } from 'fishball-connector/contract'
import { APPROVER_AFTER_ENV, ASK_REASON, ASK_TOOL, OUTCOME } from './constants.mjs'
import { approvalAudit, askSettled, callScript, stockSeen, untrustedBlock } from './expect.mjs'
import { bootStub, KIND } from './instance-stub.mjs'
import { until } from './util.mjs'

export const APPROVALS = Object.freeze({
  env: APPROVER_AFTER_ENV,
  /** Sharper skip reasons (brief: a file or case that cannot run says why). */
  skip: Object.freeze({
    /**
     * DSH 0.2.2 ignores DSH_TOOLS_MODE: PTC needs the executor overlay (dsh-sdk-app README), which the
     * shared worker overlay (support/worker.mjs) does not offer. Detected by run_code missing from the
     * session's tools, so the PTC cases run wherever the build offers it (0.2.1).
     */
    ptcRuntime: 'DSH 0.2.2 ignores DSH_TOOLS_MODE, so run_code does not exist (harness gap, not product)',
  }),
  /** DSH 0.2.1's PTC switch (dsh-web-app cordis.patch.yml, `tools.mode`). */
  ptcEnv: Object.freeze({ DSH_TOOLS_MODE: 'ptc' }),
  runCode: 'run_code',
  /**
   * The PTC runtime wraps a program in the OS file sandbox (sandbox-exec), which cannot nest inside the
   * test runner's own sandbox. Full access gives the program no file sandbox; the asking fixture tool asks
   * in its body whatever the mode, so the approval path under test is unchanged.
   */
  ptcSandboxMode: 'danger-full-access',
  /** A held stock prompt (a person who has not clicked yet) and the outcome the scripted answerer gives by default. */
  stock: Object.freeze({ hold: 'hold', default: OUTCOME.reject }),
  /** The `approval` inbox item's header lines (the request notice, DESIGN §7a.2 "What Fishball is given"). */
  item: Object.freeze({
    prefix: (id) => '[permission request ' + id + ']',
    direct: /a direct call/,
    asked: /asks first.*ask_fishball/,
    /** 'Arguments: <status>' (a cut or missing status adds its high-risk note before the full stop). */
    argumentsLine: (status) => 'Arguments: ' + status,
    highRisk: /alone makes it high risk/,
    expiredNormal: /expired/i,
    seconds: (n) => new RegExp('within ' + n + ' s\\b'),
    provenance: /Session started by: (.*?); its current turn started by: (.*?)\.?$/m,
  }),
  /** Plain answers the stub gives. */
  answer: Object.freeze({
    escalate: Object.freeze({ decision: DECISION.escalate }),
    allow: (reason = 'fine') => ({ decision: DECISION.allow, risk: RISK.low, reason }),
    reject: (reason) => ({ decision: DECISION.reject, risk: RISK.high, reason }),
    ask: (question) => ({ decision: DECISION.ask, question }),
  }),
  /** Waits and bounds of these cases. */
  ms: Object.freeze({ atOnce: 1000, quiet: 1500, settle: 15000, timerSlack: 150, timerLate: 2500 }),
  /** A string that never appears in a session's own words, to look for leaks of argument text. */
  secretPrefix: 'SECRETARG',
  /** The approval descriptor's keys for a permission request (contract §5.1; `questions` only for kind question). */
  descriptorKeys: Object.freeze(['approvalId', 'arguments', 'argumentsStatus', 'at', 'callId', 'choices', 'expiresAt', 'kind', 'offerId', 'prompt', 'quotes', 'reason', 'title', 'toolName']),
  /** The audit record's fields (DESIGN §9 approvals table and its revision 11 additions). */
  auditKeys: Object.freeze(['answer', 'argumentsDigest', 'argumentsStatus', 'at', 'callId', 'decidedAt', 'finalOutcome', 'kind', 'sessionId', 'toolName']),
  auditAnswers: Object.freeze(['allow', 'escalate', 'timeout', 'withdrawn', 'grant', 'reject', 'ask', 'to-user', 'pass', 'grant-used', 'released']),
  digest: /^[0-9a-f]{64}$/,
  /** Session modes and policies the cases set (DSH's own vocabulary). */
  mode: Object.freeze({ readOnly: 'read-only' }),
  policy: Object.freeze({ ask: 'ask', never: 'never' }),
  /** Text the agent sees for a question on a direct call (DESIGN §7a.3 "ask on a direct call"). */
  askFishballWord: /ask_fishball/,
})

let seq = 0
/**
 * A unique marker for one case (the asking tool's `text`, so its DSH reason is unique too). The counter has a
 * fixed width, so no marker is a prefix of another and `includes` finds exactly one case's frames.
 */
export const tok = (label) => 'APR' + label + 'x' + String(++seq).padStart(4, '0') + Math.random().toString(36).slice(2, 7)

/** A descriptor predicate: the request is about the call carrying this marker (in its DSH reason, its `why` or its arguments). */
export const mentions = (marker) => (d) => String(d.reason ?? '').includes(marker) || String(d.arguments ?? '').includes(marker)

/** Boot an H-STUB host with the stock prompt after the broker; the scripted answerer rejects by default. */
export async function bootApprovals(label, { env = {} } = {}) {
  const booted = await bootStub(label, { env: { ...APPROVALS.env, ...env } })
  await booted.host.call('setApprover', { outcome: APPROVALS.stock.default })
  booted.fbId = (await booted.host.state()).sessionId
  return booted
}

/** Attach the stub again when the connector closed its channel (a validation failure closes it, contract §3.1). */
export async function ensureAttached(stub) {
  if (!(await stub.transportCalls()).closedByConnector) return
  const a = await stub.attach()
  assert.ok(a.ok, 'reattach: ' + JSON.stringify(a))
}

/**
 * Ack every item again and reconnect. The connector delivers inbox items in order and holds the next one
 * while an earlier one is unacknowledged, so a case that withheld acks must reconnect: an unacknowledged
 * item is pushed again after a reconnect (contract §3.3, §4.5), and the stub then acks it.
 */
export async function ackAllAndReconnect(stub) {
  await stub.ackPolicy(null)
  await stub.detach()
  const a = await stub.attach()
  assert.ok(a.ok, 'reattach: ' + JSON.stringify(a))
}

/** Start a turn in sid whose model calls the asking tool once (does not wait). */
export const startCall = (host, sid, args, { text = 'fbtest ask turn', source } = {}) => host.call('driveStart', { sessionId: sid, text, script: callScript(ASK_TOOL, args), ...(source ? { source } : {}) })

/** The `approval.request` frame whose descriptor matches pred, or undefined. */
export const offerWhere = (stub, pred, opts) => stub.waitEvent(EVENT.approvalRequest, pred, opts)
/** The `approval.request` frame of the asking tool's call with this text (its DSH reason). */
export const offerFor = (stub, text, opts) => offerWhere(stub, (d) => d.reason === ASK_REASON(text), opts)

/** Every `approval.request` frame received so far whose descriptor matches pred. */
export const offersWhere = async (stub, pred) => (await stub.events(EVENT.approvalRequest)).filter((f) => pred(f.payload))

/** The `approval` inbox item of one request (the notice), with its parsed header and untrusted block. */
export async function itemFor(stub, approvalId, { last = false } = {}) {
  const needle = APPROVALS.item.prefix(approvalId)
  await stub.waitPush(needle, { kind: KIND.approval })
  const items = (await stub.pushTexts(needle)).filter((p) => p.kind === KIND.approval)
  const payload = last ? items.at(-1) : items[0]
  if (!payload) return undefined
  const block = untrustedBlock(payload.text)
  const [started, turnBy] = APPROVALS.item.provenance.exec(block?.header ?? '')?.slice(1) ?? [null, null]
  return { payload, block, header: block?.header ?? '', fields: block?.fields ?? {}, started, turnBy }
}

/** Every `approval` inbox item of one request id, oldest first (one per round). */
export const itemsFor = async (stub, approvalId) => (await stub.pushTexts(APPROVALS.item.prefix(approvalId))).filter((p) => p.kind === KIND.approval)

/** The asking session starts the call and the stub waits for its offer and notice. */
export async function requestFor(booted, sid, text, { args = {}, turnText, source } = {}) {
  await startCall(booted.host, sid, { text, ...args }, { text: turnText, source })
  const frame = await offerFor(booted.stub, text)
  assert.ok(frame, 'an approval.request reached the stub for ' + text)
  const item = await itemFor(booted.stub, frame.payload.approvalId)
  assert.ok(item, 'an approval inbox item reached the stub for ' + text)
  return { frame, descriptor: frame.payload, sessionId: frame.sessionId, item }
}

/** The stub answers one offer with approval.answer (contract §4.2). */
export const answerOffer = (stub, sessionId, descriptor, answer, { offerId = descriptor.offerId, approvalId = descriptor.approvalId } = {}) =>
  stub.op(OPERATION.approvalAnswer, { sessionId, approvalId, offerId, answer }, sessionId)

/**
 * Answer the nth offer matching pred as soon as it arrives, while the asking turn runs (the instance answers
 * on its own time, so a case starts this before it drives the turn). Resolves {frame, reply}, or undefined
 * when no such offer came. A continued request (ask_fishball's reply) is offered again with the same id, so
 * nth = 2 answers its second round.
 */
export function answerWhen(stub, pred, answer, { nth = 1, timeoutMs = APPROVALS.ms.settle } = {}) {
  return (async () => {
    const frame = await until(async () => (await offersWhere(stub, pred))[nth - 1] ?? false, timeoutMs, 50)
    if (!frame) return undefined
    return { frame, reply: await answerOffer(stub, frame.sessionId, frame.payload, answer) }
  })()
}

/** Send a request on to the user (escalate) and wait for its call's outcome: a case's way to end a request it no longer needs. */
export async function escalateAndSettle(booted, req, text) {
  const r = await answerOffer(booted.stub, req.sessionId, req.descriptor, APPROVALS.answer.escalate)
  assert.equal(r.type, 'response', 'escalate: ' + JSON.stringify(r))
  return outcomeOf(booted.host, text)
}

/** approval.list of one session: the live descriptors. */
export async function listed(stub, sessionId) {
  const r = await stub.op(OPERATION.approvalList, { sessionId }, sessionId)
  assert.equal(r.type, 'response', 'approval.list: ' + JSON.stringify(r))
  return r.payload.approvals
}

/** The `approval.settled` events of one request. */
export const settledEvents = async (stub, approvalId) => (await stub.events(EVENT.approvalSettled)).filter((f) => f.payload.approvalId === approvalId).map((f) => f.payload)
/** The `approval.ran` events of one request. */
export const ranEvents = async (stub, approvalId) => (await stub.events(EVENT.approvalRan)).filter((f) => !approvalId || f.payload.approvalId === approvalId).map((f) => f.payload)

/** The card records (system inbox items, contract §4.5 RECORD_ITEM) that name one request, parsed. */
export async function cardRecordsFor(stub, approvalId) {
  return (await stub.pushes()).map((f) => f.payload).filter((p) => p.kind === KIND.system).flatMap((p) => {
    const m = RECORD_ITEM.pattern.exec(p.text)
    if (!m) return []
    try { const record = JSON.parse(m[1]); return record.cardId === approvalId ? [record] : [] } catch { return [] }
  })
}
/** The `[card closed <id>]` items that name one request. */
export const closedItemsFor = async (stub, approvalId) => (await stub.pushes()).map((f) => f.payload).filter((p) => CARD_CLOSED.pattern.exec(p.text)?.[1] === approvalId)
/** Wait until the instance has been told that one request ended (a card record or a card-closed item); returns them. */
export async function toldEnded(stub, approvalId, timeoutMs = APPROVALS.ms.settle) {
  const find = async () => { const r = [...await cardRecordsFor(stub, approvalId), ...await closedItemsFor(stub, approvalId)]; return r.length > 0 ? r : false }
  return (await until(find, timeoutMs, 100)) || []
}

/** The asking tool's call with this text, once it has an outcome. */
export const outcomeOf = async (host, text, timeoutMs = APPROVALS.ms.settle) => askSettled(host, text, timeoutMs)
/** The stock prompt's records for the call with this text (the user asked in that session). */
export const stockFor = stockSeen
/** Wait until the stock prompt was asked for the call with this text; returns its records. */
export async function untilStock(host, text, timeoutMs = APPROVALS.ms.settle) {
  await until(async () => (await stockSeen(host, text)).length > 0, timeoutMs, 20)
  return stockSeen(host, text)
}

/** The approval audit records (§9) of one request id. */
export const auditFor = (home, approvalId) => approvalAudit(home).filter((r) => r.file.includes(String(approvalId).replace(/^apr_/, ''))).map((r) => r.record)
/** Wait until one request's audit record carries its final outcome. */
export async function auditedFor(home, approvalId, timeoutMs = APPROVALS.ms.settle) {
  await until(() => auditFor(home, approvalId).some((r) => r.finalOutcome), timeoutMs, 100)
  return auditFor(home, approvalId)
}
/** Every audit record of one session. */
export const auditOfSession = (home, sessionId) => approvalAudit(home).map((r) => r.record).filter((r) => r.sessionId === sessionId)

/** Change connector limits through DSH's settings service (the Plugins form's path, contract §0). */
export async function setLimit(host, patch) {
  const r = await host.call('settingsUpdate', { patch })
  assert.equal(r.ok, true, JSON.stringify(r.error))
}

/** Stop a session's turn and release any held stock prompt, so the next case starts clean. */
export async function clearSession(host, sid) {
  if ((await host.call('agentStatus', { sessionId: sid })) === 'running') await host.call('cancel', { sessionId: sid })
  while (await host.call('releaseApproval', { outcome: APPROVALS.stock.default })) { /* every held prompt */ }
  await until(async () => (await host.call('agentStatus', { sessionId: sid })) === 'idle', APPROVALS.ms.settle, 50)
}

/** Whether run_code is offered to the session's model (PTC mode on in this DSH build). */
export async function ptcOffered(host, sid) {
  const last = (await host.call('requests', { sessionId: sid })).at(-1)
  return (last?.tools ?? []).some((t) => t.name === APPROVALS.runCode)
}

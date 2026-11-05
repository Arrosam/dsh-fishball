/**
 * The approval, question, prompt and grant bridge, main-host half (§5.2, §15 T09).
 *
 * The child decides with today's six tools (answer_approval, answer_question, list_frozen_sessions
 * + answer_prompt, list_grants + revoke_grant). This module registers those operations on the
 * envelope-v2 bridge host (src/slim/host/bridge.js, `register()`) and carries the live cards and
 * their settlements the other way. It owns no decision rule and no second state store:
 * - live permission requests come from the ApprovalBroker's `liveOffers` and its `subscribe`
 *   events (src/approvals.js);
 * - live questions and their settlements come from the QuestionRouter's `liveQuestions`,
 *   `questionSession` and `subscribe` (src/questions.js);
 * - prompts and grants come from the row's existing tools and `grants.snapshot()`;
 * - the answers themselves are the captured tool bodies the main Fishball row provides through
 *   `fishballSessionState` (index.js). That provider is the only new wiring; nothing here
 *   re-implements the allowance, grant or question rules.
 *
 * Offer rules (§5.2, v1's native-control host):
 * - An offer is connection-specific. `onConnection` clears every offer on a new handshake, so an
 *   answer from a previous wire can never be replayed; the live requests are re-offered to the
 *   new connection (APPR-07). `approval.list` reuses the current offer.
 * - An answer must name the current offerId. A stale or unknown one is `expired`; the request
 *   itself stays with the broker, so the card is still listed.
 * - A question carries no offerId in its answer (§5.2); its own `expired` state comes from the
 *   router, and the envelope's session must be the question's own.
 *
 * Events: `approval.request` for a live card, `approval.settled` for a settlement (Fishball's
 * answer, the user's answer to an escalated card, or the card moving to the user). A question
 * Fishball sent to the user (`to_user`) returns the user's answer through an inbox item with the
 * QUESTION_ANSWER marker, because the frozen contract's approval.settled cannot carry answer words;
 * the child turns it into a timeline event (§8.1). Times are epoch ms.
 */
import { randomUUID } from 'node:crypto'
import {
  APPROVAL_KIND, ARGUMENTS_STATUS, DECISION, ERROR, EVENT, GRANT_KIND, INBOX_KIND, LIMITS, OPERATION,
  PLAN_REVIEW, SETTLED_BY, ContractError,
} from '../contract.js'
import { cutToBytes } from '../../text.js'
import { BridgeRefusal, ensureManaged } from './bridge.js'
import { SESSION_STATE } from './session-port.js'
import { QUESTION_ANSWER } from '../child/approvals.js'

/** The §5.2 operations this task registers; they enter the handshake's capability list. */
export const APPROVAL_OPERATIONS = Object.freeze([
  OPERATION.approvalList, OPERATION.approvalAnswer, OPERATION.questionAnswer,
  OPERATION.promptList, OPERATION.promptAnswer, OPERATION.grantList, OPERATION.grantRevoke,
])

/** The methods the main Fishball row's state provider must carry (index.js). */
const STATE_METHODS = Object.freeze([
  'bridgeReady', 'liveApprovals', 'answerApproval', 'liveQuestions', 'answerQuestion',
  'questionSession', 'listPrompts', 'answerPrompt', 'listGrants', 'revokeGrant', 'subscribe',
])
const SERVICE_METHODS = Object.freeze(['enabled', 'managedIds', 'isManaged', 'isFishball', 'describe'])
const ARGUMENTS_STATUS_LIST = Object.freeze(Object.values(ARGUMENTS_STATUS))
const DECISION_LIST = Object.freeze(Object.values(DECISION))
const SETTLED_BY_LIST = Object.freeze(Object.values(SETTLED_BY))
const ELLIPSIS = '…'
/** The provider's event names (src/approvals.js, src/questions.js); the relay maps each to a §5.2 event. */
const RELAY_EVENT = Object.freeze({ offered: 'offered', escalated: 'escalated', settled: 'settled' })

/**
 * Create the host's approval relay. One relay per native host row; `attach(host)` adds its seven
 * handlers before the transport attaches, so the welcome advertises them.
 *
 * @param {object} options
 * @param {object} options.ctx - the native host's Cordis context (only `get` is used).
 * @param {object} options.sessions - the SessionService port (src/slim/host/session-port.js).
 * @param {() => number} [options.now] - clock for offer expiry and inbox times.
 */
export function createApprovalRelay(options) {
  const { ctx, sessions, now = Date.now } = options ?? {}
  if (!ctx || typeof ctx.get !== 'function') throw new TypeError('fishball approvals: a Cordis context is required')
  if (!sessions || typeof sessions !== 'object') throw new TypeError('fishball approvals: the session port is required')
  for (const method of SERVICE_METHODS) {
    if (typeof sessions[method] !== 'function') throw new TypeError('fishball approvals: the session port must implement ' + method)
  }
  if (typeof now !== 'function') throw new TypeError('fishball approvals: now must be a function')
  return new ApprovalRelay({ ctx, sessions, now })
}

/** The relay: registrations, per-connection offers and the main-to-child events. */
class ApprovalRelay {
  constructor({ ctx, sessions, now }) {
    this.ctx = ctx
    this.sessions = sessions
    this.now = now
    this.host = undefined
    this.offers = new Map()
    this.attached = new WeakSet()
    this.disposers = []
    this.observed = undefined
    this.unsubscribe = undefined
    this.closed = false
  }

  /**
   * Add the seven handlers and the connection edge. A provider that is not up yet leaves every
   * handler answering feature-off; the edge retries the subscription when it appears.
   * @param {object} host - a createBridgeHost() instance.
   */
  attach(host) {
    if (this.closed) throw new ContractError(ERROR.disconnected)
    if (this.attached.has(host)) return
    if (typeof host?.register !== 'function' || typeof host?.onConnection !== 'function') {
      throw new TypeError('fishball approvals: the bridge host must implement register and onConnection')
    }
    this.attached.add(host)
    this.host = host
    for (const operation of APPROVAL_OPERATIONS) host.register(operation, (request) => this.handle(operation, request))
    this.disposers.push(host.onConnection(({ ready }) => this.connection(ready)))
    try { this.observe() } catch { /* the row is not up: feature-off until it is */ }
  }

  /** Stop observing and make every later operation answer feature-off. */
  close() {
    if (this.closed) return
    this.closed = true
    try { this.observed?.bridgeReady?.(false) } catch { /* the row is already gone */ }
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.observed = undefined
    this.offers.clear()
    for (const dispose of this.disposers.splice(0)) { try { dispose() } catch { /* already gone */ } }
    this.host = undefined
  }

  /** The main Fishball row's provider; absent or old-shaped is feature-off, never a throw into the frame. */
  state() {
    const found = this.ctx.get(SESSION_STATE.service)
    if (found === undefined) throw new ContractError(ERROR.featureOff)
    for (const method of STATE_METHODS) {
      if (typeof found[method] !== 'function') throw new ContractError(ERROR.featureOff)
    }
    return found
  }

  /** Subscribe once per provider instance; a replaced row is resubscribed on its next edge. */
  observe() {
    const state = this.state()
    if (this.observed === state) return
    this.unsubscribe?.()
    this.observed = state
    this.unsubscribe = state.subscribe((event) => this.notify(event))
  }

  /** A ready channel is a new offer generation; a closed one means the child can no longer answer. */
  connection(ready) {
    if (this.closed) return
    try {
      this.state().bridgeReady(ready === true)
      this.observe()
    } catch { /* no provider yet: the next edge tries again */ }
    this.offers.clear()
    if (ready === true) this.reoffer()
  }

  /** Re-offer every live card of every managed session; the host never replays an answer. */
  reoffer() {
    try {
      for (const sessionId of this.sessions.managedIds()) {
        for (const descriptor of this.liveDescriptors(sessionId)) this.offer(descriptor, sessionId)
      }
    } catch { /* a session that cannot be described is simply not re-offered */ }
  }

  /** The live descriptors of one session, fitted to the contract's caps and not already ended. */
  liveDescriptors(sessionId) {
    const state = this.state()
    return [...state.liveApprovals(sessionId), ...state.liveQuestions(sessionId)]
      .map((descriptor) => fitDescriptor(descriptor))
      .filter((descriptor) => descriptor !== undefined && descriptor.expiresAt > this.now())
      .sort((a, b) => a.at - b.at)
  }

  /**
   * The current offer of one approval; a new one is minted the first time it is listed or pushed.
   * Repeated listings reuse it, so the card the child holds stays answerable.
   */
  withOffer(descriptor) {
    const current = this.offers.get(descriptor.approvalId)
    if (current !== undefined) return { ...descriptor, offerId: current }
    const offerId = randomUUID()
    this.offers.set(descriptor.approvalId, offerId)
    return { ...descriptor, offerId }
  }

  /** Push one live card; a descriptor the contract cannot represent is not offered at all. */
  offer(descriptor, sessionId) {
    const fitted = fitDescriptor(descriptor)
    if (fitted === undefined || fitted.expiresAt <= this.now()) return
    // A re-offer (a new round, or a reconnect) invalidates the offer the child may still hold.
    this.offers.delete(fitted.approvalId)
    try { this.host?.publish(EVENT.approvalRequest, sessionId, this.withOffer(fitted)) } catch { /* closed */ }
  }

  /** Publish one settlement; an escalated card also returns the user's later answer to the child. */
  settle(event) {
    this.offers.delete(event.approvalId)
    if (!DECISION_LIST.includes(event.decision) || !SETTLED_BY_LIST.includes(event.by)) return
    try {
      this.host?.publish(EVENT.approvalSettled, event.sessionId, {
        approvalId: event.approvalId, decision: event.decision, by: event.by,
      })
    } catch { /* closed */ }
    if (event.routed !== DECISION.escalate) return
    // The frozen settled payload has no answer words. The inbox carries them as the user's own
    // words; the child turns the item into a timeline event, and the chat row delivers it. A
    // skipped batch has no words, so the notice still says the user answered.
    const words = typeof event.words === 'string' && event.words.length > 0 ? event.words : QUESTION_ANSWER.fallback
    const text = QUESTION_ANSWER.text(event.approvalId, words)
    const item = {
      messageId: randomUUID(), kind: INBOX_KIND.system, sourceSessionId: event.sessionId,
      text, images: [], dedupeKey: QUESTION_ANSWER.dedupePrefix + event.approvalId, at: this.now(),
    }
    // Unacked items stay queued in the host, so a disconnected child still gets the answer.
    try { void this.host?.pushInbox(item).catch(() => {}) } catch { /* closed */ }
  }

  /** Provider events: a card, a move to the user, or a settlement. */
  notify(event) {
    if (this.closed || event === null || typeof event !== 'object') return
    try {
      if (event.type === RELAY_EVENT.offered && event.descriptor !== undefined) this.offer(event.descriptor, event.sessionId)
      else if (event.type === RELAY_EVENT.escalated) this.settle({ ...event, decision: DECISION.escalate, by: SETTLED_BY.fishball })
      else if (event.type === RELAY_EVENT.settled) this.settle(event)
    } catch { /* a closed channel or an unrepresentable card is not the decision's failure */ }
  }

  /**
   * One §5.2 request. Authorization is per operation; the shared bridge authorization covers only
   * the session operations, so this relay applies its own before the provider sees an id.
   */
  async handle(operation, { sessionId, payload }) {
    const state = this.state()
    switch (operation) {
      case OPERATION.approvalList: {
        await ensureManaged(this.sessions, sessionId)
        return { approvals: this.liveDescriptors(sessionId).map((descriptor) => this.withOffer(descriptor)) }
      }
      case OPERATION.approvalAnswer: return this.answerApproval(state, sessionId, payload)
      case OPERATION.questionAnswer: return this.answerQuestion(state, sessionId, payload)
      case OPERATION.promptList: return { prompts: (await this.prompts(state)).map(promptOf) }
      case OPERATION.promptAnswer: return this.answerPrompt(state, sessionId, payload)
      case OPERATION.grantList: return { grants: state.listGrants().map(grantOf) }
      case OPERATION.grantRevoke: return this.revokeGrant(state, payload)
      default: throw new BridgeRefusal(ERROR.operation)
    }
  }

  /** One live approval answer, with the current offer; a stale offer is expired, never replayed. */
  async answerApproval(state, sessionId, payload) {
    await ensureManaged(this.sessions, sessionId)
    const offerId = this.offers.get(payload.approvalId)
    if (offerId === undefined || offerId !== payload.offerId) throw new BridgeRefusal(ERROR.expired)
    const live = state.liveApprovals(sessionId).some((descriptor) => descriptor.approvalId === payload.approvalId)
    if (!live) {
      this.offers.delete(payload.approvalId)
      throw new BridgeRefusal(ERROR.expired)
    }
    const result = await state.answerApproval(toApprovalTool(payload.approvalId, payload.answer))
    this.offers.delete(payload.approvalId)
    if (result?.ok !== true) throw new BridgeRefusal(result?.code ?? ERROR.failed)
    if (result.grantId === undefined) return { accepted: true }
    const expiresAt = Date.parse(result.expiresAt)
    if (!Number.isSafeInteger(expiresAt)) throw new BridgeRefusal(ERROR.failed)
    return { accepted: true, grantId: result.grantId, expiresAt }
  }

  /**
   * One question answer. The envelope's session must be the question's own (today's tool names
   * none); an unmanaged session is expired because its question went back to the session.
   */
  async answerQuestion(state, sessionId, payload) {
    if (!this.sessions.isManaged(sessionId)) throw new BridgeRefusal(ERROR.expired)
    if (state.questionSession(payload.questionId) !== sessionId) throw new BridgeRefusal(ERROR.expired)
    const result = await state.answerQuestion(toQuestionTool(payload))
    if (result?.ok !== true) throw new BridgeRefusal(result?.code ?? ERROR.failed)
    return { accepted: true }
  }

  /** The prompt list today's list_frozen_sessions is built from, with the session title added. */
  async prompts(state) {
    const result = await state.listPrompts()
    if (result?.ok !== true) throw new BridgeRefusal(result?.code ?? ERROR.failed)
    const prompts = Array.isArray(result.prompts) ? result.prompts : []
    return prompts.map((prompt) => ({ ...prompt, title: prompt.title ?? '' }))
  }

  /**
   * One frozen prompt: only the session that prompt belongs to may answer it (§5.2). The prompt
   * is not required to be managed yet; answering it is the fifth way a session becomes managed.
   */
  async answerPrompt(state, sessionId, payload) {
    const prompt = (await this.prompts(state)).find((entry) => entry.prompt_id === payload.promptId)
    if (prompt === undefined) throw new BridgeRefusal(ERROR.expired)
    if (prompt.session_id !== sessionId) throw new BridgeRefusal(ERROR.forbidden)
    const result = await state.answerPrompt({
      prompt_id: payload.promptId, decision: payload.decision,
      ...(payload.risk === undefined ? {} : { risk: payload.risk }), reason: payload.reason,
    })
    if (result?.ok !== true) throw new BridgeRefusal(result?.code ?? ERROR.failed)
    return { promptId: result.promptId, decision: result.decision, managed: result.managed === true }
  }

  /** Revoke one grant; an active grant whose session is no longer managed is refused. */
  async revokeGrant(state, payload) {
    const grant = state.listGrants().find((entry) => entry.grantId === payload.grantId)
    if (grant !== undefined && !this.sessions.isManaged(grant.sessionId)) throw new BridgeRefusal(ERROR.notManaged)
    const result = await state.revokeGrant({ grant_id: payload.grantId, reason: payload.reason })
    if (result?.ok !== true) throw new BridgeRefusal(result?.code ?? ERROR.failed)
    return { grantId: payload.grantId, revoked: true }
  }
}

/** answer_approval's tool input from the contract's answer (§5.2); a grant's time becomes ISO. */
function toApprovalTool(approvalId, answer) {
  const grant = answer.grant === undefined ? undefined : {
    kind: answer.grant.kind,
    ...(answer.grant.prefix === undefined ? {} : { prefix: answer.grant.prefix }),
    expires_at: new Date(answer.grant.expiresAt).toISOString(),
  }
  return {
    request_id: approvalId, decision: answer.decision,
    ...(answer.risk === undefined ? {} : { risk: answer.risk }),
    ...(answer.reason === undefined ? {} : { reason: answer.reason }),
    ...(answer.question === undefined ? {} : { question: answer.question }),
    ...(grant === undefined ? {} : { grant }),
  }
}

/** answer_question's tool input from the contract's request (§5.2). */
function toQuestionTool(payload) {
  return {
    question_id: payload.questionId,
    ...(payload.answers === undefined ? {} : { answers: payload.answers }),
    ...(payload.approve === undefined ? {} : { approve: payload.approve }),
    ...(payload.feedback === undefined ? {} : { feedback: payload.feedback }),
    ...(payload.toUser === undefined ? {} : { to_user: payload.toUser }),
    ...(payload.note === undefined ? {} : { note: payload.note }),
  }
}

/** One prompt in the contract's shape; its ISO time becomes epoch ms. */
function promptOf(prompt) {
  const since = Date.parse(prompt.since)
  if (!Number.isSafeInteger(since) || typeof prompt.prompt_id !== 'string' || typeof prompt.session_id !== 'string') throw new BridgeRefusal(ERROR.failed)
  if (typeof prompt.tool !== 'string' || !ARGUMENTS_STATUS_LIST.includes(prompt.arguments_status)) throw new BridgeRefusal(ERROR.failed)
  return {
    promptId: prompt.prompt_id, sessionId: prompt.session_id,
    title: cutChars(prompt.title ?? '', LIMITS.titleChars),
    toolName: prompt.tool, argumentsStatus: prompt.arguments_status, since, managed: prompt.managed === true,
  }
}

/** One active grant in the contract's shape; its ISO times become epoch ms. */
function grantOf(grant) {
  const expiresAt = Date.parse(grant.expiresAt)
  if (!Number.isSafeInteger(expiresAt) || typeof grant.grantId !== 'string' || typeof grant.sessionId !== 'string') throw new BridgeRefusal(ERROR.failed)
  if (typeof grant.toolName !== 'string' || !Object.values(GRANT_KIND).includes(grant.kind)) throw new BridgeRefusal(ERROR.failed)
  if (!Number.isSafeInteger(grant.uses) || grant.uses < 0) throw new BridgeRefusal(ERROR.failed)
  const lastUsedAt = grant.lastUsedAt === null || grant.lastUsedAt === undefined ? undefined : Date.parse(grant.lastUsedAt)
  if (lastUsedAt !== undefined && !Number.isSafeInteger(lastUsedAt)) throw new BridgeRefusal(ERROR.failed)
  return {
    grantId: grant.grantId, sessionId: grant.sessionId, toolName: grant.toolName, kind: grant.kind,
    ...(grant.kind === GRANT_KIND.prefix ? { prefix: typeof grant.prefix === 'string' ? grant.prefix : '' } : {}),
    expiresAt, uses: grant.uses,
    ...(lastUsedAt === undefined ? {} : { lastUsedAt }),
    paused: grant.paused === true,
  }
}

/**
 * Fit one live descriptor to the frozen contract's caps (§5.2). Values that are display-only are
 * cut; a selected label can never be cut, because an answer echoes it back and DSH checks it
 * against the offered label, so a question with an over-long or duplicated option label is not
 * offered at all (the user still answers it in the session).
 */
function fitDescriptor(descriptor) {
  if (descriptor === null || typeof descriptor !== 'object' || Array.isArray(descriptor)) return undefined
  const { approvalId, kind, prompt, choices, expiresAt, at, toolName, callId, reason, quotes, title, questions } = descriptor
  if (typeof approvalId !== 'string' || approvalId.length === 0) return undefined
  if (kind !== APPROVAL_KIND.approval && kind !== APPROVAL_KIND.question) return undefined
  if (typeof prompt !== 'string' || prompt.length === 0) return undefined
  if (!Array.isArray(choices) || choices.some((choice) => typeof choice !== 'string' || choice.length === 0)) return undefined
  if (new Set(choices).size !== choices.length) return undefined
  if (!Number.isSafeInteger(expiresAt) || !Number.isSafeInteger(at)) return undefined
  if (typeof toolName !== 'string' || toolName.length === 0) return undefined
  if (callId !== null && (typeof callId !== 'string' || callId.length === 0)) return undefined
  if (typeof reason !== 'string' || !Array.isArray(quotes) || quotes.some((quote) => typeof quote !== 'string')) return undefined
  const base = {
    approvalId, kind, prompt, choices: [...choices], expiresAt, at, toolName, callId,
    reason: cutChars(reason, LIMITS.reasonChars),
    quotes: quotes.map((quote) => cutToBytes(quote, LIMITS.quoteBytes, ELLIPSIS)),
    title: cutChars(typeof title === 'string' ? title : '', LIMITS.titleChars),
  }
  if (kind === APPROVAL_KIND.approval) return base
  const fitted = fitQuestions(questions)
  return fitted === undefined ? undefined : { ...base, questions: fitted }
}

/** One question list in the contract's shape; an unrepresentable list means no card. */
function fitQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0 || questions.length > LIMITS.questionsPerRequest) return undefined
  const ids = new Set()
  const fitted = []
  for (const item of questions) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined
    if (typeof item.id !== 'string' || item.id.length === 0 || ids.has(item.id)) return undefined
    if (typeof item.question !== 'string' || item.question.length === 0) return undefined
    ids.add(item.id)
    const options = Array.isArray(item.options) ? item.options : undefined
    const labels = []
    if (options !== undefined) {
      for (const option of options) {
        if (option === null || typeof option !== 'object' || typeof option.label !== 'string' || option.label.length === 0) return undefined
        if ([...option.label].length > LIMITS.labelChars || labels.includes(option.label)) return undefined
        labels.push(option.label)
      }
    }
    // The plan-review presentation is kept only when it names an offered label; any other intent
    // is not part of this contract and is dropped rather than making the question unanswerable.
    const intent = item.intent?.kind === PLAN_REVIEW && labels.includes(item.intent.approve)
      ? { kind: PLAN_REVIEW, approve: item.intent.approve, ...(typeof item.intent.callId === 'string' ? { callId: item.intent.callId } : {}) }
      : undefined
    fitted.push({
      id: item.id,
      question: cutChars(item.question, LIMITS.questionChars),
      ...(typeof item.detail === 'string' ? { detail: item.detail } : {}),
      ...(typeof item.header === 'string' ? { header: cutChars(item.header, LIMITS.labelChars) } : {}),
      ...(options === undefined ? {} : { options: options.map((option) => ({ label: option.label, ...(typeof option.description === 'string' ? { description: option.description } : {}) })) }),
      ...(typeof item.multiSelect === 'boolean' ? { multiSelect: item.multiSelect } : {}),
      ...(intent === undefined ? {} : { intent }),
    })
  }
  return fitted
}

/** A character cap (code points) for the contract's text fields, with an ellipsis when cut. */
function cutChars(text, max) {
  const characters = [...text]
  return characters.length <= max ? text : characters.slice(0, Math.max(0, max - 1)).join('') + ELLIPSIS
}

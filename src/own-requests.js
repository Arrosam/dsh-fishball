/**
 * Fishball's own requests (DESIGN §7a.11, §9 `own_requests`, requirements items 21-24; rev11f).
 *
 * Fishball never freezes on a permission prompt. Each of its own requests (add_plugin,
 * remove_plugin, unchecked tools, set_plugin_settings, turning on one of its own plugins, and a
 * plugin tool that asks in its session) becomes a card labelled Fishball in your pile, and the
 * call returns waiting-for-approval at once. The broker files the card from its approval/request
 * listener (src/approvals.js, spike S35) and answers 'rejected', so nothing waits:
 * - Fishball's own tools say beforehand what the card shows (expect: Fishball's reason, the
 *   detail list, and, for add_plugin's second step, the call the card stands for), then read the
 *   filed result (takeFiled: the waiting result, or too-many-waiting) and return it themselves;
 * - another plugin's tool has its text replaced by the post-execute listener (src/result-wording.js).
 * Under a permission mode that never asks DSH answers 'rejected' before any listener runs, so no
 * card is filed (S35) and the tool is refused as before.
 *
 * A card here has no deadline: the durable record waits until you answer it or Fishball withdraws
 * it, and a withdrawal leaves a visible "card closed" line in Fishball's chat (src/card-lifecycle.js).
 * A pass, unlike a card, ends with its turn; that is the "approved, run it again" notice's
 * lifetime, not a card's.
 *
 * Your answers:
 * - Allow: the card becomes a one-time pass for the identical retry (same tool and every argument,
 *   by the digest of the canonical JSON, S35) and Fishball is woken with "approved, run it again"
 *   through the intake ledger (never wake-capped, Reading). The pass ends when used, when
 *   withdrawn, or at the end of the turn the notice entered (`wokenTurn`).
 * - Reject: Fishball is told without being woken (requirements default); one decided while
 *   Fishball is not live is told when it is.
 * Fishball can withdraw its own card or pass (withdraw_request, item 23).
 *
 * Durable (item 24): cards and passes live in `own_requests`, so a restart keeps them; a pass
 * whose notice already entered a turn ends at the restart, because a restart ends that turn.
 * Settled ones are kept to auditEntriesKept. Your clicks and Fishball's withdrawals leave
 * `decisions` rows; the broker audits each request in the approvals audit (kind own).
 */
import { randomUUID } from 'node:crypto'
import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { APPROVAL, APPROVAL_ERROR, ARGUMENTS_STATUS, CARD_DECISION, CARD_END, CHANGED_BY, DECISION_ACTION, DECISION_OK, EVENT, INTAKE_KIND, OWN_REQUEST, OWN_STATUS, REQUEST_KIND, SOURCE, TOO_MANY_WAITING } from './constants.js'
import { closeCard } from './card-lifecycle.js'
import { AuditLog } from './audit.js'
import { argumentsDigest } from './passes.js'
import { authorOf } from './author.js'
import { byteLength, cutToBytes, latestFirst } from './text.js'
import { diagnosticOf } from './errors.js'
import { JSON_OUTPUT, ok, refused } from './tool-results.js'

export const OWN_TOOL = Object.freeze({ withdraw: 'withdraw_request' })

const ELLIPSIS = '…'
/** Detail entries are shown one per line: the bound counts the line breaks between them. */
const DETAIL_SEPARATOR = '\n'

const TEXT = Object.freeze({
  /** What Fishball reads when its call became a card (own tools and other plugins' tools alike). */
  /** Past maxPendingApprovals: nothing was filed or asked (Q-r11-cap-own). */
  tooManyWaiting: `${TOO_MANY_WAITING}: too many permission requests are waiting for the user, so this call was not made and nothing was asked. Try it again once the user has answered some of them, or withdraw one of your own waiting requests with withdraw_request.`,
  waiting: (id) => `${OWN_REQUEST.waitingCode}: this call did not run. It waits for the user's approval as request ${id}, a card in the user's pile; carry on with other work meanwhile. You will be told when the user answers. If the user allows it, you are told to run it again, with the exact call to make; that identical call then runs once. If you no longer need it, withdraw it with withdraw_request({request_id: "${id}"}).`,
  /** The "approved, run it again" notice (item 22); it names the request and the exact call. */
  runAgain: (id, toolName, args) => `[approved ${id}] Fishball notice: the user allowed your request ${id}. It has not run yet: run it again now, as the identical call ${toolName} with exactly these arguments: ${args}\nThat one call then runs once without asking. The approval ends when this turn ends.`,
  /** The same, when the arguments were too long to keep whole: quoting the cut text would make a different call. */
  runAgainLong: (id, toolName) => `[approved ${id}] Fishball notice: the user allowed your request ${id}. It has not run yet: run it again now, repeating your earlier ${toolName} call for request ${id} exactly, with the same arguments (too long to quote here). That one call then runs once without asking. The approval ends when this turn ends.`,
  runAgainSummary: (id) => `The user allowed request ${id}`,
  rejected: (id, toolName, note) => `Fishball notice: the user rejected your request ${id} (${toolName}); it did not run.${note ? ` The user's note: ${note}` : ''}`,
  /** The closing line of a cut detail list (not counted in its bound). */
  more: (count) => `and ${count} more`,
  withdrawDescription: 'Withdraw one of your own requests that waits for the user (a card in the user\'s pile, request own_…), or one the user allowed that you no longer need to run again. Use it when you no longer need the call, or when too many requests are waiting.',
  requestIdArg: 'The request id (own_…) from the waiting-for-approval result.',
})

/** The result Fishball's own tool returns when its call became a card (§7a.11). */
export const waitingResult = (requestId) => refused(OWN_REQUEST.waitingCode, { request_id: requestId, note: TEXT.waiting(requestId) })
/** The same text, for another plugin's tool in Fishball's session (post-execute, S35). */
export const waitingText = (requestId) => TEXT.waiting(requestId)
/**
 * Past the cap: Fishball's own tool returns this, in the same JSON form as the waiting result
 * (the manager's decision, 2026-11-02); another plugin's tool gets the text through post-execute.
 */
export const tooManyWaitingResult = () => refused(TOO_MANY_WAITING, { note: TEXT.tooManyWaiting })
export const tooManyWaitingText = () => TEXT.tooManyWaiting

/**
 * A detail list cut to maxBytes (the manager's decision, Q-r11-own-card-detail): bytes as shown,
 * one entry per line; the cut falls at a whole entry and adds "and N more" (not counted in the
 * bound). A first entry that alone exceeds the bound is cut with "…", and "and N more" counts
 * the entries after it.
 * @param entries - the full list of texts. @returns the list to show.
 */
export function boundedDetail(entries, maxBytes) {
  const shown = []
  let used = 0
  for (const entry of entries) {
    const cost = byteLength(entry) + (shown.length === 0 ? 0 : byteLength(DETAIL_SEPARATOR))
    if (used + cost <= maxBytes) {
      shown.push(entry)
      used += cost
      continue
    }
    if (shown.length === 0) shown.push(cutToBytes(entry, maxBytes, ELLIPSIS))
    break
  }
  const left = entries.length - shown.length
  return left > 0 ? [...shown, TEXT.more(left)] : shown
}

/** The turn a user message entered: the last turn/start before it in the log, or undefined. */
function turnOfMessage(events, messageId) {
  const at = events.findIndex((event) => event.type === APPROVAL.userEvent && event.data?.id === messageId)
  if (at < 0) return undefined
  return events.slice(0, at).findLast((event) => event.type === APPROVAL.turnStartEvent)?.data?.turn
}

const byNewest = (field) => ([, a], [, b]) => latestFirst(a[field], b[field])

export class OwnRequests {
  #store
  #logger
  #ledger
  #readLimits
  #assistantId
  #agentOf
  #onChange
  #decisions
  /** callId -> what Fishball's own tool says its card shows (set just before it asks). */
  #expected = new Map()
  /** callId -> what Fishball's own tool returns (the waiting result, or too-many-waiting), until its body reads it. */
  #filed = new Map()
  /** Writes run one after another, so a pass is never used twice or answered while it is used. */
  #changes = Promise.resolve()

  /**
   * @param ctx - fishball row context (session events).
   * @param store - Store (`own_requests`, `decisions`). @param logger - plugin logger.
   * @param deps.ledger - IntakeLedger (the "run it again" notice wakes Fishball).
   * @param deps.readLimits - () => limits (argumentExcerptBytes, rationaleChars, auditEntriesKept).
   * @param deps.assistantId - () => Fishball's session id. @param deps.agentOf - () => its agent, or undefined.
   * @param deps.onChange - called after any card changes (the state feed publishes).
   */
  constructor(ctx, store, logger, { ledger, readLimits, assistantId, agentOf, onChange }) {
    this.#store = store
    this.#logger = logger
    this.#ledger = ledger
    this.#readLimits = readLimits
    this.#assistantId = assistantId
    this.#agentOf = agentOf
    this.#onChange = onChange
    this.#decisions = new AuditLog(() => store.decisions, () => readLimits().auditEntriesKept)
    ctx.on(EVENT.sessionEvent, (session, event) => { if (session.id === assistantId()) this.#onFishballEvent(session, event) })
  }

  /**
   * Fishball's own tool, just before it asks: what its card shows.
   * @param info.reason - Fishball's reason; info.detail - the full detail list, or undefined;
   * @param info.subject - { toolName, args }: the call the card stands for, when it is not the
   *   asking call itself (add_plugin's second step stands for set_plugin_enabled on the plugin it
   *   installed, so the pass of the install never covers that step, and that step is retried by
   *   turning the plugin on).
   */
  expect(callId, info) {
    if (callId !== undefined) this.#expected.set(callId, info)
  }

  /** The asking call is over: forget what it expected. */
  forget(callId) {
    this.#expected.delete(callId)
  }

  /** What Fishball's own tool expects for this call, or undefined for another plugin's tool. */
  expected(callId) {
    return this.#expected.get(callId)
  }

  /**
   * What Fishball's own tool returns for this call (read once by the tool body): the waiting
   * result when a card was filed, too-many-waiting past the cap, or undefined (refused without
   * either: a never-asking mode, S35).
   */
  takeFiled(callId) {
    const id = this.#filed.get(callId)
    this.#filed.delete(callId)
    return id
  }

  /** Cards waiting for you: they count toward maxPendingApprovals (Q-r11-cap-own). */
  waitingCount() {
    let count = 0
    for (const [, record] of this.#store.ownRequests.entries()) if (record.status === OWN_STATUS.waiting) count++
    return count
  }

  /**
   * File one card (the broker's listener, before it answers 'rejected').
   * @param request - { callId, toolName, args: { text, status, value }, reason, detail? }; callId is
   *   Fishball's own tool's call, whose body reads its result back (takeFiled), else undefined.
   * @param isFull - () => whether maxPendingApprovals requests are open; checked in the write
   *   queue, so parallel calls in one step cannot all slip under the cap.
   * @returns the own_ id, or undefined when the cap is reached (nothing filed; the own tool then
   *   reads too-many-waiting back).
   */
  async file({ callId, toolName, args, reason, detail }, isFull) {
    const limits = this.#readLimits()
    const id = OWN_REQUEST.idPrefix + randomUUID().replace(/-/g, '')
    const filed = await this.#serial(async () => {
      if (isFull()) return false
      await this.#store.ownRequests.put(id, {
      toolName,
      ...(args.value === undefined ? {} : { argumentsDigest: argumentsDigest(args.value) }),
      arguments: args.text, argumentsStatus: args.status,
      reason: reason.slice(0, limits.rationaleChars),
      ...(detail === undefined ? {} : { detail: boundedDetail(detail, limits.argumentExcerptBytes) }),
      status: OWN_STATUS.waiting, createdAt: new Date().toISOString(),
      })
      return true
    })
    if (!filed) {
      if (callId !== undefined) this.#filed.set(callId, tooManyWaitingResult())
      return undefined
    }
    if (callId !== undefined) this.#filed.set(callId, waitingResult(id))
    this.#onChange()
    return id
  }

  /**
   * Use the pass of an identical call you allowed (S35: same tool, same canonical arguments).
   * Every own request is Fishball's session's (a subagent of Fishball asks for it, §7a.13), so
   * the session part of S35's key is the same for all of them and is not stored.
   * @param args - the parsed arguments, or undefined (then no pass can match).
   * @returns the own_ id whose pass was used, or undefined.
   */
  takePass(toolName, args) {
    if (args === undefined) return Promise.resolve(undefined)
    const digest = argumentsDigest(args)
    return this.#serial(async () => {
      const found = [...this.#store.ownRequests.entries()].find(([, record]) => record.status === OWN_STATUS.approved && record.toolName === toolName && record.argumentsDigest === digest)
      if (found === undefined) return undefined
      await this.#settle(found[0], { status: OWN_STATUS.used })
      return found[0]
    })
  }

  /** Whether this id names one of Fishball's own requests (any state). */
  has(requestId) {
    return this.#store.ownRequests.get(requestId) !== undefined
  }

  /**
   * Your Allow once / Reject on one of Fishball's cards (§10e).
   * @param note - your optional Reject note, told to Fishball.
   * @returns whether the card was still waiting (false: the route answers expired).
   */
  async answer(requestId, decision, note) {
    const allowed = decision === CARD_DECISION.allow
    const answered = await this.#serial(async () => {
      const current = this.#store.ownRequests.get(requestId)
      if (current?.status !== OWN_STATUS.waiting) return undefined
      if (!allowed) return { record: await this.#settle(requestId, { status: OWN_STATUS.rejected, ...(note ? { note } : {}), told: false }) }
      // The notice is made first: the pass records its id, to find the turn it wakes.
      const notice = this.#runAgainNotice(requestId, current)
      return { record: await this.#settle(requestId, { status: OWN_STATUS.approved, noticeId: notice.id }), notice }
    })
    if (answered === undefined) return false
    await this.#decide({ action: allowed ? DECISION_ACTION.allowOnce : DECISION_ACTION.reject, by: CHANGED_BY.user, target: requestId, ...(allowed ? {} : { withNote: Boolean(note) }) })
    if (allowed) {
      // Delivery failure defers the approval notice; it never changes your decision into a rejection.
      if (!(await this.#wake(requestId, answered.notice))) await this.#serial(() => this.#update(requestId, { told: false })).catch(this.#warn('own request told'))
    } else {
      await this.#tellRejected(requestId, answered.record)
    }
    return true
  }

  /**
   * Fishball's withdraw_request: its waiting card leaves the pile, or its pass ends.
   * @returns undefined when withdrawn, else APPROVAL_ERROR.expired (not open: unknown, answered or ended).
   */
  async withdraw(requestId) {
    const record = await this.#serial(async () => {
      const current = this.#store.ownRequests.get(requestId)
      if (current?.status !== OWN_STATUS.waiting && current?.status !== OWN_STATUS.approved) return undefined
      return this.#settle(requestId, { status: OWN_STATUS.withdrawn })
    })
    if (record === undefined) return APPROVAL_ERROR.expired
    await this.#decide({ action: DECISION_ACTION.withdraw, by: CHANGED_BY.fishball, target: requestId })
    // The card leaves without your answer: one visible line says so (src/card-lifecycle.js).
    closeCard(this.#agentOf(), { kind: REQUEST_KIND.own, requestId, sessionId: this.#assistantId() }, CARD_END.withdrawn, this.#logger)
    return undefined
  }

  /**
   * Each time Fishball goes live (§11 "Restart"), from Fishball's log: a pass whose notice entered
   * a turn that has ended (a restart closes it as interrupted) ends; one whose turn still runs
   * records it; a rejection or run-again notice Fishball has not been given yet is given now.
   * @param session - Fishball's session.
   */
  async catchUp(session) {
    const events = session.snapshotEvents()
    for (const [id, record] of [...this.#store.ownRequests.entries()]) {
      if (record.status === OWN_STATUS.approved) {
        const turn = record.wokenTurn ?? turnOfMessage(events, record.noticeId)
        if (turn === undefined) {
          // A notice that reached neither the queue nor Fishball is given now, without a wake.
          if (record.told === false) await this.#retell(id, record)
          continue
        }
        const ended = events.some((event) => event.type === APPROVAL.turnEndEvent && event.data?.turn === turn)
        await this.#serial(() => (ended ? this.#settle(id, { status: OWN_STATUS.expired }) : this.#update(id, { wokenTurn: turn })))
      } else if (record.status === OWN_STATUS.rejected && record.told === false) await this.#tellRejected(id, record)
    }
  }

  /**
   * Fishball's cards for your pile (§10e), newest first: the same shape as a session's card, kind
   * own, with Fishball's session id as `sessionId` and its list under `detail`.
   */
  cards() {
    const sessionId = this.#assistantId()
    return [...this.#store.ownRequests.entries()].filter(([, record]) => record.status === OWN_STATUS.waiting).sort(byNewest('createdAt')).map(([requestId, record]) => ({
      requestId, kind: REQUEST_KIND.own, sessionId, callId: null, toolName: record.toolName, arguments: record.arguments, argumentsStatus: record.argumentsStatus,
      quotes: [], why: record.reason, thread: [], note: '', detail: record.detail ?? [], since: record.createdAt,
    }))
  }

  /** Fishball's withdraw_request (scope P; its Permission requests plugin, §10d). */
  registerTools(register) {
    register(defineTool({
      name: OWN_TOOL.withdraw,
      description: TEXT.withdrawDescription,
      parameters: {
        request_id: { type: 'string', required: true, description: TEXT.requestIdArg },
      },
      output: JSON_OUTPUT,
      execute: async ({ request_id: id }) => {
        const code = await this.withdraw(id)
        return code === undefined ? ok({ requestId: id, withdrawn: true }) : refused(code)
      },
    }))
  }

  /**
   * Fishball's session: the turn the "run it again" notice entered is recorded on its pass, and
   * that pass ends when the turn ends (§7a.11 retry-pass lifetime).
   */
  #onFishballEvent(session, event) {
    if (event.type === APPROVAL.userEvent && typeof event.data?.id === 'string') {
      const found = [...this.#store.ownRequests.entries()].find(([, record]) => record.status === OWN_STATUS.approved && record.noticeId === event.data.id && record.wokenTurn === undefined)
      if (found === undefined) return
      // The message is being logged now, so the turn it enters is the latest one started.
      const turn = session.snapshotEvents().findLast((entry) => entry.type === APPROVAL.turnStartEvent)?.data?.turn
      if (turn !== undefined) void this.#serial(() => this.#update(found[0], { wokenTurn: turn })).catch(this.#warn('own request turn'))
    } else if (event.type === APPROVAL.turnEndEvent) {
      // Read in the write queue, after a wokenTurn still being written for this turn.
      void this.#serial(async () => {
        const ended = [...this.#store.ownRequests.entries()].filter(([, record]) => record.status === OWN_STATUS.approved && record.wokenTurn === event.data?.turn)
        for (const [id] of ended) await this.#settle(id, { status: OWN_STATUS.expired })
      }).catch(this.#warn('own request pass end'))
    }
  }

  /** The "approved, run it again" notice for one request (item 22). */
  #runAgainNotice(requestId, record) {
    const text = record.argumentsStatus === ARGUMENTS_STATUS.complete ? TEXT.runAgain(requestId, record.toolName, record.arguments) : TEXT.runAgainLong(requestId, record.toolName)
    return createUserMessage({ content: [{ type: 'text', text }], source: { ...SOURCE.notice, summary: boundContextSummary(TEXT.runAgainSummary(requestId)), author: authorOf(INTAKE_KIND.system) } })
  }

  /**
   * Wake Fishball with the notice (never wake-capped, Reading). A notice the queue refuses is
   * injected without a wake instead, so Fishball still reads it at its next turn.
   * @returns whether it was queued or injected (false: Fishball is told at its next go-live).
   */
  async #wake(requestId, notice) {
    try {
      await this.#ledger.publish({ kind: INTAKE_KIND.approval, sourceIdentity: OWN_REQUEST.sourceIdentity, dedupeKey: requestId, message: notice })
      return true
    } catch (error) {
      this.#logger.warn('run-again notice %s not queued (%s)', requestId, diagnosticOf(error))
      return this.#inject(notice)
    }
  }

  /** A run-again notice that could not be given before: a fresh one, injected; its id replaces the old one. */
  async #retell(requestId, record) {
    const notice = this.#runAgainNotice(requestId, record)
    if (!this.#inject(notice)) return
    await this.#serial(() => this.#update(requestId, { noticeId: notice.id, told: true })).catch(this.#warn('own request told'))
  }

  /** Tell Fishball of your Reject without waking it; once told, the record says so. */
  async #tellRejected(requestId, record) {
    const text = TEXT.rejected(requestId, record.toolName, record.note)
    if (!this.#inject(createUserMessage({ content: [{ type: 'text', text }], source: { ...SOURCE.notice, summary: boundContextSummary(text), author: authorOf(INTAKE_KIND.system) } }))) return
    await this.#serial(() => this.#update(requestId, { told: true })).catch(this.#warn('own request told'))
  }

  /** A message to Fishball without a wake. @returns whether it reached a live Fishball. */
  #inject(message) {
    const agent = this.#agentOf()
    if (agent === undefined) return false
    try {
      agent.inject(message)
      return true
    } catch (error) {
      this.#warn('own request note')(error)
      return false
    }
  }

  /** Settle (or move) one record: its new fields and decidedAt, then prune. @returns the new record. */
  async #settle(id, fields) {
    const record = { ...this.#store.ownRequests.get(id), ...fields, ...(fields.status === OWN_STATUS.used || fields.status === OWN_STATUS.expired ? {} : { decidedAt: new Date().toISOString() }) }
    await this.#store.ownRequests.put(id, record)
    await this.#pruneSettled()
    this.#onChange()
    return record
  }

  async #update(id, fields) {
    const record = this.#store.ownRequests.get(id)
    if (record !== undefined) await this.#store.ownRequests.put(id, { ...record, ...fields })
  }

  /**
   * Settled requests beyond auditEntriesKept leave, oldest decision first; cards, passes and
   * rejections Fishball has not been told about yet always stay.
   */
  async #pruneSettled() {
    const settled = [...this.#store.ownRequests.entries()].filter(([, record]) => record.status !== OWN_STATUS.waiting && record.status !== OWN_STATUS.approved && record.told !== false).sort(byNewest('decidedAt'))
    for (const [id] of settled.slice(this.#readLimits().auditEntriesKept)) await this.#store.ownRequests.delete(id)
  }

  #serial(change) {
    const run = this.#changes.then(change)
    this.#changes = run.catch(() => {})
    return run
  }

  /** One `decisions` row on Fishball's session; a failed write is logged, the decision itself stands. */
  async #decide({ action, by, target, withNote }) {
    try {
      await this.#decisions.append({ action, sessionId: this.#assistantId(), by, target, ...(withNote === undefined ? {} : { withNote }), at: new Date().toISOString(), outcome: DECISION_OK }, [action])
      this.#onChange()
    } catch (error) {
      this.#warn('decision audit')(error)
    }
  }

  #warn(label) {
    return (error) => this.#logger.warn('%s failed (%s)', label, diagnosticOf(error))
  }
}

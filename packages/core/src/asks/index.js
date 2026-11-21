/**
 * fishball-core's ask cards, server half (task F-ASKCARD; K3 `contracts/ask-card.d.ts`, `ui.d.ts`
 * `asks`; R-FB-11, R-UI-12, R-CON-05, R-CON-06, R-CON-08; PLAT-UC-07; Q3 = A).
 *
 * A permission request (a `permission` offer; the user, 2026-11-17, after `ask_agent` was removed)
 * is Fishball's to answer. When its model cannot decide, it may file the request as a card with the
 * `ask_user` tool (or escalate it to the session's own prompt); the user answers Allow or Reject, with an optional
 * reason, in Fishball's own conversation (fishball-ui's client.asks.js), and core commits that
 * answer through its link as Fishball's `approval_answer` on the card's `offerId`. The main DSH shows nothing (Q-U2):
 * nothing here is registered outside the Fishball DSH.
 *
 * - `createAsks({targets, table, logger})`: takes each target's polls (`take`; every offer of `ASKS.eventTypes`,
 *   `settlement` and `retirement`; a page is read whoever the event was dispatched to, so an interceptor or Fishball
 *   taking it changes nothing here), and returns `service` (the K3 `fishballInstance.ui.asks`),
 *   `toolFor(source, name)` (one target's filing tool, raw DSH definition; core's target collection
 *   registers it in the manager's scope), `reconcile(source)` (below), `answered(source, args)`
 *   (Fishball's own accepted `approval_answer`), `voidWhere` and `close()`.
 *   `take(page, source)` resolves once the page's cards are stored, with the ids of the page's events whose card could not be stored
 *   (R-FIX F12: the caller must not let those be acked, or the offer is gone for good).
 * - `openAskCards(ctx, storageDomain)`: the durable table.
 * - `registerAskRoutes(ctx, options)`: the owner-only routes the browser half reads (routes.js).
 *
 * Startup reconciliation (Fishball's decision, 2026-11-16): `reconcile()` deletes every unfiled ask
 * whose call ended, so asks whose call died with a connector restart (which retires nothing) do not
 * stay recorded forever. F-WIRE calls it once per start, at the link's first `connected` status. An
 * ask's call is live while the connector lists it: `approval_answer` authorises an ask by the same
 * `liveOffers` port that `approvals_list` reads (dsh-connector src/mcp/tools/offers.js), so a session's
 * list omitting the ask, or `unknown-session`, means the call ended. Any other answer keeps the ask.
 *
 * First commit wins (R-CON-06): answers to one card run one after another, and only an open card
 * sends; so of two answers the second sees the first's outcome. The connector settles an ask once
 * whatever core does, so a lost race there answers `already-settled` / `expired`, and the card
 * closes. No timer (R-CON-05): a card waits until it is answered here or closed by an event.
 *
 * MULTI-1 (PLAN-MULTI §5; MULTI-0 `ask-card.d.ts`, `ui.d.ts`): one store and one service for every
 * target. Each target's pipeline hands its pages here with its trusted `source` (`take(result,
 * source)`); a card carries that source and its opaque `handle`, and `answer(handle, …)` commits
 * through the handle's own target only (`targets.callTool(source, …)`), never by a raw `approvalId`.
 * Each target has its own filing tool (`toolFor(source, name)`), which finds offers of that target
 * epoch only; its model-facing name is the caller's (the namespaced `ask_user`, PLAN-MULTI §4.4).
 * Removing a target or retiring its epoch voids its open cards (`voidWhere`), sending nothing.
 */
import { SEAM_TARGETS } from 'fishball-shared/ui-seam'
import { LINK, MCP, TARGETS } from '../../contracts/constants.js'
import { tupleOfHandle } from '../targets/keys.js'
import { emitIsolated, subscribe } from '../link/listeners.js'
import { codeOf } from '../events/diagnostics.js'
import { renderJson } from '../tool-output.js'
import { ASKS, ASK_CODE, ASK_LOG, ASK_MISUSE, ASK_TOOL_DEFINITION, ASK_TEXT, CARD_STATE } from './constants.js'
import { cardKeyOf, cardOf, createCardStore, recordOf } from './store.js'

// Core's own copy of the connector's MCP surface (K3a; F-OWN-SCHEMA), under the names this module reads.
const REFUSAL = MCP.refusal
const TOOL = MCP.tools
const EVENT_TYPE = MCP.eventTypes

export { openAskCards } from './store.js'
export { registerAskRoutes } from './routes.js'
export { ASKS, ASK_TOOL, CARD_STATE } from './constants.js'

const refusal = (code) => Object.freeze({ ok: false, code })
const OK = Object.freeze({ ok: true })
const NO_FAILURES = Object.freeze([])

/** `{choice, text?}` with a Q3 = A choice and an optional string reason; else undefined. */
function answerOf(answer) {
  if (answer === null || typeof answer !== 'object' || !ASKS.choices.includes(answer.choice)) return undefined
  if (answer.text !== undefined && typeof answer.text !== 'string') return undefined
  return answer
}

/** The K1 `approval_answer` answer for the user's choice (the mapping the user chose, constants.js). */
function approvalAnswerOf({ choice, text }) {
  const reason = text?.trim() ?? ''
  return { decision: choice, risk: ASKS.riskOf[choice], reason: reason === '' ? ASKS.defaultReason : reason }
}

/**
 * Serial chains keyed by id: `run(key, task)` starts `task` after every earlier task of `key`. The
 * same rule as the connector's answer queue (dsh-connector src/mcp/tools/offers.js `serial`),
 * copied because the two sides share no package (requirements 1.39).
 */
function keyedSerial() {
  const tails = new Map()
  return (key, task) => {
    const run = (tails.get(key) ?? Promise.resolve()).then(task)
    const tail = run.then(() => undefined, () => undefined)
    tails.set(key, tail)
    void tail.then(() => { if (tails.get(key) === tail) tails.delete(key) })
    return run
  }
}

/**
 * @param {object} options
 * @param {{callTool(source: object, name: string, args: object): Promise<object>, live(source: object): boolean}} options.targets
 *   the targets' links: a call through the link of `source`'s target epoch (`disconnected` when it
 *   is not current), and whether that epoch is current
 * @param {object} options.table the card KvTable, from `openAskCards`
 * @param {{warn: Function}} [options.logger] the background log
 */
export function createAsks({ targets, table, logger }) {
  if (typeof targets?.callTool !== 'function' || typeof targets?.live !== 'function') throw new TypeError(ASK_MISUSE.targets)
  const listeners = new Set()
  const list = () => Object.freeze(store.cards().map(cardOf))
  const store = createCardStore(table, () => emitIsolated(listeners, list()))
  const serial = keyedSerial()
  let intake = Promise.resolve()
  let closed = false

  /** One polled event of `source`; anything but a card-able offer (`ASKS.eventTypes`), its settlement or its retirement is not the store's. */
  async function takeOne(event, source) {
    if (ASKS.eventTypes.includes(event?.type)) {
      const record = recordOf(event, source)
      if (record === undefined) { logger?.warn(ASK_LOG.malformed, String(event.eventId)); return }
      await store.add(record)
    } else if (event?.type === EVENT_TYPE.settlement) {
      if (typeof event.payload?.approvalId === 'string') await store.close(cardKeyOf(source, event.payload.approvalId))
    } else if (event?.type === EVENT_TYPE.retirement) {
      const key = store.keyOfEvent(source, event.payload?.retiredEventId)
      if (key !== undefined) await store.close(key)
    }
  }

  // Pages are taken in order, one event at a time, so an ask and its settlement in one page (or in
  // two) are applied in the order the connector committed them. The listener returns the page's
  // promise, so a caller that owns the poll pipeline (core's main row) can store the cards before it
  // lets the same events be acked (F-WIRE: "store the card before the ack"); the link ignores it.
  // The promise resolves to the ids of the events whose write failed: those stay unacked at the
  // caller, so the connector offers them again and the write is retried at the next poll.
  /** One polled page of the target epoch `source` (see above); resolves to the ids of the events not stored. */
  function take(result, source) {
    if (closed || result?.ok !== true || !Array.isArray(result.events)) return intake.then(() => NO_FAILURES)
    const events = [...result.events]
    // Each event's failure is its own: a later settlement in the same page must still close its
    // card, because an acked page is never polled again.
    const page = intake.then(async () => {
      const failed = []
      for (const event of events) {
        if (closed) break
        try { await takeOne(event, source) } catch (error) {
          logger?.warn(ASK_LOG.writeFailed, codeOf(error))
          failed.push(event?.eventId)
        }
      }
      return Object.freeze(failed)
    })
    intake = page.then(() => undefined)
    return page
  }

  /**
   * A card write after the connector answered. Its failure is only logged: the connector's answer
   * stands whatever the table says, so `answer` still reports it (K3 `Promise<UiResult>` never
   * rejects), and the ask's settlement event moves the card at the next poll.
   */
  async function recorded(write) {
    try { await write() } catch (error) { logger?.warn(ASK_LOG.writeFailed, codeOf(error)) }
  }

  /** The connector's answer for one card, applied to it. */
  async function commit(record, answer) {
    let result
    try {
      result = await targets.callTool(record.source, TOOL.approvalAnswer, {
        sessionId: record.sessionId, approvalId: record.approvalId, offerId: record.offerId, answer: approvalAnswerOf(answer),
      })
    } catch (error) {
      // Sent, outcome unknown: the card stays open, and the ask's settlement closes it if it landed.
      logger?.warn(ASK_LOG.commitFailed, record.approvalId, codeOf(error))
      return refusal(REFUSAL.operationFailed)
    }
    // Both moves name the answered offer, so a newer offer that replaced it meanwhile stays as it is.
    if (result?.ok === true) { await recorded(() => store.answered(record.key, record.offerId)); return OK }
    const code = typeof result?.code === 'string' ? result.code : REFUSAL.operationFailed
    if (ASKS.closingCodes.includes(code)) await recorded(() => store.closeOffer(record.key, record.offerId))
    // `disconnected` (never sent) and the connector's own refusals leave the ask waiting there,
    // so the card stays open for another answer.
    else if (code !== LINK.disconnected) logger?.warn(ASK_LOG.commitFailed, record.approvalId, code)
    return refusal(code)
  }

  const service = Object.freeze({
    list,
    onChange: (fn) => subscribe(listeners, fn),
    /**
     * Commits the user's answer once, through the card's own target (MULTI-0: by its `handle`).
     * Argument checks come first and send nothing; a handle that names no card of core's answers
     * `unknown-target`; then a card that is not filed, closed or voided answers `expired`, and an
     * answered one `already-settled` (the K1 refusals a second answer gets at the connector).
     */
    answer(handle, answer) {
      const checked = answerOf(answer)
      if (typeof handle !== 'string' || checked === undefined) return Promise.resolve(refusal(REFUSAL.invalidArguments))
      const tuple = tupleOfHandle(handle)
      // Only a card's own kind of handle names a card (an event or session handle never does).
      const key = tuple?.kind === TARGETS.key.kind.approval ? cardKeyOf(tuple, tuple.remoteId) : undefined
      if (key === undefined || store.get(key) === undefined) return Promise.resolve(refusal(SEAM_TARGETS.refusal.unknownTarget))
      return serial(key, async () => {
        const record = store.get(key)
        if (record?.filed !== true || record.state === CARD_STATE.closed || record.state === CARD_STATE.voided) return refusal(REFUSAL.expired)
        if (record.state === CARD_STATE.answered) return refusal(REFUSAL.alreadySettled)
        // A choice the card does not offer (Allow on incomplete arguments) is refused before sending.
        if (!record.choices.includes(checked.choice)) return refusal(REFUSAL.invalidArguments)
        return commit(record, checked)
      })
    },
  })

  /**
   * The startup reconciliation of one target epoch (see the header). Its candidates are that epoch's
   * unfiled asks recorded when it begins, after the pages already polled are taken; an ask that
   * arrives meanwhile is not one.
   * @returns {Promise<{deleted: number, kept: number}>}
   */
  async function reconcile(source) {
    await intake
    const bySession = Map.groupBy(store.unfiled(source), (record) => record.sessionId)
    let deleted = 0
    for (const [sessionId, records] of bySession) {
      const ended = await endedOf(source, sessionId, records)
      // On the intake chain, where offers are added: an unfiled record is deleted only there, so
      // the delete can never remove a newer offer that replaced it (store.js header).
      const drops = intake.then(async () => { for (const record of ended) await store.dropUnfiled(record.key, record.offerId) })
      // A failed delete fails this reconciliation, as before, but never the chain later pages wait on.
      intake = drops.catch(() => {})
      await drops
      deleted += ended.length
    }
    const kept = [...bySession.values()].reduce((sum, records) => sum + records.length, 0) - deleted
    logger?.info?.(ASK_LOG.reconciled, deleted, kept)
    return { deleted, kept }
  }

  /** The records of one session whose call ended, by its `approvals_list` answer; none when unsure. */
  async function endedOf(source, sessionId, records) {
    let result
    try { result = await targets.callTool(source, TOOL.approvalsList, { sessionId }) } catch (error) {
      logger?.warn(ASK_LOG.reconcileFailed, codeOf(error))
      return []
    }
    if (result?.ok === true && Array.isArray(result.approvals)) {
      const live = new Set(result.approvals.map((descriptor) => descriptor?.approvalId))
      return records.filter((record) => !live.has(record.approvalId))
    }
    return ASKS.endedCodes.includes(result?.code) ? records : []
  }

  /** `ask_user({offer_id})` of target epoch `source`: files that offer as a card (idempotent while open). */
  async function fileCard(source, args) {
    const offerId = args?.[ASKS.offerArgument]
    if (typeof offerId !== 'string' || offerId === '') return refusal(REFUSAL.invalidArguments)
    // A tool kept by a model after its target went: nothing of another target is ever filed.
    if (!targets.live(source)) return refusal(SEAM_TARGETS.refusal.unknownTarget)
    // After the ask events already polled are taken, so a card filed right after its event is found.
    await intake
    const record = store.byOffer(source, offerId)
    if (record === undefined) return refusal(store.wasClosed(source, offerId) ? REFUSAL.expired : ASK_CODE.unknownOffer)
    if (record.state !== CARD_STATE.open) return refusal(REFUSAL.expired)
    await store.file(record.key, offerId)
    const filed = store.get(record.key)
    // A newer offer that replaced this one meanwhile is not filed by it: this offer has expired.
    return filed?.offerId === offerId && filed.filed === true && filed.state === CARD_STATE.open ? { ok: true, card: cardOf(filed) } : refusal(REFUSAL.expired)
  }

  /**
   * The filing tool of one target epoch, in the raw form `tools.register` takes, under the
   * model-facing `name` the caller gives it (the namespaced `ask_user`) and the caller's
   * `description` (its own, with the target's name framed as data).
   */
  const toolFor = (source, name, description = ASK_TEXT.description) => Object.freeze({
    name,
    description,
    parameters: ASK_TOOL_DEFINITION.parameters,
    output: {
      schema: ASK_TOOL_DEFINITION.schema,
      render: renderJson,
    },
    execute: async (args) => {
      try { return await fileCard(source, args) } catch (error) {
        logger?.warn(ASK_LOG.writeFailed, codeOf(error))
        return refusal(REFUSAL.operationFailed)
      }
    },
  })

  /**
   * Fishball's own `approval_answer` through the target's façade was accepted (`ok`): the request
   * is settled, and the connector sends no `settlement` for an answer its managing agent gave (its
   * tool result is the outcome), so the request's record would stay open for ever. The open record
   * still unfiled on that very offer is closed, and so deleted (store.js header), on the intake chain
   * as every unfiled close. A filed card is the user's and keeps its own answer path (`commit`).
   * Never rejects: a failed delete is logged, and the next start's reconciliation finds the record.
   */
  function answered(source, args) {
    const approvalId = args?.[ASKS.answerArguments.approvalId]
    const offerId = args?.[ASKS.answerArguments.offerId]
    if (typeof approvalId !== 'string' || typeof offerId !== 'string') return intake
    const run = intake.then(() => store.dropUnfiled(cardKeyOf(source, approvalId), offerId))
    intake = run.catch((error) => logger?.warn(ASK_LOG.writeFailed, codeOf(error)))
    return intake
  }

  /**
   * Voids the open cards of every target epoch `retired(source)` names (MULTI-1, Q07), after the
   * pages already polled are taken and on the intake chain, so a page of that epoch still in flight
   * cannot re-open one. Sends nothing remote.
   */
  function voidWhere(retired) {
    const run = intake.then(() => store.voidWhere(retired))
    intake = run.catch(() => {})
    return run
  }

  return Object.freeze({
    service,
    take,
    toolFor,
    reconcile,
    answered,
    voidWhere,
    /** Resolves once every page taken so far is stored. */
    drained: () => intake,
    /** Stops taking pages; cards and the table stay as they are (the table is the caller's). */
    close() {
      closed = true
      listeners.clear()
    },
  })
}

/**
 * fishball-core's ask cards, server half (task F-ASKCARD; K3 `contracts/ask-card.d.ts`, `ui.d.ts`
 * `asks`; R-FB-11, R-UI-12, R-CON-05, R-CON-06, R-CON-08; PLAT-UC-07; Q3 = A).
 *
 * An `ask` (a session's `ask_agent`) is Fishball's to answer. When its model cannot decide, it files
 * the ask as a card with the `ask_user` tool; the user answers Allow or Reject, with an optional
 * reason, in Fishball's own conversation (fishball-ui's client.asks.js), and core commits that
 * answer through its link as Fishball's `approval_answer` on the card's `offerId`. The main DSH shows nothing (Q-U2):
 * nothing here is registered outside the Fishball DSH.
 *
 * - `createAsks({link, table, logger})`: follows the link's polls (every `ask`, `settlement` and
 *   `retirement`; a page is read whoever the event was dispatched to, so an interceptor or Fishball
 *   taking it changes nothing here), and returns `service` (the K3 `fishballInstance.ui.asks`),
 *   `tool` (the filing tool's raw DSH definition; core's main row registers it with `tools.register`
 *   in the manager's scope), `reconcile()` (below) and `close()`. Its `onPoll` listener resolves once
 *   the page's cards are stored.
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
 */
import { LINK, MCP } from '../../contracts/constants.js'
import { emitIsolated, subscribe } from '../link/listeners.js'
import { codeOf } from '../events/diagnostics.js'
import { ASKS, ASK_CODE, ASK_LOG, ASK_MISUSE, ASK_TOOL_DEFINITION, ASK_TEXT, CARD_STATE } from './constants.js'
import { cardOf, createCardStore, recordOf } from './store.js'

// Core's own copy of the connector's MCP surface (K3a; F-OWN-SCHEMA), under the names this module reads.
const REFUSAL = MCP.refusal
const TOOL = MCP.tools
const EVENT_TYPE = MCP.eventTypes

export { openAskCards } from './store.js'
export { registerAskRoutes } from './routes.js'
export { ASKS, ASK_TOOL, CARD_STATE } from './constants.js'

const refusal = (code) => Object.freeze({ ok: false, code })
const OK = Object.freeze({ ok: true })

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
 * @param {{onPoll(fn: (result: object) => void): () => void, callTool(name: string, args: object): Promise<object>}} options.link
 *   core's link (link.js `McpLink`), public API only
 * @param {object} options.table the card KvTable, from `openAskCards`
 * @param {{warn: Function}} [options.logger] the background log
 */
export function createAsks({ link, table, logger }) {
  if (typeof link?.onPoll !== 'function' || typeof link?.callTool !== 'function') throw new TypeError(ASK_MISUSE.link)
  const listeners = new Set()
  const list = () => Object.freeze(store.cards().map(cardOf))
  const store = createCardStore(table, () => emitIsolated(listeners, list()))
  const serial = keyedSerial()
  let intake = Promise.resolve()
  let closed = false

  /** One polled event; anything but an ask, its settlement or its retirement is not the store's. */
  async function take(event) {
    if (event?.type === EVENT_TYPE.ask) {
      const record = recordOf(event)
      if (record === undefined) { logger?.warn(ASK_LOG.malformed, String(event.eventId)); return }
      await store.add(record)
    } else if (event?.type === EVENT_TYPE.settlement) {
      await store.close(event.payload?.approvalId)
    } else if (event?.type === EVENT_TYPE.retirement) {
      await store.close(store.approvalOfEvent(event.payload?.retiredEventId))
    }
  }

  // Pages are taken in order, one event at a time, so an ask and its settlement in one page (or in
  // two) are applied in the order the connector committed them. The listener returns the page's
  // promise, so a caller that owns the poll pipeline (core's main row) can store the cards before it
  // lets the same events be acked (F-WIRE: "store the card before the ack"); the link ignores it.
  const offPoll = link.onPoll((result) => {
    if (closed || result?.ok !== true || !Array.isArray(result.events)) return intake
    const events = [...result.events]
    // Each event's failure is its own: a later settlement in the same page must still close its
    // card, because an acked page is never polled again.
    intake = intake.then(async () => {
      for (const event of events) {
        if (closed) return
        try { await take(event) } catch (error) { logger?.warn(ASK_LOG.writeFailed, codeOf(error)) }
      }
    })
    return intake
  })

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
      result = await link.callTool(TOOL.approvalAnswer, {
        sessionId: record.sessionId, approvalId: record.approvalId, offerId: record.offerId, answer: approvalAnswerOf(answer),
      })
    } catch (error) {
      // Sent, outcome unknown: the card stays open, and the ask's settlement closes it if it landed.
      logger?.warn(ASK_LOG.commitFailed, record.approvalId, codeOf(error))
      return refusal(REFUSAL.operationFailed)
    }
    if (result?.ok === true) { await recorded(() => store.answered(record.approvalId)); return OK }
    const code = typeof result?.code === 'string' ? result.code : REFUSAL.operationFailed
    if (ASKS.closingCodes.includes(code)) await recorded(() => store.close(record.approvalId))
    // `disconnected` (never sent) and the connector's own refusals leave the ask waiting there,
    // so the card stays open for another answer.
    else if (code !== LINK.disconnected) logger?.warn(ASK_LOG.commitFailed, record.approvalId, code)
    return refusal(code)
  }

  const service = Object.freeze({
    list,
    onChange: (fn) => subscribe(listeners, fn),
    /**
     * Commits the user's answer once. Argument checks come first and send nothing; then a card that
     * is not listed, or closed, answers `expired`, and an answered one `already-settled` (the K1
     * refusals a second answer gets at the connector).
     */
    answer(approvalId, answer) {
      const checked = answerOf(answer)
      if (typeof approvalId !== 'string' || checked === undefined) return Promise.resolve(refusal(REFUSAL.invalidArguments))
      return serial(approvalId, async () => {
        const record = store.get(approvalId)
        if (record?.filed !== true || record.state === CARD_STATE.closed) return refusal(REFUSAL.expired)
        if (record.state === CARD_STATE.answered) return refusal(REFUSAL.alreadySettled)
        return commit(record, checked)
      })
    },
  })

  /**
   * The startup reconciliation (see the header). Its candidates are the unfiled asks recorded when
   * it begins, after the pages already polled are taken; an ask that arrives meanwhile is not one.
   * @returns {Promise<{deleted: number, kept: number}>}
   */
  async function reconcile() {
    await intake
    const bySession = Map.groupBy(store.unfiled(), (record) => record.sessionId)
    let deleted = 0
    for (const [sessionId, records] of bySession) {
      const ended = await endedOf(sessionId, records)
      for (const record of ended) await store.dropUnfiled(record.approvalId)
      deleted += ended.length
    }
    const kept = [...bySession.values()].reduce((sum, records) => sum + records.length, 0) - deleted
    logger?.info?.(ASK_LOG.reconciled, deleted, kept)
    return { deleted, kept }
  }

  /** The records of one session whose call ended, by its `approvals_list` answer; none when unsure. */
  async function endedOf(sessionId, records) {
    let result
    try { result = await link.callTool(TOOL.approvalsList, { sessionId }) } catch (error) {
      logger?.warn(ASK_LOG.reconcileFailed, codeOf(error))
      return []
    }
    if (result?.ok === true && Array.isArray(result.approvals)) {
      const live = new Set(result.approvals.map((descriptor) => descriptor?.approvalId))
      return records.filter((record) => !live.has(record.approvalId))
    }
    return ASKS.endedCodes.includes(result?.code) ? records : []
  }

  /** `ask_user({offer_id})`: files the ask with that offer id as a card (idempotent while open). */
  async function fileCard(args) {
    const offerId = args?.[ASKS.offerArgument]
    if (typeof offerId !== 'string' || offerId === '') return refusal(REFUSAL.invalidArguments)
    // After the ask events already polled are taken, so a card filed right after its event is found.
    await intake
    const record = store.byOffer(offerId)
    if (record === undefined) return refusal(store.wasClosed(offerId) ? REFUSAL.expired : ASK_CODE.unknownOffer)
    if (record.state !== CARD_STATE.open) return refusal(REFUSAL.expired)
    await store.file(record.approvalId)
    const filed = store.get(record.approvalId)
    return filed?.filed === true && filed.state === CARD_STATE.open ? { ok: true, card: cardOf(filed) } : refusal(REFUSAL.expired)
  }

  const tool = Object.freeze({
    name: ASKS.tool,
    description: ASK_TEXT.description,
    parameters: ASK_TOOL_DEFINITION.parameters,
    output: {
      schema: ASK_TOOL_DEFINITION.schema,
      render: (_args, value) => [{ type: ASK_TOOL_DEFINITION.blockType, text: JSON.stringify(value, null, ASK_TOOL_DEFINITION.jsonIndent) }],
    },
    execute: async (args) => {
      try { return await fileCard(args) } catch (error) {
        logger?.warn(ASK_LOG.writeFailed, codeOf(error))
        return refusal(REFUSAL.operationFailed)
      }
    },
  })

  return Object.freeze({
    service,
    tool,
    reconcile,
    /** Stops following the link; cards and the table stay as they are (the table is the caller's). */
    close() {
      closed = true
      offPoll()
      listeners.clear()
    },
  })
}

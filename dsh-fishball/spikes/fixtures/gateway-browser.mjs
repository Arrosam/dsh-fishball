/**
 * Spike fixture (S36): a stand-in for one browser tab, connected to DSH's real typert gateway as
 * an owner client (`openRemoteEvents`), so forwarded `user-questions/request` waterfalls, their
 * `cancel` frames and answers travel the same Host path a browser uses. Only the wire is skipped.
 *
 * What it copies from dsh-client-ui-user-questions (rc.2/rc.3 `client.js`), as the oracle:
 * - `compose` = `submitDrafts`: skipped -> { id, selected: [] }; custom text replaces a
 *   single-select choice and supplements a multi-select one;
 * - plan review Approve = { answers: [{ id, selected: [approve] }] }; "Discuss" = reject
 *   ASK_CANCELLED;
 * - a timed card claims the wait with `userQuestions.attachWait` and, when its countdown ends,
 *   rejects ASK_TIMED_OUT (the card stays, as continued);
 * - a continued card answers through `userQuestions.answer(agent, callId, batch)` (the RPC body).
 */
export const BROWSER = Object.freeze({ event: 'user-questions/request', waterfall: 'waterfall', cancel: 'cancel', ready: 'ready' })

/** dsh-client-ui-user-questions `submitDrafts`, verbatim in behaviour. drafts[i] = { selected, custom, skipped }. */
export function compose(questions, drafts) {
  return {
    answers: questions.map((item, index) => {
      const value = drafts[index]
      if (value.skipped) return { id: item.id, selected: [] }
      const custom = (value.custom ?? '').trim()
      return { id: item.id, selected: custom === '' || item.multiSelect === true ? value.selected : [], ...(custom === '' ? {} : { custom }) }
    }),
  }
}

export class GatewayBrowser {
  #gateway
  #ctx
  #life = new AbortController()
  clientId
  /** eventId -> { eventId, agentId, request, closed: false | 'cancel' | 'answered' | 'rejected', claim } */
  cards = new Map()
  frames = []

  constructor(ctx) {
    this.#ctx = ctx
    this.#gateway = ctx.typertGateway
  }

  async connect({ countdown = true } = {}) {
    this.countdown = countdown
    const peer = { principal: { kind: 'owner' }, signal: this.#life.signal }
    const stream = this.#gateway.openRemoteEvents({ args: {} }, this.#life.signal, peer)[Symbol.asyncIterator]()
    const ready = await stream.next()
    if (ready.value?.type !== BROWSER.ready) throw new Error('gateway did not open an event stream')
    this.clientId = ready.value.clientId
    this.client = this.#gateway.remoteEventClients.get(this.clientId)
    ;(async () => {
      for (;;) {
        const { value, done } = await stream.next()
        if (done) return
        this.#frame(value)
      }
    })().catch((error) => { this.streamError = String(error) })
    return this
  }

  disconnect() { this.#life.abort(new Error('tab closed')) }

  #frame(frame) {
    if (frame.type === BROWSER.waterfall && frame.event === BROWSER.event) {
      const card = { eventId: frame.eventId, agentId: frame.agentId, request: frame.request, closed: false, shownAt: Date.now() }
      this.cards.set(frame.eventId, card)
      this.frames.push({ type: 'waterfall', eventId: frame.eventId, agentId: frame.agentId })
      if (frame.request.wait?.timed === true) this.#claim(card)
    } else if (frame.type === BROWSER.cancel && this.cards.has(frame.eventId)) {
      const card = this.cards.get(frame.eventId)
      card.closed ||= 'cancel'
      card.claim?.abort()
      this.frames.push({ type: 'cancel', eventId: frame.eventId })
    }
  }

  /** Hold a timed wait as the real card does; at the countdown, reject ASK_TIMED_OUT. */
  async #claim(card) {
    const agent = this.#ctx.agents.get(card.agentId)
    card.claim = new AbortController()
    const frames = this.#ctx.userQuestions.attachWait(agent, card.request.wait.callId, card.claim.signal)[Symbol.asyncIterator]()
    const opening = await frames.next()
    if (opening.done) return
    card.remainingMs = opening.value.remainingMs
    if (this.countdown) card.timer = setTimeout(() => this.reject(card.eventId, 'ASK_TIMED_OUT'), opening.value.remainingMs)
    frames.next().catch(() => {})
  }

  #send(card, outcome) {
    clearTimeout(card.timer)
    card.claim?.abort()
    this.#gateway.receiveRemoteEventResult(this.client, { clientId: this.clientId, eventId: card.eventId, outcome })
  }

  /** The newest open card of a session. */
  openCard(sessionId) { return [...this.cards.values()].reverse().find((c) => c.agentId === sessionId && !c.closed) }

  answer(eventId, batch) {
    const card = this.cards.get(eventId)
    card.closed = 'answered'
    this.#send(card, { kind: 'result', value: batch })
  }

  reject(eventId, code) {
    const card = this.cards.get(eventId)
    if (card.closed) return
    card.closed = 'rejected:' + code
    this.#send(card, { kind: 'rejected', error: { name: 'UserQuestionError', message: code, code } })
  }

  /** A continued card's answer: the body of the `answer` RPC. */
  answerContinued(sessionId, callId, batch) {
    return this.#ctx.userQuestions.answer(this.#ctx.agents.get(sessionId), callId, batch)
  }
}

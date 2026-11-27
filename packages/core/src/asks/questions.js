/** Local Fishball questions share the card layer, not a connector's offer lifecycle. */
import { randomUUID } from 'node:crypto'
import { createUserMessage, freezeMessage } from '@deepseek-ai/dsh-llm'
import { SEAM_TARGETS } from 'fishball-shared/ui-seam'
import { MCP } from '../../contracts/constants.js'
import { codeOf } from '../events/diagnostics.js'
import { emitIsolated, subscribe } from '../link/listeners.js'
import { renderJson } from '../tool-output.js'
import { ASK_LOG, ASK_TOOL, ASK_TOOL_DEFINITION, CARD_STATE, QUESTION_CARD as Q } from './constants.js'
import { answersOf, questionsOf, questionSchema, QUESTION_PARAMETERS } from './question-shape.js'

const { refusal: REFUSAL } = MCP
const refusal = (code) => ({ ok: false, code })
const ok = Object.freeze({ ok: true })

export async function openQuestionCards(ctx, { defineDomain, domainTable }) {
  const domain = await ctx.storage.domain.open(defineDomain({
    name: Q.domain, version: Q.version, tables: { [Q.table]: domainTable(questionSchema) },
  }))
  return { table: domain.table(Q.table), close: () => domain.close() }
}

function replyText(cardId, answers) {
  return Q.answerPrefix + JSON.stringify({ cardId, answers })
}

const textBlock = (text) => ({ type: 'text', text })

export function createQuestionCards({ table, resolveAgent, ownsSession, flush, watchSession, logger }) {
  const listeners = new Set()
  let tail = Promise.resolve()
  let closed = false
  const run = (task) => {
    const result = tail.then(async () => {
      if (closed) return refusal(REFUSAL.operationFailed)
      try { return await task() }
      catch (error) { logger?.warn(ASK_LOG.commitFailed, Q.kind, codeOf(error)); return refusal(REFUSAL.operationFailed) }
    })
    tail = result.then(() => undefined)
    return result
  }
  const publish = () => emitIsolated(listeners)
  const records = () => [...table.entries()].map(([, record]) => record)

  // Weakly track attempted replies per live agent. The log is authoritative across restarts;
  // within one agent a claimed reply may not have its user/message receipt yet.
  const attempts = new WeakMap()
  const outstanding = new Map(records().flatMap((record) => record.reply === undefined ? [] : [[record.reply.messageId, record.cardId]]))
  const admitted = (live, id) => live.session.snapshotEvents().some((event) => event.type === Q.event.admitted && event.data.id === id)

  async function complete(record) {
    // Once admitted, the user's text belongs in the session log, not a second history store.
    const { cardId, sessionId } = record
    await table.put(cardId, { cardId, sessionId, settled: true })
    outstanding.delete(record.reply.messageId)
    if (!record.settled) publish()
  }

  const unwatch = watchSession((log, event) => {
    if (event.type !== Q.event.admitted || !ownsSession(log.id)) return
    const cardId = outstanding.get(event.data.id)
    if (cardId !== undefined) void run(async () => {
      const latest = table.get(cardId)
      if (latest?.reply === undefined) return
      if (!await flush(log)) throw new Error(Q.answerUnavailable)
      await complete(latest)
    })
  })

  async function deliver(record, live, recovering = false) {
    const { cardId, reply: { messageId, answers } } = record
    const received = admitted(live, messageId)
    if (!received) {
      let tried = attempts.get(live)
      if (tried === undefined) attempts.set(live, tried = new Set())
      const steered = live.inbox.nextStep.find((message) => message.id === messageId)
      const pending = steered ?? live.inbox.nextTurn.find((message) => message.id === messageId)
      if (pending !== undefined && recovering && live.status !== Q.running) {
        // Restored inbox entries do not wake DSH. Requeue the exact pending identity as its
        // scheduler does; a crash between removal and requeue still leaves the outbox intact.
        live.inbox.remove(messageId)
        if (steered === undefined) await live.followup(pending)
        else await live.steer(steered)
      } else if (pending === undefined && !tried.has(messageId)) {
        await live.followup(freezeMessage({ id: messageId, role: 'user', source: Q.replySource, content: [textBlock(replyText(cardId, answers))] }))
      }
      tried.add(messageId)
    }
    if (!await flush(live.session)) throw new Error(Q.answerUnavailable)
    if (received) await complete(record)
    else if (!record.settled) {
      await table.put(cardId, { ...record, settled: true })
      publish()
    }
    return ok
  }

  function answer(cardId, input) {
    if (typeof cardId !== 'string') return Promise.resolve(refusal(REFUSAL.invalidArguments))
    return run(async () => {
      const record = table.get(cardId)
      if (record === undefined || !ownsSession(record.sessionId)) return refusal(SEAM_TARGETS.refusal.unknownTarget)
      if (record.settled) return refusal(REFUSAL.alreadySettled)
      const answers = answersOf(record.questions, input)
      if (answers === undefined) return refusal(REFUSAL.invalidArguments)
      const live = await resolveAgent(record.sessionId)
      if (live?.id !== record.sessionId) return refusal(REFUSAL.expired)
      // Commit the user's first choice before touching the session log. If the two writes are
      // interrupted, the stored message identity lets retry/restart reconcile without duplicating it.
      if (record.reply !== undefined) {
        if (JSON.stringify(record.reply.answers) !== JSON.stringify(answers)) return refusal(REFUSAL.alreadySettled)
        return deliver(record, live)
      }
      const { id: messageId } = createUserMessage({ source: Q.replySource, content: [textBlock(replyText(cardId, answers))] })
      const answered = { ...record, reply: { messageId, answers } }
      await table.put(cardId, answered)
      outstanding.set(messageId, cardId)
      return deliver(answered, live)
    })
  }

  return Object.freeze({
    list: () => records().filter(({ sessionId, settled }) => !settled && ownsSession(sessionId)).map(({ cardId, sessionId, questions, askedAt }) => ({
      kind: Q.kind, handle: cardId, cardId, sessionId, questions, askedAt, state: CARD_STATE.open,
    })),
    onChange: (fn) => subscribe(listeners, fn),
    answer,
    toolFor: (sessionId) => ({
      name: ASK_TOOL.fileCard,
      description: Q.description,
      parameters: QUESTION_PARAMETERS,
      output: { schema: ASK_TOOL_DEFINITION.schema, render: renderJson },
      async execute(input) {
        const questions = questionsOf(input?.questions)
        if (questions === undefined) throw new TypeError(Q.invalidQuestions)
        const result = await run(async () => {
          if (!ownsSession(sessionId)) return refusal(REFUSAL.expired)
          const cardId = Q.idPrefix + randomUUID()
          await table.put(cardId, { cardId, questions, sessionId, askedAt: Date.now() })
          publish()
          return { cardId }
        })
        if (result.cardId === undefined) throw new Error(Q.fileUnavailable)
        return result
      },
    }),
    async recover(liveAgent) {
      const pending = records().filter(({ sessionId, reply }) => reply !== undefined && ownsSession(sessionId))
      if (pending.length === 0) return
      const { sessionId } = pending[0]
      // A row reload may join an agent between its inbox claim and user/message append. Let
      // that activity finish before deciding the delivery is missing; never wait in the tool.
      await liveAgent(sessionId)?.whenIdle()
      for (const { cardId } of pending) await run(async () => {
        const current = table.get(cardId)
        if (current?.reply === undefined || !ownsSession(sessionId)) return
        const live = await resolveAgent(sessionId)
        if (live?.id === sessionId) await deliver(current, live, true)
      })
    },
    close() {
      closed = true
      unwatch()
      listeners.clear()
      return tail
    },
  })
}

/** One presentation feed; keep local and connector answer semantics in their respective owners. */
export function cardFeed(permissions, questions) {
  const list = () => Object.freeze([...permissions.list(), ...questions.list()].sort((a, b) => a.askedAt - b.askedAt))
  return Object.freeze({
    list,
    onChange(fn) {
      const push = () => fn(list())
      const offPermissions = permissions.onChange(push)
      const offQuestions = questions.onChange(push)
      return () => { offPermissions(); offQuestions() }
    },
    answer: permissions.answer,
    answerQuestion: questions.answer,
  })
}

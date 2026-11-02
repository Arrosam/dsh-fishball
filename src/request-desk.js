/**
 * RequestDesk (revision 11, DESIGN §7a.2, items 6-9): the two tools a managed session's agent has
 * besides message_fishball. Their definitions go to the ManagedRegistry (src/managed.js), which
 * registers them in each managed agent's own scope while Permission requests runs (§5e "Which
 * Fishball plugin", Reading), so a session that is yours gets DSH's UNKNOWN_TOOL.
 *
 * - list_user_messages(): your recent messages in the calling session (the one the user sees),
 *   with their ids, which agents cannot otherwise see (item 6). Only messages you typed there
 *   count: sources user and user-rpc, never a relay, a Fishball notice or a forward. The newest
 *   userMessagesListed, each excerpt cut to userMessageExcerptChars characters (Q-r11-list).
 * - ask_fishball({tool, arguments, quote, why}): ask before a call that needs approval (item 7).
 *   Quotes are verified by code: each id must be a message you typed in that session, and code
 *   adds its full text from the log, so a quote cannot be faked; any other id refuses the call
 *   with not-user-message and nothing is sent. The agent waits until the final answer (item 8);
 *   the broker (src/approvals.js) holds the request, its thread, the pass or the to-you ticket,
 *   and its card in your pile once Fishball sends it to you (rev11c). The call's own id is passed
 *   on: the running row shows your buttons by it, and the turn's tags are placed by it.
 *   ask_fishball({request_id, reply}) answers Fishball's question in the same thread.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { APPROVAL, ASK_ERROR, ASK_RESULT, SESSION_INFO } from './constants.js'
import { rootSessionOf, senderOf, textOfEvent } from './session-info.js'

export const DESK_TOOL = Object.freeze({ ask: 'ask_fishball', list: 'list_user_messages' })

/** What the agent does next, per answer (stable texts; the codes are the contract). */
const NOTE = Object.freeze({
  [ASK_RESULT.allowed]: 'Fishball allowed this call once. Make the call now with exactly these arguments.',
  [ASK_RESULT.rejected]: 'Fishball rejected this call. Do not make it.',
  [ASK_RESULT.question]: 'Fishball asks a question before deciding. Answer with ask_fishball({request_id, reply}); the same request then goes back to Fishball.',
  [ASK_RESULT.unavailable]: 'Fishball cannot answer now. Make the call yourself; the user is asked in this session.',
  [ASK_RESULT.overCapacity]: 'Too many requests are waiting for Fishball or the user. Make the call yourself; the user is asked in this session.',
  [ASK_RESULT.noLongerManaged]: 'This session is no longer managed by Fishball. Make the call yourself; the user is asked in this session.',
  [ASK_ERROR.notUserMessage]: 'A quoted id is not a message the user typed in this session. Use ids from list_user_messages. Nothing was sent.',
  [ASK_ERROR.tooLarge]: 'The request is too large to send to Fishball (arguments, quotes, reason and thread together). Quote fewer messages or shorten the reason. Nothing was sent.',
  [ASK_ERROR.expired]: 'That request is not open in this session. Ask again with tool, arguments, quote and why.',
  [ASK_ERROR.invalid]: 'Give tool (a tool name) and arguments (an object of the exact arguments), or request_id with reply.',
  [ASK_ERROR.empty]: 'The reply is empty.',
  [ASK_ERROR.cancelled]: 'The call was cancelled.',
})
/** A call one of Fishball's standing grants covers: allowed at once, no Fishball step (§7a.3, §7a.8). */
const GRANT_NOTE = 'A standing grant from Fishball covers this call. Make the call now with exactly these arguments.'
/** The same, when the user answered the request's card (Fishball had sent it to them, §7a.6). */
const USER_NOTE = Object.freeze({
  [ASK_RESULT.allowed]: 'The user allowed this call once. Make the call now with exactly these arguments.',
  [ASK_RESULT.rejected]: 'The user rejected this call. Do not make it.',
})

const TEXT = Object.freeze({
  listDescription: 'List the user\'s recent messages in this session, newest first, each with its id, time and an excerpt. Use the ids as quotes in ask_fishball.',
  askDescription: 'Ask Fishball, who manages this session for the user, before you make a call that needs the user\'s approval. Give the exact tool and arguments you will use, the ids of the user\'s messages (from list_user_messages) that show the user asked for this work, and why the call is needed. Wait for the answer: "allowed" means make exactly that call now; "rejected" means do not; "question" means answer with ask_fishball({request_id, reply}); any other answer tells you to make the call yourself, and the user is asked.',
  toolArg: 'The name of the tool you will call.',
  argumentsArg: 'The exact arguments you will pass to it.',
  quoteArg: 'Ids of the user\'s messages in this session (from list_user_messages) that show what the user asked you to do.',
  whyArg: 'Why the call is needed, in one or two sentences.',
  requestIdArg: 'To answer Fishball\'s question: the request id it named.',
  replyArg: 'Your answer to Fishball\'s question (with request_id).',
})

const JSON_OUTPUT = Object.freeze({ schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] })
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The messages you typed in a session, oldest first: [{ id, at, text }]. */
function userMessages(session) {
  return session.snapshotEvents()
    .filter((event) => event.type === APPROVAL.userEvent && senderOf(event.data?.source) === SESSION_INFO.roles.user && typeof event.data?.id === 'string')
    .map((event) => ({ id: event.data.id, at: new Date(event.time).toISOString(), text: textOfEvent(event) }))
}

/** The first `chars` characters of a text (code points, so a character is never split). */
const firstChars = (text, chars) => [...text].slice(0, chars).join('')

/** One answer to the agent: the code, the fields that go with it, and what to do next. */
function answer({ code, requestId, reason, question, byUser, byGrant }) {
  return {
    ok: code === ASK_RESULT.allowed,
    code,
    ...(requestId === undefined ? {} : { request_id: requestId }),
    ...(reason === undefined ? {} : { reason }),
    ...(question === undefined ? {} : { question }),
    note: byGrant ? GRANT_NOTE : (byUser ? USER_NOTE[code] : undefined) ?? NOTE[code],
  }
}

/**
 * @param deps.ctx - fishball row context (sessions).
 * @param deps.broker - ApprovalBroker (askFirst, reply).
 * @param deps.readLimits - () => limits.
 * @returns the two tool definitions, for the managed registry.
 */
export function requestDeskTools({ ctx, broker, readLimits }) {
  /** The session the user sees for this call, and its log (a subagent never has these tools). */
  const callerOf = (exec) => {
    const sessionId = rootSessionOf(ctx, exec.agent.id)
    return { sessionId, session: ctx.sessions.get(sessionId) ?? exec.agent.session }
  }
  const list = defineTool({
    name: DESK_TOOL.list,
    description: TEXT.listDescription,
    parameters: {},
    output: JSON_OUTPUT,
    async execute(_args, exec) {
      if (exec.agent === undefined) return answer({ code: ASK_ERROR.invalid })
      const limits = readLimits()
      const messages = userMessages(callerOf(exec).session).reverse().slice(0, limits.userMessagesListed)
      return { ok: true, messages: messages.map(({ id, at, text }) => ({ id, at, excerpt: firstChars(text, limits.userMessageExcerptChars) })) }
    },
  })
  const ask = defineTool({
    name: DESK_TOOL.ask,
    description: TEXT.askDescription,
    parameters: {
      tool: { type: 'string', description: TEXT.toolArg },
      arguments: { type: 'object', additionalProperties: true, description: TEXT.argumentsArg },
      quote: { type: 'array', items: { type: 'string' }, description: TEXT.quoteArg },
      why: { type: 'string', description: TEXT.whyArg },
      request_id: { type: 'string', description: TEXT.requestIdArg },
      reply: { type: 'string', description: TEXT.replyArg },
    },
    output: JSON_OUTPUT,
    async execute({ tool, arguments: args, quote, why, request_id: requestId, reply }, exec) {
      if (exec.agent === undefined) return answer({ code: ASK_ERROR.invalid })
      const { sessionId, session } = callerOf(exec)
      if (requestId !== undefined) {
        if (typeof reply !== 'string' || reply.trim().length === 0) return answer({ code: ASK_ERROR.empty })
        return answer(await broker.reply({ sessionId, requestId, reply: reply.trim(), callId: exec.callId, signal: exec.signal }))
      }
      const ids = quote ?? []
      if (typeof tool !== 'string' || tool.trim().length === 0 || !isObject(args) || !Array.isArray(ids) || (why !== undefined && typeof why !== 'string')) return answer({ code: ASK_ERROR.invalid })
      const typed = new Map(userMessages(session).map((message) => [message.id, message.text]))
      const quotes = []
      for (const id of new Set(ids)) {
        if (!typed.has(id)) return answer({ code: ASK_ERROR.notUserMessage })
        quotes.push({ id, text: typed.get(id) })
      }
      return answer(await broker.askFirst({ agent: exec.agent, sessionId, toolName: tool, args, quotes, why: (why ?? '').trim(), callId: exec.callId, signal: exec.signal }))
    },
  })
  return [ask, list]
}

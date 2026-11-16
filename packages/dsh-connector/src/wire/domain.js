/**
 * C-TOOLS' `domain` port (mcp/tools/index.js) bound to this DSH (task C-WIRE): the V2 session
 * port's DSH work (slim/host/session-port.js: start, message, redirect, stop, read, describe, the
 * image port) and the bridge's folder rule (`placeOf`), reused unchanged, over the V3 state
 * instead of the V2 registries. K1c `ManagedState` is the only owner of who manages a session; this
 * port never reads the V2 managed registry.
 *
 * - `sessions.read` returns K1's neutral roles (READ_ROLE, requirements 1.41 Q-G8 = B): the port's
 *   `fishball` (a message the V3 connector sent, `senderSessionId` = SENDER below) reads
 *   `principal`. Every V3 delivery is sent under that one sender id, so a principal's own message
 *   reads as `principal` whichever principal sent it.
 * - `interactions` is the split's interim (the user's choice, 2026-11-16: the V2 approval broker
 *   is switched to V3 routing in C-WIRE-2): the live offers are routing's (`liveOffers`), so a
 *   session has none until then; the prompt and grant lists are empty, and every answer is
 *   `unsupported-operation`. Nothing here settles or hides a V2 request.
 */
import { READ_ROLE, REFUSAL } from '../../mcp-schema/index.js'
import { SESSION_INFO } from '../constants.js'
import { rootSessionOf } from '../session-info.js'
import { placeOf } from '../slim/host/bridge.js'
import { createSessionPort } from '../slim/host/session-port.js'
import { DOMAIN } from './constants.js'

/** The V2 read's role words → K1 READ_ROLE: only the connector's own sender is renamed. */
const ROLE_OF = Object.freeze({ [SESSION_INFO.roles.fishball]: READ_ROLE.principal })
/** A V2 read message in K1's words: its role, and its author where the port wrote the role there. */
function neutral(message) {
  const role = ROLE_OF[message.role] ?? message.role
  return { ...message, role, author: message.author === message.role ? role : message.author }
}
/** The V2 port's decisions audit belongs to the V2 row; a V3 stop or redirect writes none. */
const NO_AUDIT = async () => {}

const unsupported = async () => Object.freeze({ ok: false, code: REFUSAL.unsupportedOperation })

/**
 * @param ctx - the connector row's context
 * @param deps.readLimits - the connector's live limits (src/config.js)
 * @param deps.routing - the routing composition (`liveOffers`)
 */
export function createSessionDomain(ctx, { readLimits, routing }) {
  // What the V2 port reads of its registries: the V3 sender id and the connector's live limits.
  const v3State = Object.freeze({ assistantId: () => DOMAIN.senderId, readLimits, stopped: NO_AUDIT, redirected: NO_AUDIT })
  const port = createSessionPort(ctx, { state: () => v3State })

  const sessions = Object.freeze({
    rootOf: (sessionId) => rootSessionOf(ctx, sessionId),
    describe: (sessionId) => port.describe(sessionId),
    async start(args, { onCreated }) {
      const target = await placeOf(port, args.folder)
      return port.start({
        target, title: args.title, message: args.message, attachments: args.attachments,
        ...(args.model === undefined ? {} : { model: args.model }),
        ...(args.reasoningEffort === undefined ? {} : { reasoningEffort: args.reasoningEffort }),
        onCreated,
      })
    },
    // Only the K1 fields: the V2 port's `notifyWhenFinished` (a V2 watch) has no V3 meaning.
    message: ({ sessionId, message, attachments }) => port.message({ sessionId, message, attachments }),
    redirect: ({ sessionId, message, attachments }) => port.redirect({ sessionId, message, attachments }),
    stop: (input) => port.stop(input),
    async read(input) {
      const read = await port.read(input)
      return { messages: read.messages.map(neutral), truncated: read.truncated }
    },
  })

  const interactions = Object.freeze({
    liveOffers: (sessionId) => routing.liveOffers(sessionId),
    answerApproval: unsupported,
    answerQuestion: unsupported,
    listPrompts: async () => [],
    answerPrompt: unsupported,
    listGrants: async () => [],
    revokeGrant: unsupported,
  })

  const attachments = Object.freeze({
    put: (args) => port.attachment.put(args),
    read: (args) => port.attachment.read(args),
  })

  return Object.freeze({ sessions, interactions, attachments })
}

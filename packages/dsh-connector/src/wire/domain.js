/**
 * C-TOOLS' `domain` port (mcp/tools/index.js) bound to this DSH (tasks C-WIRE, C-WIRE-2): the
 * session port, the permission broker, the question router, the prompts already showing, the
 * standing grants and the managed sessions' `message_agent`, all over the V3 state. K1c
 * `ManagedState` is the only owner of who manages a session.
 *
 * - `sessions.read` returns K1's neutral roles (READ_ROLE, requirements 1.41 Q-G8 = B): a message
 *   the connector delivered (`senderSessionId` = DOMAIN.senderId) reads `principal`, whichever
 *   principal sent it.
 * - Every end of management (release, Take back, revocation) retires the session's offers in
 *   routing, which reports them (`onLeft`): each waiting call goes to the user in its session. A
 *   session nobody manages any more has its grants ended (§5e), on every managed-state change.
 */
import { READ_ROLE, parseOfferId } from '../../mcp-schema/index.js'
import { SESSION_INFO } from '../constants.js'
import { openGrantStore, createGrants } from '../domain/grants.js'
import { createPermissions } from '../domain/permissions.js'
import { createPromptGate } from '../domain/prompt-gate.js'
import { createPrompts } from '../domain/prompts.js'
import { createQuestions } from '../domain/questions.js'
import { placeOf } from '../domain/folder.js'
import { createSessionPort } from '../domain/session-port.js'
import { createSessionTools } from '../domain/session-tools.js'
import { createWording } from '../domain/wording.js'
import { rootSessionOf, titleOf } from '../session-info.js'
import { DOMAIN } from './constants.js'

/** The port's role words → K1 READ_ROLE: only the connector's own sender is renamed. */
const ROLE_OF = Object.freeze({ [SESSION_INFO.roles.fishball]: READ_ROLE.principal })
/** A read message in K1's words: its role, and its author where the port wrote the role there. */
function neutral(message) {
  const role = ROLE_OF[message.role] ?? message.role
  return { ...message, role, author: message.author === message.role ? role : message.author }
}

const refused = (code) => Object.freeze({ ok: false, code })

/**
 * @param ctx - the connector row's context
 * @param deps.storageDomain - `{defineDomain, domainTable}` of the running SDK
 * @param deps.readLimits - the connector's live limits (src/config.js)
 * @param deps.routing - the routing composition
 * @param deps.logger - the row's logger
 * @returns `{sessions, interactions, attachments, close}`
 */
export async function createSessionDomain(ctx, { storageDomain, readLimits, routing, logger }) {
  const now = Date.now
  const managerOf = (sessionId) => routing.managed.managerOf(sessionId)
  const titleOfSession = (sessionId) => titleOf(ctx, sessionId)
  const port = createSessionPort(ctx, { senderId: DOMAIN.senderId, readLimits, now })
  const grantStore = await openGrantStore(ctx, storageDomain)
  const grants = createGrants({ table: grantStore.table, managerOf, now, logger })
  const wording = createWording(ctx)
  const gate = createPromptGate(ctx, now)
  const permissions = createPermissions(ctx, { routing, managerOf, grants, gate, wording, titleOf: titleOfSession, readLimits, now, logger })
  const questions = createQuestions(ctx, { routing, managerOf, titleOf: titleOfSession, now, logger })
  const prompts = createPrompts({ gate, wording, titleOf: titleOfSession })
  const tools = createSessionTools(ctx, { routing, managed: routing.managed, readLimits, logger })

  const disposers = [
    routing.onLeft((offers) => {
      for (const { offerId } of offers) {
        const requestId = parseOfferId(offerId)?.requestId
        if (!permissions.toUser(requestId)) questions.toUser(requestId)
      }
    }),
    routing.managed.onChange(() => grants.endUnmanaged()),
  ]
  await grants.reconcile()

  const sessions = Object.freeze({
    rootOf: (sessionId) => rootSessionOf(ctx, sessionId),
    describe: (sessionId) => port.describe(sessionId),
    async start(args, { onCreated }) {
      const target = await placeOf(ctx, args.folder)
      return port.start({
        target, title: args.title, message: args.message, attachments: args.attachments,
        ...(args.model === undefined ? {} : { model: args.model }),
        ...(args.reasoningEffort === undefined ? {} : { reasoningEffort: args.reasoningEffort }),
        onCreated,
      })
    },
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
    answerApproval: ({ approvalId, answer }) => permissions.answer({ approvalId, answer }),
    answerQuestion: (answer) => questions.answer(answer),
    listPrompts: () => prompts.list(),
    answerPrompt: (answer) => prompts.answer(answer),
    listGrants: async () => grants.list(),
    async revokeGrant({ grantId }) {
      const code = await grants.revoke(grantId)
      return code === undefined ? Object.freeze({ ok: true }) : refused(code)
    },
  })

  const attachments = Object.freeze({
    put: (args) => port.attachment.put(args),
    read: (args) => port.attachment.read(args),
  })

  return Object.freeze({
    sessions,
    interactions,
    attachments,
    async close() {
      for (const dispose of disposers.splice(0)) dispose?.()
      for (const module of [tools, permissions, questions, wording]) module.close()
      grants.stop()
      await grantStore.close()
    },
  })
}

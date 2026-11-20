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
import { SESSIONS_SERVICE, createDelegates } from '../delegates/index.js'
import { createPromptGate } from '../domain/prompt-gate.js'
import { createPrompts } from '../domain/prompts.js'
import { createQuestions } from '../domain/questions.js'
import { placeOf } from '../domain/folder.js'
import { createSessionPort } from '../domain/session-port.js'
import { createSessionTools } from '../domain/session-tools.js'
import { createWording } from '../domain/wording.js'
import { rootSessionOf, storedRootOf, titleOf } from '../session-info.js'
import { DOMAIN } from './constants.js'
import { LOG } from '../domain/constants.js'
import { diagnosticOf } from '../errors.js'

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
 * @returns `{sessions, interactions, attachments, provide(ctx), close}`: `provide` serves `dshConnectorSessions`
 */
export async function createSessionDomain(ctx, { storageDomain, readLimits, routing, logger }) {
  const now = Date.now
  const warn = (error) => logger.warn(LOG.format, LOG.grantWriteFailed, diagnosticOf(error))
  const managerOf = (sessionId) => routing.managed.managerOf(sessionId)
  const titleOfSession = (sessionId) => titleOf(ctx, sessionId)
  const port = createSessionPort(ctx, { senderId: DOMAIN.senderId, readLimits, now })
  // Every part is closed in reverse as soon as it exists, so a step that throws leaves nothing
  // open: no storage domain, and no listener routing into closed modules (as openV3's closers).
  const closers = []
  const close = async () => {
    for (const closeOne of closers.splice(0).reverse()) {
      try { await closeOne() } catch (error) { logger.warn(LOG.format, LOG.closeFailed, diagnosticOf(error)) }
    }
  }
  try {
    return await assemble()
  } catch (error) {
    await close()
    throw error
  }

  async function assemble() {
    const grantStore = await openGrantStore(ctx, storageDomain)
    closers.push(() => grantStore.close())
    const grants = createGrants({ table: grantStore.table, managerOf, now, logger })
    closers.push(() => grants.stop())
    const wording = createWording(ctx)
    closers.push(() => wording.close())
    const gate = createPromptGate(ctx, now)
    const delegates = createDelegates({ logger })
    closers.push(() => delegates.close())
    const permissions = createPermissions(ctx, { routing, managerOf, grants, delegates, gate, wording, titleOf: titleOfSession, readLimits, now, logger })
    closers.push(() => permissions.close())
    const questions = createQuestions(ctx, { routing, managerOf, titleOf: titleOfSession, now, logger })
    closers.push(() => questions.close())
    const prompts = createPrompts({ gate, wording, titleOf: titleOfSession })
    const tools = createSessionTools(ctx, { routing, managed: routing.managed, readLimits, logger })
    closers.push(() => tools.close())

    let sweepQueued = false
    let closing = false
    closers.push(() => { closing = true })
    const disposers = [
      routing.onLeft((offers) => {
        for (const { offerId } of offers) {
          const requestId = parseOfferId(offerId)?.requestId
          if (!permissions.toUser(requestId)) questions.toUser(requestId)
        }
      }),
      // Every management change ends the grants their principal no longer covers (X-08). The sweep
      // runs on the managed chain after the change's own step (review F05): a succession, or its
      // undo, has then moved both the managers and the grant owners, so it never sees one half
      // moved and ends a grant the step is about to give back. Changes queued while a sweep waits
      // share it.
      routing.managed.onChange(() => {
        if (sweepQueued || closing) return
        sweepQueued = true
        // A sweep queued before close finds the grants table closed: skipped, not a logged failure.
        routing.afterChanges(() => { sweepQueued = false; return closing ? undefined : grants.endUnmanaged() }).catch(warn)
      }),
      // Awaited by the succession, which undoes it when a later step fails (R-HOST-09).
      routing.onSucceeded((from, to) => grants.moveOwner(from, to)),
    ]
    closers.push(() => { for (const dispose of disposers.splice(0)) dispose?.() })
    await grants.reconcile()

    const sessions = Object.freeze({
      rootOf: (sessionId) => rootSessionOf(ctx, sessionId),
      storedRootOf: (sessionId) => storedRootOf(ctx, sessionId),
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
      message: ({ sessionId, message, attachments, admit }) => port.message({ sessionId, message, attachments, admit }),
      redirect: ({ sessionId, message, attachments, admit }) => port.redirect({ sessionId, message, attachments, admit }),
      stop: (input) => port.stop(input),
      async read(input) {
        const read = await port.read(input)
        return { messages: read.messages.map(neutral), truncated: read.truncated }
      },
    })

    const interactions = Object.freeze({
      liveOffers: (sessionId) => routing.liveOffers(sessionId),
      answerApproval: ({ approvalId, answer, principalKey }) => permissions.answer({ approvalId, answer, principalKey }),
      answerQuestion: (answer) => questions.answer(answer),
      listPrompts: () => prompts.list(),
      answerPrompt: (answer) => prompts.answer(answer),
      listGrants: async () => grants.list(),
      // A failed durable delete rejects (dispatch answers `operation-failed`, review F01).
      async revokeGrant({ grantId, principalKey }) {
        const code = await grants.revoke(grantId, principalKey)
        return code === undefined ? Object.freeze({ ok: true }) : refused(code)
      },
    })

    const attachments = Object.freeze({
      put: (args) => port.attachment.put(args),
      read: (args) => port.attachment.read(args),
    })

    /**
     * `dshConnectorSessions` (host-services/sessions.d.ts): what a main-DSH plugin needs to act for a
     * session's manager. `stop` is the Stop button (the turn ends, messages still reach the session);
     * `read` is `session_read`'s bounded read, neutral roles included.
     */
    const service = Object.freeze({
      apiVersion: SESSIONS_SERVICE.apiVersion,
      delegates: Object.freeze({ register: (definition) => delegates.register(definition) }),
      rootOf: (sessionId) => rootSessionOf(ctx, sessionId),
      managerOf: (sessionId) => managerOf(rootSessionOf(ctx, sessionId)),
      read: ({ sessionId, maxMessages, maxBytes }) => sessions.read({ sessionId, maxMessages, maxBytes }),
      stop: async ({ sessionId }) => { await port.stop({ sessionId }) },
    })
    const provide = (target) => target.effect(() => target.provide(SESSIONS_SERVICE.name, service), SESSIONS_SERVICE.label)

    return Object.freeze({ sessions, interactions, attachments, provide, close })
  }
}

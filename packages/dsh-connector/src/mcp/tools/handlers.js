/**
 * The core tools' bodies (task C-TOOLS; design §3.2; K1 TOOLS). Each body gets arguments that
 * already passed K1's input schema and the payload rules (dispatch.js), and returns
 * `{ok: true, …fields}` or `{ok: false, code}`; dispatch.js builds the K1 envelope. A body never
 * builds prose: a refusal is a code. A domain port signals a refusal by returning `{ok: false,
 * code}` or throwing a `RefusalError`; anything else it throws is `operation-failed` (dispatch.js).
 *
 * The domain is reached only through the `domain` port (index.js documents its shape), which
 * C-WIRE binds. Who manages a session is K1c's `ManagedState` only.
 */
import { APPROVAL_DECISION, REFUSAL, TOOL } from '../../../mcp-schema/index.js'
import { inboxAckTool, inboxPollTool } from '../../mailbox/index.js'
import { AUTHORITY, SESSION_ACCESS } from './constants.js'
import { RefusalError } from '../../errors.js'
import { startManaged } from './start.js'

const refused = (code) => ({ ok: false, code })
/** `grant_revoke` of a held grant whose session is not the caller's (sessions.js table, rows 1 and 3). */
const GRANT_REFUSAL = Object.freeze({ [AUTHORITY.other]: REFUSAL.forbidden, [AUTHORITY.none]: REFUSAL.notManaged })
const ok = (fields) => ({ ok: true, ...fields })
/** `fields` with the optional keys whose value is undefined left out. */
const defined = (fields) => Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
/** A port answer `{ok, code?, …}` passed on: a refusal keeps its code only. */
const passed = (result, fields) => (result?.ok === true ? ok(fields(result)) : refused(result?.code ?? REFUSAL.operationFailed))
/** A K1 CallToolResult (C-MAILBOX's tools) back to `{ok, …}`, so every body has one shape. */
const unwrapped = (result) => result.structuredContent

/**
 * @param {object} ports see index.js
 * @param {ReturnType<import('./sessions.js').createSessionAccess>} access
 * @param {ReturnType<import('./offers.js').createOfferDesk>} offers
 * @returns {Readonly<Record<string, (args: object, call: {caller: object}) => Promise<object>>>}
 */
export function createHandlers({ pairs, mailbox, managed, manageWork, checkCurrentTurn, domain, now, logger }, access, offers) {
  const { sessions, interactions, attachments, models, workspaces } = domain

  /**
   * Runs `body(args, caller, root, admit)` once the session table (sessions.js) allows it. `admit()`
   * applies the table again against the current managed state and throws the refusal
   * (`RefusalError`, answered by dispatch.js) when the caller no longer manages the session: the
   * body and the session port call it after each await, right before each side effect and before
   * read data is returned (review F02).
   */
  const onSession = (accessRow, body) => async (args, { caller }) => {
    const checked = await access.check(args.sessionId, caller.principalKey, accessRow)
    if (checked.code !== undefined) return refused(checked.code)
    const admit = () => {
      const code = access.recheck(args.sessionId, caller.principalKey, accessRow, checked.root)
      if (code !== undefined) throw new RefusalError(code)
    }
    return body(args, caller, checked.root, admit)
  }
  const managing = (body) => onSession(SESSION_ACCESS.manage, body)
  const reading = (body) => onSession(SESSION_ACCESS.read, body)
  const delivery = (send) => managing(async (args, caller, root, admit) => {
    const sent = await send({ sessionId: args.sessionId, message: args.message, attachments: args.attachments, admit })
    return ok({ status: sent.status, running: sent.running === true })
  })


  /**
   * The answer tools (offers.js). Row 1 of the session table applies first: a session another
   * principal manages is `forbidden` before any offer or DSH read, since that principal holds
   * every offer of it (Fishball 2026-11-14). The offer, and the domain's commit, then use the
   * root the domain keys its requests by (a subagent asks for the session the user sees).
   */
  async function answered(args, caller, requestId, commit, settles = true) {
    const { relation, root } = access.relationOf(args.sessionId, caller.principalKey)
    if (relation === AUTHORITY.other) return refused(REFUSAL.forbidden)
    return offers.answer({ sessionId: root, requestId, offerId: args.offerId, principalKey: caller.principalKey, settles }, commit)
  }

  return Object.freeze({
    // Only managed sessions are related in V3 (Fishball's Q4): the caller's own, never another's.
    async [TOOL.sessionsList](args, { caller }) {
      const listed = []
      for (const { sessionId, principalKey } of managed.managed()) {
        if (listed.length >= args.limit) break
        if (principalKey !== caller.principalKey) continue
        const summary = await sessions.describe(sessionId)
        if (summary === undefined || (args.workspaceId !== undefined && summary.workspaceId !== args.workspaceId)) continue
        // Taken back or handed over while it was described: no longer the caller's (review F02).
        if (!access.isMine(sessionId, caller.principalKey)) continue
        listed.push(summary)
      }
      return ok({ sessions: listed })
    },
    // DISCOVERY-TOOLS: this DSH's choices for session_start, not a session's data, so no session table.
    [TOOL.workspacesList]: async () => ok({ workspaces: await workspaces.list() }),
    [TOOL.modelsList]: async () => ok(await models.list()),
    // The start and its manage are start.js's, shared with dshConnectorSessions.start.
    [TOOL.sessionStart]: (args, { caller }) => startManaged(
      { sessions, managed, logger, manage: manageWork === undefined ? undefined : (sessionId) => manageWork(sessionId, caller) },
      args, caller.principalKey,
    ),
    [TOOL.sessionMessage]: delivery((input) => sessions.message(input)),
    [TOOL.sessionRedirect]: delivery((input) => sessions.redirect(input)),
    [TOOL.sessionStop]: managing(async (args, caller, root, admit) => {
      await sessions.stop(defined({ sessionId: args.sessionId, reason: args.reason, admit }))
      return ok({ stopped: true })
    }),
    [TOOL.sessionRead]: reading(async (args, caller, root, admit) => {
      if (args.checkTurn !== undefined) {
        const current = args.sessionId === root && await checkCurrentTurn?.(root, caller, args.checkTurn) === true
        admit()
        return ok({ current })
      }
      const read = await sessions.read({ sessionId: args.sessionId, maxMessages: args.maxMessages, maxBytes: args.maxBytes })
      admit()
      return ok({ messages: read.messages, truncated: read.truncated })
    }),
    // The reason is checked (V2: required) but has no V3 consumer: K1c's `release` is the only
    // call, and it sends no release event (K1c-2).
    [TOOL.sessionRelease]: managing(async (args, caller, root) => {
      return passed(await managed.release(root, caller.principalKey), () => ({ sessionId: args.sessionId, managed: false }))
    }),
    [TOOL.approvalsList]: managing(async (args, caller, root) => ok({ approvals: await offers.heldBy(root, caller.principalKey) })),
    // `ask` never reaches the domain (X-SEC X-02; the user, 2026-11-17: refused). K1's schema already
    // refuses it; this guard keeps the rule should the schema ever widen.
    [TOOL.approvalAnswer]: (args, { caller }) => (args.answer.decision === APPROVAL_DECISION.ask ? refused(REFUSAL.invalidDecision) : answered(args, caller, args.approvalId, async (sessionId) => passed(
      await interactions.answerApproval({ sessionId, approvalId: args.approvalId, answer: args.answer, principalKey: caller.principalKey }),
      (result) => defined({ accepted: true, grantId: result.grantId, expiresAt: result.grantId === undefined ? undefined : result.expiresAt }),
    ), args.answer.decision !== APPROVAL_DECISION.escalate)),
    [TOOL.questionAnswer]: (args, { caller }) => {
      const { offerId, ...answer } = args
      return answered(args, caller, args.questionId, async (sessionId) => passed(
        await interactions.answerQuestion({ ...answer, sessionId, principalKey: caller.principalKey }), () => ({ accepted: true }),
      ), args.toUser !== true)
    },
    // Only sessions the caller manages (the user, 2026-11-17: "Prompts can be listed and answered
    // only on sessions the agent manages").
    async [TOOL.promptsList](args, { caller }) {
      const prompts = await interactions.listPrompts()
      return ok({ prompts: prompts.filter((prompt) => access.isMine(prompt.sessionId, caller.principalKey)) })
    },
    [TOOL.promptAnswer]: managing(async (args, caller, root, admit) => {
      // A closed prompt is expired; a prompt of another session than the one named is forbidden,
      // so a caller can never answer a session it does not manage through a session it does.
      const prompt = (await interactions.listPrompts()).find((entry) => entry.promptId === args.promptId)
      admit()
      if (prompt === undefined) return refused(REFUSAL.expired)
      if (prompt.sessionId !== root) return refused(REFUSAL.forbidden)
      // No await between `admit` and the answer: the prompts port answers synchronously.
      const result = await interactions.answerPrompt(defined({ promptId: args.promptId, decision: args.decision, risk: args.risk, reason: args.reason, principalKey: caller.principalKey }))
      return passed(result, (answer) => ({ promptId: answer.promptId, decision: answer.decision, managed: answer.managed === true }))
    }),
    async [TOOL.grantsList](args, { caller }) {
      const grants = await interactions.listGrants()
      return ok({ grants: grants.filter((grant) => access.isMine(grant.sessionId, caller.principalKey)) })
    },
    async [TOOL.grantRevoke](args, { caller }) {
      // A grant is its session's manager's (R-ROUTE-02); V2 refused a grant whose session is no
      // longer managed `not-managed`. An unlisted id is the domain's own answer (`unknown`, `ended`).
      const grant = (await interactions.listGrants()).find((entry) => entry.grantId === args.grantId)
      if (grant !== undefined) {
        const { relation } = access.relationOf(grant.sessionId, caller.principalKey)
        const code = GRANT_REFUSAL[relation]
        if (code !== undefined) return refused(code)
      }
      const revoked = await interactions.revokeGrant({ grantId: args.grantId, reason: args.reason, principalKey: caller.principalKey })
      return passed(revoked, () => ({ grantId: args.grantId, revoked: true }))
    },
    async [TOOL.attachmentPut](args) {
      const put = await attachments.put(args)
      return ok({ hostRef: put.hostRef, expiresAt: put.expiresAt })
    },
    [TOOL.attachmentRead]: reading(async (args, caller, root, admit) => {
      const read = await attachments.read({ sessionId: args.sessionId, attachmentId: args.attachmentId })
      admit()
      return ok({ attachmentId: read.attachmentId, mediaType: read.mediaType, total: read.total, sha256: read.sha256, chunks: read.chunks })
    }),
    [TOOL.inboxPoll]: async (args, { caller }) => unwrapped(await inboxPollTool(mailbox, caller.principalKey, args)),
    [TOOL.inboxAck]: async (args, { caller }) => unwrapped(await inboxAckTool(mailbox, caller.principalKey, args)),
    /**
     * `pair` (R-ID-03/04): the caller's entry binds to its own client id. `PairStore.pair` throws
     * `TypeError` for a client id that is not a fishball id (W3 brief F6); the token endpoint
     * never issues such a token, so it is a wiring fault, answered `operation-failed` by
     * dispatch.js's one catch, with no id echoed and nothing changed.
     */
    [TOOL.pair]: async (args, { caller }) => pairs.pair(caller.entryKey, caller.clientId, args.name, now()),
    [TOOL.setName]: async (args, { caller }) => pairs.setName(caller.principalKey, args.name),
  })
}

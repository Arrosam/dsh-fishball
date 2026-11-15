/**
 * The core tools (task K1; design §3.2; R-CON-02, R-ID-03/04, R-NAME-02/06, R-CON-03).
 *
 * Each tool's `outputSchema` is an exact-one `oneOf` of its success shape(s) (`ok: true`) and its
 * refusal envelope (`ok: false`), so every output schema admits the refusal (R-CON-02). The
 * branches are disjoint because `ok` is a different constant in each and every object is closed.
 * The root is that `oneOf`, not `type: "object"`: [spec] 2026-07-28 tools § Output Schema allows any
 * JSON Schema (the page's own example has an array root), DSH's subset forbids `type` beside
 * `oneOf`, and one loose object would no longer admit exactly a success or a refusal. Both hosts'
 * `assertSupportedJsonSchema` (the check `dsh-mcp-client` applies to output schemas) accept it.
 * It is deliberately not an `isObjectRootSchema` schema: that is K2's rule for contributed tools.
 * The order of TOOLS is the `tools/list` order of the core tools, ahead of every contributed
 * tool (R-EXT-12).
 */
import { REFUSAL, RESYNC_REASON, TOOL } from './constants.js'
import { RISK } from '../contract/contract.js'
import { array, boolean, constant, frozen, integer, nullable, object, oneOfStrings, string } from './schema.js'
import {
  approvalAnswer, delivery, descriptor, grantSummary, mailboxEvent, promptDecision, promptSummary, questionAnswerItem,
  questionItem, readMessage, sessionSummary, time,
} from './shapes.js'

const OK = Object.freeze({ success: true, refusal: false })

/** `{ok: true, …fields}` */
const success = (required, optional) => object({ ok: constant(OK.success), ...required }, optional)

/**
 * `{ok: false, code, message?}`, plus the extra fields one refusal of that tool carries.
 * `message` is optional human text (K2's ContributedResult has the same shape); the code is the
 * contract, never the text.
 */
export const refusalSchema = (extra = {}) => object({ ok: constant(OK.refusal), code: string() }, { message: string(), ...extra })

const output = (...branches) => ({ oneOf: branches })
const tool = (name, description, input, ...successes) => ({ name, description, inputSchema: input, outputSchema: output(...successes, refusalSchema()) })

const attachments = () => array(string(), 'hostRefs from attachment_put, each used once')

/** `pair`'s refusals carry `bound` and `advice` for `already-paired` (R-ID-04). */
const pairBound = () => object({ idMatches: boolean(), boundId: string(), name: nullable(string()), pairedAt: time(), lastSeenAt: nullable(time()) })

const DEFINITIONS = [
  tool(TOOL.sessionsList, 'List the main-DSH sessions related to you. Sessions another principal manages are omitted.',
    object({ limit: integer() }, { workspaceId: string() }),
    success({ sessions: array(sessionSummary()) })),
  tool(TOOL.sessionStart, 'Start a session in a workspace or an absolute folder and send its first message. You become its managing principal.',
    object({ folder: string(), title: string(), message: string(), attachments: attachments() }, { model: string(), reasoningEffort: string() }),
    success({ sessionId: string(), managed: boolean() }, { titleError: string(), workspaceError: string() })),
  tool(TOOL.sessionMessage, 'Send a message to a session you manage. An unconfirmed delivery is never retried.',
    object({ sessionId: string(), message: string(), attachments: attachments() }),
    success({ status: delivery() })),
  tool(TOOL.sessionRedirect, 'Cancel the running turn of a session you manage and send a new message.',
    object({ sessionId: string(), message: string(), attachments: attachments() }),
    success({ status: delivery() })),
  tool(TOOL.sessionStop, 'Stop the running turn of a session you manage.',
    object({ sessionId: string() }, { reason: string() }),
    success({ stopped: constant(true) })),
  tool(TOOL.sessionRead, 'Read the latest messages of a session related to you, within the given bounds.',
    object({ sessionId: string(), maxMessages: integer(), maxBytes: integer() }),
    success({ messages: array(readMessage()), truncated: boolean() })),
  tool(TOOL.sessionRelease, 'Give a session you manage back to the user, with a reason.',
    object({ sessionId: string(), reason: string() }),
    success({ sessionId: string(), managed: constant(false) })),
  tool(TOOL.approvalsList, 'List the live permission requests, questions and plan reviews of a session you manage.',
    object({ sessionId: string() }),
    success({ approvals: array(descriptor()) })),
  tool(TOOL.approvalAnswer, 'Answer a permission request (or an ask_agent request) by its current offer id.',
    object({ sessionId: string(), approvalId: string(), offerId: string(), answer: approvalAnswer() }),
    success({ accepted: constant(true) }, { grantId: string(), expiresAt: time() })),
  tool(TOOL.questionAnswer, 'Answer a question or plan review by its current offer id; questionId is its approvalId.',
    object({ sessionId: string(), questionId: string(), offerId: string() },
      { answers: array(questionAnswerItem()), approve: boolean(), feedback: string(), toUser: boolean(), note: string() }),
    success({ accepted: constant(true) })),
  // PROPOSED: V2's question.ask named the instance's own child session as the card's author; an
  // MCP principal has no session in the main DSH, so the argument is gone. Where the card is shown,
  // and its fields, are K3's (the user-card freeze).
  tool(TOOL.questionAsk, 'Ask the user your own questions as a card in the main DSH. The answer arrives as a settlement event.',
    object({ questions: array(questionItem()) }),
    success({ questionId: string() })),
  tool(TOOL.questionAnswerOwn, 'Answer your own question card for the user, with the words the user gave you.',
    object({ questionId: string(), answers: array(questionAnswerItem()) }),
    success({ accepted: constant(true) })),
  tool(TOOL.promptsList, 'List the permission prompts the user is being shown in sessions you manage.',
    object({}),
    success({ prompts: array(promptSummary()) })),
  tool(TOOL.promptAnswer, 'Allow or reject a permission prompt the user is being shown, with a reason.',
    object({ sessionId: string(), promptId: string(), decision: promptDecision(), reason: string() }, { risk: oneOfStrings(Object.values(RISK)) }),
    success({ promptId: string(), decision: promptDecision(), managed: boolean() })),
  tool(TOOL.grantsList, 'List your standing grants.',
    object({}),
    success({ grants: array(grantSummary()) })),
  tool(TOOL.grantRevoke, 'Revoke one of your standing grants, with a reason.',
    object({ grantId: string(), reason: string() }),
    success({ grantId: string(), revoked: constant(true) })),
  tool(TOOL.attachmentPut, 'Upload one image or file in base64 chunks; returns a single-use hostRef for a message.',
    object({ transferId: string(), total: integer(), sha256: string(), mediaType: string(), chunks: array(string()) }, { name: string() }),
    success({ hostRef: string(), expiresAt: time() })),
  tool(TOOL.attachmentRead, 'Read an image a session references, in base64 chunks.',
    object({ sessionId: string(), attachmentId: string() }),
    success({ attachmentId: string(), mediaType: string(), total: integer(), sha256: string(), chunks: array(string()) })),
  tool(TOOL.inboxPoll, 'Read the next page of your pending events. Reading does not acknowledge; use inbox_ack.',
    object({}, { cursor: string(), limit: integer() }),
    success({ events: array(mailboxEvent()), nextCursor: string(), hasMore: boolean() }),
    success({ resync: object({ reason: oneOfStrings(Object.values(RESYNC_REASON)), headSequence: integer() }) })),
  tool(TOOL.inboxAck, 'Acknowledge events you have durably taken, with their payloadDigest. All receipts or none.',
    object({ receipts: array(object({ eventId: string(), payloadDigest: string() })) }),
    success({ acked: integer() })),
  {
    name: TOOL.pair,
    description: 'Bind your client id to your token, once per token, optionally with a name. A second pair always fails with already-paired.',
    inputSchema: object({}, { name: string() }),
    outputSchema: output(
      success({ paired: constant(true), id: string(), name: nullable(string()) },
        { nameAssigned: boolean(), nameRefused: oneOfStrings([REFUSAL.nameTaken, REFUSAL.nameInvalid]) }),
      refusalSchema({ bound: pairBound(), advice: string() }),
    ),
  },
  tool(TOOL.setName, 'Set or clear (null) your display name. Names are unique per connector, compared without letter case.',
    object({ name: nullable(string()) }),
    success({ name: nullable(string()) })),
]

/** The core tools in `tools/list` order. Frozen schema data. */
export const TOOLS = frozen(DEFINITIONS)
export const TOOL_NAMES = Object.freeze(TOOLS.map((definition) => definition.name))
export const toolDefinition = (name) => TOOLS.find((definition) => definition.name === name)

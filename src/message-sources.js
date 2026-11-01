/**
 * Who wrote a message in a session's log, read from its source (DESIGN §5d, §7a).
 *
 * start_session's first message has a user source so DSH titles the new session from it, and
 * it names Fishball as its sender. So a user source alone does not mean the user typed it: one
 * that names a sender session was sent on that session's behalf.
 */
import { APPROVAL, SOURCE } from './constants.js'

/** Whether a message source is the user's own typing (sources user / user-rpc, no sender). */
export const typedByUser = (source) => APPROVAL.userSources.includes(source?.kind) && source.senderSessionId === undefined

/** Kinds a session-sent message can have: a relay, or start_session's first message. */
const SENT_KINDS = new Set([SOURCE.relay.kind, SOURCE.start.kind])

/**
 * Whether a message source was sent by the given session. An unknown session id matches
 * nothing, so a user's message (no sender) is never taken for one.
 */
export const sentBy = (source, sessionId) => sessionId !== undefined && SENT_KINDS.has(source?.kind) && source.senderSessionId === sessionId

/**
 * Facts about another session for Fishball's messages and notices: its title, folder, whether
 * it is archived, and a bounded excerpt of its last answer. Read from the live session when it
 * is attached, else without activating its agent (sessionController.inspect observes the log);
 * DSH's title is folded from that log.
 */
import { foldSessionTitle } from '@deepseek-ai/dsh-session-title'
import { APPROVAL, SESSION_INFO, SOURCE } from './constants.js'
import { byteLength, cutToBytes } from './text.js'

/** The seq a session with no events reports, so every later event counts as newer. */
export const NO_EVENTS_SEQ = -1

/** The text of the last assistant message among events, cut to excerptBytes (the forwardExcerptBytes limit). */
export function lastAnswerExcerpt(events, excerptBytes) {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type !== SESSION_INFO.assistantEvent) continue
    const text = (event.data?.message?.content ?? []).filter((block) => block.type === SESSION_INFO.textBlock).map((block) => block.text).join('\n').trim()
    if (text.length === 0) continue
    // Bounded in bytes, so the framing allowance holds whatever the script (review L).
    return cutToBytes(text, excerptBytes, SESSION_INFO.ellipsis)
  }
  return ''
}

/**
 * The session the user sees for a session id: a subagent's session belongs to its parent
 * (header origin 'subagent', parentSession), up to the root. Reads attached sessions only: a
 * subagent calling the tool is attached, and so are its running ancestors; if a middle
 * ancestor is cold (detached), the message is attributed to that ancestor (review L2).
 */
export function rootSessionOf(ctx, sessionId) {
  let id = sessionId
  for (let depth = 0; depth < SESSION_INFO.maxSubagentDepth; depth++) {
    const header = ctx.sessions.get(id)?.header
    if (header?.origin !== SESSION_INFO.subagentOrigin || header.parentSession === undefined) return id
    id = header.parentSession
  }
  return id
}

/**
 * DSH's "session not found": the controller throws an ApiSessionNotFound (class name; its
 * error.name stays 'Error'), the query engine a SESSION_QUERY_SESSION_NOT_FOUND code.
 */
const NOT_FOUND = Object.freeze({ errorName: 'ApiSessionNotFound', queryCode: 'SESSION_QUERY_SESSION_NOT_FOUND' })

/**
 * Whether a read failed because the session does not exist (DSH's not-found failures), as
 * opposed to a transient or migration failure.
 */
export const isNotFound = (error) => error?.constructor?.name === NOT_FOUND.errorName || error?.code === NOT_FOUND.queryCode

/**
 * Whether DSH reports a session as gone. Only a not-found failure counts: any other read
 * failure may be transient, so the session is treated as still there.
 */
export async function isSessionGone(ctx, sessionId) {
  try {
    await eventsOf(ctx, sessionId)
    return false
  } catch (error) {
    return isNotFound(error)
  }
}

/** A session's title among its events (DSH folds the latest title event), or '' when it has none. */
export const titleFrom = (events) => foldSessionTitle(events)?.title ?? ''

/** A session's current title, or '' when it has none or cannot be read. */
export async function titleOf(ctx, sessionId) {
  try {
    return titleFrom((await eventsOf(ctx, sessionId)).events)
  } catch {
    return ''
  }
}

/** Events and header of a session: the live one when attached, else the persisted log. */
async function eventsOf(ctx, sessionId) {
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) return { events: live.snapshotEvents(), header: live.header }
  const inspection = await ctx.sessionController.inspect(sessionId)
  return { events: inspection.events, header: inspection.meta }
}

/**
 * Describe one session, or undefined when no such session exists.
 * @param ctx - context with sessions, sessionController and workspaceRegistry.
 * @param excerptBytes - bound of the last answer's excerpt (the forwardExcerptBytes limit).
 * @returns { id, title, cwd, archived, excerpt, lastSeq }.
 */
export async function describeSession(ctx, sessionId, excerptBytes) {
  let read
  try {
    read = await eventsOf(ctx, sessionId)
  } catch {
    return undefined
  }
  return describeFrom(ctx, sessionId, read, excerptBytes)
}

/** A session's last event seq (a watermark), or undefined when no such session exists. */
export async function lastSeqOf(ctx, sessionId) {
  try {
    return (await eventsOf(ctx, sessionId)).events.at(-1)?.seq ?? NO_EVENTS_SEQ
  } catch {
    return undefined
  }
}

/** Describe a session from events and header already read. */
function describeFrom(ctx, sessionId, read, excerptBytes) {
  return {
    id: sessionId,
    title: titleFrom(read.events),
    cwd: read.header.cwd ?? null,
    archived: ctx.workspaceRegistry.archivedSessionIds.includes(sessionId),
    excerpt: lastAnswerExcerpt(read.events, excerptBytes),
    lastSeq: read.events.at(-1)?.seq ?? NO_EVENTS_SEQ,
  }
}

/** The text of one message event, or '' (tool calls and other blocks are not text). */
export const textOfEvent = (event) => {
  const content = event.type === SESSION_INFO.assistantEvent ? event.data?.message?.content : event.data?.content
  return (content ?? []).filter((block) => block.type === SESSION_INFO.textBlock).map((block) => block.text).join('\n').trim()
}

/**
 * Who wrote a user-role message, from the source DSH recorded with it (DESIGN §5c, §7a): the
 * user typing (DSH's user sources), Fishball (a relay carrying Fishball's session id), another
 * session (any other relay), or else context that DSH or a plugin added (notices, goal rounds,
 * schedules, file notes, instructions). A message without a source is context, never an
 * unproven 'user'. DSH's user/message carries all of these; only the source tells them apart.
 * @param fishballId - Fishball's session id (undefined matches no relay).
 * @returns a SESSION_INFO.roles value other than assistant.
 */
export function senderOf(source, fishballId) {
  if (APPROVAL.userSources.includes(source?.kind)) return SESSION_INFO.roles.user
  if (source?.kind !== SOURCE.relay.kind) return SESSION_INFO.roles.context
  return fishballId !== undefined && source.senderSessionId === fishballId ? SESSION_INFO.roles.fishball : SESSION_INFO.roles.agent
}

/**
 * One message as read_session shows it: its role, plus the sending session of another
 * session's relay (so Fishball can read that one too) or the source kind of added context.
 */
function messageOf(event, fishballId, text) {
  if (event.type === SESSION_INFO.assistantEvent) return { role: SESSION_INFO.roles.assistant, text }
  const source = event.data?.source
  const role = senderOf(source, fishballId)
  if (role === SESSION_INFO.roles.agent) return { role, from: source.senderSessionId, text }
  if (role === SESSION_INFO.roles.context && typeof source?.kind === 'string') return { role, source: source.kind, text }
  return { role, text }
}

/**
 * The last user-role and assistant messages of a session, newest last, within maxBytes of text
 * in total (older ones are dropped first; one longer message is cut). Each is labelled by who
 * wrote it (senderOf), so Fishball never reads its own or another agent's words as the user's.
 * @param fishballId - Fishball's session id, to tell its own messages apart.
 * @param excerptBytes - bound of info's last-answer excerpt (the forwardExcerptBytes limit).
 * @returns { info, messages: [{ role, from?, source?, text }] }, or undefined when the session does not exist.
 */
export async function readSessionMessages(ctx, sessionId, fishballId, count, maxBytes, excerptBytes) {
  let read
  try {
    read = await eventsOf(ctx, sessionId)
  } catch {
    return undefined
  }
  const info = describeFrom(ctx, sessionId, read, excerptBytes)
  const picked = []
  let used = 0
  for (let i = read.events.length - 1; i >= 0 && picked.length < count; i--) {
    const event = read.events[i]
    if (event.type !== SESSION_INFO.assistantEvent && event.type !== SESSION_INFO.userEvent) continue
    const text = textOfEvent(event)
    if (text.length === 0) continue
    const room = maxBytes - used
    // Too little room for even the ellipsis: stop rather than exceed the bound (P6 test A73).
    if (room <= byteLength(SESSION_INFO.ellipsis)) break
    const cut = cutToBytes(text, room, SESSION_INFO.ellipsis)
    picked.unshift(messageOf(event, fishballId, cut))
    used += byteLength(cut)
  }
  return { info, messages: picked }
}

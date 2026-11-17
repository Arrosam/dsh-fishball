/**
 * Facts about another session the V3 domain reads: its root, whether it is gone, its title, and who
 * wrote a message and its text. Read from the live session when it is attached, else without
 * activating its agent (dsh-base's sessionQuery); DSH's title is folded from that log. The session
 * tools' own reads and summaries are domain/session-port.js's (review F09 removed the unused V2
 * description and read chain that used to sit here).
 */
import { foldSessionTitle } from '@deepseek-ai/dsh-session-title'
import { SESSION_INFO, SOURCE, USER_SOURCES } from './constants.js'

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

const isSubagentHeader = (header) => header?.origin === SESSION_INFO.subagentOrigin && header.parentSession !== undefined

/**
 * A session's header, live or stored, or undefined when DSH reports it not found (any other failure
 * rejects). A live session's header is read directly, without copying its events.
 */
async function headerOf(ctx, sessionId) {
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) return live.header
  try {
    return (await persistedEventsOf(ctx, sessionId)).header
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

/**
 * The root of a session as `rootSessionOf` follows it, but read from the live session or else its
 * stored log, so a stopped subagent's session is followed to its root too. Hand over and Take back
 * act on this root (review UI-01): management is per root session (K1c), and a subagent's session
 * must never get a manager of its own beside its root's, or session access and permission routing
 * would name different managers for one session.
 * @returns the root id, or undefined when `sessionId` is not a session of this DSH. A parent that
 *   is gone ends the walk at the last session that exists.
 * @throws (rejects) any read failure other than DSH's not-found: the ancestry is then unknown, and
 *   taking the session for a root could split its ownership.
 */
export async function storedRootOf(ctx, sessionId) {
  let header = await headerOf(ctx, sessionId)
  if (header === undefined) return undefined
  let id = sessionId
  for (let depth = 0; depth < SESSION_INFO.maxSubagentDepth && isSubagentHeader(header); depth++) {
    const parent = await headerOf(ctx, header.parentSession)
    if (parent === undefined) break
    id = header.parentSession
    header = parent
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

/**
 * A persisted session's events and header, read without making it live. dsh-base's sessionQuery
 * is the one reader both 0.2.1 and 0.2.2 have: 0.2.2 removed sessionController.inspect(), which
 * made every lookup of a stopped session answer unknown-session there. A missing session rejects
 * with SESSION_QUERY_SESSION_NOT_FOUND (isNotFound).
 */
export async function persistedEventsOf(ctx, sessionId) {
  const read = await ctx.sessionQuery.readSession(sessionId)
  return { events: read.events, header: read.session }
}

/** Events and header of a session: the live one when attached, else the persisted log. */
async function eventsOf(ctx, sessionId) {
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) return { events: live.snapshotEvents(), header: live.header }
  return persistedEventsOf(ctx, sessionId)
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
 * @param fishballId - Fishball's session id (no id, such as null before Fishball has a session,
 *   matches no relay).
 * @returns a SESSION_INFO.roles value other than assistant.
 */
export function senderOf(source, fishballId) {
  if (USER_SOURCES.includes(source?.kind)) return SESSION_INFO.roles.user
  if (source?.kind !== SOURCE.relay.kind) return SESSION_INFO.roles.context
  return typeof fishballId === 'string' && source.senderSessionId === fishballId ? SESSION_INFO.roles.fishball : SESSION_INFO.roles.agent
}

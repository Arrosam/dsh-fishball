/**
 * Facts about another session for Fishball's messages and notices: its title, folder, whether
 * it is archived, and a bounded excerpt of its last answer. Read from the live session when it
 * is attached, else without activating its agent (sessionController.inspect observes the log);
 * DSH's title is folded from that log.
 */
import { foldSessionTitle } from '@deepseek-ai/dsh-session-title'
import { SESSION_INFO } from './constants.js'
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
    title: foldSessionTitle(read.events)?.title ?? '',
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
 * The last user and assistant messages of a session, newest last, within maxBytes in total
 * (older ones are dropped first; one longer message is cut).
 * @param excerptBytes - bound of info's last-answer excerpt (the forwardExcerptBytes limit).
 * @returns { info, messages: [{ role, text }] }, or undefined when the session does not exist.
 */
export async function readSessionMessages(ctx, sessionId, count, maxBytes, excerptBytes) {
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
    const role = event.type === SESSION_INFO.assistantEvent ? SESSION_INFO.roles.assistant : event.type === SESSION_INFO.userEvent ? SESSION_INFO.roles.user : undefined
    if (role === undefined) continue
    const text = textOfEvent(event)
    if (text.length === 0) continue
    const room = maxBytes - used
    // Too little room for even the ellipsis: stop rather than exceed the bound (P6 test A73).
    if (room <= byteLength(SESSION_INFO.ellipsis)) break
    const cut = cutToBytes(text, room, SESSION_INFO.ellipsis)
    picked.unshift({ role, text: cut })
    used += byteLength(cut)
  }
  return { info, messages: picked }
}

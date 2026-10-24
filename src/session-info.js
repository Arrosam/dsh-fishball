/**
 * Facts about another session for Fishball's messages and notices: its title, folder, whether
 * it is archived, and a bounded excerpt of its last answer. Read from the live session when it
 * is attached, else without activating its agent (sessionController.inspect observes the log);
 * DSH's title is folded from that log.
 */
import { foldSessionTitle } from '@deepseek-ai/dsh-session-title'
import { SESSION_INFO } from './constants.js'
import { cutToBytes } from './text.js'

/** The text of the last assistant message among events, cut to SESSION_INFO.excerptBytes. */
export function lastAnswerExcerpt(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type !== SESSION_INFO.assistantEvent) continue
    const text = (event.data?.message?.content ?? []).filter((block) => block.type === SESSION_INFO.textBlock).map((block) => block.text).join('\n').trim()
    if (text.length === 0) continue
    // Bounded in bytes, so the framing allowance holds whatever the script (review L).
    return cutToBytes(text, SESSION_INFO.excerptBytes, SESSION_INFO.ellipsis)
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
 * @returns { id, title, cwd, archived, excerpt }.
 */
export async function describeSession(ctx, sessionId) {
  let read
  try {
    read = await eventsOf(ctx, sessionId)
  } catch {
    return undefined
  }
  return {
    id: sessionId,
    title: foldSessionTitle(read.events)?.title ?? '',
    cwd: read.header.cwd ?? null,
    archived: ctx.workspaceRegistry.archivedSessionIds.includes(sessionId),
    excerpt: lastAnswerExcerpt(read.events),
  }
}

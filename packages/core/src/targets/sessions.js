/**
 * One target epoch's running managed sessions (the sidebar's nested list): the sessions this
 * Fishball manages on that DSH (connector `sessions_list`: exactly the caller's managed root
 * sessions, those it started and those the user handed over) that are running now.
 *
 * Refreshed, never polled (core has no timer by design): once each time the link becomes
 * `connected`, and after any polled mailbox page holding an event that can change the answer
 * (`TARGET_SESSIONS.refreshOn`: the connector pushes them for managed sessions only). One call in
 * flight; a trigger meanwhile asks for exactly one more after it, so the last answer read is never
 * older than the last trigger. The list is `null` (unknown) off a connection, cleared the moment
 * the link leaves `connected`; a result of an earlier connection, or one after `dispose`, is dropped.
 * A failed or refused call, or an answer of another shape, keeps the last list and logs a code only
 * (the error's, the refusal's, or `TARGET_SESSIONS.unexpected`), as the runtime's other warns.
 *
 * Each kept session is `{sessionId, title}`, both strings: `title` is untrusted remote text, kept
 * verbatim (plain text in the UI, D06), `''` when the connector sent none.
 */
import { LINK, MCP } from '../../contracts/constants.js'
import { codeOf } from '../events/diagnostics.js'
import { TARGET_LOG, TARGET_SESSIONS } from './constants.js'

const REFRESH_ON = new Set(TARGET_SESSIONS.refreshOn)
const ARGS = Object.freeze({ [TARGET_SESSIONS.limitArgument]: TARGET_SESSIONS.listLimit })
const LIST = MCP.tools.sessionsList

/** The running sessions of a `sessions_list` success, or `undefined` for any other answer. */
function runningOf(result) {
  if (result?.ok !== true || !Array.isArray(result.sessions)) return undefined
  return Object.freeze(result.sessions
    .filter((session) => session?.running === true && typeof session.sessionId === 'string')
    .map((session) => Object.freeze({ sessionId: session.sessionId, title: typeof session.title === 'string' ? session.title : '' })))
}

/**
 * @param {{status(): {state: string}, onStatus: Function, onPoll: Function, callTool: Function}} link this epoch's link
 * @param {{onChange: () => void, logger?: {warn: Function}}} options `onChange` after every change of `list()`
 * @returns {{list(): ReadonlyArray<{sessionId: string, title: string}> | null, dispose(): void}}
 */
export function createRunningSessions(link, { onChange, logger }) {
  let sessions = null
  let disposed = false
  // Bumped on every entry into and exit from `connected`: an answer is taken only on its own connection.
  let connection = 0
  // The refresh in flight, `{again}` (the link's own `#poll` / `#rediscover` coalescing).
  let running
  const connected = () => link.status().state === LINK.state.connected
  const warn = (code) => logger?.warn(TARGET_LOG.failed, TARGET_LOG.sessions, code)

  function adopt(next) {
    if (JSON.stringify(next) === JSON.stringify(sessions)) return
    sessions = next
    onChange()
  }

  function refresh() {
    if (disposed) return
    if (running !== undefined) { running.again = true; return }
    const run = { again: true }
    running = run
    void (async () => {
      while (run.again && !disposed && connected()) {
        run.again = false
        const at = connection
        const answer = await link.callTool(LIST, ARGS).then((result) => ({ result }), (error) => ({ code: codeOf(error) }))
        // Overtaken by a connection change or disposed: neither adopted nor logged.
        if (disposed || at !== connection) continue
        const next = runningOf(answer.result)
        if (next !== undefined) adopt(next)
        else warn(answer.code ?? (typeof answer.result?.code === 'string' ? answer.result.code : TARGET_SESSIONS.unexpected))
      }
      // In the same synchronous step as the last `again` check, so no trigger falls between them.
      if (running === run) running = undefined
    })()
  }

  const disposers = [
    link.onStatus(() => {
      if (disposed) return
      connection += 1
      if (connected()) refresh()
      else adopt(null)
    }),
    link.onPoll((page) => {
      if (page?.ok === true && Array.isArray(page.events) && page.events.some((event) => REFRESH_ON.has(event?.type))) refresh()
    }),
  ]

  return Object.freeze({
    list: () => sessions,
    dispose() {
      disposed = true
      for (const dispose of disposers.splice(0)) dispose()
    },
  })
}

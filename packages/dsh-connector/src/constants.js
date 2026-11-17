/**
 * Fixed values of the connector row that more than one of its modules reads. Runtime-tunable
 * limits are NOT here: they are the row's config (src/config.js), which the user edits on DSH's
 * Plugins page and the connector's own settings page. A feature's own values live beside it
 * (src/domain/constants.js, src/wire/constants.js, …). C-WIRE-2 removed the V2 broker's.
 */

/** Package identity and log channel. The row id is the plugin's name (design §0.2, D22). */
export const PLUGIN = Object.freeze({
  name: 'dsh-connector',
  logger: 'fishball',
})

/** A principal's explicit model choice on `session_start` (provider/model). */
export const MODEL_SELECTION = Object.freeze({ settingsKey: 'model', minIdLength: 1, routeSeparator: '/' })

/** DSH user sources: what the user typed (session_read's `user`). */
export const USER_SOURCES = Object.freeze(['user', 'user-rpc'])

/**
 * The source of a message the connector delivers (DSH's agent-message relay, spike S16). `via`
 * names the tool that sent it, kept in the log, so a redirect is told apart from a message.
 */
export const SOURCE = Object.freeze({
  relay: Object.freeze({ kind: 'agent-message', form: 'relay' }),
  via: Object.freeze({ message: 'message', redirect: 'redirect' }),
})

/**
 * Reading a session (src/session-info.js, src/domain/session-port.js): its events, who wrote a
 * message (`fishball` is the connector's own sender, which session_read names `principal`), the
 * ellipsis of a cut text and how far up a subagent's parents are followed.
 */
export const SESSION_INFO = Object.freeze({
  ellipsis: '…',
  assistantEvent: 'assistant/message',
  userEvent: 'user/message',
  roles: Object.freeze({ user: 'user', assistant: 'assistant', fishball: 'fishball', agent: 'agent', context: 'context' }),
  textBlock: 'text',
  /** Session header marking a subagent's session, and how far up its parents are followed. */
  subagentOrigin: 'subagent',
  maxSubagentDepth: 8,
})

/**
 * Why start_session could not name the session it started (the result's titleError; the
 * session still starts, like a refused watch).
 */
export const TITLE_ERROR = Object.freeze({
  /** No sessionTitle service (dsh-base's session-title row is off). */
  unavailable: 'title-unavailable',
  /** DSH found no visible characters in the title. */
  invalid: 'title-invalid',
  /** Anything else DSH refused (logged). */
  failed: 'title-failed',
})

/**
 * start_session's `workspaceError` (DESIGN §5d): DSH created the session but could not add it
 * to the workspace. The session still starts and shows under Ungrouped, like one started in a
 * folder that is not a workspace.
 */
export const WORKSPACE_ERROR = Object.freeze({
  attachFailed: 'workspace-attach-failed',
  /** DSH's RemoteError code for this case; its details carry the new session's id. */
  dshCode: 'session/workspace-attach-failed',
})

export const HTTP = Object.freeze({ ok: 200, badRequest: 400, notFound: 404, conflict: 409, serverError: 500 })
export const HTTP_METHOD = Object.freeze({ get: 'GET', post: 'POST' })
export const REQUEST_BODY_BUFFERED = 'buffered'
/** The owner-only routes' and the model choice's refusal words. */
export const API_CODE = Object.freeze({
  badBody: 'bad-body',
  /** The named model does not exist. */
  unknown: 'unknown',
  /** The choice was refused. */
  refused: 'refused',
})
export const RESPONSE_HEADERS = Object.freeze({
  json: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  eventStream: Object.freeze({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' }),
})

/**
 * Host services the row injects (index.js `inject`): the session domain's DSH services. The
 * web-app ones (`connection`, `sessionController`, `workspaceRegistry`) keep the row pending
 * without dsh-web-app, which the connector requires (the user, 2026-11-17).
 */
export const SERVICE = Object.freeze({
  agents: 'agents',
  workspaceRegistry: 'workspaceRegistry',
  storageDomain: 'storageDomain',
  /** A managed session's own tool (message_agent), registered in its agent's scope. */
  tools: 'tools',
  connection: 'connection',
  sessionProjections: 'sessionProjections',
  sessionController: 'sessionController',
  /** Permission prompts the domain routes (src/domain/permissions.js). */
  approval: 'approval',
  /** Durable session flush after a delivered message. */
  sessions: 'sessions',
  /** Reads a stopped session's log without making it live (src/session-info.js persistedEventsOf). */
  sessionQuery: 'sessionQuery',
  /** `session_start`'s model choice reads ctx.llm (src/model-catalog.js). */
  llm: 'llm',
})

/** Optional services read with ctx.get. */
export const OPTIONAL_SERVICE = Object.freeze({
  /** DSH's session titles (dsh-base's session-title row; absent only if a profile turns that row off): session_start names the new session. */
  sessionTitle: 'sessionTitle',
})

/**
 * DSH's web server: the V3 connector's MCP, token and metadata routes and its listener facts
 * (src/wire/). Like `connection`, `sessionController` and `workspaceRegistry` above, it is a row of
 * dsh-web-app, not of dsh-base, on both SDKs. The connector requires the web app (the user,
 * 2026-11-17, S1 = A): without it the row stays pending in DSH's own missing-dependency state
 * (checked on 0.2.1-rc.5 and 0.2.2-rc.1). It is read with `ctx.get` all the same, so the V3 open
 * logs one clear line and stays off should a profile ever provide the other rows without it.
 */
export const WEB_SERVICE = Object.freeze({ webServer: 'webServer' })

/** Host events this row listens to. */
export const EVENT = Object.freeze({
  /** DSH's loader event after a volatile-only settings change (spike S21). */
  volatileUpdate: 'loader/volatile-update',
})

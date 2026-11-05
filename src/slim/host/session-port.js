/**
 * The main-host SessionService port for the slim session bridge (§5.2, §15 T05 merge).
 *
 * bridge.js owns framing, authorization and the §5.2 operation shapes; this module answers the
 * session methods in that file's header — plus the attachment port it registers — with the same
 * main-DSH services today's Fishball tools use, so the bridge gets today's powers without a
 * second implementation of them:
 * - create/message/redirect/stop/read/describe use sessionController.create, resolveAgent,
 *   cancel, state, projections and the history page, sessions.flush, agents.get,
 *   workspaceRegistry and the optional sessionTitle service, exactly as src/messaging.js and
 *   src/session-info.js do. The cold reads use the remote APIs present in 0.2.2-rc.1 (the
 *   legacy inspect entry does not exist there), so the bridge works on both the 0.2.1 and the
 *   0.2.2 main host;
 * - the managed registry, the watch registry and the assistant session id come from the
 *   `fishballSessionState` service the main Fishball row provides (index.js). Those registries
 *   stay owned by that row: this port never writes Fishball's store and never keeps a second
 *   managed or watch list. A missing service is refused with feature-off, so the native host can
 *   still boot without the legacy row and the session operations simply do nothing.
 *
 * start runs create -> title -> model (when the caller named one) -> manage -> first delivery.
 * It never creates a folder: bridge.js resolves the folder to an existing workspace or an
 * existing absolute directory before this port is called (§5.2).
 *
 * Read messages carry the bridge's own projection (seq, role, author and image metadata) instead
 * of read_session's untrusted-block shape; the role vocabulary and the per-event text helper are
 * shared with src/session-info.js.
 *
 * Attachments (§6.4) are the image port from src/slim/host/images.js: attachment.read/put serve the
 * bridge's two transfer operations, and start/message/redirect consume the hostRefs a child just
 * put into the one user message they build. A file becomes DSH's own file block, which request
 * assembly projects to handle text; nothing here inlines file bytes into a provider request.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionTitleInvalidError } from '@deepseek-ai/dsh-session-title'
import { ContractError, DELIVERY, ERROR, ROLE, WATCH_ERROR } from '../contract.js'
import { MANAGED_BY, OPTIONAL_SERVICE, SESSION_INFO, SOURCE, TITLE_ERROR, WORKSPACE_ERROR } from '../../constants.js'
import { senderOf, textOfEvent } from '../../session-info.js'
import { prepareSessionModel, applySessionModel } from '../../session-model.js'
import { createImagePort } from './images.js'
import { byteLength, cutToBytes } from '../../text.js'

/**
 * The service the main Fishball row provides for the registries the bridge cannot own. One
 * constant, shared with index.js, so the provider and the port cannot drift apart.
 */
export const SESSION_STATE = Object.freeze({ service: 'fishballSessionState' })

/** The service's own shape; index.js builds it from the row's live objects. */
const STATE_METHODS = Object.freeze([
  'assistantId', 'managedIds', 'isManaged', 'isFishball', 'manage', 'release', 'watch', 'watches', 'unwatch',
])

/** The main-DSH services every operation needs; a missing one is a wiring error, not a refusal. */
const DSH_SERVICES = Object.freeze(['sessions', 'sessionController', 'agents', 'workspaceRegistry'])

/** A passive state read takes a cancellation signal; the bridge's own request timeout is the bound. */
const NEVER_ABORTED = new AbortController().signal

/** The title projection (dsh-session-title) folded into every Session summary; absent is no title. */
const TITLE_PROJECTION = 'title'
/** DSH's history page needs a message budget of at least one (its request validator refuses 0). */
const MIN_PAGE_MESSAGES = 1
/** The session address kind every ordinary managed/watchable Session uses. */
const SESSION_ADDRESS = 'session'
/** dsh-agent's status for a Session with a turn in progress; 0.2.1 exposes it on the live agent. */
const RUNNING_AGENT = 'running'

const LOG = 'fishball-session-port'
const IMAGE_BLOCK = 'image'
/** Watch refusals the contract's watchError vocabulary can carry (§5.2). */
const WATCH_REFUSALS = new Set(Object.values(WATCH_ERROR))

const stateOf = (ctx) => {
  const found = ctx.get(SESSION_STATE.service)
  if (found === undefined) throw new ContractError(ERROR.featureOff)
  return found
}

/** One user message with Fishball as the sender, as src/messaging.js builds it. */
function userMessageOf(text, assistantId, attachments = []) {
  return createUserMessage({
    content: [{ type: 'text', text }, ...attachments],
    source: { ...SOURCE.relay, senderSessionId: assistantId },
  })
}

/** The content blocks of a user or assistant message event. */
const contentOf = (event) => (event.type === SESSION_INFO.assistantEvent ? event.data?.message?.content : event.data?.content)

/** Image metadata the bridge may show; bytes are T06's, never this read's (§6.1). */
function imagesOf(event) {
  const content = contentOf(event)
  if (!Array.isArray(content)) return []
  const images = []
  for (const block of content) {
    if (block?.type !== IMAGE_BLOCK || block.attachment === undefined) continue
    const { attachmentId, mediaType, width, height, bytes } = block.attachment
    images.push({ attachmentId, mediaType, width, height, bytes })
  }
  return images
}

/**
 * Who wrote one read message: the role vocabulary is session-info's, and the author names the
 * concrete writer (the other session's id, the source kind) where the role alone cannot.
 */
function messageOf(event, text, assistantId) {
  const role = event.type === SESSION_INFO.assistantEvent ? ROLE.assistant : senderOf(event.data?.source, assistantId)
  const source = event.data?.source
  const author = role === ROLE.agent && typeof source?.senderSessionId === 'string' && source.senderSessionId.length > 0
    ? source.senderSessionId
    : role === ROLE.context && typeof source?.kind === 'string' && source.kind.length > 0 ? source.kind : role
  return { seq: event.seq, role, author, text, images: imagesOf(event) }
}

/**
 * Create the port over a main-host Cordis context.
 *
 * @param {object} ctx - native-host row context (sessions, sessionController, agents, workspaceRegistry,
 *   attachments, sessionQuery, get, logger).
 * @param {object} [options]
 * @param {() => boolean} [options.enabled] - the native host's own switch; the port also requires
 *   the Fishball row's state service, so a bridge without the legacy row answers feature-off.
 * @returns {SessionService} the object bridge.js validates and calls.
 */
export function createSessionPort(ctx, options = {}) {
  const { enabled = () => true, now = Date.now } = options ?? {}
  if (!ctx || typeof ctx.get !== 'function') throw new TypeError('fishball-native-host: a Cordis context is required')
  if (typeof enabled !== 'function') throw new TypeError('fishball-native-host: enabled must be a function')
  if (typeof now !== 'function') throw new TypeError('fishball-native-host: now must be a function')
  for (const service of DSH_SERVICES) {
    if (ctx[service] === undefined) throw new TypeError('fishball-native-host: missing service ' + service)
  }
  const logger = typeof ctx.logger === 'function' ? ctx.logger(LOG) : undefined
  const state = () => {
    const found = stateOf(ctx)
    for (const method of STATE_METHODS) {
      if (typeof found[method] !== 'function') throw new TypeError('fishball-native-host: the session state service must implement ' + method)
    }
    return found
  }
  const workspaces = () => ctx.workspaceRegistry.list()

  /**
   * The image port needs the full log (sessionQuery.readSession) and the attachment store. Both
   * are in dsh-base, but a minimal composition may omit them. Resolution is lazy so a profile
   * that mounts those services after this row still gets the attachment operations; until then
   * an attachment call is a typed feature-off, never a silently dropped image.
   */
  let imagePort
  function imagePortOf() {
    if (imagePort !== undefined) return imagePort
    const attachmentStore = ctx.get('attachments')
    const sessionQuery = ctx.get('sessionQuery')
    if (typeof attachmentStore?.readImage !== 'function' || typeof sessionQuery?.readSession !== 'function') {
      throw new ContractError(ERROR.featureOff)
    }
    imagePort = createImagePort({ attachments: attachmentStore, sessionQuery, now })
    return imagePort
  }

  /** The bridge's §6.2/§6.4 surface; methods resolve the port on first use. */
  const attachment = Object.freeze({
    read: ({ sessionId, attachmentId }) => imagePortOf().read({ sessionId, attachmentId }),
    put: (payload) => imagePortOf().put(payload),
    resolve: (hostRefs) => hostRefs.length === 0 ? [] : imagePortOf().resolve(hostRefs),
  })

  /** The workspace a session belongs to, or null for an ungrouped session. */
  const workspaceOf = (sessionId) => workspaces().find((workspace) => workspace.sessionIds.includes(sessionId))?.id ?? null

  /**
   * One passive history page ending at the session's current cursor. This is 0.2.2's events
   * read (0.2.1 has no events entry, so readEventsOf uses its inspection there); records are
   * shaped {type:'event', event}.
   */
  async function pageOf(sessionId, cursor, maxMessages) {
    const request = { address: { kind: SESSION_ADDRESS, sessionId }, throughSeq: cursor, maxMessages }
    return ctx.sessionController.events(request, NEVER_ABORTED)
  }

  /**
   * Running and pending-input for one Session. 0.2.2 owns a passive state read; 0.2.1 has none,
   * so its live agent's status is the running flag and its waiting requests are not exposed on
   * this API (pendingInteraction stays false there).
   */
  async function activityOf(sessionId) {
    if (typeof ctx.sessionController.state === 'function') {
      const passive = await ctx.sessionController.state({ sessionId }, NEVER_ABORTED)
      return {
        running: passive.running === true,
        pendingInteraction: Array.isArray(passive.pendingInput) && passive.pendingInput.length > 0,
      }
    }
    return { running: ctx.agents.get(sessionId)?.status === RUNNING_AGENT, pendingInteraction: false }
  }

  /**
   * The events a bounded read scans. 0.2.2 reads a page up to the passive cursor; 0.2.1 has no
   * passive state read but its inspection returns the whole log, and the caller's bounds still
   * cut it below.
   */
  async function readEventsOf(sessionId, maxMessages) {
    if (typeof ctx.sessionController.state === 'function') {
      const { cursor } = await ctx.sessionController.state({ sessionId }, NEVER_ABORTED)
      const page = await pageOf(sessionId, cursor, maxMessages)
      return { events: (page.records ?? []).map((record) => record.event ?? record), hasMore: page.hasMore === true }
    }
    const inspection = await ctx.sessionController.inspect(sessionId, NEVER_ABORTED)
    return { events: inspection.events, hasMore: false }
  }

  /** Hand a message to a session's agent and flush it; false on the flush is unconfirmed, never failed. */
  async function handOver(agent, text, assistantId, send, attachments) {
    await send(agent, userMessageOf(text, assistantId, attachments))
    let flushed = false
    try { flushed = await ctx.sessions.flush(agent.session) === true } catch { /* Unconfirmed, not undelivered. */ }
    return { status: flushed ? DELIVERY.delivered : DELIVERY.unconfirmed }
  }

  /**
   * Consume the hostRefs a child put just before this message. An empty list needs no port; a
   * non-empty one without the port is refused feature-off, never silently delivered as text.
   */
  async function attachmentsOf(hostRefs) {
    if (hostRefs === undefined || hostRefs.length === 0) return []
    return attachment.resolve(hostRefs)
  }

  /** Resolve and deliver one message with already-consumed attachment blocks. */
  async function deliverWith(sessionId, text, send, attachments) {
    const { assistantId } = state()
    const resolved = await ctx.sessionController.resolveAgent(sessionId)
    if (resolved.agent === undefined) throw new ContractError(ERROR.unknownSession)
    return handOver(resolved.agent, text, assistantId(), send, attachments)
  }

  /**
   * Consume hostRefs and deliver. A refused hostRef fails before resolveAgent, so an invalid
   * or expired ref cannot activate a session or leave a half-built message behind.
   */
  async function deliver(sessionId, text, send, hostRefs = []) {
    const attachments = await attachmentsOf(hostRefs)
    return deliverWith(sessionId, text, send, attachments)
  }

  /**
   * Create the session through DSH. DSH creates it first and adds it to the workspace second;
   * when only that step fails the session exists (under Ungrouped), so it still starts with DSH's
   * own code for the partial failure (src/messaging.js's rule).
   */
  async function createSession(target) {
    try {
      return { sessionId: (await ctx.sessionController.create(target)).sessionId }
    } catch (error) {
      const sessionId = error?.code === WORKSPACE_ERROR.dshCode ? error.details?.sessionId : undefined
      if (typeof sessionId !== 'string' || sessionId.length === 0) throw new ContractError(ERROR.failed)
      return { sessionId, workspaceError: WORKSPACE_ERROR.attachFailed }
    }
  }

  /** Name the session; a title DSH refuses is reported, and the session still starts (§5.2). */
  function nameSession(sessionId, title) {
    const titles = ctx.get(OPTIONAL_SERVICE.sessionTitle)
    if (titles === undefined) return { titleError: TITLE_ERROR.unavailable }
    try {
      return { title: titles.rename(ctx.sessions.get(sessionId), title).title }
    } catch (error) {
      if (error instanceof SessionTitleInvalidError) return { titleError: TITLE_ERROR.invalid }
      logger?.warn('naming session %s failed (%s)', sessionId, error?.code ?? ERROR.failed)
      return { titleError: TITLE_ERROR.failed }
    }
  }

  /** Create -> title -> model -> manage -> first delivery; the contract has no field for a failed start delivery. */
  async function start({ target, title, model, reasoningEffort, message, attachments: hostRefs = [] }) {
    const registry = state()
    // Validate the model before anything is created, so a refused choice leaves no session behind.
    const selection = await prepareSessionModel(ctx, model, reasoningEffort)
    // Consume hostRefs only after the model check: a refused model keeps the refs usable.
    const attachments = await attachmentsOf(hostRefs)
    const created = await createSession(target)
    const named = nameSession(created.sessionId, title)
    if (selection !== undefined) await applySessionModel(ctx, created.sessionId, selection)
    try {
      await registry.manage(created.sessionId, MANAGED_BY.start)
    } catch (error) {
      logger?.warn('making session %s managed failed (%s)', created.sessionId, error?.code ?? ERROR.failed)
    }
    // manage() writes the store first; a throw after that write leaves the session managed, so
    // the answer reports the registry's state rather than the call's outcome.
    const managed = registry.isManaged(created.sessionId)
    try {
      await deliverWith(created.sessionId, message, (agent, input) => agent.steer(input), attachments)
    } catch (error) {
      logger?.warn('first delivery to %s failed (%s)', created.sessionId, error?.code ?? ERROR.failed)
    }
    return {
      sessionId: created.sessionId,
      managed,
      ...(named.titleError === undefined ? {} : { titleError: named.titleError }),
      ...(created.workspaceError === undefined ? {} : { workspaceError: created.workspaceError }),
    }
  }

  /** One bounded read page, newest messages kept; reports whether the caller's bounds cut it. */
  async function read({ sessionId, maxMessages, maxBytes }) {
    const { assistantId } = state()
    // The history request refuses a zero message budget; a caller asking for none gets none.
    if (maxMessages < MIN_PAGE_MESSAGES) return { messages: [], truncated: false }
    const { events, hasMore } = await readEventsOf(sessionId, maxMessages)
    const messages = []
    let used = 0
    let truncated = false
    for (let index = events.length - 1; index >= 0; index--) {
      if (messages.length >= maxMessages) { truncated = true; break }
      const event = events[index]
      if (event.type !== SESSION_INFO.assistantEvent && event.type !== SESSION_INFO.userEvent) continue
      const text = textOfEvent(event)
      if (text.length === 0) continue
      const room = maxBytes - used
      // Too little room for even the ellipsis: stop rather than exceed the caller's bound.
      if (room <= byteLength(SESSION_INFO.ellipsis)) { truncated = true; break }
      const cut = cutToBytes(text, room, SESSION_INFO.ellipsis)
      messages.unshift(messageOf(event, cut, assistantId()))
      used += byteLength(cut)
    }
    // A page that cut older messages reports it; the bridge's own frame bound may cut further.
    return { messages, truncated: truncated || hasMore }
  }

  const port = {
    enabled: () => enabled() === true && ctx.get(SESSION_STATE.service) !== undefined,
    managedIds: () => [...state().managedIds()],
    isManaged: (sessionId) => state().isManaged(sessionId) === true,
    isFishball: (sessionId) => state().isFishball(sessionId) === true,
    async describe(sessionId) {
      // The title projection is cold-safe and exists on both host versions; null means no such
      // session (DSH's own not-found answer), not a read failure.
      const projection = await ctx.sessionController.projections({ sessionId }, NEVER_ABORTED)
      if (projection === null || projection === undefined) return undefined
      // An archived session is unknown to the bridge: its rows disappear with the archive (§5.2).
      if (ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) return undefined
      let running = false
      let pendingInteraction = false
      try { ({ running, pendingInteraction } = await activityOf(sessionId)) } catch { /* state read failure */ }
      const title = typeof projection.values?.[TITLE_PROJECTION] === 'string' ? projection.values[TITLE_PROJECTION] : ''
      return { sessionId, title, workspaceId: workspaceOf(sessionId), running, pendingInteraction }
    },
    workspaces: () => workspaces().map((workspace) => ({ id: workspace.id, path: workspace.path })),
    async resolveWorkspacePath(path) {
      const found = await ctx.workspaceRegistry.resolveByPath(path)
      return found === undefined ? undefined : { id: found.id }
    },
    start,
    message: ({ sessionId, message, attachments }) => deliver(sessionId, message, (agent, input) => agent.steer(input), attachments),
    redirect: ({ sessionId, message, attachments }) => deliver(sessionId, message, async (agent, input) => {
      // The Stop button's path, then the instruction as the next turn (src/messaging.js).
      await ctx.sessionController.cancel({ sessionId })
      agent.followup(input)
    }, attachments),
    async stop({ sessionId }) {
      // An idle session has no live agent and nothing to stop; DSH's cancel is the Stop button.
      if (ctx.agents.get(sessionId) !== undefined) await ctx.sessionController.cancel({ sessionId })
    },
    read,
    // T06's two bridge operations. attachment.read answers metadata plus chunks; the image port
    // has already checked that this Session's log references the id.
    attachment,
    async watch({ sessionId, mode }) {
      try {
        return { watchId: (await state().watch({ sessionId, mode })).id }
      } catch (error) {
        // A watch refusal is typed data in the §5.2 response, not an error frame.
        if (typeof error?.code === 'string' && WATCH_REFUSALS.has(error.code)) return { watchError: error.code }
        throw error
      }
    },
    async watches() {
      return state().watches().map((watch) => ({ watchId: watch.id, sessionId: watch.targetSessionId, mode: watch.mode, status: watch.status }))
    },
    async unwatch({ watchId }) {
      try { await state().unwatch(watchId) } catch (error) {
        // Closing is idempotent (§5.2): an unknown id closes nothing.
        if (error?.code !== WATCH_ERROR.unknownWatch) throw error
      }
    },
    release: ({ sessionId, reason }) => state().release(sessionId, reason),
  }
  return Object.freeze(port)
}

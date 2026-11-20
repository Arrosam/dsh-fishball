/**
 * The session port of the V3 domain (C-WIRE; C-WIRE-2 moved it out of the V2 `slim/host/` path):
 * the DSH work behind the core session tools, with the main-DSH services the tools need and no
 * second implementation of them:
 * - create/message/redirect/stop/read/describe use sessionController.create, resolveAgent,
 *   cancel, state, projections and the history page, sessions.flush, agents.get,
 *   workspaceRegistry and the optional sessionTitle service. The cold reads use the remote APIs
 *   present in 0.2.2-rc.1 (the legacy inspect entry does not exist there), so the port works on
 *   both the 0.2.1 and the 0.2.2 main host;
 * - who manages a session is K1c `ManagedState`'s alone (the caller's `onCreated`); this port keeps
 *   no managed, watch or audit state.
 *
 * start runs create -> title -> model (when the caller named one) -> onCreated -> first delivery.
 * It never creates a folder: `placeOf` (folder.js) resolves the folder to an existing workspace or
 * an existing absolute directory before this port is called.
 *
 * Read messages carry the port's own projection (seq, role, author and image metadata); the role
 * vocabulary and the per-event text helper are shared with src/session-info.js.
 *
 * Authority (review F02): message, redirect and stop take an optional `admit()` from the core tools,
 * which throws when the caller no longer manages the session. It runs after each DSH await and
 * immediately before the side effect (the steer, the cancel, the follow-up), so a Take back or Hand
 * over during a lookup stops the call before it acts for a former manager. Start needs none: its
 * session is new, and becomes the caller's in `onCreated`.
 *
 * Attachments (§6.4) are the image port from images.js: attachment.read/put serve the two
 * transfer tools, and start/message/redirect consume the hostRefs a principal just put into the
 * one user message they build. A file becomes DSH's own file block, which request assembly
 * projects to handle text; nothing here inlines file bytes into a provider request.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionTitleInvalidError } from '@deepseek-ai/dsh-session-title'
import { DELIVERY, REFUSAL } from '../../mcp-schema/index.js'
import { OPTIONAL_SERVICE, SESSION_INFO, SOURCE, TITLE_ERROR, WORKSPACE_ERROR } from '../constants.js'
import { RefusalError } from '../errors.js'
import { MODEL_ERROR, ModelChoiceError } from '../model-catalog.js'
import { headerOf, isSessionGone, isSubagentHeader, senderOf, textOfEvent } from '../session-info.js'
import { prepareSessionModel, applySessionModel } from '../session-model.js'
import { byteLength, cutToBytes } from '../text.js'
import { createImagePort } from './images.js'

/** The main-DSH services every operation needs; a missing one is a wiring error, not a refusal. */
const DSH_SERVICES = Object.freeze(['sessions', 'sessionController', 'agents', 'workspaceRegistry'])

/** A passive state read takes a cancellation signal; the bridge's own request timeout is the bound. */
const NEVER_ABORTED = new AbortController().signal

/** The title projection (dsh-session-title) folded into every Session summary; absent is no title. */
const TITLE_PROJECTION = 'title'
/** DSH's history page needs a message budget of at least one (its request validator refuses 0, and a new session's cursor is -1). */
const MIN_PAGE_MESSAGES = 1
/** `admit` when the caller passes none (start's own first delivery): nothing to recheck. */
const ADMITTED = () => {}
/**
 * DSH 0.2.2's history addresses (dsh-api-session-controller `SessionAddress`): an ordinary Session
 * by its id; a subagent's Session only through its direct parent, which DSH checks against the
 * child's header (an ordinary address for it is refused `session/agent-busy`). `mode: unknown`
 * reads either kind of child without asserting which one it is.
 */
const SESSION_ADDRESS = Object.freeze({ session: 'session', subagent: 'subagent', anyMode: 'unknown' })
/** dsh-agent's status for a Session with a turn in progress; 0.2.1 exposes it on the live agent. */
export const RUNNING_AGENT = 'running'

const LIST_ACTIVITY = Object.freeze({
  event: 'api-session/activity',
  stepMs: 1,
  failed: 'delivery activity for %s failed (%s)',
})
// Live activity watermarks only, never DSH's projection/cache: kept per connector context, so a
// reload of the row starts again from DSH's own list rows.
const deliveryActivityByContext = new WeakMap()

const LOG = 'dsh-connector-session-port'
/** Log lines (`logger.warn(line, sessionId, code)`): a session id and a code, never text. */
const LOG_LINE = Object.freeze({
  nameFailed: 'naming session %s failed (%s)',
  firstDeliveryFailed: 'first delivery to %s failed (%s)',
})
/** Programming errors (thrown, never shown to a client). */
const MISUSE = Object.freeze({
  context: 'dsh-connector session port: a Cordis context is required',
  options: 'dsh-connector session port: senderId (a string), readLimits and now (functions) are required',
  service: 'dsh-connector session port: missing service ',
})
const IMAGE_BLOCK = 'image'
/** A message's role as K1 READ_ROLE names it, from the session-info vocabulary (SESSION_INFO.roles). */
const ROLE = SESSION_INFO.roles

/**
 * One user message with the connector as the sender (`senderId`, the read's `principal`). `via`
 * names the tool that sent it (SOURCE.via), so a redirect is told apart from a message in the log.
 */
function userMessageOf(text, senderId, attachments = [], via = SOURCE.via.message) {
  return createUserMessage({
    content: [{ type: SESSION_INFO.textBlock, text }, ...attachments],
    source: { ...SOURCE.relay, senderSessionId: senderId, via },
  })
}

/**
 * The message-size cap (the user's decision, 2026-11-08): a message or start body over
 * maxMessageBytes (64 KiB by default, the connector's own setting) is refused before anything is
 * delivered or created, `limit-exceeded`.
 */
function boundMessage(text, limits) {
  if (byteLength(text) > limits.maxMessageBytes) throw new RefusalError(REFUSAL.limitExceeded)
}

/**
 * Why a start failed, as a K1 code (the user's decision, 2026-11-08: no new codes,
 * operation-failed only for what is truly unexpected). A refused model or effort is an invalid
 * choice the caller can correct (invalid-decision); a catalog that cannot be read is
 * feature-off; a refusal keeps its own code.
 */
const MODEL_REFUSAL = Object.freeze({
  [MODEL_ERROR.invalid]: REFUSAL.invalidDecision, [MODEL_ERROR.effort]: REFUSAL.invalidDecision,
  [MODEL_ERROR.required]: REFUSAL.invalidDecision, [MODEL_ERROR.unavailable]: REFUSAL.featureOff,
})
function startRefusal(error) {
  if (error instanceof RefusalError) return error
  if (error instanceof ModelChoiceError && MODEL_REFUSAL[error.code] !== undefined) return new RefusalError(MODEL_REFUSAL[error.code])
  return new RefusalError(REFUSAL.operationFailed)
}

/** The content blocks of a user or assistant message event. */
const contentOf = (event) => (event.type === SESSION_INFO.assistantEvent ? event.data?.message?.content : event.data?.content)

/** Image metadata a read shows; bytes are attachment_read's, never this read's (§6.1). */
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
function messageOf(event, text, senderId) {
  const role = event.type === SESSION_INFO.assistantEvent ? ROLE.assistant : senderOf(event.data?.source, senderId)
  const source = event.data?.source
  const author = role === ROLE.agent && typeof source?.senderSessionId === 'string' && source.senderSessionId.length > 0
    ? source.senderSessionId
    : role === ROLE.context && typeof source?.kind === 'string' && source.kind.length > 0 ? source.kind : role
  return { seq: event.seq, role, author, text, images: imagesOf(event) }
}

/**
 * Create the port over the connector row's Cordis context.
 *
 * @param {object} ctx - the row's context (sessions, sessionController, agents, workspaceRegistry,
 *   attachments, sessionQuery, get, on, emit, logger).
 * @param {object} options
 * @param {string} options.senderId - the `senderSessionId` of every message this port delivers
 * @param {() => {maxMessageBytes: number, readSessionMessages: number, readSessionBytes: number}} options.readLimits
 *   - the connector's live limits (src/config.js)
 * @param {() => number} [options.now] - the clock of the activity bump and hostRef expiry
 * @param {(sessionId: string) => void} [options.stoppedByManager] - told right before the port cancels a
 *   turn for the managing agent (stop, redirect), so that turn end reports no turn-finished
 * @returns the port (see the module comment)
 */
export function createSessionPort(ctx, options) {
  const { senderId, readLimits, now = Date.now, stoppedByManager = () => {} } = options ?? {}
  if (!ctx || typeof ctx.get !== 'function') throw new TypeError(MISUSE.context)
  if (typeof senderId !== 'string' || typeof readLimits !== 'function' || typeof now !== 'function') throw new TypeError(MISUSE.options)
  for (const service of DSH_SERVICES) {
    if (ctx[service] === undefined) throw new TypeError(MISUSE.service + service)
  }
  const logger = typeof ctx.logger === 'function' ? ctx.logger(LOG) : undefined
  const workspaces = () => ctx.workspaceRegistry.list()
  let activityWatermarks = deliveryActivityByContext.get(ctx)
  if (activityWatermarks === undefined) {
    activityWatermarks = new Map()
    deliveryActivityByContext.set(ctx, activityWatermarks)
    // The public list read may yield. Observe native activity too so a human message during
    // that read cannot leave our baseline behind the row already seen by connected clients.
    ctx.on(LIST_ACTIVITY.event, (sessionId, timestamp) => {
      activityWatermarks.set(sessionId, Math.max(timestamp, activityWatermarks.get(sessionId) ?? timestamp))
    })
  }

  /**
   * The image port needs the full log (sessionQuery.readSession) and the attachment store. Both
   * are in dsh-base, but a minimal composition may omit them. Resolution is lazy so a profile
   * that mounts those services after this row still gets the attachment tools; until then an
   * attachment call is a typed feature-off, never a silently dropped image.
   */
  let imagePort
  function imagePortOf() {
    if (imagePort !== undefined) return imagePort
    const attachmentStore = ctx.get('attachments')
    const sessionQuery = ctx.get('sessionQuery')
    if (typeof attachmentStore?.readImage !== 'function' || typeof sessionQuery?.readSession !== 'function') {
      throw new RefusalError(REFUSAL.featureOff)
    }
    imagePort = createImagePort({ attachments: attachmentStore, sessionQuery, now })
    return imagePort
  }

  /** The §6.2/§6.4 surface; methods resolve the port on first use. */
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
    const request = { address: await historyAddressOf(sessionId), throughSeq: cursor, maxMessages }
    return ctx.sessionController.events(request, NEVER_ABORTED)
  }

  /**
   * The history address of a session (SESSION_ADDRESS): a subagent's session is read through its
   * parent, so the root's manager can read a child it manages through the root (R-FIX-CUI).
   */
  async function historyAddressOf(sessionId) {
    const header = await headerOf(ctx, sessionId)
    return isSubagentHeader(header)
      ? { kind: SESSION_ADDRESS.subagent, parentSessionId: header.parentSession, childSessionId: sessionId, mode: SESSION_ADDRESS.anyMode }
      : { kind: SESSION_ADDRESS.session, sessionId }
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
   * The events a bounded read scans: the whole log, so empty-text messages and the caps are
   * counted by read() alone. 0.2.2 reads one page up to the passive cursor with a budget of every
   * event (a page counts messages, and the log has no more messages than events); 0.2.1 has no
   * passive state read but its inspection returns the whole log.
   */
  async function readEventsOf(sessionId) {
    if (typeof ctx.sessionController.state === 'function') {
      const { cursor } = await ctx.sessionController.state({ sessionId }, NEVER_ABORTED)
      const page = await pageOf(sessionId, cursor, Math.max(MIN_PAGE_MESSAGES, cursor + 1))
      return (page.records ?? []).map((record) => record.event ?? record)
    }
    return (await ctx.sessionController.inspect(sessionId, NEVER_ABORTED)).events
  }

  /** Live-only ordering: use the public row baseline shared by both supported DSH versions. */
  async function emitDeliveryActivity(sessionId) {
    const { items } = await ctx.sessionController.list({}, NEVER_ABORTED)
    const row = items.find((item) => item.sessionId === sessionId)
    // Recheck after the asynchronous delivery/read: a target may have been archived meanwhile.
    if (row === undefined || ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) return
    // No await between reading and advancing the watermark: concurrent deliveries must also
    // advance when the clock ties or moves backwards. No authoritative row is changed.
    const previous = Math.max(row.updatedAt, activityWatermarks.get(sessionId) ?? row.updatedAt)
    const timestamp = Math.max(now(), previous + LIST_ACTIVITY.stepMs)
    activityWatermarks.set(sessionId, timestamp)
    ctx.emit(LIST_ACTIVITY.event, sessionId, timestamp)
  }

  /** Hand a message to a session's agent and flush it; false on the flush is unconfirmed, never failed. */
  async function handOver(agent, text, send, attachments, via) {
    await send(agent, userMessageOf(text, senderId, attachments, via))
    let flushed = false
    try { flushed = await ctx.sessions.flush(agent.session) === true } catch { /* Unconfirmed, not undelivered. */ }
    if (flushed) {
      // A list read or notification failure cannot undo a confirmed relay.
      try { await emitDeliveryActivity(agent.session.id) } catch (error) {
        logger?.warn(LIST_ACTIVITY.failed, agent.session.id, error?.code ?? REFUSAL.operationFailed)
      }
    }
    // WAKE-REDUCE: the session's activity right after the hand-over is the tool's own answer, so no
    // separate `state` event reports it (a steer wakes an idle agent before it returns).
    return { status: flushed ? DELIVERY.delivered : DELIVERY.unconfirmed, running: agent.status === RUNNING_AGENT }
  }

  /**
   * Consume the hostRefs a principal put just before this message. An empty list needs no port; a
   * non-empty one without the port is refused feature-off, never silently delivered as text.
   */
  async function attachmentsOf(hostRefs) {
    if (hostRefs === undefined || hostRefs.length === 0) return []
    return attachment.resolve(hostRefs)
  }

  /** Resolve and deliver one message with already-consumed attachment blocks; `admit` runs right before `send`. */
  async function deliverWith(sessionId, text, send, attachments, via, admit = ADMITTED) {
    const resolved = await ctx.sessionController.resolveAgent(sessionId)
    if (resolved.agent === undefined) throw new RefusalError(REFUSAL.unknownSession)
    admit()
    return handOver(resolved.agent, text, send, attachments, via)
  }

  /**
   * Consume hostRefs and deliver. A refused hostRef fails before resolveAgent, so an invalid
   * or expired ref cannot activate a session or leave a half-built message behind.
   */
  async function deliver(sessionId, text, send, { hostRefs = [], via = SOURCE.via.message, admit = ADMITTED } = {}) {
    const attachments = await attachmentsOf(hostRefs)
    admit()
    return deliverWith(sessionId, text, send, attachments, via, admit)
  }

  /**
   * Create the session through DSH. DSH creates it first and adds it to the workspace second;
   * when only that step fails the session exists (under Ungrouped), so it still starts with DSH's
   * own code for the partial failure (`workspaceError`).
   */
  async function createSession(target) {
    try {
      return { sessionId: (await ctx.sessionController.create(target)).sessionId }
    } catch (error) {
      const sessionId = error?.code === WORKSPACE_ERROR.dshCode ? error.details?.sessionId : undefined
      if (typeof sessionId !== 'string' || sessionId.length === 0) throw startRefusal(error)
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
      logger?.warn(LOG_LINE.nameFailed, sessionId, error?.code ?? REFUSAL.operationFailed)
      return { titleError: TITLE_ERROR.failed }
    }
  }

  /** session_message: steer the message into the session. */
  async function message({ sessionId, message: text, attachments, admit }) {
    boundMessage(text, readLimits())
    return deliver(sessionId, text, (agent, input) => agent.steer(input), { hostRefs: attachments, admit })
  }

  /**
   * Create -> title -> model -> `onCreated(sessionId)` -> first delivery. `onCreated` is awaited
   * once the session exists and before its first message (R-ROUTE-01): the caller makes it managed
   * then, and reports the outcome itself. A failed first delivery still answers the sessionId
   * (logged): the session exists.
   */
  async function start({ target, title, model, reasoningEffort, message, attachments: hostRefs = [], onCreated }) {
    // Bounded first: an oversized first message creates no session.
    boundMessage(message, readLimits())
    // Validate the model before anything is created, so a refused choice leaves no session behind.
    let selection
    try { selection = await prepareSessionModel(ctx, model, reasoningEffort) } catch (error) { throw startRefusal(error) }
    // Consume hostRefs only after the model check: a refused model keeps the refs usable.
    const attachments = await attachmentsOf(hostRefs)
    const created = await createSession(target)
    const named = nameSession(created.sessionId, title)
    if (selection !== undefined) await applySessionModel(ctx, created.sessionId, selection)
    await onCreated(created.sessionId)
    let running = false
    try {
      ({ running } = await deliverWith(created.sessionId, message, (agent, input) => agent.steer(input), attachments))
    } catch (error) {
      logger?.warn(LOG_LINE.firstDeliveryFailed, created.sessionId, error?.code ?? REFUSAL.operationFailed)
    }
    return {
      sessionId: created.sessionId,
      running,
      ...(named.titleError === undefined ? {} : { titleError: named.titleError }),
      ...(created.workspaceError === undefined ? {} : { workspaceError: created.workspaceError }),
    }
  }

  /**
   * One bounded read, newest messages kept. The bounds are the caller's maxMessages/maxBytes,
   * each capped by the connector's own readSessionMessages/readSessionBytes (the user's decision,
   * 2026-11-07: the caps are enforced here, connector-side only). A read the caps or the caller's
   * bounds cut reports `truncated: true`, the contract's explicit reason (§4.1); nothing is cut
   * silently, and an uncut read reports false.
   *
   * Only messages with text count: an empty-text message is skipped and takes no place under
   * maxMessages (DESIGN §5c). DSH's history page counts every message, so the page is read with
   * the whole log's budget and the count is taken here (ROL-24, 0.2.2's page read).
   */
  async function read({ sessionId, maxMessages, maxBytes }) {
    const limits = readLimits()
    const messageBudget = Math.min(maxMessages, limits.readSessionMessages)
    const byteBudget = Math.min(maxBytes, limits.readSessionBytes)
    const events = await readEventsOf(sessionId)
    const messages = []
    let used = 0
    let truncated = false
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index]
      if (event.type !== SESSION_INFO.assistantEvent && event.type !== SESSION_INFO.userEvent) continue
      const text = textOfEvent(event)
      if (text.length === 0) continue
      // A message with text is left out from here on: the read is cut.
      if (messages.length >= messageBudget) { truncated = true; break }
      const room = byteBudget - used
      // Too little room for even the ellipsis: stop rather than exceed the bound.
      if (room <= byteLength(SESSION_INFO.ellipsis) && byteLength(text) > room) { truncated = true; break }
      const cut = cutToBytes(text, room, SESSION_INFO.ellipsis)
      if (cut !== text) truncated = true
      messages.unshift(messageOf(event, cut, senderId))
      used += byteLength(cut)
    }
    return { messages, truncated }
  }

  const port = {
    async describe(sessionId) {
      // The title projection is cold-safe and exists on both host versions; null means no such
      // session (DSH's own not-found answer), not a read failure.
      let projection
      try {
        projection = await ctx.sessionController.projections({ sessionId }, NEVER_ABORTED)
      } catch {
        // DSH's title fold reads every user message's source.kind, so one message with no source
        // makes the projection throw on both hosts (ROL-06), and it stays cached that way. The
        // session still exists and is described without a title; only DSH's own not-found means
        // there is no such session.
        if (await isSessionGone(ctx, sessionId)) return undefined
        projection = { values: {} }
      }
      if (projection === null || projection === undefined) return undefined
      // An archived session is unknown to the tools: its rows disappear with the archive (§5.2).
      if (ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) return undefined
      let running = false
      let pendingInteraction = false
      try { ({ running, pendingInteraction } = await activityOf(sessionId)) } catch { /* state read failure */ }
      const title = typeof projection.values?.[TITLE_PROJECTION] === 'string' ? projection.values[TITLE_PROJECTION] : ''
      return { sessionId, title, workspaceId: workspaceOf(sessionId), running, pendingInteraction }
    },
    start,
    message,
    async redirect({ sessionId, message, attachments, admit = ADMITTED }) {
      const delivered = await deliver(sessionId, message, async (agent, input) => {
        // The Stop button's path, then the instruction as the next turn (src/messaging.js). The
        // cancelled turn is the manager's own stop: it reports no turn-finished (WAKE-REDUCE).
        stoppedByManager(sessionId)
        await ctx.sessionController.cancel({ sessionId })
        admit()
        agent.followup(input)
      }, { hostRefs: attachments, via: SOURCE.via.redirect, admit })
      return delivered
    },
    /** `byManager`: the managing agent's own session_stop (its turn end then reports no turn-finished). */
    async stop({ sessionId, reason, admit = ADMITTED, byManager = false }) {
      // A loaded but idle agent still sits in ctx.agents, so its presence is not "something is
      // running"; the host's passive state (0.2.2) or the live agent's status (0.2.1) decides.
      // DSH's cancel is the Stop button, and an idle stop is a no-op.
      const { running } = await activityOf(sessionId)
      admit()
      if (!running) return
      // The manager's own stop reports no turn-finished (WAKE-REDUCE, the user's decision); a
      // plugin's stop (the watchdog's, dshConnectorSessions) is not the manager's and is reported.
      if (byManager) stoppedByManager(sessionId)
      await ctx.sessionController.cancel({ sessionId })
    },
    read,
    // attachment_read answers metadata plus chunks; the image port checks that this Session's log
    // references the id.
    attachment,
  }
  return Object.freeze(port)
}

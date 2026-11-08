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
 * notifyWhenFinished on start and message sets up a watch on the target after a delivery, with
 * the watermark read BEFORE that delivery, so a fast turn the message starts is never missed
 * (src/watches.js, review H1; 7713 N5). This is the legacy src/messaging.js withWatch rule: a
 * watch the child set up afterwards with session.watch would start after such a turn had ended.
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
import { MODEL_ERROR, ModelChoiceError } from '../../model-catalog.js'
import { NO_EVENTS_SEQ, isSessionGone, senderOf, textOfEvent } from '../../session-info.js'
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
  'assistantId', 'managedIds', 'isManaged', 'isFishball', 'isRelated', 'readLimits', 'manage', 'release', 'stopped', 'redirected',
  'watch', 'watermark', 'watches', 'unwatch',
])

/** The main-DSH services every operation needs; a missing one is a wiring error, not a refusal. */
const DSH_SERVICES = Object.freeze(['sessions', 'sessionController', 'agents', 'workspaceRegistry'])

/** A passive state read takes a cancellation signal; the bridge's own request timeout is the bound. */
const NEVER_ABORTED = new AbortController().signal

/** The title projection (dsh-session-title) folded into every Session summary; absent is no title. */
const TITLE_PROJECTION = 'title'
/** DSH's history page needs a message budget of at least one (its request validator refuses 0, and a new session's cursor is -1). */
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

/**
 * One user message with Fishball as the sender, as src/messaging.js builds it. `via` names the
 * tool that sent it (SOURCE.via): a redirect is told apart from a message by it, so a permission
 * request from the redirected turn names redirect_session as its origin (DESIGN §7a.12, ORG-01).
 * DSH keeps a source's extra fields in the log; the relay's kind and sender are unchanged.
 */
function userMessageOf(text, assistantId, attachments = [], via = SOURCE.via.message) {
  return createUserMessage({
    content: [{ type: 'text', text }, ...attachments],
    source: { ...SOURCE.relay, senderSessionId: assistantId, via },
  })
}

/**
 * The message-size cap (the user's decision, 2026-11-08): a session.message or session.start body
 * over maxMessageBytes (64 KiB by default, the connector's own setting) is refused before anything
 * is delivered or created. Contract 1.1's code for an oversized value is limit-exceeded (§8).
 */
function boundMessage(text, limits) {
  if (byteLength(text) > limits.maxMessageBytes) throw new ContractError(ERROR.limit)
}

/**
 * Why a start failed, as a contract 1.1 code (the user's decision, 2026-11-08: no new codes,
 * operation-failed only for what is truly unexpected). A refused model or effort is an invalid
 * choice the caller can correct (invalid-decision); a catalog that cannot be read is
 * feature-off; a contract refusal keeps its own code.
 */
const MODEL_REFUSAL = Object.freeze({
  [MODEL_ERROR.invalid]: ERROR.invalidDecision, [MODEL_ERROR.effort]: ERROR.invalidDecision,
  [MODEL_ERROR.required]: ERROR.invalidDecision, [MODEL_ERROR.unavailable]: ERROR.featureOff,
})
function startRefusal(error) {
  if (error instanceof ContractError) return error
  if (error instanceof ModelChoiceError && MODEL_REFUSAL[error.code] !== undefined) return new ContractError(MODEL_REFUSAL[error.code])
  return new ContractError(ERROR.failed)
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

  /** Hand a message to a session's agent and flush it; false on the flush is unconfirmed, never failed. */
  async function handOver(agent, text, assistantId, send, attachments, via) {
    await send(agent, userMessageOf(text, assistantId, attachments, via))
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
  async function deliverWith(sessionId, text, send, attachments, via) {
    const { assistantId } = state()
    const resolved = await ctx.sessionController.resolveAgent(sessionId)
    if (resolved.agent === undefined) throw new ContractError(ERROR.unknownSession)
    return handOver(resolved.agent, text, assistantId(), send, attachments, via)
  }

  /**
   * Consume hostRefs and deliver. A refused hostRef fails before resolveAgent, so an invalid
   * or expired ref cannot activate a session or leave a half-built message behind.
   */
  async function deliver(sessionId, text, send, hostRefs = [], via = SOURCE.via.message) {
    const attachments = await attachmentsOf(hostRefs)
    return deliverWith(sessionId, text, send, attachments, via)
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
      logger?.warn('naming session %s failed (%s)', sessionId, error?.code ?? ERROR.failed)
      return { titleError: TITLE_ERROR.failed }
    }
  }

  /**
   * Add a watch for Fishball (Watches' defaults: finished, once, DESIGN §5c).
   * @param input - { sessionId, mode?, since? }; since is the watermark (src/watches.js add()).
   * @returns { watchId } or { watchError }: a watch refusal is typed data in the §5.2 response.
   */
  async function addWatch(input) {
    try {
      return { watchId: (await state().watch(input)).id }
    } catch (error) {
      if (typeof error?.code === 'string' && WATCH_REFUSALS.has(error.code)) return { watchError: error.code }
      throw error
    }
  }

  /**
   * notifyWhenFinished after a delivery that did not throw (delivered or unconfirmed: the session
   * has the message either way). A refused watch never undoes the message (DESIGN §5b).
   * @returns {} when not asked, else addWatch's result.
   */
  const notifyAfter = (notify, sessionId, since) => (notify === true ? addWatch({ sessionId, since }) : {})

  /** message's delivery; with notifyWhenFinished the watermark is read before the message goes in. */
  async function message({ sessionId, message: text, attachments, notifyWhenFinished: notify }) {
    boundMessage(text, state().readLimits())
    const since = notify === true ? await state().watermark(sessionId) : undefined
    const delivered = await deliver(sessionId, text, (agent, input) => agent.steer(input), attachments)
    return { ...delivered, ...(await notifyAfter(notify, sessionId, since)) }
  }

  /** Create -> title -> model -> manage -> first delivery; the contract has no field for a failed start delivery. */
  async function start({ target, title, model, reasoningEffort, message, attachments: hostRefs = [], notifyWhenFinished: notify }) {
    const registry = state()
    // Bounded first: an oversized first message creates no session.
    boundMessage(message, registry.readLimits())
    // Validate the model before anything is created, so a refused choice leaves no session behind.
    let selection
    try { selection = await prepareSessionModel(ctx, model, reasoningEffort) } catch (error) { throw startRefusal(error) }
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
    // A new session: its log before the first message holds no turn end, so a read that finds
    // nothing counts every turn end (legacy watermarkOfNew). Named before this is read.
    const since = notify === true ? (await registry.watermark(created.sessionId)) ?? NO_EVENTS_SEQ : undefined
    let delivered = false
    try {
      await deliverWith(created.sessionId, message, (agent, input) => agent.steer(input), attachments)
      delivered = true
    } catch (error) {
      logger?.warn('first delivery to %s failed (%s)', created.sessionId, error?.code ?? ERROR.failed)
    }
    // No watch on a session that never got its first message: no turn would ever end there
    // (the legacy tool also watched only after a delivery that did not fail).
    const watched = delivered ? await notifyAfter(notify, created.sessionId, since) : {}
    return {
      sessionId: created.sessionId,
      managed,
      ...(named.titleError === undefined ? {} : { titleError: named.titleError }),
      ...(created.workspaceError === undefined ? {} : { workspaceError: created.workspaceError }),
      ...watched,
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
    const { assistantId, readLimits } = state()
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
      messages.unshift(messageOf(event, cut, assistantId()))
      used += byteLength(cut)
    }
    return { messages, truncated }
  }

  const port = {
    enabled: () => enabled() === true && ctx.get(SESSION_STATE.service) !== undefined,
    managedIds: () => [...state().managedIds()],
    isManaged: (sessionId) => state().isManaged(sessionId) === true,
    isFishball: (sessionId) => state().isFishball(sessionId) === true,
    isRelated: async (sessionId) => (await state().isRelated(sessionId)) === true,
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
    message,
    async redirect({ sessionId, message, attachments }) {
      const delivered = await deliver(sessionId, message, async (agent, input) => {
        // The Stop button's path, then the instruction as the next turn (src/messaging.js).
        await ctx.sessionController.cancel({ sessionId })
        agent.followup(input)
      }, attachments, SOURCE.via.redirect)
      // Audited once it was handed over (DESIGN §7a.12, §9); a failed redirect has no row.
      await state().redirected(sessionId)
      return delivered
    },
    async stop({ sessionId, reason }) {
      // An idle session has no live agent and nothing to stop; DSH's cancel is the Stop button.
      const running = ctx.agents.get(sessionId) !== undefined
      if (running) await ctx.sessionController.cancel({ sessionId })
      // One decisions row either way; its outcome says whether a turn was running (DESIGN §9).
      await state().stopped(sessionId, reason, running)
    },
    read,
    // T06's two bridge operations. attachment.read answers metadata plus chunks; the image port
    // has already checked that this Session's log references the id.
    attachment,
    watch: ({ sessionId, mode }) => addWatch({ sessionId, mode }),
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

/**
 * Fishball's own chat in the isolated child (Section 2.1, 8.4, 15 T07).
 *
 * The child's base profile has no sessionController: nothing here creates or resumes
 * Fishball's Session for it. This module owns that Session end to end:
 * - one durable chat record under the child's own DSH home names the Session, so a child
 *   restart resumes the same conversation instead of starting a second one;
 * - the Session is created read-only with approval policy "ask" (8.4, D8); the composer has
 *   no permission control, and no route accepts a permission or preset change;
 * - the transcript is derived from DSH's own session log (the supported live-preferred
 *   sessionQuery read), and live updates are relayed as the child app's one SSE event, so the
 *   slim UI re-reads nothing per delta;
 * - resolveAgent is the activation owner the child's reminder scheduler needs (T10): after a
 *   restart only this module can resume Fishball's Session, so without it every reminder
 *   delivery into its own session fails;
 * - applyModel is the live-session port the admin service (T11) calls after it persisted the
 *   child's default model, so the change applies on the next request (Section 9).
 *
 * Rules kept here:
 * - Delivery is followup, never a retry: one prompt is one queued turn.
 * - deliverInbox queues one inbox item as Fishball's own turn; notify appends a visible system
 *   timeline entry without a turn, for a typed inbox refusal. The inbox row
 *   (src/slim/child/inbox.js) is their only caller.
 * - No path, URL, token or provider text crosses to the page. Typed codes and this module's
 *   own copy are the only failures the UI shows (Section 11).
 * - Text is plain: the slim UI renders it as text, never as HTML.
 * - The transcript is bounded in entries and characters, so one long conversation cannot make
 *   the page unrenderable.
 *
 * API contract (src/slim/child/server.js owns only the HTTP framing):
 *   GET  /api/chat -> 200 { sessionId, running, permission: { mode }, entries }
 *   POST /api/chat { text, attachments? } -> 200 { messageId } | 400 { code, message } | 503
 *   GET  /api/model -> 200 { selection, providers, models }
 *   POST /api/model { provider, model, reasoningEffort? } -> 200 { selection } | 400/503
 * The attachments are the descriptors /api/upload returned ({kind, attachment}); the image
 * service verifies each against the child's own store before the message is built (§6.6).
 * Entries are the page's timeline records (ENTRY_KIND); a partial entry is a merge by id, so
 * a tool/result completes the row its tool/call started. A card record entry (I7) carries the
 * record's v1 data unchanged as `record`, for src/slim/ui/records.js to draw.
 */
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { ERROR, INBOX_KIND, LIMITS, ROUTES } from '../contract.js'
import { applyPersona } from './persona.js'
import { CARD_RECORD } from '../card-record.js'

/** The child serves the contract's /api/* tails; the broker adds /fishball/embed in front (3.1). */
const API = (tail) => ROUTES.api.slice(ROUTES.prefix.length) + tail

/**
 * The chat API contract src/slim/ui/chat.js follows. Relative URLs on the page resolve to the
 * child's "/" and behind the broker's "/fishball/embed/" alike (3.1).
 */
export const CHAT = Object.freeze({
  path: API('chat'),
  modelPath: API('model'),
  /** The SSE event this module publishes on; the shell already owns the one EventSource. */
  event: 'chat',
  methods: Object.freeze(['GET', 'HEAD', 'POST']),
  media: 'application/json',
})

/** Entry kinds the page renders; an absence is an unknown future value the page ignores. */
export const ENTRY_KIND = Object.freeze({
  user: 'user',
  assistant: 'assistant',
  tool: 'tool',
  notice: 'notice',
  record: 'record',
})

/** The one sandbox and approval policy Fishball's session is hard-wired to (8.4, D8). */
const POLICY = Object.freeze({ sandbox: 'read-only', approval: 'ask' })

/** The legacy Fishball session-id prefix, kept so the child's log is recognisable beside older ones. */
const SESSION_PREFIX = 'session-fishball-'

/**
 * View and record bounds. The message bound is Fishball's established maxMessageBytes
 * (src/config.js); the entry bounds keep one long tool output from dominating the page.
 */
const CHAT_LIMITS = Object.freeze({
  messageBytes: 65536,
  entryChars: 8000,
  toolArgumentsChars: 1200,
  toolOutputChars: 4000,
  entries: 300,
  resumeAttempts: 4,
  resumeRetryMs: 200,
  directoryMode: 0o700,
  recordFileMode: 0o600,
  recordChars: 4096,
})

/**
 * A system timeline entry is a plugin record: DSH persists and forks it but never projects it to
 * the model, so a typed inbox refusal stays visible without starting a turn. The record type
 * belongs to this plugin's own namespace (§5.2, §6.3).
 */
const NOTICE_RECORD = 'plugin:fishball/inbox-notice'

const RECORD = Object.freeze({ directory: 'fishball', file: 'chat.json', cwd: 'assistant' })
const CHILD = Object.freeze({
  agents: 'agents',
  profileContext: 'profileContext',
  sessionQuery: 'sessionQuery',
  defaultModel: 'agentDefaultModel',
  sandboxPolicy: 'sandboxPolicy',
  images: 'fishballImages',
  logger: 'fishball-native-chat',
  writerHeld: 'SessionAlreadyOwnedError',
})

const METHOD = Object.freeze({ get: 'GET', head: 'HEAD', post: 'POST' })
const HTTP = Object.freeze({ ok: 200, badRequest: 400, notFound: 404, unavailable: 503, failed: 500 })
const ELLIPSIS = '…'

/** Typed refusals; the HTTP hook returns code and message unchanged. */
export const CHAT_ERROR = Object.freeze({
  invalid: 'invalid-input',
  tooLarge: 'too-large',
  unavailable: 'chat-unavailable',
  session: 'chat-session',
  model: 'model-unavailable',
  method: 'method-not-allowed',
  failed: 'chat-failed',
})
const ERROR_STATUS = Object.freeze({
  [CHAT_ERROR.invalid]: HTTP.badRequest,
  [CHAT_ERROR.tooLarge]: HTTP.badRequest,
  [CHAT_ERROR.unavailable]: HTTP.unavailable,
  [CHAT_ERROR.session]: HTTP.unavailable,
  [CHAT_ERROR.model]: HTTP.badRequest,
  [CHAT_ERROR.method]: HTTP.badRequest,
})
const MESSAGE = Object.freeze({
  invalid: 'The chat request is invalid.',
  tooLarge: 'The message is too large.',
  unavailable: 'Fishball chat is not available in this child.',
  session: 'Fishball could not open its session.',
  model: 'The model choice is not available.',
  method: 'The chat API accepts GET, HEAD and POST.',
  failed: 'The chat operation failed.',
})

/**
 * Who wrote a user-role message, from DSH's own source kind. The page words it in its own
 * language (src/slim/ui/i18n.js `chat.author.*`, I9), so the child sends the kind, not text.
 */
const AUTHOR_KIND = Object.freeze({ user: 'user', schedule: 'schedule', other: 'other' })

/**
 * Sources for Fishball's queued turns. An inbox item keeps its origin: a session's message is an
 * agent relay, while a hand-over note, watch notice or system item is a Fishball notice. Neither
 * source pretends another session's words are the user's own (§5.2, §6.5).
 */
const SOURCE = Object.freeze({
  user: Object.freeze({ kind: 'user' }),
  relay: Object.freeze({ kind: 'agent-message', form: 'relay' }),
  notice: Object.freeze({ kind: 'fishball-notice', form: 'notice' }),
})

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value) => (typeof value === 'string' ? value : '')

/** A typed boundary refusal; the HTTP hook returns code and message unchanged. */
class ChatApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ChatApiError'
    this.code = code
  }
}

function invalid() { throw new ChatApiError(CHAT_ERROR.invalid, MESSAGE.invalid) }
function unavailable() { throw new ChatApiError(CHAT_ERROR.unavailable, MESSAGE.unavailable) }
function sessionFailed() { throw new ChatApiError(CHAT_ERROR.session, MESSAGE.session) }
function modelUnavailable() { throw new ChatApiError(CHAT_ERROR.model, MESSAGE.model) }

/** Clamp by code point so a surrogate pair is never cut in half. */
function clamp(value, max) {
  const characters = Array.from(value)
  return characters.length <= max ? value : characters.slice(0, max).join('') + ELLIPSIS
}

/** Join the visible text blocks of one model message; reasoning and tool calls stay out. */
function textOfBlocks(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string' && block.text !== '') parts.push(block.text)
  }
  return parts.join('')
}

/**
 * The page's view of one attachment block: metadata only, never bytes or a path (§6.5). The
 * timeline shows the user's own upload under its id and fetches the preview from the child's
 * read-only by-id route; an id the route does not know still reads "Preview unavailable".
 */
function attachmentOf(block) {
  const ref = block?.attachment
  if (ref === null || typeof ref !== 'object' || typeof ref.attachmentId !== 'string' || ref.attachmentId === '') return undefined
  if (block.type === 'image') {
    if (typeof ref.mediaType !== 'string' || !Number.isSafeInteger(ref.width) || !Number.isSafeInteger(ref.height) || !Number.isSafeInteger(ref.bytes)) return undefined
    return {
      kind: 'image', attachmentId: ref.attachmentId, mediaType: ref.mediaType,
      width: ref.width, height: ref.height, bytes: ref.bytes,
      ...(typeof ref.name === 'string' && ref.name !== '' ? { name: ref.name } : {}),
    }
  }
  if (block.type !== 'file' || typeof ref.name !== 'string' || !Number.isSafeInteger(ref.bytes)) return undefined
  return { kind: 'file', attachmentId: ref.attachmentId, name: ref.name, bytes: ref.bytes }
}

/** The attachment metadata of one message content, in block order; empty means none. */
function attachmentsOf(content) {
  if (!Array.isArray(content)) return []
  const attachments = []
  for (const block of content) {
    const attachment = attachmentOf(block)
    if (attachment !== undefined) attachments.push(attachment)
  }
  return attachments
}

function authorKindOf(source) {
  const kind = source?.kind
  if (kind === 'user') return AUTHOR_KIND.user
  if (kind === 'schedule') return AUTHOR_KIND.schedule
  return AUTHOR_KIND.other
}

/**
 * The source of one inbox turn. A session message is an agent relay naming its sender; a
 * hand-over note, watch notice or system item is a Fishball notice. The text keeps its own
 * framing; this source only tells DSH whose words the turn carries.
 */
function inboxSourceOf(item) {
  if (item?.kind !== INBOX_KIND.session) return SOURCE.notice
  return typeof item.sourceSessionId === 'string' && item.sourceSessionId !== ''
    ? { ...SOURCE.relay, senderSessionId: item.sourceSessionId }
    : SOURCE.relay
}

/**
 * Map one committed session event to a partial timeline entry, or undefined for log-only
 * events. Tool names are remembered from tool/call, because a tool/result names only the call
 * id it answers. The page merges a partial entry into the row with the same id.
 */
function entryOfEvent(event, toolNames) {
  const data = event?.data
  if (!isRecord(data)) return undefined
  switch (event.type) {
    case 'user/message': {
      const id = text(data.id)
      const attachments = attachmentsOf(data.content)
      // A message without an id cannot be merged with its live twin; showing it under a
      // sequence id is better than losing it.
      return {
        id: id === '' ? 'u:' + event.seq : 'm:' + id,
        kind: ENTRY_KIND.user,
        at: event.time,
        authorKind: authorKindOf(data.source),
        text: clamp(textOfBlocks(data.content), CHAT_LIMITS.entryChars),
        ...(attachments.length === 0 ? {} : { attachments }),
      }
    }
    case 'assistant/message': {
      const content = data.message?.content
      const visible = clamp(textOfBlocks(content), CHAT_LIMITS.entryChars)
      const attachments = attachmentsOf(content)
      if (visible === '' && attachments.length === 0) return undefined
      return {
        id: 'a:' + event.seq, kind: ENTRY_KIND.assistant, at: event.time, text: visible,
        ...(attachments.length === 0 ? {} : { attachments }),
      }
    }
    case 'tool/call': {
      const callId = text(data.callId)
      if (callId === '') return undefined
      const name = text(data.name) || 'tool'
      toolNames.set(callId, name)
      return {
        id: 't:' + callId,
        kind: ENTRY_KIND.tool,
        at: event.time,
        name,
        arguments: clamp(text(data.arguments), CHAT_LIMITS.toolArgumentsChars),
        state: 'running',
      }
    }
    case 'tool/result': {
      const callId = text(data.message?.toolCallId)
      if (callId === '') return undefined
      const reason = text(data.error?.reason)
      const output = clamp(textOfBlocks(data.message?.content) || reason, CHAT_LIMITS.toolOutputChars)
      // The name is omitted when this process never saw the call: the page keeps the name its
      // earlier partial entry carried instead of replacing it with a placeholder.
      return {
        id: 't:' + callId,
        kind: ENTRY_KIND.tool,
        ...(toolNames.has(callId) ? { name: toolNames.get(callId) } : {}),
        state: 'done',
        isError: data.message?.isError === true,
        output,
      }
    }
    case NOTICE_RECORD: {
      const value = text(data.text)
      if (value === '') return undefined
      return { id: 'n:' + event.seq, kind: ENTRY_KIND.notice, at: event.time, text: clamp(value, CHAT_LIMITS.entryChars) }
    }
    case CARD_RECORD.type: {
      // The connector's row matches the same way (client.records.js). The id is the record's own,
      // not the event's seq: the bridge remembers dedupe keys for one child process only, so a
      // record whose ack was lost is re-delivered after a child restart and appended a second
      // time; the merge by id keeps one row, at the first place.
      if (data.v !== CARD_RECORD.version || typeof data.id !== 'string' || data.id === '') return undefined
      return { id: 'r:' + data.id, kind: ENTRY_KIND.record, at: event.time, record: data }
    }
    case 'turn/end': {
      const reason = data.reason
      if (reason?.kind !== 'error') return undefined
      const code = text(reason.error?.code) || 'error'
      return { id: 'n:' + event.seq, kind: ENTRY_KIND.notice, at: event.time, text: 'The turn failed (' + code + ').' }
    }
    default:
      return undefined
  }
}

/**
 * Fold a committed log into page entries: partial entries merge by id, insertion order keeps
 * the conversation order, and only the newest CHAT_LIMITS.entries survive.
 */
function entriesOfEvents(events) {
  const toolNames = new Map()
  const merged = new Map()
  for (const event of events) {
    const entry = entryOfEvent(event, toolNames)
    if (entry === undefined) continue
    const prior = merged.get(entry.id)
    // A row keeps the time it first appeared at, as the page's upsert keeps a row's place, so a
    // card record appended twice reads at its first place after a reload as well as live.
    merged.set(entry.id, prior === undefined ? entry : { ...prior, ...entry, at: prior.at ?? entry.at })
  }
  return [...merged.values()].slice(-CHAT_LIMITS.entries)
}

/** One model choice as the picker shows it; a model without adapter metadata stays selectable. */
function modelOf(provider, model) {
  return {
    provider,
    id: model.id,
    name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id,
    efforts: [],
  }
}

function effortsOf(info) {
  const efforts = info?.reasoning?.efforts
  if (!Array.isArray(efforts)) return []
  return efforts
    .filter((effort) => typeof effort?.id === 'string' && effort.id !== '')
    .map((effort) => ({ id: effort.id, name: typeof effort.name === 'string' && effort.name !== '' ? effort.name : effort.id }))
}

function selectionOf(value) {
  if (!isRecord(value)) return undefined
  const { provider, model, reasoningEffort } = value
  if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') return undefined
  return { provider, model, ...(typeof reasoningEffort === 'string' && reasoningEffort !== '' ? { reasoningEffort } : {}) }
}

/**
 * Create Fishball's chat over one child context.
 *
 * @param {object} ctx - the fishball-native-app row's context.
 * @param {Function} [ctx.get] - Cordis service lookup (agents, profileContext, sessionQuery,
 *   agentDefaultModel, llm, sandboxPolicy). Every service is read when used, so a row that
 *   loads later is picked up without restarting the chat.
 * @param {Function} [ctx.on] - Cordis event subscription; session/event, agent/status and
 *   agent/assistant-stream drive the live page.
 * @param {object} [options]
 * @param {{ blocks: Function }} [options.images] - the child image service
 *   (src/slim/child/images.js); without it a prompt may carry no attachment. The app row creates
 *   it from the same context and passes it here, so the chat never reads the store itself.
 * @returns {object} start reads the durable record (never creates a Session by itself); the
 *   first read or send activates the Session. service is the fishballChat service other rows
 *   read; handle serves the JSON routes; subscribe relays the SSE frames.
 */
export function createChat(ctx, options = {}) {
  if (!ctx || typeof ctx.get !== 'function' || typeof ctx.on !== 'function') {
    throw new TypeError('fishball-native-chat: a Cordis context with get() and on() is required')
  }
  const images = options?.images ?? (typeof ctx.get === 'function' ? ctx.get(CHILD.images) : undefined)
  const profile = ctx.get(CHILD.profileContext)
  if (typeof profile?.home !== 'string' || !path.isAbsolute(profile.home)) {
    throw new TypeError('fishball-native-chat: the child profile home is required')
  }
  const logger = typeof ctx.logger === 'function' ? ctx.logger(CHILD.logger) : undefined
  const directory = path.join(profile.home, RECORD.directory)
  const recordPath = path.join(directory, RECORD.file)
  const cwd = path.join(directory, RECORD.cwd)
  const listeners = new Set()
  const toolNames = new Map()
  const disposers = []
  let sessionId
  let agent
  let activation
  let started = false
  let closed = false

  function publish(payload) {
    for (const listener of [...listeners]) {
      try { listener(payload) } catch { /* a closed or broken SSE stream owns its failure */ }
    }
  }

  function requireAgents() {
    const agents = ctx.get(CHILD.agents)
    if (agents === undefined) unavailable()
    return agents
  }

  function agentOptions() {
    const selection = selectionOf(ctx.get(CHILD.defaultModel)?.currentSelection?.())
    return selection === undefined ? {} : { ...selection }
  }

  /**
   * Write the record before the Session exists, as the legacy lifecycle does: a crash between
   * the two must not make the next start create a second Session.
   */
  async function record(id) {
    await mkdir(directory, { recursive: true, mode: CHAT_LIMITS.directoryMode })
    const temp = recordPath + '.tmp'
    await writeFile(temp, JSON.stringify({ sessionId: id }) + '\n', { mode: CHAT_LIMITS.recordFileMode })
    await rename(temp, recordPath)
    sessionId = id
  }

  async function readRecord() {
    let raw
    try {
      raw = await readFile(recordPath, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return
      logger?.warn('the chat record could not be read (%s)', String(error?.code ?? error))
      return
    }
    if (raw.length > CHAT_LIMITS.recordChars) {
      logger?.warn('the chat record is too large; it is ignored')
      return
    }
    let parsed
    try { parsed = JSON.parse(raw) } catch { logger?.warn('the chat record is not JSON; it is ignored'); return }
    if (!isRecord(parsed) || typeof parsed.sessionId !== 'string' || parsed.sessionId === '') {
      logger?.warn('the chat record names no session; it is ignored')
      return
    }
    sessionId = parsed.sessionId
  }

  /** Fishball's persona in the agent's own scope, on create and on every resume (T07). */
  function composePersona(agentCtx) {
    applyPersona(agentCtx.systemPrompt)
  }

  /**
   * Compose a new Session's world before publication (8.4): read-only and approval "ask", then
   * its persona. A resume uses composePersona only, because the persisted session already holds
   * both policies; appending them again on every restart would grow the log.
   */
  function configure(agentCtx, live) {
    setSandboxMode(live.session, POLICY.sandbox)
    setApprovalPolicy(live.session, POLICY.approval)
    composePersona(agentCtx)
  }

  async function createSession(agents) {
    const id = SESSION_PREFIX + randomUUID()
    await mkdir(cwd, { recursive: true, mode: CHAT_LIMITS.directoryMode })
    await record(id)
    const handle = await agents.create({ sessionId: id, meta: { cwd }, agentOptions: agentOptions(), setup: configure })
    return handle.agent
  }

  async function resumeSession(agents, id) {
    for (let attempt = 1; ; attempt++) {
      try {
        return (await agents.resume({ resumeSessionId: id, agentOptions: agentOptions(), setup: composePersona })).agent
      } catch (error) {
        const live = agents.get(id)
        if (live !== undefined) return live
        // A child that starts while another writer still holds the log waits briefly, exactly
        // as the legacy lifecycle does; every other refusal is reported, never replaced by a
        // silently created second Session.
        const held = error?.name === CHILD.writerHeld
        if (!held || attempt >= CHAT_LIMITS.resumeAttempts) {
          logger?.warn('Fishball session %s could not be resumed (%s)', id, String(error?.code ?? error?.name ?? error))
          sessionFailed()
        }
        await new Promise((resolve) => setTimeout(resolve, CHAT_LIMITS.resumeRetryMs))
      }
    }
  }

  async function open() {
    const agents = requireAgents()
    if (sessionId === undefined) {
      agent = await createSession(agents)
      return agent
    }
    const live = agents.get(sessionId)
    if (live !== undefined) {
      agent = live
      return live
    }
    agent = await resumeSession(agents, sessionId)
    return agent
  }

  /** One activation owner: concurrent reads, sends and reminder deliveries share the attempt. */
  function activate() {
    if (agent !== undefined && sessionId !== undefined && ctx.get(CHILD.agents)?.get?.(sessionId) === agent) {
      return Promise.resolve(agent)
    }
    if (activation === undefined) {
      activation = open().finally(() => { activation = undefined })
    }
    return activation
  }

  function permissionOf(live) {
    try {
      const mode = ctx.get(CHILD.sandboxPolicy)?.resolve?.({ session: live.session })?.mode
      return typeof mode === 'string' && mode !== '' ? { mode } : { mode: POLICY.sandbox }
    } catch {
      return { mode: POLICY.sandbox }
    }
  }

  async function page() {
    const live = await activate()
    const query = ctx.get(CHILD.sessionQuery)
    if (query === undefined) unavailable()
    let snapshot
    try {
      snapshot = await query.readSession(live.id)
    } catch (error) {
      logger?.warn('the chat transcript could not be read (%s)', String(error?.code ?? error?.name ?? error))
      sessionFailed()
    }
    return {
      sessionId: String(live.id),
      running: live.status === 'running',
      permission: permissionOf(live),
      entries: entriesOfEvents(snapshot.events),
    }
  }

  /** Build and queue one turn through the one activation owner; no content means no turn. */
  async function queue(value, blocks, source) {
    const content = [...(value === '' ? [] : [{ type: 'text', text: value }]), ...blocks]
    if (content.length === 0) invalid()
    const live = await activate()
    const message = createUserMessage({ content, source })
    live.followup(message)
    return { messageId: message.id }
  }

  /**
   * Queue one user turn; the caller's page shows it at once under the returned message id.
   * Attachment refs are verified into blocks first, so a refused upload leaves the Session
   * untouched and no half-built message reaches the log.
   */
  async function send(value, attachments = []) {
    if (Buffer.byteLength(value, 'utf8') > CHAT_LIMITS.messageBytes) {
      throw new ChatApiError(CHAT_ERROR.tooLarge, MESSAGE.tooLarge)
    }
    let blocks = []
    if (attachments.length > 0) {
      if (typeof images?.blocks !== 'function') invalid()
      try {
        blocks = await images.blocks(attachments)
      } catch (error) {
        if (error?.name === 'ContractError' && typeof error.code === 'string') {
          // The chat API's own vocabulary: an oversize attachment is 400/too-large, a bad ref
          // is 400/invalid; the bridge's transfer codes stay inside the child.
          if (error.code === ERROR.tooLarge) throw new ChatApiError(CHAT_ERROR.tooLarge, MESSAGE.tooLarge)
          throw new ChatApiError(CHAT_ERROR.invalid, MESSAGE.invalid)
        }
        throw error
      }
    }
    return queue(value, blocks, SOURCE.user)
  }

  /**
   * Queue one inbox item as Fishball's own turn (§5.2, §6.3). The host's text is forwarded as it
   * arrived, so the sender's framing and untrusted block stay intact; this method never
   * re-frames content. Images are pulled into the child's own store first, and a model that
   * cannot accept them refuses before any turn is queued.
   */
  async function deliverInbox(item, options = {}) {
    if (!isRecord(item) || typeof item.text !== 'string' || item.text === '') {
      throw new TypeError('fishball-native-chat: an inbox item needs text')
    }
    let blocks = []
    if (options.skipImages !== true && Array.isArray(item.images) && item.images.length > 0) {
      if (typeof images?.receiveInbox !== 'function') {
        throw new TypeError('fishball-native-chat: the image service is required for inbox images')
      }
      const live = await activate()
      const received = await images.receiveInbox(item, { agent: live })
      blocks = received.blocks
    }
    return queue(item.text, blocks, inboxSourceOf(item))
  }

  /**
   * One card record in Fishball's session (src/slim/card-record.js): a log-only plugin record
   * that DSH's session view draws (client.js) and that never reaches the model. `tell`, when given,
   * is a notice Fishball does read, queued as its own turn exactly as deliverInbox queues every
   * other inbox item: it wakes an idle Fishball, and a running turn reads it when it ends (7713
   * N9-b: injected without a wake, the user's answer sat unread until the user's next message).
   */
  async function recordCard(data, tell) {
    const live = await activate()
    appendPluginRecord(live.session, CARD_RECORD.type, data)
    if (typeof tell === 'string' && tell !== '') await queue(clamp(tell, CHAT_LIMITS.entryChars), [], SOURCE.notice)
    return { recorded: true }
  }

  /**
   * Append a visible system entry without starting a turn. Plugin records are log-only and
   * ignorable: DSH persists and forks them with the Session but never projects them into a
   * model request, so a typed inbox refusal stays visible without making Fishball answer it.
   */
  async function notify(value) {
    if (typeof value !== 'string' || value === '') throw new TypeError('fishball-native-chat: a notice needs text')
    const live = await activate()
    appendPluginRecord(live.session, NOTICE_RECORD, { text: clamp(value, CHAT_LIMITS.entryChars) })
    return { notified: true }
  }

  function requireLlm() {
    const llm = ctx.get('llm')
    if (llm === undefined) modelUnavailable()
    return llm
  }

  async function catalog(llm) {
    const providers = []
    const models = []
    let routes = []
    try { routes = llm.listProviders() } catch { modelUnavailable() }
    for (const route of routes) {
      if (typeof route?.id !== 'string' || route.id === '') continue
      providers.push({ id: route.id, name: typeof route.name === 'string' && route.name !== '' ? route.name : route.id })
      let advertised = []
      try { advertised = await llm.listModels(route.id) } catch { advertised = [] }
      for (const model of advertised) {
        if (typeof model?.id !== 'string' || model.id === '') continue
        const entry = modelOf(route.id, model)
        try { entry.efforts = effortsOf(await llm.resolveModelInfo(route.id, model.id)) } catch { /* metadata is best effort */ }
        models.push(entry)
      }
    }
    return { providers, models }
  }

  async function modelPage() {
    // The catalog is a wiring read; checking it first keeps a missing llm from creating a
    // Session just to answer a picker request.
    const llm = requireLlm()
    const live = await activate()
    const { providers, models } = await catalog(llm)
    return { selection: selectionOf(live.model?.current?.()) ?? null, providers, models }
  }

  /** Refuse a pair this child cannot route before it reaches the live Session. */
  async function assertChoice(llm, selection) {
    let providers = []
    try { providers = llm.listProviders() } catch { modelUnavailable() }
    if (!providers.some((route) => route.id === selection.provider)) modelUnavailable()
    let advertised = []
    try { advertised = await llm.listModels(selection.provider) } catch { modelUnavailable() }
    if (!advertised.some((model) => model.id === selection.model)) modelUnavailable()
    let info
    try { info = await llm.resolveModelInfo(selection.provider, selection.model) } catch { info = undefined }
    if (selection.reasoningEffort !== undefined) {
      if (!effortsOf(info).some((effort) => effort.id === selection.reasoningEffort)) modelUnavailable()
    }
    // The prepared call must be the route the page chose: an adapter that silently substitutes
    // its default would change the next request without the user's choice.
    let prepared
    try { prepared = await llm.resolveCallConfig({ ...selection }) } catch { modelUnavailable() }
    if (prepared?.provider !== selection.provider || prepared?.model !== selection.model) modelUnavailable()
    if (selection.reasoningEffort !== undefined && prepared.reasoningEffort !== selection.reasoningEffort) modelUnavailable()
  }

  function selectModel(live, selection) {
    live.model.select(selection)
    publish({ type: 'model', selection })
  }

  async function setModel(body) {
    if (!isRecord(body)) invalid()
    const keys = Object.keys(body)
    const allowed = ['provider', 'model', 'reasoningEffort']
    if (keys.length < 2 || keys.length > allowed.length) invalid()
    if (keys.some((key) => !allowed.includes(key))) invalid()
    if (Object.hasOwn(body, 'reasoningEffort') && (typeof body.reasoningEffort !== 'string' || body.reasoningEffort === '')) invalid()
    const selection = selectionOf(body)
    if (selection === undefined) invalid()
    const llm = requireLlm()
    await assertChoice(llm, selection)
    const live = await activate()
    selectModel(live, selection)
    return { selection }
  }

  /**
   * Apply an already validated default selection to the live Session (T11's port). The admin
   * persisted it first, so a failure here is the admin result's sessionError, not a lost default.
   */
  function applyModel(value) {
    const selection = selectionOf(value)
    if (selection === undefined) throw new TypeError('fishball-native-chat: a model selection is required')
    return activate().then((live) => { selectModel(live, selection) })
  }

  /**
   * The reminder scheduler's activation owner (T10). A Session this chat does not own is
   * delegated to next(); Fishball's own is returned live or resumed here.
   */
  function resolveAgent(id, next) {
    if (typeof next !== 'function') throw new TypeError('fishball-native-chat: resolveAgent needs the delegation continuation')
    if (sessionId === undefined || id !== sessionId) return next()
    return activate()
  }

  async function chatRoute(request) {
    if (request.method === METHOD.get || request.method === METHOD.head) return page()
    if (request.method === METHOD.post) {
      if (!isRecord(request.body)) invalid()
      const keys = Object.keys(request.body)
      // Strict keys: a permission or preset name can never enter with a prompt (D8).
      if (keys.length === 0 || keys.some((key) => key !== 'text' && key !== 'attachments')) invalid()
      if (Object.hasOwn(request.body, 'text') && typeof request.body.text !== 'string') invalid()
      const attachments = request.body.attachments ?? []
      if (!Array.isArray(attachments)) invalid()
      if (attachments.length > LIMITS.attachmentsPerMessage) throw new ChatApiError(CHAT_ERROR.tooLarge, MESSAGE.tooLarge)
      const value = Object.hasOwn(request.body, 'text') ? request.body.text : ''
      if (value.trim() === '' && attachments.length === 0) invalid()
      return send(value, attachments)
    }
    throw new ChatApiError(CHAT_ERROR.method, MESSAGE.method)
  }

  async function modelRoute(request) {
    if (request.method === METHOD.get || request.method === METHOD.head) return modelPage()
    if (request.method === METHOD.post) return setModel(request.body)
    throw new ChatApiError(CHAT_ERROR.method, MESSAGE.method)
  }

  function failureOf(error) {
    if (error instanceof ChatApiError) {
      return { status: ERROR_STATUS[error.code] ?? HTTP.failed, body: { code: error.code, message: error.message } }
    }
    return { status: HTTP.failed, body: { code: CHAT_ERROR.failed, message: MESSAGE.failed } }
  }

  /** Serve one JSON route; the HTTP hook has already matched the path and read any body. */
  async function handle(route, request) {
    try {
      if (route === CHAT.path) return { status: HTTP.ok, body: await chatRoute(request ?? {}) }
      if (route === CHAT.modelPath) return { status: HTTP.ok, body: await modelRoute(request ?? {}) }
      return { status: HTTP.notFound, body: { code: CHAT_ERROR.invalid, message: MESSAGE.invalid } }
    } catch (error) {
      return failureOf(error)
    }
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('fishball-native-chat: a chat listener must be a function')
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  async function start() {
    if (started) return
    await readRecord()
    disposers.push(ctx.on('session/event', (session, event) => {
      if (closed || sessionId === undefined || session.id !== sessionId) return
      const entry = entryOfEvent(event, toolNames)
      if (entry !== undefined) publish({ type: 'entry', entry })
    }))
    disposers.push(ctx.on('agent/assistant-stream', (payload) => {
      if (closed || sessionId === undefined || payload?.agent?.id !== sessionId) return
      const frame = payload.frame
      if (frame?.type === 'chunk' && frame.chunk?.type === 'text-delta' && typeof frame.chunk.text === 'string' && frame.chunk.text !== '') {
        publish({ type: 'stream', text: frame.chunk.text })
      } else if (frame?.type === 'end') {
        publish({ type: 'stream-end' })
      }
    }))
    disposers.push(ctx.on('agent/status', (payload) => {
      if (closed || sessionId === undefined || payload?.agent?.id !== sessionId) return
      publish({ type: 'state', running: payload.status === 'running' })
    }))
    started = true
  }

  function close() {
    if (closed) return
    closed = true
    listeners.clear()
    for (const dispose of disposers.splice(0)) { try { dispose() } catch { /* the row is going away */ } }
  }

  return Object.freeze({
    start,
    close,
    service: Object.freeze({ resolveAgent, applyModel, deliverInbox, notify, recordCard }),
    handle,
    subscribe,
  })
}

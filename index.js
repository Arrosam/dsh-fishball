/**
 * Fishball's main-DSH row: the "body" (slim §12). Fishball itself runs in the isolated child DSH
 * (native-host.js, src/slim); this row holds what must stay in the main process because it
 * touches main sessions:
 * - src/store.js           durable state: managed sessions, watches, intake, pile, grants, preferences
 * - src/intake.js          every input for Fishball, durable, pushed to the child's inbox
 * - src/messaging.js       message_fishball (managed sessions) and the Hand over note
 * - src/managed.js         which sessions Fishball manages, their tools, Hand over / Take back
 * - src/session-titles.js  current titles of the managed sessions
 * - src/watches.js         "tell Fishball when finished": watches and their notices
 * - src/approvals.js       managed sessions' permission requests go to Fishball first
 * - src/request-desk.js    ask_fishball and list_user_messages (managed sessions only)
 * - src/passes.js          one-time passes and to-you tickets
 * - src/pile.js            the cards that went to you, answered in their session
 * - src/questions.js       managed sessions' questions and plan reviews go to Fishball
 * - src/own-questions.js   Fishball's own questions to you (the child's ask_user)
 * - src/grants.js          standing grants: calls they cover run without waking Fishball
 * - src/result-wording.js  what an agent reads after Fishball answered its direct call
 * - src/preferences.js     your display choices (the sidebar brand icon and entry)
 * - src/http.js            /api/fishball/* for the brand, the session-row marks and Hand over
 * The child reaches all of this only through `fishballSessionState` and the bridge
 * (src/slim/host/*). There is no in-process Fishball agent or session: the legacy one was removed,
 * because a second Fishball in the main process took every input the user meant for the child.
 */
import { Config, readLimits } from './src/config.js'
import { PLUGIN, ERROR, STATUS, SERVICE, API_CODE, WATCH_BY, CARD_END, PILE_SCOPE, FISHBALL } from './src/constants.js'
import { LifecycleStateError, diagnosticOf } from './src/errors.js'
import { StateFeed } from './src/state-feed.js'
import { Store } from './src/store.js'
import { IntakeError, IntakeLedger } from './src/intake.js'
import { registerInbound } from './src/messaging.js'
import { ManagedError, ManagedRegistry } from './src/managed.js'
import { SESSION_STATE } from './src/slim/host/session-port.js'
import { SessionTitles } from './src/session-titles.js'
import { Watches, WatchError } from './src/watches.js'
import { Preferences } from './src/preferences.js'
import { APPROVAL_TOOL, ApprovalBroker } from './src/approvals.js'
import { requestDeskTools } from './src/request-desk.js'
import { CallPasses } from './src/passes.js'
import { Pile } from './src/pile.js'
import { QUESTION_TOOL, QuestionRouter } from './src/questions.js'
import { OwnQuestions } from './src/own-questions.js'
import { GRANT_TOOL, Grants } from './src/grants.js'
import { ResultWording } from './src/result-wording.js'
import { byteLength, latestFirst } from './src/text.js'
import { registerRoutes } from './src/http.js'

export const name = PLUGIN.name
export { Config }

/** Services the row cannot work without; see SERVICE for why each is needed. */
export const inject = Object.values(SERVICE)

/** A command before the store has opened, or after it failed. */
const unavailable = () => Promise.reject(new LifecycleStateError(API_CODE.unavailable))

export async function apply(ctx, config) {
  const logger = ctx.logger(PLUGIN.logger)
  const limits = () => readLimits(config)
  const feed = new StateFeed((error) => logger.warn('state listener failed (%s)', diagnosticOf(error)))
  /** The row is live once its store is open; it never waits on the child (the bridge reports that). */
  let status = { status: STATUS.live, error: null }
  let views = {}
  const snapshot = () => ({ ...status, sessionId: FISHBALL.sessionId, limits: limits(), ...Object.fromEntries(Object.entries(views).map(([key, view]) => [key, view()])) })
  const publish = () => feed.publish(snapshot())
  const commands = { send: unavailable, setManaged: unavailable, answerRequest: unavailable, setQuestionMode: unavailable, setBrandStyle: unavailable, setSidebarEntry: unavailable }
  registerRoutes(ctx, {
    snapshot,
    subscribe: (listener) => feed.subscribe(listener),
    send: (input) => commands.send(input),
    setManaged: (input) => commands.setManaged(input),
    answerRequest: (input) => commands.answerRequest(input),
    setQuestionMode: (mode) => commands.setQuestionMode(mode),
    setBrandStyle: (style) => commands.setBrandStyle(style),
    setSidebarEntry: (entry) => commands.setSidebarEntry(entry),
  })

  let store
  try {
    store = await Store.open(ctx)
  } catch (error) {
    logger.warn('store could not be opened (%s)', diagnosticOf(error))
    status = { status: STATUS.failed, error: { code: ERROR.storeUnreadable } }
    publish()
    return
  }
  // Your display choices need only the store, so they are wired before anything that can fail (B4).
  const preferences = new Preferences(store, { onChange: () => publish() })
  views.preferences = () => preferences.snapshot()
  commands.setBrandStyle = (style) => preferences.setBrandStyle(style)
  commands.setSidebarEntry = (entry) => preferences.setSidebarEntry(entry)

  const logged = (label) => (error) => logger.warn('%s failed (%s)', label, diagnosticOf(error))
  const assistantId = () => FISHBALL.sessionId
  /**
   * Whether the child's bridge is connected. The child, not anything in this process, answers
   * managed sessions' permission requests and questions (§5.2): the provider below flips this from
   * the bridge's own ready/close edges, and requests waiting for Fishball go to you when it drops.
   */
  let bridgeReady = false
  const isLive = () => bridgeReady
  /** Created below: the bridge reads their live state and reuses their tool bodies (T09). */
  let broker
  let questions
  let grants
  const bridgeTools = new Map()
  const ledger = new IntakeLedger(store, logger, { readLimits: limits, onChange: () => publish() })
  // Watches (DESIGN §5c): set up by you, by Fishball, or by another agent for its own session.
  const watches = new Watches(ctx, store, logger, { ledger, readLimits: limits, assistantId, onChange: () => publish() })
  /** A watch for a tool result: { watch } or { watchError } (the message itself still went out). */
  const watchFor = async (sessionId, by, since) => {
    try { return { watch: await watches.add({ sessionId, by, since }) } } catch (error) {
      if (error instanceof WatchError) return { watchError: error.code }
      throw error
    }
  }
  /** Managed sessions (revision 11, §5e); created below, once message_fishball's definition exists. */
  let managedRegistry
  const manage = (sessionId, by) => managedRegistry.manage(sessionId, by)
  const isManaged = (sessionId) => managedRegistry.isManaged(sessionId)
  const inbound = registerInbound({ ctx, ledger, readLimits: limits, assistantId, isLive, watch: watchFor, isManaged, manage })
  /** ask_fishball and list_user_messages; created with the broker below. */
  let deskTools = []
  /** What a managed agent has: message_fishball, ask_fishball and list_user_messages (rev11a, rev11b). */
  const managedTools = () => [inbound.tool, ...deskTools]
  // Managed sessions are listed by title in the marks and the bridge: titles followed while they are managed.
  const sessionTitles = new SessionTitles(ctx, { onChange: () => publish() })
  const followManaged = () => sessionTitles.follow(managedRegistry.snapshot().map((entry) => entry.sessionId))
  managedRegistry = new ManagedRegistry(ctx, store, logger, {
    ledger, readLimits: limits, assistantId, onChange: () => { followManaged(); publish() }, managedTools,
    // Waiting requests of a session taken back or released go to you, and its grants end (§5e);
    // the broker and the grants exist below.
    onLeave: (sessionId, change) => {
      broker.releaseSession(sessionId)
      questions.releaseSession(sessionId)
      void grants.endSession(sessionId, change).catch(logged('grants end'))
    },
  })
  // release_session's body is the bridge's session.release (src/slim/host/session-port.js).
  managedRegistry.registerTools((definition) => { bridgeTools.set(definition.name, definition) })
  followManaged()
  views.managed = () => managedRegistry.snapshot().map((entry) => ({ ...entry, title: sessionTitles.get(entry.sessionId) }))
  views.intake = () => ledger.snapshot()

  // Cards that went to you (rev11c, §7a.6, §9), kept in the plugin's store so a card you still had
  // is rebuilt at the next start (T08; src/pile.js explains why a rebuilt card is then closed). A
  // card that leaves without your answer reaches the child through the broker's closure event.
  const pile = new Pile(() => publish(), (card, end) => broker.cardClosed(card, end), { stored: store.pile, scope: PILE_SCOPE.approvals, logger })
  // Fishball's own questions have their own pile (§15 T09): no deadline, closure through the broker.
  const ownPile = new Pile(() => publish(), (card, end) => broker.cardClosed(card, end), { stored: store.pile, scope: PILE_SCOPE.ownQuestions, logger })
  const ownQuestions = new OwnQuestions(ownPile, { readLimits: limits })
  ownQuestions.restore()
  // Standing grants (rev11d, §7a.8): paused while the child is not connected.
  grants = new Grants(store, logger, { readLimits: limits, isPaused: () => !bridgeReady, onChange: () => publish(), isManaged })
  ctx.effect(() => () => grants.stop(), 'fishball: grant expiry timer')
  // Managed sessions' permission requests go to Fishball first (DESIGN §7a).
  broker = new ApprovalBroker(ctx, store, logger, {
    ledger, readLimits: limits, assistantId, isLive, onChange: () => publish(), isManaged,
    passes: new CallPasses(),
    // The one post-execute listener that sets Fishball's wording (spike S35).
    wording: new ResultWording(ctx),
    pile,
    grants,
    // answer_prompt makes the prompt's session managed (the fifth way in, rev11e §7a.9).
    manage,
  })
  // Managed sessions' questions and plan reviews go to Fishball (rev11g, §7a.10); yours stay in their chat.
  questions = new QuestionRouter(ctx, store, logger, {
    ledger, readLimits: limits, assistantId, onChange: () => publish(), canAnswer: isLive, isManaged,
    managedIds: () => managedRegistry.snapshot().map((entry) => entry.sessionId),
  })
  // The bridge runs the same tool bodies through the provider below: the allowance, grant and
  // question rules are not written a second time, and a refusal keeps today's code.
  const capture = (definition) => { bridgeTools.set(definition.name, definition) }
  broker.registerTools(capture)
  questions.registerTools(capture)
  grants.registerTools(capture)
  views.questionMode = () => questions.mode()
  deskTools = requestDeskTools({ ctx, broker, readLimits: limits })
  // Managed agents already live get the two tools now that they exist.
  managedRegistry.sync()
  // Cards from managed sessions, whose titles are followed (session-titles.js); the ask_fishball
  // row and the needs-action dot read them. Text, never markup (§10e). Newest first (Reading).
  views.pile = () => [...pile.cards(), ...questions.cards(), ...ownPile.cards()].map((card) => ({ ...card, title: card.title ?? sessionTitles.get(card.sessionId) })).sort((a, b) => latestFirst(a.since, b.since))
  // Your Allow once / Reject in the asking session's ask_fishball row (§10e): 409 expired once the
  // card left; a note over maxMessageBytes is refused.
  commands.answerRequest = async ({ requestId, decision, note }) => {
    if (note !== undefined && byteLength(note) > limits().maxMessageBytes) throw new LifecycleStateError(API_CODE.tooLarge)
    if (!broker.answerCard({ requestId, decision, note })) throw new LifecycleStateError(API_CODE.expired)
  }
  commands.setQuestionMode = (mode) => questions.setMode(mode)
  // When this row unloads nothing can answer: waiting requests go to you at once (P7 review M1).
  ctx.effect(() => () => { broker.releaseAll(); questions.releaseAll() }, 'fishball: release permission requests and questions')
  const asApiError = (ErrorClass) => async (task) => {
    try { return await task() } catch (error) {
      if (error instanceof ErrorClass) throw new LifecycleStateError(error.code)
      throw error
    }
  }
  // Hand over with a note, and Hand over / Take back (§8.3, §10e). Neither needs the child to be
  // up: the note waits in the ledger and reaches the child when it connects (§5.2 "Inbox").
  commands.send = ({ sessionId, note }) => asApiError(IntakeError)(() => inbound.forward(sessionId, note))
  commands.setManaged = ({ sessionId, managed }) => asApiError(ManagedError)(() => (managed ? managedRegistry.handOver(sessionId) : managedRegistry.takeBack(sessionId)))
  // Sessions DSH no longer finds leave the registry (§9), and their grants end. Grants that ended
  // while DSH was down end now (§11 "Restart").
  void managedRegistry.prune().catch(logged('managed sessions check'))
  void grants.reconcile().catch(logged('grants check'))

  /** The list_frozen_sessions body plus the session title the contract's prompt summary carries. */
  const captured = async (toolName, args) => {
    const definition = bridgeTools.get(toolName)
    if (definition === undefined) return { ok: false, code: API_CODE.unavailable }
    return definition.execute(args)
  }
  const listPrompts = async () => {
    const result = await captured(APPROVAL_TOOL.listPrompts, {})
    if (result?.ok !== true) return result
    return { ...result, prompts: result.prompts.map((prompt) => ({ ...prompt, title: sessionTitles.get(prompt.session_id) ?? '' })) }
  }
  const withTitle = (descriptor, sessionId) => ({ ...descriptor, title: sessionTitles.get(sessionId) ?? '' })
  /** T08: cards rebuilt from the store are closed on the child's first connection, once. */
  let restoredCardsClosed = false
  /** The child is connected: what waited for it is settled now (T08, rev11g "Restart", §5c catch-up). */
  const onConnected = () => {
    // Cards rebuilt from the store are detached: DSH ended the turn each waited on at the restart,
    // so none can be answered (src/pile.js). Closed once the child can show why.
    if (!restoredCardsClosed) {
      restoredCardsClosed = true
      pile.settleWhere((card) => card.restored === true, { end: CARD_END.restarted })
    }
    void questions.rebuild().catch(logged('continued questions'))
    void watches.catchUp().catch(logged('watch catch-up'))
  }
  // The session bridge adapts these registries instead of duplicating them (§5.2). Provided as an
  // effect, so turning the row off removes it and the bridge answers feature-off.
  ctx.effect(() => ctx.provide(SESSION_STATE.service, Object.freeze({
    assistantId,
    managedIds: () => managedRegistry.snapshot().map((entry) => entry.sessionId),
    isManaged: (sessionId) => managedRegistry.isManaged(sessionId),
    isFishball: (sessionId) => sessionId === assistantId(),
    manage: (sessionId, by) => managedRegistry.manage(sessionId, by),
    release: (sessionId, reason) => managedRegistry.release(sessionId, reason),
    watch: (input) => watches.add({ ...input, by: { kind: WATCH_BY.assistant } }),
    watches: () => watches.snapshot().watches,
    unwatch: (watchId) => watches.remove(watchId),
    bridgeReady: (ready) => {
      const was = bridgeReady
      bridgeReady = ready === true
      // The child can no longer answer: what waits for Fishball goes to you at once.
      if (was && !bridgeReady) { broker.releaseAll(); questions.releaseAll() }
      if (!was && bridgeReady) onConnected()
      publish()
    },
    // Every input waiting in the ledger goes to the child that just connected (§5.2 "Inbox").
    attachInbox: (push) => ledger.attach(push),
    liveApprovals: (sessionId) => broker.liveOffers(sessionId).map((descriptor) => withTitle(descriptor, sessionId)),
    answerApproval: (input) => captured(APPROVAL_TOOL.answer, input),
    liveQuestions: (sessionId) => questions.liveQuestions(sessionId).map((descriptor) => withTitle(descriptor, sessionId)),
    answerQuestion: (input) => captured(QUESTION_TOOL.answer, input),
    questionSession: (questionId) => questions.questionSession(questionId),
    // T09's own question: the child files the card and reads its id.
    askQuestion: (input) => ownQuestions.ask(input),
    answerOwnQuestion: (input) => {
      const refusal = ownQuestions.answerCard(input)
      return refusal === undefined ? { ok: true } : { ok: false, code: refusal.code, ...(refusal.reason === undefined ? {} : { reason: refusal.reason }) }
    },
    listPrompts,
    answerPrompt: (input) => captured(APPROVAL_TOOL.answerPrompt, input),
    listGrants: () => grants.snapshot(),
    revokeGrant: (input) => captured(GRANT_TOOL.revoke, input),
    subscribe: (listener) => {
      // A live event's descriptor carries the envelope's session, not its own id; the label view
      // and the child card both need the session title, so it is attached once here.
      const wrapped = (event) => {
        if (event?.type === 'offered' && event.descriptor !== undefined) listener({ ...event, descriptor: withTitle(event.descriptor, event.sessionId) })
        else listener(event)
      }
      const offBroker = broker.subscribe(wrapped)
      const offQuestions = questions.subscribe(wrapped)
      const offOwn = ownQuestions.subscribe(wrapped)
      return () => { offBroker(); offQuestions(); offOwn() }
    },
  })), 'fishball: native session state')
  publish()
}

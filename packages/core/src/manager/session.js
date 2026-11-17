/**
 * The one Fishball manager session (V3 F-WIRE; was the V2 child chat, src/slim/child/chat.js).
 *
 * This module owns that Session end to end; it serves no route and relays no event:
 * - one durable record under the profile's DSH home (`<home>/fishball/chat.json`) names the
 *   Session, so a restart resumes the same conversation instead of starting a second one;
 * - the Session is created read-only with approval policy "ask" (8.4, D8);
 * - every activation (create or resume) also tries to make the Session a member of the workspace
 *   over its own folder (user decision 7.A): native ui-conversation keeps a blank session's
 *   composer inert until its workspace resolves. Only the page path requires the attach
 *   (activateAttached); background activations (activate) log a failed attach and proceed;
 * - resolveAgent is the activation owner the reminder scheduler needs: after a restart only this
 *   module can resume Fishball's Session;
 * - the model is core's own Fishball setting when it is routable in this DSH, else DSH's default
 *   (the user's decision "所有版本：先用DSH的默认模型"); nothing else chooses Fishball's model.
 */
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { applyPersona } from './persona.js'
import { emitIsolated, subscribe } from '../link/listeners.js'

const MANAGER_SESSION = Object.freeze({
  /** The one sandbox and approval policy Fishball's session is hard-wired to (8.4, D8). */
  policy: Object.freeze({ sandbox: 'read-only', approval: 'ask' }),
  /** The legacy Fishball session-id prefix, kept so the log is recognisable beside older ones. */
  sessionPrefix: 'session-fishball-',
  /** The durable record and the session's own folder, both under `<home>/fishball/`. */
  record: Object.freeze({ directory: 'fishball', file: 'chat.json', cwd: 'assistant', tempSuffix: '.tmp', encoding: 'utf8' }),
  limits: Object.freeze({
    // A writer that still holds the log (a restart racing the old process) is waited for briefly,
    // as the legacy lifecycle does: 4 attempts 200 ms apart.
    resumeAttempts: 4,
    resumeRetryMs: 200,
    directoryMode: 0o700,
    recordFileMode: 0o600,
    // The record holds one session id; anything larger is not ours.
    recordChars: 4096,
    // Bounds the unexpected-error detail a failed workspace attach or model apply logs.
    detailChars: 300,
  }),
  services: Object.freeze({
    agents: 'agents',
    profileContext: 'profileContext',
    defaultModel: 'agentDefaultModel',
    agentPresets: 'agentPresets',
    llm: 'llm',
    // dsh-workspace's registry, composed by the dsh-web-app bundle in both SDKs.
    workspaceRegistry: 'workspaceRegistry',
  }),
  logger: 'fishball-manager-session',
  writerHeld: 'SessionAlreadyOwnedError',
  /** dsh-session-persistence's refusal for an id with no durable log (both SDKs). */
  logMissing: 'SessionPersistenceNotFoundError',
  missingFile: 'ENOENT',
  /** The durable model-selection event and request header DSH records for a Session. */
  modelEvent: Object.freeze({ selection: 'model/selection', header: 'request/header' }),
  /** Typed refusals of the activation entries; the session route maps any refusal to 503. */
  error: Object.freeze({ unavailable: 'chat-unavailable', session: 'chat-session' }),
  /** The one log code for a Fishball model setting this DSH cannot route (never the setting's text). */
  modelUnroutable: 'model-unavailable',
  unknownErrorName: 'Error',
  ellipsis: '…',
  /** Background log lines (printf format); never a setting's text, a token or a message. */
  log: Object.freeze({
    modelUnroutable: 'Fishball\'s model setting is not routable here; DSH\'s default is used (%s)',
    settingUnreadable: 'Fishball\'s model setting could not be read (%s)',
    recordUnreadable: 'the manager session record could not be read (%s)',
    recordTooLarge: 'the manager session record is too large; it is ignored',
    recordNotJson: 'the manager session record is not JSON; it is ignored',
    recordNoSession: 'the manager session record names no session; it is ignored',
    resumeFailed: 'Fishball session %s could not be resumed (%s)',
    recreated: 'Fishball session %s has no log; it is created again under the same id',
    storedElsewhere: 'Fishball session %s is stored under another folder (moved home); it stays outside the current folder\'s workspace',
    workspaceFailed: 'Fishball session %s could not join its workspace (%s: %s)',
    modelFailed: 'Fishball session %s could not apply its model (%s: %s)',
  }),
  message: Object.freeze({
    prefix: 'fishball manager session: ',
    context: 'a Cordis context with get() is required',
    home: 'the profile home is required',
    options: 'setup, published and model functions are required',
    next: 'resolveAgent needs the delegation continuation',
    unavailable: 'Fishball\'s manager session is not available.',
    session: 'Fishball could not open its session.',
    // Log-only diagnostic.
    noWorkspaces: 'the workspace registry is not composed',
  }),
})

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A typed activation refusal; `code` is one of MANAGER_SESSION.error. */
export class ManagerSessionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ManagerSessionError'
    this.code = code
  }
}

function unavailable() { throw new ManagerSessionError(MANAGER_SESSION.error.unavailable, MANAGER_SESSION.message.unavailable) }
function sessionFailed() { throw new ManagerSessionError(MANAGER_SESSION.error.session, MANAGER_SESSION.message.session) }
function usage(message) { return new TypeError(MANAGER_SESSION.message.prefix + message) }

/** Clamp by code point so a surrogate pair is never cut in half. */
function clamp(value, max) {
  const characters = Array.from(value)
  return characters.length <= max ? value : characters.slice(0, max).join('') + MANAGER_SESSION.ellipsis
}

function effortsOf(info) {
  const efforts = info?.reasoning?.efforts
  if (!Array.isArray(efforts)) return []
  return efforts.filter((effort) => typeof effort?.id === 'string' && effort.id !== '')
}

function selectionOf(value) {
  if (!isRecord(value)) return undefined
  const { provider, model, reasoningEffort } = value
  if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') return undefined
  return { provider, model, ...(typeof reasoningEffort === 'string' && reasoningEffort !== '' ? { reasoningEffort } : {}) }
}

function sameSelection(a, b) {
  return a?.provider === b?.provider && a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort
}

/**
 * The last model choice DSH recorded in this Session's log, or undefined. 0.2.1 has no
 * Agent-owned selector, so a restart restores the choice from the same durable events the 0.2.2
 * AgentModel reads through its projection.
 */
function recordedSelection(live) {
  let selection
  for (const event of live.session.snapshotEvents()) {
    if (event.type === MANAGER_SESSION.modelEvent.selection) selection = selectionOf(event.data)
    else if (event.type === MANAGER_SESSION.modelEvent.header) selection = selectionOf(event.data?.header?.config) ?? selection
  }
  return selection
}

/** The diagnosable part of an unexpected failure: name, code and message only, never request data. */
function failureDetail(error) {
  const name = typeof error?.name === 'string' && error.name !== '' ? error.name : MANAGER_SESSION.unknownErrorName
  const message = typeof error?.message === 'string' ? error.message : String(error)
  const code = typeof error?.code === 'string' && error.code !== '' ? error.code : undefined
  return { name, ...(code === undefined ? {} : { code }), message: clamp(message, MANAGER_SESSION.limits.detailChars) }
}

/**
 * Create the Fishball manager session over one row context.
 *
 * @param {object} ctx - the owning row's Cordis context. `ctx.get` reads agents, profileContext,
 *   agentDefaultModel, llm and workspaceRegistry when used, so a row that loads later is picked up.
 * @param {object} options
 * @param {(agentCtx: object, live: object) => (void|Promise<void>)} options.setup - composition
 *   in the agent's own scope, after the persona, on create and on every resume.
 * @param {(live: object) => Promise<void>} options.published - awaited once the session is opened
 *   and composed; recovery that may drive the agent belongs here, never in setup.
 * @param {() => ({provider: string, model: string, reasoningEffort?: string}|undefined)} options.model
 *   - core's own Fishball model setting, or undefined when unset.
 * @param {object} [options.logger] - defaults to `ctx.logger(MANAGER_SESSION.logger)`.
 * @returns {Readonly<{start(): Promise<void>, close(): void, activate(): Promise<object>,
 *   activateAttached(): Promise<object>, sessionId(): string|undefined,
 *   onChange(fn: (sessionId: string|undefined) => void): () => void,
 *   resolveAgent(id: string, next: Function): any, applyModel(): Promise<void>}>}
 *   start reads the durable record (never creates a Session by itself); activate and
 *   activateAttached reject with ManagerSessionError.
 */
export function createManagerSession(ctx, options) {
  if (!ctx || typeof ctx.get !== 'function') throw usage(MANAGER_SESSION.message.context)
  const { setup, published, model } = options ?? {}
  if (typeof setup !== 'function' || typeof published !== 'function' || typeof model !== 'function') {
    throw usage(MANAGER_SESSION.message.options)
  }
  const profile = ctx.get(MANAGER_SESSION.services.profileContext)
  if (typeof profile?.home !== 'string' || !path.isAbsolute(profile.home)) throw usage(MANAGER_SESSION.message.home)
  const logger = options.logger ?? (typeof ctx.logger === 'function' ? ctx.logger(MANAGER_SESSION.logger) : undefined)
  const { limits, services } = MANAGER_SESSION
  const directory = path.join(profile.home, MANAGER_SESSION.record.directory)
  const recordPath = path.join(directory, MANAGER_SESSION.record.file)
  const cwd = path.join(directory, MANAGER_SESSION.record.cwd)
  const listeners = new Set()
  // Distinct unroutable settings already logged, so a setting is reported once, not per activation.
  const reported = new Set()
  let sessionId
  // The live agent this module composed and published. Publication does not wait for the workspace
  // attach: notices refuse an unpublished manager (manager-not-ready), and background work must
  // not stop on a workspace problem (Fishball's decision, 2026-11-11).
  let agent
  // The live agent whose workspace attach finished, and the one attempt in flight (attach()).
  let attached
  let attaching
  let activation
  // The sessionId() value listeners last heard, so they hear each change exactly once.
  let announced
  // The newest read of the model setting, `{read, promise}`: a validation overtaken by a newer read
  // never applies its older choice (R-FIX F06: last write wins).
  let modelReads = 0
  let latestRead
  let started = false
  let closed = false

  /**
   * X1 (manager.sessionId(), GET api/fishball/session) names the manager only once it is
   * published and attached. The page opens with GET and POSTs only on null, so a manager that a
   * background activation left unattached must read as absent: that is what makes the page's
   * next open (or Retry) POST and retry the attach. Consequence: manager tools that authenticate
   * against X1 refuse during a turn queued while the attach is failing.
   */
  function managerId() {
    return agent !== undefined && attached === agent ? agent.id : undefined
  }

  /** Every assignment of `agent` or `attached` ends here: listeners hear a changed managerId() once. */
  function announce() {
    const id = managerId()
    if (id === announced) return
    announced = id
    emitIsolated(listeners, id)
  }

  function requireAgents() {
    const agents = ctx.get(services.agents)
    if (agents === undefined) unavailable()
    return agents
  }

  function defaultSelection() {
    return selectionOf(ctx.get(services.defaultModel)?.currentSelection?.())
  }

  /**
   * Whether this DSH routes `selection` exactly: provider listed, model listed, effort advertised
   * when given, and the prepared call is the same route (an adapter that silently substitutes its
   * default would change Fishball's model without the setting). Any failure reads as not routable.
   */
  async function routable(selection) {
    const llm = ctx.get(services.llm)
    if (llm === undefined) return false
    try {
      if (!llm.listProviders().some((route) => route.id === selection.provider)) return false
      if (!(await llm.listModels(selection.provider)).some((entry) => entry.id === selection.model)) return false
      if (selection.reasoningEffort !== undefined) {
        let info
        try { info = await llm.resolveModelInfo(selection.provider, selection.model) } catch { info = undefined }
        if (!effortsOf(info).some((effort) => effort.id === selection.reasoningEffort)) return false
      }
      const prepared = await llm.resolveCallConfig({ ...selection })
      return prepared?.provider === selection.provider && prepared?.model === selection.model
        && (selection.reasoningEffort === undefined || prepared.reasoningEffort === selection.reasoningEffort)
    } catch {
      return false
    }
  }

  function reportUnroutable(selection) {
    const key = JSON.stringify([selection.provider, selection.model, selection.reasoningEffort ?? null])
    if (reported.has(key)) return
    reported.add(key)
    logger?.warn(MANAGER_SESSION.log.modelUnroutable, MANAGER_SESSION.modelUnroutable)
  }

  /**
   * Core's setting when it is routable here, else `undefined`: DSH's own default then applies, as it
   * does for any session that selects nothing, and follows a later change of that default. An unset
   * or unreadable setting is not an error.
   */
  async function chosenSelection() {
    let chosen
    // A failing settings read must not block the session either: it reads as unset.
    try { chosen = selectionOf(model()) } catch (error) { logger?.warn(MANAGER_SESSION.log.settingUnreadable, failureDetail(error).name) }
    if (chosen === undefined) return undefined
    if (await routable(chosen)) return chosen
    reportUnroutable(chosen)
    return undefined
  }

  /**
   * The routable setting (`chosen`) and the selection the live manager should run on (`selection`:
   * `chosen`, or DSH's current default when the setting is unset or unroutable; a session that once
   * ran on the setting goes back to the default when the setting is cleared; `undefined` when DSH
   * reports no default), for the newest setting. Routability is asynchronous, so the setting may
   * change while it is checked: an answer overtaken by a newer read is not used, and that newer
   * read's own promise is awaited instead. No caller starts another read for being overtaken, so
   * overlapping callers never leapfrog each other: each read is started by one caller only.
   * @param {Promise<object>} [start] a read already begun (`readSelection`); by default a new one
   */
  async function latestSelection(start = readSelection()) {
    let answer = await start
    while (answer.read !== latestRead.read) answer = await latestRead.promise
    return answer
  }

  /** Begins one read of the setting and its routability; it becomes the newest read. */
  function readSelection() {
    const read = ++modelReads
    const promise = chosenSelection().then((chosen) => ({ read, chosen, selection: chosen ?? defaultSelection() }))
    latestRead = { read, promise }
    return promise
  }

  function agentOptions(selection) {
    return selection === undefined ? {} : { ...selection }
  }

  /**
   * Write the record before the Session exists, as the legacy lifecycle does: a crash between
   * the two must not make the next start create a second Session.
   */
  async function record(id) {
    await mkdir(directory, { recursive: true, mode: limits.directoryMode })
    const temp = recordPath + MANAGER_SESSION.record.tempSuffix
    await writeFile(temp, JSON.stringify({ sessionId: id }) + '\n', { mode: limits.recordFileMode })
    await rename(temp, recordPath)
    sessionId = id
  }

  async function readRecord() {
    let raw
    try {
      raw = await readFile(recordPath, MANAGER_SESSION.record.encoding)
    } catch (error) {
      if (error?.code === MANAGER_SESSION.missingFile) return
      logger?.warn(MANAGER_SESSION.log.recordUnreadable, String(error?.code ?? error))
      return
    }
    if (raw.length > limits.recordChars) {
      logger?.warn(MANAGER_SESSION.log.recordTooLarge)
      return
    }
    let parsed
    try { parsed = JSON.parse(raw) } catch { logger?.warn(MANAGER_SESSION.log.recordNotJson); return }
    if (!isRecord(parsed) || typeof parsed.sessionId !== 'string' || parsed.sessionId === '') {
      logger?.warn(MANAGER_SESSION.log.recordNoSession)
      return
    }
    sessionId = parsed.sessionId
  }

  /** Fishball's persona in the agent's own scope, then the caller's setup, on create and on every resume. */
  /**
   * The manager's composition, on create and on every resume: core's own agent preset first (the
   * registry's default, `fishball`, which core's patch sets: its tools are the manager's read-only
   * ones, R-FB-02, R-FB-13), mounted the way DSH's own session controller mounts a session's preset
   * (dsh-api-session-controller `composeAgent`, both SDKs); then the persona; then the contributions.
   * A DSH without the preset registry composes no preset, as DSH's controller does.
   */
  async function composePersona(agentCtx, live) {
    await ctx.get(services.agentPresets)?.mount(agentCtx, presetId)
    await composeOwn(agentCtx, live)
  }

  /**
   * The persona and the contributions alone: what an already composed and published agent gets (a
   * manager session another owner, such as DSH's controller, resumed first). The preset registry's
   * `mount` is for an unpublished agent only, so it is never called on one; that agent keeps the
   * preset it was composed with.
   */
  async function composeOwn(agentCtx, live) {
    applyPersona(agentCtx.systemPrompt)
    await setup(agentCtx, live)
  }

  /**
   * The preset the manager runs on: the registry's default (core's patch makes it `fishball`),
   * resolved once per activation as DSH's controller does, so the create records it in the
   * Session's header (`meta.agentPreset`) and DSH reports it (`presetForSession`) like any session's.
   */
  let presetId
  async function resolvePreset() {
    presetId = (await ctx.get(services.agentPresets)?.resolve())?.id
  }

  /**
   * Compose a new Session's world before publication (8.4): read-only and approval "ask", then
   * its persona. A resume uses composePersona only, because the persisted session already holds
   * both policies; appending them again on every restart would grow the log.
   */
  function configure(agentCtx, live) {
    setSandboxMode(live.session, MANAGER_SESSION.policy.sandbox)
    setApprovalPolicy(live.session, MANAGER_SESSION.policy.approval)
    return composePersona(agentCtx, live)
  }

  function ensureFolder() {
    return mkdir(cwd, { recursive: true, mode: limits.directoryMode })
  }

  async function createSession(agents, selection) {
    const id = MANAGER_SESSION.sessionPrefix + randomUUID()
    await record(id)
    return createWithId(agents, id, selection)
  }

  /** Create the Session the record names (the record is written already). */
  async function createWithId(agents, id, selection) {
    await ensureFolder()
    const handle = await agents.create({
      sessionId: id, meta: { cwd, ...(presetId === undefined ? {} : { agentPreset: presetId }) }, agentOptions: agentOptions(selection), setup: configure,
    })
    return handle.agent
  }

  async function resumeSession(agents, id, selection) {
    for (let attempt = 1; ; attempt++) {
      try {
        return (await agents.resume({ resumeSessionId: id, agentOptions: agentOptions(selection), setup: composePersona })).agent
      } catch (error) {
        const live = agents.get(id)
        if (live !== undefined) return live
        // The record names a Session with no log: its first create failed before DSH made it, or
        // the log was removed. It is created under the same id, as DSH's own restore-or-create
        // does (dsh-agent-loop, both SDKs), so the manager is not unavailable for good (R-FIX F05,
        // the user's decision 2026-11-18). Only that refusal creates: it proves there is no log.
        if (error?.name === MANAGER_SESSION.logMissing) {
          logger?.warn(MANAGER_SESSION.log.recreated, id)
          return createWithId(agents, id, selection)
        }
        // A start while another writer still holds the log waits briefly, exactly as the legacy
        // lifecycle does; every other refusal is reported, never replaced by a silently created
        // second Session.
        const held = error?.name === MANAGER_SESSION.writerHeld
        if (!held || attempt >= limits.resumeAttempts) {
          logger?.warn(MANAGER_SESSION.log.resumeFailed, id, String(error?.code ?? error?.name ?? error))
          sessionFailed()
        }
        await new Promise((resolve) => setTimeout(resolve, limits.resumeRetryMs))
      }
    }
  }

  /**
   * Whether the Session is stored under another folder than the current
   * `<home>/fishball/assistant`: a moved or renamed home leaves its header naming the old path,
   * which may no longer resolve. DSH has no public call that changes a Session's cwd (the header
   * is frozen creation metadata; resume takes no cwd), and dsh-workspace's attachSession refuses
   * a cwd that does not resolve to the workspace path, so such a Session can never become a
   * member of the current folder's workspace. A stored folder that does not resolve for any
   * reason (missing, untraversable, no longer a directory) is elsewhere: it cannot be the current
   * folder, which ensureFolder has just made resolvable, and attachSession would refuse it on
   * every attempt. A header without a cwd is not a relocation; attachSession reports it.
   */
  async function storedElsewhere(live) {
    const stored = live.session?.header?.cwd
    if (typeof stored !== 'string' || stored === '') return false
    let resolved
    try {
      resolved = await realpath(stored)
    } catch {
      return true
    }
    return resolved !== await realpath(cwd)
  }

  /**
   * Make the manager's Session a member of the workspace over its own folder (user decision
   * 7.A: the page opens straight into a blank, typable session). Native ui-conversation keeps
   * the empty-session composer inert until the session's workspace resolves a title, and
   * dsh-workspace adds members only through attachSession: its path-grouped bootstrap runs
   * once, at the profile's first boot, before this Session exists. Both public calls are
   * idempotent (create reuses the workspace of the same canonical path, attachSession resolves
   * without writing for an accounted id), so an existing manager that was never attached is
   * attached too. The folder is recreated first because both calls refuse a missing directory.
   * A moved home (storedElsewhere) still gets the workspace for the current folder, but no
   * membership: attachSession would refuse it on every attempt, which would turn a relocation
   * into a permanent page failure. It is logged and counts as done.
   * Rejects with the underlying error; the caller decides whether that blocks.
   */
  async function attachWorkspace(live) {
    const registry = ctx.get(services.workspaceRegistry)
    if (typeof registry?.create !== 'function') throw new TypeError(MANAGER_SESSION.message.noWorkspaces)
    await ensureFolder()
    const workspace = await registry.create(cwd)
    if (await storedElsewhere(live)) {
      logger?.warn(MANAGER_SESSION.log.storedElsewhere, live.id)
    } else {
      await workspace.attachSession(live.id)
    }
    attached = live
    announce()
  }

  /** One attach attempt per live agent at a time: concurrent activations share it. */
  function attach(live) {
    if (attached === live) return Promise.resolve()
    if (attaching?.live !== live) {
      const attempt = { live, promise: attachWorkspace(live).finally(() => { if (attaching === attempt) attaching = undefined }) }
      attaching = attempt
    }
    return attaching.promise
  }

  function attachFailed(live, error) {
    const detail = failureDetail(error)
    logger?.warn(MANAGER_SESSION.log.workspaceFailed, live.id, detail.name, detail.message)
  }

  /** The composed agent while DSH still holds it live, else undefined. */
  function liveAgent() {
    if (agent === undefined || sessionId === undefined) return undefined
    return ctx.get(services.agents)?.get?.(sessionId) === agent ? agent : undefined
  }

  /**
   * One current/select port over the Agent's real model API. 0.2.1 has no Agent.model; its
   * selection seam is installModelSelection over the Agent's scoped context. Keeping both
   * behind this port means callers never branch on the DSH version.
   */
  const legacyModels = new WeakMap()
  function modelPortOf(live) {
    if (typeof live.model?.select === 'function' && typeof live.model?.current === 'function') return live.model
    const installed = legacyModels.get(live)
    if (installed !== undefined) return installed
    const ref = { current: recordedSelection(live) ?? defaultSelection(), assembled: undefined }
    installModelSelection(live.ctx, ref)
    const port = {
      current: () => ref.current,
      select(selection) {
        live.session.append(MANAGER_SESSION.modelEvent.selection, selection)
        ref.current = selection
      },
    }
    legacyModels.set(live, port)
    return port
  }

  /**
   * Apply `selection` (the effective one) to `live`. Only a change is selected: on 0.2.1 every
   * select appends a model/selection event, so selecting an unchanged choice on each activation
   * would grow the log. Never rejects: a model problem is logged and must not block the session.
   */
  function syncModel(live, selection) {
    if (selection === undefined) return
    try {
      const port = modelPortOf(live)
      if (!sameSelection(selectionOf(port.current()), selection)) port.select(selection)
    } catch (error) {
      const detail = failureDetail(error)
      logger?.warn(MANAGER_SESSION.log.modelFailed, live.id, detail.name, detail.message)
    }
  }

  /**
   * Create or resume the Session, compose, apply the model and publish it. The model is applied
   * here too, not only through agentOptions: a resumed Session's log may record an older choice,
   * and it must run on the current setting before recovery can drive a turn. Publication does not
   * wait for the workspace attach (the activation entries below own it).
   */
  async function open() {
    if (closed) unavailable()
    const agents = requireAgents()
    // Read once per open: routability lists providers and models, and the resume retries and the
    // apply below must all use the same choice. Create and resume get the setting alone (none when
    // unset, so DSH applies its own default as for any session); the sync below then moves a session
    // that still runs on an earlier setting back to the default, and selects nothing when it already
    // runs on it (on 0.2.1 every select appends a log event).
    let read = await latestSelection()
    const { chosen } = read
    await resolvePreset()
    if (closed) unavailable()
    const existing = sessionId === undefined ? undefined : agents.get(sessionId)
    const live = existing ?? await (sessionId === undefined ? createSession(agents, chosen) : resumeSession(agents, sessionId, chosen))
    if (closed) unavailable()
    if (existing && agent !== existing) await composeOwn(existing.ctx, existing)
    if (closed) unavailable()
    // A read of the setting made while the Session opened (`applyModel`) is newer: the latest is
    // applied, never the choice this open started with.
    if (read.read !== latestRead.read) read = await latestSelection(latestRead.promise)
    if (closed) unavailable()
    syncModel(live, read.selection)
    agent = live
    announce()
    // The factory has now published the fully configured scope. Recovery may drive
    // the agent, so it must never run inside the composition-only setup callback.
    await published(live)
    return live
  }

  /** One preparation owner: concurrent activations share it. */
  function prepare() {
    const live = liveAgent()
    if (live !== undefined) return Promise.resolve(live)
    if (activation === undefined) {
      activation = open().finally(() => { activation = undefined })
    }
    return activation
  }

  /**
   * One workspace attach attempt, unless the manager is already attached; a failure is logged
   * and reported as false. A session closed during the attach reports itself unavailable, as
   * every other activation step does: the registry going away with it is not a workspace failure.
   */
  async function tryAttach(live) {
    let joined = true
    try {
      await attach(live)
    } catch (error) {
      if (closed) unavailable()
      attachFailed(live, error)
      joined = false
    }
    if (closed) unavailable()
    return joined
  }

  /**
   * The background activation (notices, reminders and their recovery): the Session is prepared
   * and one attach attempt is made, but a failed attach never stops the work (Fishball's
   * decision, 2026-11-11). The manager stays unattached, so X1 keeps reading absent and the
   * page's next open retries through activateAttached.
   */
  async function activate() {
    const live = await prepare()
    await tryAttach(live)
    return live
  }

  /**
   * The page activation (manager.ensureSession, POST api/fishball/session): the attach is
   * required, so a failure is the route's 503 and the page's Retry, and the next call tries
   * again. The manager is published either way, so notices and their recovery keep working
   * after a failed page open. Kept as its own entry rather than a flag on activate: the two
   * callers differ in failure policy only, and the steps are shared through tryAttach.
   */
  async function activateAttached() {
    const live = await prepare()
    if (!await tryAttach(live)) sessionFailed()
    return live
  }

  /**
   * Re-read the effective selection and apply it to the live agent, if one exists. Never
   * activates the Session: one not yet open gets the setting when it opens. Never rejects.
   */
  async function applyModel() {
    if (liveAgent() === undefined) {
      // No live manager to apply to. An open in flight read the setting before this change: a
      // newer read makes it apply the newest setting (`open`). Without one nothing is read.
      if (activation !== undefined) await latestSelection()
      return
    }
    const { selection } = await latestSelection()
    // The agent may have closed or been replaced while the catalog was read.
    const live = liveAgent()
    if (live !== undefined) syncModel(live, selection)
  }

  /**
   * The live manager's model as it runs now, or `undefined` with no live manager (it activates
   * nothing). The bridge façade's image gate reads it per call (the model can change between turns).
   */
  function currentModel() {
    const live = liveAgent()
    if (live === undefined) return undefined
    try { return selectionOf(modelPortOf(live).current()) } catch { return undefined }
  }

  /**
   * The reminder scheduler's activation owner. A Session this module does not own is
   * delegated to next(); Fishball's own is returned live or resumed here.
   */
  function resolveAgent(id, next) {
    if (typeof next !== 'function') throw usage(MANAGER_SESSION.message.next)
    if (sessionId === undefined || id !== sessionId) return next()
    return activate()
  }

  async function start() {
    if (started) return
    await readRecord()
    started = true
  }

  function close() {
    if (closed) return
    closed = true
    listeners.clear()
  }

  return Object.freeze({
    start,
    close,
    activate,
    activateAttached,
    sessionId: managerId,
    /** Calls `fn(sessionId)` after each change of sessionId(). Returns its disposer. A throwing listener affects no other. */
    onChange: (fn) => subscribe(listeners, fn),
    resolveAgent,
    applyModel,
    currentModel,
  })
}

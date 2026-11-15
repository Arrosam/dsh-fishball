/**
 * The isolated child's admin service (§9, §15 T11).
 *
 * The main settings page reads and changes the child's model, plugins and settings through the
 * admin relay (dsh-instance src/slim/host/admin.js). This module is the child half: it serves the admin wire
 * protocol (fishball-shared/admin-protocol) and applies every operation with the child's own
 * mounted DSH services.
 *
 * Rules kept here, because they are what makes the admin safe:
 * - The child is the only writer. Every operation uses the services of THIS process
 *   (`settings`, `pluginManager`, `llm`), so the target is always the child's profile: no
 *   request carries a profile, a path or a second identity, and nothing the main host sends can
 *   name the main profile or a file.
 * - Every mutation is revision-checked. Model and settings edits carry the DSH settings
 *   revision the page read and reach `settings.mutate(ns, ops, expectedRevision)`; plugin edits
 *   carry the inventory digest of the bundle list the page read. A stale request is refused
 *   with `stale-revision` before anything is written.
 * - Refusals are typed. Every operation answers `{ok:true,result}` or
 *   `{ok:false,error:{code}}`; a DSH refusal becomes one of ADMIN_ERROR's codes and an
 *   unexpected failure becomes `operation-failed`. Nothing throws into the page.
 * - No secret, path or URL crosses. Settings are described with `redactSecrets`, results carry
 *   package names, versions and codes only, and pnpm output is never forwarded (§11).
 *
 * The protocol is not in the connector contract because the frozen contract's twenty operations
 * are the session bridge's and §5.2 keeps the admin on the lifecycle channel. It lives in
 * fishball-shared (admin-protocol.js), which the main-side relay imports too, so both ends
 * validate one definition; this module binds it to the contract and re-exports it unchanged.
 */
import { createHash } from 'node:crypto'
import {
  ADMIN, ADMIN_APPLICATIONS, ADMIN_ERROR, ADMIN_LIMITS, ADMIN_OPERATION, ADMIN_OPERATIONS,
  AdminFailure, createAdminProtocol, refuse, refusal, refusalOf,
} from 'fishball-shared/admin-protocol'
import { DIGEST, STATUS, STATUS_CODES } from 'dsh-connector/contract'

export { ADMIN, ADMIN_ERROR, ADMIN_LIMITS, ADMIN_OPERATION, ADMIN_OPERATIONS, AdminFailure, refusal, refusalOf }
export const { validateRequest, validateResult, createAdminCodec } = createAdminProtocol({ DIGEST, STATUS, STATUS_CODES })

const HEX_ENCODING = 'hex'

/** DSH plugin-manager codes the admin passes through unchanged; the rest become plugin-failed. */
const PLUGIN_REFUSAL = new Set([
  ADMIN_ERROR.unknownPlugin, ADMIN_ERROR.invalidSpec, ADMIN_ERROR.alreadyInstalled,
  ADMIN_ERROR.ambiguousInstall, ADMIN_ERROR.notBundle, ADMIN_ERROR.notRemovable,
  ADMIN_ERROR.stopProfile, ADMIN_ERROR.bundleInUse, ADMIN_ERROR.incompatibleVersion,
  ADMIN_ERROR.unsupportedPlatform, ADMIN_ERROR.managementRequired, ADMIN_ERROR.unaddressable,
])

/** dsh-settings' own conflict code; its text carries no value the page may read (§11). */
const SETTINGS_CONFLICT = 'SETTINGS_CONFLICT'

/** dsh-base's row id for the default model selection. The child profile is base-only (§2.3). */
const MODEL_NAMESPACE = 'agent-default-model'

/** The child chat row's service name (T07); absent until that row mounts. */
const CHAT_SERVICE = 'fishballChat'

function digestOf(text) {
  return createHash(DIGEST.algorithm).update(text).digest(HEX_ENCODING)
}

/* ---------------------------------------------------------------- the applier */

/** The DSH service methods this module calls; a missing one is a wiring fault, not a refusal. */
const PORT_METHODS = Object.freeze({
  settings: Object.freeze(['describe', 'mutate']),
  plugins: Object.freeze(['listBundles', 'installBundle', 'removeBundle', 'setBundleEnabled']),
  llm: Object.freeze(['listProviders', 'listModels', 'resolveModelInfo', 'resolveCallConfig']),
})

function portOf(name, service) {
  for (const method of PORT_METHODS[name]) {
    if (typeof service?.[method] !== 'function') {
      throw new TypeError('fishball admin: the ' + name + ' port must implement ' + method)
    }
  }
  return service
}

/**
 * Create the child applier.
 *
 * @param {object} options
 * @param {object} options.settings - ctx.settings (SettingsForms): describe, mutate, writable.
 * @param {object} options.plugins - ctx.pluginManager: listBundles, installBundle, removeBundle,
 *   setBundleEnabled.
 * @param {object} options.llm - ctx.llm: listProviders, listModels, resolveModelInfo,
 *   resolveCallConfig.
 * @param {(selection: {provider: string, model: string, reasoningEffort?: string}) => Promise<void>}
 *   [options.applyModel] - applies an accepted selection to the child's live session so the next
 *   request uses it (§9); it resolves once the session took it and rejects when it could not.
 *   The T07 chat row owns that session and supplies this port. Without it the persisted default
 *   is the whole effect, and the next created agent uses the new model.
 * @param {() => ({provider: string, model: string, reasoningEffort?: string}|null)} [options.currentModel]
 *   - the live session's model when the T07 chat has one; `null` before activation. The page
 *   shows it beside a saved default the catalog no longer offers.
 * @returns {{handle: (operation: string, payload: object) => Promise<{ok: true, result: object}|{ok: false, error: object}>}}
 */
export function createAdminService(options) {
  const { settings, plugins, llm, applyModel, currentModel } = options ?? {}
  if (applyModel !== undefined && typeof applyModel !== 'function') {
    throw new TypeError('fishball admin: applyModel must be a function')
  }
  if (currentModel !== undefined && typeof currentModel !== 'function') {
    throw new TypeError('fishball admin: currentModel must be a function')
  }
  const ports = Object.freeze({
    settings: portOf('settings', settings),
    plugins: portOf('plugins', plugins),
    llm: portOf('llm', llm),
    applyModel,
    currentModel,
  })
  return Object.freeze({
    /**
     * Apply one validated request. The caller has already validated the payload with
     * validateRequest; every failure becomes a typed refusal.
     */
    async handle(operation, payload) {
      try {
        switch (operation) {
          case ADMIN_OPERATION.modelGet: return { ok: true, result: await modelSnapshot(ports) }
          case ADMIN_OPERATION.modelSet: return { ok: true, result: await setModel(ports, payload) }
          case ADMIN_OPERATION.pluginsGet: return { ok: true, result: await pluginsSnapshot(ports) }
          case ADMIN_OPERATION.pluginInstall: return { ok: true, result: await installPlugin(ports, payload) }
          case ADMIN_OPERATION.pluginRemove: return { ok: true, result: await removePlugin(ports, payload) }
          case ADMIN_OPERATION.pluginEnable: return { ok: true, result: await setPluginEnabled(ports, payload, true) }
          case ADMIN_OPERATION.pluginDisable: return { ok: true, result: await setPluginEnabled(ports, payload, false) }
          case ADMIN_OPERATION.settingsGet: return { ok: true, result: settingsSnapshot(ports) }
          case ADMIN_OPERATION.settingsMutate: return { ok: true, result: await mutateSettings(ports, payload) }
          default: return refusal(ADMIN_ERROR.operation)
        }
      } catch (error) {
        return refusalOf(error)
      }
    },
  })
}

/* ---------------------------------------------------------------- model */

function describe(settings) { return settings.describe({ redactSecrets: true }) }

function selectionOfValue(value) {
  if (!value || typeof value !== 'object') return undefined
  const { provider, model, reasoningEffort } = value
  if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') return undefined
  return { provider, model, ...(typeof reasoningEffort === 'string' && reasoningEffort !== '' ? { reasoningEffort } : {}) }
}

/**
 * The child's default model entry: the effective selection and the revision the page must send
 * back. Its absence is a typed refusal, never a guessed namespace.
 */
function modelEntry(settings) {
  const entry = describe(settings).find((candidate) => candidate.ns === MODEL_NAMESPACE)
  if (entry === undefined) refuse(ADMIN_ERROR.modelUnavailable)
  const selection = selectionOfValue(entry.value)
  if (selection === undefined) refuse(ADMIN_ERROR.modelUnavailable)
  return { entry, selection }
}

function reasoningEffortsOf(info) {
  const efforts = info?.reasoning?.efforts
  if (!Array.isArray(efforts)) return []
  return efforts.filter((effort) => typeof effort?.id === 'string' && effort.id !== '')
}

async function listedModels(llm, provider) {
  try { return await llm.listModels(provider) } catch { refuse(ADMIN_ERROR.modelUnavailable) }
}

async function resolvedModel(llm, provider, model) {
  try { return await llm.resolveModelInfo(provider, model) } catch { refuse(ADMIN_ERROR.modelUnavailable) }
}

/** One catalog entry; adapter metadata is best-effort, so a model without it stays selectable. */
async function describedModel(llm, provider, model) {
  const entry = {
    provider,
    id: model.id,
    name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id,
    efforts: [],
  }
  let info
  try { info = await llm.resolveModelInfo(provider, model.id) } catch { info = undefined }
  if (info !== undefined) {
    entry.efforts = reasoningEffortsOf(info).map((effort) => ({
      id: effort.id,
      name: typeof effort.name === 'string' && effort.name !== '' ? effort.name : effort.id,
    }))
    const fallback = info.reasoning?.defaultEffort
    if (typeof fallback === 'string' && fallback !== '') entry.defaultEffort = fallback
    const window = info.context?.contextWindow
    if (Number.isSafeInteger(window) && window > 0) entry.contextWindow = window
    if (typeof info.description === 'string' && info.description !== '') entry.description = info.description
  }
  if (entry.description === undefined && typeof model.description === 'string' && model.description !== '') {
    entry.description = model.description
  }
  return entry
}

/** The child's own catalog: every provider route and the models it advertises now. */
async function catalog(llm) {
  const providers = llm.listProviders().map((provider) => ({ id: provider.id, name: provider.name }))
  const models = []
  for (const provider of providers) {
    let advertised = []
    try { advertised = await llm.listModels(provider.id) } catch { advertised = [] }
    for (const model of advertised) {
      if (typeof model?.id !== 'string' || model.id === '') continue
      models.push(await describedModel(llm, provider.id, model))
    }
  }
  return { providers, models }
}

/** The live session's selection, or null when the chat has not activated a session yet. */
function currentSelection(ports) {
  if (ports.currentModel === undefined) return null
  try { return selectionOfValue(ports.currentModel()) ?? null } catch { return null }
}

async function modelSnapshot(ports) {
  const { entry, selection } = modelEntry(ports.settings)
  const { providers, models } = await catalog(ports.llm)
  return { revision: entry.revision, selection, providers, models, active: currentSelection(ports) }
}

/** Refuse a pair the child's catalog does not offer, before any write can persist it. */
async function assertChoice(llm, selection) {
  if (!llm.listProviders().some((route) => route.id === selection.provider)) refuse(ADMIN_ERROR.unknownProvider)
  const advertised = await listedModels(llm, selection.provider)
  if (!advertised.some((model) => model.id === selection.model)) refuse(ADMIN_ERROR.unknownModel)
  const info = await resolvedModel(llm, selection.provider, selection.model)
  if (selection.reasoningEffort !== undefined) {
    const efforts = reasoningEffortsOf(info).map((effort) => effort.id)
    if (!efforts.includes(selection.reasoningEffort)) refuse(ADMIN_ERROR.invalidEffort)
  }
  // The exact route the adapter prepares must be the exact route the page chose: an adapter
  // that silently substitutes its default would persist a model the user never selected
  // (src/model-catalog.js's rule, kept for the child's own catalog).
  let prepared
  try { prepared = await llm.resolveCallConfig({ ...selection }) } catch { refuse(ADMIN_ERROR.modelUnavailable) }
  if (prepared?.provider !== selection.provider || prepared?.model !== selection.model) refuse(ADMIN_ERROR.modelUnavailable)
  if (selection.reasoningEffort !== undefined && prepared.reasoningEffort !== selection.reasoningEffort) {
    refuse(ADMIN_ERROR.modelUnavailable)
  }
}

function modelOps(selection) {
  return [
    { op: 'set', path: ['provider'], value: selection.provider },
    { op: 'set', path: ['model'], value: selection.model },
    selection.reasoningEffort === undefined
      ? { op: 'unset', path: ['reasoningEffort'] }
      : { op: 'set', path: ['reasoningEffort'], value: selection.reasoningEffort },
  ]
}

async function setModel(ports, payload) {
  modelEntry(ports.settings)
  const selection = {
    provider: payload.provider,
    model: payload.model,
    ...(payload.reasoningEffort === undefined ? {} : { reasoningEffort: payload.reasoningEffort }),
  }
  await assertChoice(ports.llm, selection)
  await mutate(ports.settings, MODEL_NAMESPACE, modelOps(selection), payload.revision)
  const after = modelEntry(ports.settings)
  const result = { revision: after.entry.revision, selection: after.selection }
  if (ports.applyModel !== undefined) {
    // Persisted first, applied second: a live-session failure must not lose the default the
    // page just saved, so it is a result field (like session.start's titleError) and not a
    // refusal of the whole request.
    try { await ports.applyModel(after.selection) } catch { result.sessionError = ADMIN_ERROR.failed }
  }
  return result
}

/* ---------------------------------------------------------------- plugins */

async function listBundles(plugins) {
  try { return await plugins.listBundles() } catch { refuse(ADMIN_ERROR.failed) }
}

/**
 * The inventory revision: a digest of the facts a mutation depends on (name, version,
 * enabled, installed, removable). DSH offers no revision for its package inventory, so the
 * digest is the page's concurrency token: it survives a child restart, it changes when any
 * other writer changes the profile, and it never needs its own stored counter.
 */
function inventoryRevision(bundles) {
  const facts = bundles
    .map((bundle) => [
      bundle.name, bundle.version ?? null,
      bundle.enabled === true, bundle.installed === true, bundle.removable === true,
    ])
    .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
  return digestOf(JSON.stringify(facts))
}

function assertInventory(bundles, expected) {
  // The refusal carries no numbers: the page's token is a digest, not a revision count, and
  // the page reloads the inventory instead of guessing the new one.
  if (inventoryRevision(bundles) !== expected) refuse(ADMIN_ERROR.staleRevision)
}

function bundleOf(bundle) {
  if (typeof bundle?.name !== 'string' || bundle.name === '') refuse(ADMIN_ERROR.failed)
  return {
    name: bundle.name,
    ...(typeof bundle.version === 'string' ? { version: bundle.version } : {}),
    enabled: bundle.enabled === true,
    installed: bundle.installed === true,
    removable: bundle.removable === true,
    official: bundle.official === true,
  }
}

async function pluginsSnapshot(ports) {
  const bundles = await listBundles(ports.plugins)
  return { inventoryRevision: inventoryRevision(bundles), bundles: bundles.map(bundleOf) }
}

/**
 * Only a package this profile installed can be changed from the page. Everything the DSH
 * installation ships (dsh-base among it) is not removable, so the page can never disable the
 * child's own core, and an unknown name is its own typed refusal.
 */
function manageable(bundles, name) {
  const bundle = bundles.find((candidate) => candidate.name === name)
  if (bundle === undefined) refuse(ADMIN_ERROR.unknownPlugin)
  if (bundle.removable !== true || bundle.installed !== true) refuse(ADMIN_ERROR.notRemovable)
  return bundle
}

/** Turn DSH's ChangeResult into an accepted change or a typed refusal. */
function acceptedChange(result) {
  if (!result || typeof result !== 'object') refuse(ADMIN_ERROR.pluginFailed)
  if (!ADMIN_APPLICATIONS.has(result.application)) {
    // A build waiting for script approval is the one failure the page must show differently.
    if (Array.isArray(result.pendingBuilds) && result.pendingBuilds.length > 0) refuse(ADMIN_ERROR.buildBlocked)
    const code = result.error?.code
    refuse(PLUGIN_REFUSAL.has(code) ? code : ADMIN_ERROR.pluginFailed)
  }
  return result
}

async function change(run) {
  let result
  try { result = await run() } catch { refuse(ADMIN_ERROR.failed) }
  return acceptedChange(result)
}

async function installPlugin(ports, payload) {
  assertInventory(await listBundles(ports.plugins), payload.inventoryRevision)
  const result = await change(() => ports.plugins.installBundle(payload.spec))
  if (typeof result.bundle !== 'string' || result.bundle === '') refuse(ADMIN_ERROR.pluginFailed)
  return {
    inventoryRevision: inventoryRevision(await listBundles(ports.plugins)),
    application: result.application,
    name: result.bundle,
    ...(typeof result.version === 'string' ? { version: result.version } : {}),
  }
}

async function removePlugin(ports, payload) {
  const before = await listBundles(ports.plugins)
  assertInventory(before, payload.inventoryRevision)
  const bundle = manageable(before, payload.name)
  const result = await change(() => ports.plugins.removeBundle(bundle.name))
  return {
    inventoryRevision: inventoryRevision(await listBundles(ports.plugins)),
    application: result.application,
  }
}

async function setPluginEnabled(ports, payload, enabled) {
  const before = await listBundles(ports.plugins)
  assertInventory(before, payload.inventoryRevision)
  const bundle = manageable(before, payload.name)
  const result = await change(() => ports.plugins.setBundleEnabled(bundle.name, enabled))
  const after = await listBundles(ports.plugins)
  // Report the observed state, not the requested one: an override DSH reports as "overridden"
  // must not look applied to the page.
  const observed = after.find((candidate) => candidate.name === bundle.name)
  return {
    inventoryRevision: inventoryRevision(after),
    application: result.application,
    enabled: observed?.enabled === true,
  }
}

/* ---------------------------------------------------------------- settings */

function secretSlots(secrets) {
  if (!Array.isArray(secrets)) return []
  return secrets.map((secret) => ({
    path: Array.isArray(secret?.path) ? secret.path.map((step) => String(step)) : [],
    set: secret?.set === true,
  }))
}

function settingsSnapshot(ports) {
  return {
    writable: ports.settings.writable === true,
    namespaces: describe(ports.settings).map((entry) => ({
      ns: entry.ns,
      revision: entry.revision,
      autoGenerate: entry.autoGenerate === true,
      schema: entry.schema,
      value: entry.value,
      secrets: secretSlots(entry.secrets),
    })),
  }
}

/**
 * One revision-checked settings write. A stale revision is its own refusal with both numbers,
 * so the page can reload the form instead of guessing; any other failure stays a typed
 * operation-failed, because dsh-settings' message may name a field or an entry.
 */
async function mutate(settings, ns, ops, revision) {
  if (settings.writable !== true) refuse(ADMIN_ERROR.readOnly)
  try {
    await settings.mutate(ns, ops, revision)
  } catch (error) {
    if (error?.code === SETTINGS_CONFLICT) {
      const details = Number.isSafeInteger(error.actual) ? { expected: revision, actual: error.actual } : {}
      refuse(ADMIN_ERROR.staleRevision, details)
    }
    refuse(ADMIN_ERROR.failed)
  }
}

async function mutateSettings(ports, payload) {
  if (!describe(ports.settings).some((entry) => entry.ns === payload.ns)) refuse(ADMIN_ERROR.unknownNamespace)
  await mutate(ports.settings, payload.ns, payload.ops, payload.revision)
  const after = describe(ports.settings).find((entry) => entry.ns === payload.ns)
  return { ns: payload.ns, revision: after === undefined ? payload.revision : after.revision }
}

/* ---------------------------------------------------------------- the wire end */

const TRANSPORT_METHODS = Object.freeze(['send', 'onMessage', 'onClose'])

/**
 * Create the child's admin wire end.
 *
 * The transport is a channel view of the already-authenticated lifecycle wire:
 * `{send(frame), onMessage(listener), onClose(listener)}`. It deliberately has no `close`:
 * the admin channel does not own the wire, and dropping the connection would take the session
 * bridge down with it. A replaced or closed transport only detaches this end.
 *
 * @param {object} options
 * @param {ReturnType<typeof createAdminService>} options.service - the applier.
 * @returns {{attached: boolean, attach: Function, detach: Function, close: Function,
 *   receive: (encoded: string) => Promise<void>}}
 */
export function createAdminEndpoint(options) {
  const { service } = options ?? {}
  if (typeof service?.handle !== 'function') throw new TypeError('fishball admin: the service must implement handle')
  const codec = createAdminCodec()
  let transport
  let disposers = []
  let closed = false

  function detach() {
    for (const dispose of disposers.splice(0)) { try { dispose() } catch { /* the wire is already gone */ } }
    transport = undefined
  }

  function send(encoded) {
    const current = transport
    if (current === undefined) return
    try { current.send(encoded) } catch { detach() }
  }

  function reply(id, operation, outcome) {
    // A reply too large for the frame, or one whose result no longer matches its shape, is
    // answered with a typed refusal while the wire lives: the wire closes a frame that overflows.
    const attempt = (candidate) => codec.encode(codec.reply(id, operation, candidate))
    let encoded
    try { encoded = attempt(outcome) } catch (error) {
      // "too-large" stays distinguishable; a result that no longer matches its shape is the
      // child's own fault and must not masquerade as the page's bad payload.
      const code = error instanceof AdminFailure && error.code === ADMIN_ERROR.limit ? ADMIN_ERROR.limit : ADMIN_ERROR.failed
      try { encoded = attempt(refusal(code)) } catch { return }
    }
    send(encoded)
  }

  /**
   * Handle one wire frame. A frame the codec cannot read is dropped (there is no id to answer
   * with); every frame it can read is answered, including its own typed refusal.
   */
  async function receive(encoded) {
    if (closed) return
    let frame
    try { frame = codec.decode(encoded) } catch { return }
    if (!frame || typeof frame !== 'object' || typeof frame.id !== 'string') return
    let request
    try { request = codec.acceptRequest(frame) } catch (error) {
      reply(frame.id, frame.op, refusalOf(error))
      return
    }
    let outcome
    try { outcome = await service.handle(request.op, request.payload) } catch { outcome = refusal(ADMIN_ERROR.failed) }
    reply(request.id, request.op, outcome)
  }

  return Object.freeze({
    get attached() { return transport !== undefined },

    attach(next) {
      if (closed) throw new Error('fishball admin: the endpoint is closed')
      for (const method of TRANSPORT_METHODS) {
        if (typeof next?.[method] !== 'function') throw new TypeError('fishball admin: the transport must implement ' + method)
      }
      detach()
      transport = next
      // An unexpected failure is the end's own; it must never become an unhandled rejection
      // on a transport callback the wire cannot await.
      disposers.push(next.onMessage((encoded) => { receive(encoded).catch(() => {}) }))
      disposers.push(next.onClose(detach))
    },

    detach,
    close() { closed = true; detach() },
    receive,
  })
}

/* ---------------------------------------------------------------- the child row */

/** Stable Cordis plugin name; the child overlay inserts this module as its own row (§2.3). */
export const name = 'fishball-native-admin'
export const inject = ['nativeRuntime', 'settings', 'pluginManager', 'llm']

const ROW = Object.freeze({ logger: 'fishball-native-admin' })

/**
 * Mount the admin service in the child. The admin transport arrives with each main-host
 * connection and is replaced after a restart, so attaching is a listener rather than a startup
 * step. A runtime that exposes no admin channel is reported once and leaves the row inert: the
 * merge that adds the channel is the one that makes this reachable.
 */
export function apply(ctx) {
  if (typeof ctx.nativeRuntime.onAdminTransport !== 'function') {
    ctx.logger(ROW.logger).warn('the child runtime exposes no admin transport; the admin service is unreachable')
    return
  }
  const service = createAdminService({
    settings: ctx.settings,
    plugins: ctx.pluginManager,
    llm: ctx.llm,
    // The T07 chat row publishes its live session; until it does, the persisted default is the
    // whole effect and the next created agent uses it.
    applyModel: (selection) => {
      const chat = ctx.get(CHAT_SERVICE)
      return chat?.applyModel === undefined ? Promise.resolve() : chat.applyModel(selection)
    },
    currentModel: () => {
      const chat = ctx.get(CHAT_SERVICE)
      return chat?.currentModel?.() ?? null
    },
  })
  const endpoint = createAdminEndpoint({ service })
  const unsubscribe = ctx.nativeRuntime.onAdminTransport((transport) => {
    try { endpoint.attach(transport) } catch { /* the next transport replaces it */ }
  })
  // Cordis treats an apply() return value as the fiber's disposer. The endpoint reaches the
  // main side through onAdminTransport; returning it instead fails activation with "Invalid effect".
  return () => { unsubscribe(); endpoint.close() }
}

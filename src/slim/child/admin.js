/**
 * The isolated child's admin service (§9, §15 T11).
 *
 * The main settings page reads and changes the child's model, plugins and settings through the
 * admin relay (src/slim/host/admin.js). This module is the child half: it defines the admin wire
 * protocol and applies every operation with the child's own mounted DSH services.
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
 * The protocol lives here rather than in src/slim/contract.js because the frozen contract's
 * twenty operations are the session bridge's and §5.2 keeps the admin on the lifecycle channel.
 * The main-side relay imports this module for the same shapes, so both ends validate one
 * definition instead of two drifting ones.
 */
import { createHash, randomUUID } from 'node:crypto'
import { DIGEST, STATUS, STATUS_CODES } from '../contract.js'

const KIB = 1024
const NO_KEYS = Object.freeze([])
const HEX_ENCODING = 'hex'

/**
 * The admin wire protocol. One JSON frame out, one typed outcome back.
 *
 * `channel` is the lifecycle-wire payload channel this protocol requires. The session bridge
 * owns the wire's `control` channel exclusively — its frames are envelope v2 and a foreign
 * frame closes the connection — so the admin protocol needs its own payload channel on the
 * same authenticated wire rather than a second socket. Merge hook (see the delivery report):
 * src/native-runtime/wire.js must carry this channel and hand each end a transport view.
 */
export const ADMIN = Object.freeze({
  version: 1,
  channel: 'admin',
})

/**
 * Frame and payload bounds. The lifecycle wire caps one frame at 1 MiB
 * (RUNTIME_LIMITS.maxFrameBytes) and carries this protocol's frame inside it as a JSON string,
 * where every quote gains an escape byte; half of that frame leaves room for the escaping, so an
 * oversize reply is refused with `too-large` instead of making the wire drop the connection.
 * The package bound covers a pnpm install/remove, which outlives any interactive request.
 */
export const ADMIN_LIMITS = Object.freeze({
  frameBytes: 512 * KIB,
  requestTimeoutMs: 30_000,
  packageTimeoutMs: 10 * 60_000,
  operationsPerMutation: 64,
  pathDepth: 8,
  specChars: 512,
  nameChars: 256,
  descriptionChars: 1000,
})

/** The page's operations; `local` ones never travel (the relay answers them itself). */
export const ADMIN_OPERATION = Object.freeze({
  status: 'admin.status',
  restart: 'admin.restart',
  modelGet: 'admin.model.get',
  modelSet: 'admin.model.set',
  pluginsGet: 'admin.plugins.get',
  pluginInstall: 'admin.plugin.install',
  pluginRemove: 'admin.plugin.remove',
  pluginEnable: 'admin.plugin.enable',
  pluginDisable: 'admin.plugin.disable',
  settingsGet: 'admin.settings.get',
  settingsMutate: 'admin.settings.mutate',
})

const LOCAL = Object.freeze({ local: true, timeoutMs: 0 })
const remote = (timeoutMs) => Object.freeze({ local: false, timeoutMs })

/** Direction and time bound of each operation; a local operation is the host's own work. */
export const ADMIN_OPERATIONS = Object.freeze({
  [ADMIN_OPERATION.status]: LOCAL,
  [ADMIN_OPERATION.restart]: LOCAL,
  [ADMIN_OPERATION.modelGet]: remote(ADMIN_LIMITS.requestTimeoutMs),
  [ADMIN_OPERATION.modelSet]: remote(ADMIN_LIMITS.requestTimeoutMs),
  [ADMIN_OPERATION.pluginsGet]: remote(ADMIN_LIMITS.requestTimeoutMs),
  [ADMIN_OPERATION.pluginInstall]: remote(ADMIN_LIMITS.packageTimeoutMs),
  [ADMIN_OPERATION.pluginRemove]: remote(ADMIN_LIMITS.packageTimeoutMs),
  [ADMIN_OPERATION.pluginEnable]: remote(ADMIN_LIMITS.packageTimeoutMs),
  [ADMIN_OPERATION.pluginDisable]: remote(ADMIN_LIMITS.packageTimeoutMs),
  [ADMIN_OPERATION.settingsGet]: remote(ADMIN_LIMITS.requestTimeoutMs),
  [ADMIN_OPERATION.settingsMutate]: remote(ADMIN_LIMITS.requestTimeoutMs),
})

/**
 * The typed refusal vocabulary. Plugin codes reuse DSH's own management refusal names
 * (`ManagementError.code`), so the page shows the real reason — unknown package, protected
 * package, incompatible version — instead of one flattened failure.
 */
export const ADMIN_ERROR = Object.freeze({
  // Frame and channel.
  invalidFrame: 'invalid-frame',
  version: 'unsupported-version',
  operation: 'unsupported-operation',
  payload: 'invalid-payload',
  limit: 'too-large',
  unavailable: 'unavailable',
  timeout: 'timeout',
  disconnected: 'disconnected',
  invalidResponse: 'invalid-response',
  failed: 'operation-failed',
  // Revisions.
  staleRevision: 'stale-revision',
  // Model.
  unknownProvider: 'unknown-provider',
  unknownModel: 'unknown-model',
  invalidEffort: 'invalid-reasoning-effort',
  modelUnavailable: 'model-unavailable',
  // Settings.
  unknownNamespace: 'unknown-namespace',
  readOnly: 'read-only',
  // Plugins; the first twelve are DSH's own codes (see the comment above).
  unknownPlugin: 'unknown-plugin',
  invalidSpec: 'invalid-spec',
  alreadyInstalled: 'already-installed',
  ambiguousInstall: 'ambiguous-install',
  notBundle: 'not-bundle',
  notRemovable: 'not-removable',
  stopProfile: 'stop-profile',
  bundleInUse: 'bundle-in-use',
  incompatibleVersion: 'incompatible-version',
  unsupportedPlatform: 'unsupported-platform',
  managementRequired: 'management-required',
  unaddressable: 'unaddressable',
  // Admin-owned: a package run that waits for build-script approval, and everything unmapped.
  buildBlocked: 'build-blocked',
  pluginFailed: 'plugin-failed',
})

const ADMIN_CODES = new Set(Object.values(ADMIN_ERROR))

/** DSH plugin-manager codes the admin passes through unchanged; the rest become plugin-failed. */
const PLUGIN_REFUSAL = new Set([
  ADMIN_ERROR.unknownPlugin, ADMIN_ERROR.invalidSpec, ADMIN_ERROR.alreadyInstalled,
  ADMIN_ERROR.ambiguousInstall, ADMIN_ERROR.notBundle, ADMIN_ERROR.notRemovable,
  ADMIN_ERROR.stopProfile, ADMIN_ERROR.bundleInUse, ADMIN_ERROR.incompatibleVersion,
  ADMIN_ERROR.unsupportedPlatform, ADMIN_ERROR.managementRequired, ADMIN_ERROR.unaddressable,
])

/** A successful package change; `cancelled` and `failed` are refusals, never results. */
const APPLICATIONS = new Set(['applied', 'restart-required', 'overridden'])

/** dsh-settings' own conflict code; its text carries no value the page may read (§11). */
const SETTINGS_CONFLICT = 'SETTINGS_CONFLICT'

/** dsh-base's row id for the default model selection. The child profile is base-only (§2.3). */
const MODEL_NAMESPACE = 'agent-default-model'

/** The child chat row's service name (T07); absent until that row mounts. */
const CHAT_SERVICE = 'fishballChat'

/**
 * A typed refusal thrown inside this module. It never reaches a caller: `handle` turns it into
 * `{ok:false,error}`, and `createAdminCodec` turns boundary failures into error frames.
 */
export class AdminFailure extends Error {
  /**
   * @param {string} code - one of ADMIN_ERROR's values.
   * @param {{expected?: number, actual?: number}} [details] - revision facts for a stale refusal.
   */
  constructor(code, details = {}) {
    super(code)
    this.name = 'AdminFailure'
    this.code = code
    this.details = details
  }
}

function refuse(code, details) { throw new AdminFailure(code, details) }

/** The page-facing refusal shape; `details` carry revision numbers only. */
export function refusal(code, details = {}) {
  return { ok: false, error: { code, ...details } }
}

/** Convert any thrown value into a typed refusal, never rethrowing into a caller. */
export function refusalOf(error) {
  return error instanceof AdminFailure ? refusal(error.code, error.details) : refusal(ADMIN_ERROR.failed)
}

/**
 * Plain, dense, data-only containers, as the frozen contract validates them: accessors and
 * extra own keys cannot smuggle a value past a check. The contract module keeps its own copies
 * private and holds no admin operations, so the admin boundary carries its own four helpers.
 */
function exact(value, required, optional = NO_KEYS) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse(ADMIN_ERROR.payload)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) refuse(ADMIN_ERROR.payload)
  const allowed = new Set([...required, ...optional])
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) refuse(ADMIN_ERROR.payload)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) refuse(ADMIN_ERROR.payload)
  }
  for (const key of required) if (!Object.hasOwn(value, key)) refuse(ADMIN_ERROR.payload)
}

function list(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) refuse(ADMIN_ERROR.payload)
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) refuse(ADMIN_ERROR.payload)
  }
}

function text(value, max = ADMIN_LIMITS.nameChars) {
  if (typeof value !== 'string' || value.length === 0) refuse(ADMIN_ERROR.payload)
  if ([...value].length > max) refuse(ADMIN_ERROR.payload)
}

function natural(value) {
  if (!Number.isSafeInteger(value) || value < 0) refuse(ADMIN_ERROR.payload)
}

function boolean(value) {
  if (typeof value !== 'boolean') refuse(ADMIN_ERROR.payload)
}

function oneOf(value, values) {
  if (!values.includes(value)) refuse(ADMIN_ERROR.payload)
}

function has(value, key) { return Object.hasOwn(value, key) }

/** A sha256 hex digest, the same shape the contract uses for attachment bytes. */
function digestChars(value) {
  if (typeof value !== 'string' || value.length !== DIGEST.hexLength) refuse(ADMIN_ERROR.payload)
  for (const character of value) if (!DIGEST.hex.includes(character)) refuse(ADMIN_ERROR.payload)
}

function digestOf(text) {
  return createHash(DIGEST.algorithm).update(text).digest(HEX_ENCODING)
}

/** One `{provider, model}` pair, with the effort only when the adapter has one. */
function selectionShape(value) {
  exact(value, ['provider', 'model'], ['reasoningEffort'])
  text(value.provider, ADMIN_LIMITS.nameChars)
  text(value.model, ADMIN_LIMITS.nameChars)
  if (has(value, 'reasoningEffort')) text(value.reasoningEffort, ADMIN_LIMITS.nameChars)
}

/**
 * One settings path edit. A wholesale write of the section root is refused: the page holds a
 * redacted value, and rebuilding the section from it would silently delete every secret the
 * wire never returned (dsh-settings' SettingsPathOp warning).
 */
function settingOpShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse(ADMIN_ERROR.payload)
  if (value.op === 'set') {
    exact(value, ['op', 'path', 'value'])
    if (value.value === undefined) refuse(ADMIN_ERROR.payload)
  }
  else if (value.op === 'unset') exact(value, ['op', 'path'])
  else refuse(ADMIN_ERROR.payload)
  list(value.path)
  if (value.path.length === 0 || value.path.length > ADMIN_LIMITS.pathDepth) refuse(ADMIN_ERROR.payload)
  for (const step of value.path) text(step, ADMIN_LIMITS.nameChars)
}

/* ---------------------------------------------------------------- request shapes */

function noPayload(value) { exact(value, NO_KEYS) }

function modelSetRequest(value) {
  exact(value, ['revision', 'provider', 'model'], ['reasoningEffort'])
  natural(value.revision)
  text(value.provider, ADMIN_LIMITS.nameChars)
  text(value.model, ADMIN_LIMITS.nameChars)
  if (has(value, 'reasoningEffort')) text(value.reasoningEffort, ADMIN_LIMITS.nameChars)
}

function installRequest(value) {
  exact(value, ['inventoryRevision', 'spec'])
  digestChars(value.inventoryRevision)
  text(value.spec, ADMIN_LIMITS.specChars)
}

function bundleRequest(value) {
  exact(value, ['inventoryRevision', 'name'])
  digestChars(value.inventoryRevision)
  text(value.name, ADMIN_LIMITS.nameChars)
}

function mutateRequest(value) {
  exact(value, ['ns', 'revision', 'ops'])
  text(value.ns, ADMIN_LIMITS.nameChars)
  natural(value.revision)
  list(value.ops)
  if (value.ops.length === 0 || value.ops.length > ADMIN_LIMITS.operationsPerMutation) refuse(ADMIN_ERROR.payload)
  for (const op of value.ops) settingOpShape(op)
}

const REQUESTS = Object.freeze({
  [ADMIN_OPERATION.status]: noPayload,
  [ADMIN_OPERATION.restart]: noPayload,
  [ADMIN_OPERATION.modelGet]: noPayload,
  [ADMIN_OPERATION.modelSet]: modelSetRequest,
  [ADMIN_OPERATION.pluginsGet]: noPayload,
  [ADMIN_OPERATION.pluginInstall]: installRequest,
  [ADMIN_OPERATION.pluginRemove]: bundleRequest,
  [ADMIN_OPERATION.pluginEnable]: bundleRequest,
  [ADMIN_OPERATION.pluginDisable]: bundleRequest,
  [ADMIN_OPERATION.settingsGet]: noPayload,
  [ADMIN_OPERATION.settingsMutate]: mutateRequest,
})

/* ---------------------------------------------------------------- result shapes */

function statusResult(value) {
  exact(value, ['state', 'code'])
  oneOf(value.state, Object.values(STATUS))
  if (value.code !== null) oneOf(value.code, Object.values(STATUS_CODES))
}

function modelShape(value) {
  exact(value, ['provider', 'id', 'name', 'efforts'], ['description', 'contextWindow', 'defaultEffort'])
  text(value.provider, ADMIN_LIMITS.nameChars)
  text(value.id, ADMIN_LIMITS.nameChars)
  text(value.name, ADMIN_LIMITS.nameChars)
  if (has(value, 'description')) text(value.description, ADMIN_LIMITS.descriptionChars)
  if (has(value, 'contextWindow')) natural(value.contextWindow)
  if (has(value, 'defaultEffort')) text(value.defaultEffort, ADMIN_LIMITS.nameChars)
  list(value.efforts)
  for (const effort of value.efforts) {
    exact(effort, ['id', 'name'])
    text(effort.id, ADMIN_LIMITS.nameChars)
    text(effort.name, ADMIN_LIMITS.nameChars)
  }
}

function modelResult(value) {
  exact(value, ['revision', 'selection', 'providers', 'models'])
  natural(value.revision)
  selectionShape(value.selection)
  list(value.providers)
  for (const provider of value.providers) {
    exact(provider, ['id', 'name'])
    text(provider.id, ADMIN_LIMITS.nameChars)
    text(provider.name, ADMIN_LIMITS.nameChars)
  }
  list(value.models)
  for (const model of value.models) modelShape(model)
}

function modelSetResult(value) {
  exact(value, ['revision', 'selection'], ['sessionError'])
  natural(value.revision)
  selectionShape(value.selection)
  if (has(value, 'sessionError') && !ADMIN_CODES.has(value.sessionError)) refuse(ADMIN_ERROR.payload)
}

function bundleShape(value) {
  exact(value, ['name', 'enabled', 'installed', 'removable', 'official'], ['version'])
  text(value.name, ADMIN_LIMITS.nameChars)
  if (has(value, 'version')) text(value.version, ADMIN_LIMITS.nameChars)
  boolean(value.enabled)
  boolean(value.installed)
  boolean(value.removable)
  boolean(value.official)
}

function pluginsResult(value) {
  exact(value, ['inventoryRevision', 'bundles'])
  digestChars(value.inventoryRevision)
  list(value.bundles)
  for (const bundle of value.bundles) bundleShape(bundle)
}

function application(value) {
  if (!APPLICATIONS.has(value)) refuse(ADMIN_ERROR.payload)
}

function installResult(value) {
  exact(value, ['inventoryRevision', 'application', 'name'], ['version'])
  digestChars(value.inventoryRevision)
  application(value.application)
  text(value.name, ADMIN_LIMITS.nameChars)
  if (has(value, 'version')) text(value.version, ADMIN_LIMITS.nameChars)
}

function changeResult(value) {
  exact(value, ['inventoryRevision', 'application'])
  digestChars(value.inventoryRevision)
  application(value.application)
}

function enabledResult(value) {
  exact(value, ['inventoryRevision', 'application', 'enabled'])
  digestChars(value.inventoryRevision)
  application(value.application)
  boolean(value.enabled)
}

function namespaceShape(value) {
  exact(value, ['ns', 'revision', 'autoGenerate', 'schema', 'value', 'secrets'])
  text(value.ns, ADMIN_LIMITS.nameChars)
  natural(value.revision)
  boolean(value.autoGenerate)
  // schema and value are DSH's own redacted documents; the frame round-trip already made them
  // JSON, so their contents are never inspected (a value holds a secret slot's "set" state at
  // most, never the secret itself).
  list(value.secrets)
  for (const secret of value.secrets) {
    exact(secret, ['path', 'set'])
    list(secret.path)
    for (const step of secret.path) text(step, ADMIN_LIMITS.nameChars)
    boolean(secret.set)
  }
}

function settingsResult(value) {
  exact(value, ['writable', 'namespaces'])
  boolean(value.writable)
  list(value.namespaces)
  for (const entry of value.namespaces) namespaceShape(entry)
}

function mutateResult(value) {
  exact(value, ['ns', 'revision'])
  text(value.ns, ADMIN_LIMITS.nameChars)
  natural(value.revision)
}

const RESULTS = Object.freeze({
  [ADMIN_OPERATION.status]: statusResult,
  [ADMIN_OPERATION.restart]: statusResult,
  [ADMIN_OPERATION.modelGet]: modelResult,
  [ADMIN_OPERATION.modelSet]: modelSetResult,
  [ADMIN_OPERATION.pluginsGet]: pluginsResult,
  [ADMIN_OPERATION.pluginInstall]: installResult,
  [ADMIN_OPERATION.pluginRemove]: changeResult,
  [ADMIN_OPERATION.pluginEnable]: enabledResult,
  [ADMIN_OPERATION.pluginDisable]: enabledResult,
  [ADMIN_OPERATION.settingsGet]: settingsResult,
  [ADMIN_OPERATION.settingsMutate]: mutateResult,
})

/** Validate one request payload against its operation; throws AdminFailure. */
export function validateRequest(operation, payload) {
  if (!Object.hasOwn(REQUESTS, operation)) refuse(ADMIN_ERROR.operation)
  REQUESTS[operation](payload)
  return payload
}

/** Validate one result payload against its operation; throws AdminFailure. */
export function validateResult(operation, result) {
  if (!Object.hasOwn(RESULTS, operation)) refuse(ADMIN_ERROR.operation)
  RESULTS[operation](result)
  return result
}

/* ---------------------------------------------------------------- wire frames */

/** The wire error object is a code plus revision facts; nothing else may ride in it. */
function errorShape(value) {
  exact(value, ['code'], ['expected', 'actual'])
  if (typeof value.code !== 'string' || !ADMIN_CODES.has(value.code)) refuse(ADMIN_ERROR.payload)
  if (has(value, 'expected')) natural(value.expected)
  if (has(value, 'actual')) natural(value.actual)
  return value
}

function outcomeShape(value) {
  if (!value || typeof value !== 'object' || typeof value.ok !== 'boolean') refuse(ADMIN_ERROR.payload)
  if (value.ok) {
    if (!has(value, 'result') || has(value, 'error')) refuse(ADMIN_ERROR.payload)
  } else if (!has(value, 'error') || has(value, 'result')) refuse(ADMIN_ERROR.payload)
  return value
}

/**
 * The frame codec both ends use. Every frame is bounded before it is sent: the lifecycle wire
 * closes a connection whose frame overflows, and a typed `too-large` refusal is recoverable
 * while a dropped wire is not.
 */
export function createAdminCodec() {
  return Object.freeze({
    /** Build one request frame, with the payload validated for its operation. */
    request(operation, payload) {
      if (!Object.hasOwn(ADMIN_OPERATIONS, operation)) refuse(ADMIN_ERROR.operation)
      if (ADMIN_OPERATIONS[operation].local) refuse(ADMIN_ERROR.operation)
      validateRequest(operation, payload)
      return { v: ADMIN.version, id: randomUUID(), op: operation, payload }
    },

    /** One frame as wire text, bounded. */
    encode(frame) {
      let encoded
      try { encoded = JSON.stringify(frame) } catch { refuse(ADMIN_ERROR.payload) }
      if (Buffer.byteLength(encoded, 'utf8') > ADMIN_LIMITS.frameBytes) refuse(ADMIN_ERROR.limit)
      return encoded
    },

    /** Wire text as a frame, bounded and JSON-parsed; the shape check is the caller's. */
    decode(encoded) {
      if (typeof encoded !== 'string') refuse(ADMIN_ERROR.invalidFrame)
      if (Buffer.byteLength(encoded, 'utf8') > ADMIN_LIMITS.frameBytes) refuse(ADMIN_ERROR.limit)
      let frame
      try { frame = JSON.parse(encoded) } catch { refuse(ADMIN_ERROR.invalidFrame) }
      return frame
    },

    /** Validate an incoming request frame and its payload. */
    acceptRequest(frame) {
      exact(frame, ['v', 'id', 'op', 'payload'])
      if (frame.v !== ADMIN.version) refuse(ADMIN_ERROR.version)
      text(frame.id, ADMIN_LIMITS.nameChars)
      if (typeof frame.op !== 'string' || !Object.hasOwn(ADMIN_OPERATIONS, frame.op)) refuse(ADMIN_ERROR.operation)
      if (ADMIN_OPERATIONS[frame.op].local) refuse(ADMIN_ERROR.operation)
      validateRequest(frame.op, frame.payload)
      return frame
    },

    /**
     * Build one reply frame. `operation` validates a successful result; a refusal may be
     * answered without one, because the request that produced it may have had no valid
     * operation to begin with.
     */
    reply(id, operation, outcome) {
      text(id, ADMIN_LIMITS.nameChars)
      outcomeShape(outcome)
      if (outcome.ok) {
        if (!Object.hasOwn(ADMIN_OPERATIONS, operation)) refuse(ADMIN_ERROR.operation)
        validateResult(operation, outcome.result)
        return { v: ADMIN.version, id, ok: true, result: outcome.result }
      }
      return { v: ADMIN.version, id, ok: false, error: errorShape(outcome.error) }
    },

    /** Validate an incoming reply against the request it answers. */
    acceptReply(frame, operation) {
      try {
        exact(frame, ['v', 'id', 'ok'], ['result', 'error'])
        if (frame.v !== ADMIN.version || typeof frame.id !== 'string' || typeof frame.ok !== 'boolean') {
          refuse(ADMIN_ERROR.invalidResponse)
        }
        outcomeShape(frame)
        if (frame.ok) {
          validateResult(operation, frame.result)
          return { ok: true, result: frame.result }
        }
        return { ok: false, error: errorShape(frame.error) }
      } catch { refuse(ADMIN_ERROR.invalidResponse) }
    },
  })
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
 * @returns {{handle: (operation: string, payload: object) => Promise<{ok: true, result: object}|{ok: false, error: object}>}}
 */
export function createAdminService(options) {
  const { settings, plugins, llm, applyModel } = options ?? {}
  if (applyModel !== undefined && typeof applyModel !== 'function') {
    throw new TypeError('fishball admin: applyModel must be a function')
  }
  const ports = Object.freeze({
    settings: portOf('settings', settings),
    plugins: portOf('plugins', plugins),
    llm: portOf('llm', llm),
    applyModel,
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

async function modelSnapshot(ports) {
  const { entry, selection } = modelEntry(ports.settings)
  const { providers, models } = await catalog(ports.llm)
  return { revision: entry.revision, selection, providers, models }
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
  if (!APPLICATIONS.has(result.application)) {
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

    /**
     * Handle one wire frame. A frame the codec cannot read is dropped (there is no id to answer
     * with); every frame it can read is answered, including its own typed refusal.
     */
    async receive(encoded) {
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
    },
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
  })
  const endpoint = createAdminEndpoint({ service })
  const unsubscribe = ctx.nativeRuntime.onAdminTransport((transport) => {
    try { endpoint.attach(transport) } catch { /* the next transport replaces it */ }
  })
  ctx.on('dispose', () => { unsubscribe(); endpoint.close() })
  return endpoint
}
